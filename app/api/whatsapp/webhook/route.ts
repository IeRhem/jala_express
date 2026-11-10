import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/prisma/db";
import { handleIncomingMessage } from "@/lib/whatsapp-handlers";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) return true; // Local dev fallback until WHATSAPP_APP_SECRET is set
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      for (const message of messages) {
        const wamid: string | undefined = message.id;
        if (!wamid) continue;

        // Idempotent WebhookInbox check
        const existingInbox = await db.orm.public.WebhookInbox.where({
          eventId: wamid,
        }).first();

        if (existingInbox && existingInbox.status === "PROCESSED") {
          continue;
        }

        const inbox =
          existingInbox ??
          (await db.orm.public.WebhookInbox.create({
            provider: "WHATSAPP",
            eventId: wamid,
            eventType: `whatsapp.${message.type ?? "unknown"}`,
            payload: message,
            status: "PROCESSING",
            attempts: 1,
          }));

        try {
          await handleIncomingMessage(message);
          await db.orm.public.WebhookInbox.where({ id: inbox.id }).update({
            status: "PROCESSED",
            processedAt: new Date(),
          });
        } catch (err: any) {
          await db.orm.public.WebhookInbox.where({ id: inbox.id }).update({
            status: "FAILED",
            attempts: (inbox.attempts || 1) + 1,
            lastError: err?.message || String(err),
          });
        }
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
