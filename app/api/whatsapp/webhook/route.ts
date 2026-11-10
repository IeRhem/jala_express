import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/prisma/db";
import { handleIncomingMessage } from "@/lib/whatsapp-handlers";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET!;

// Meta calls this once, when you register the webhook URL in the Meta
// App dashboard, to prove you control this endpoint.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Meta calls this for every incoming message and status event.
export async function POST(request: NextRequest) {
  // Raw text, not request.json() — the signature below is computed over
  // the exact bytes Meta sent, and re-serializing parsed JSON can
  // produce a different string and fail verification.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!isValidSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  try {
    await routeWebhookPayload(payload);
  } catch (err) {
    console.error("WhatsApp webhook handler error:", err);
  }

  // Always 200 for a validly-signed payload — WhatsApp retries non-200s
  // aggressively, and the WebhookInbox claim below (not this response
  // code) is what actually prevents double-processing a retry.
  return new NextResponse("OK", { status: 200 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

async function routeWebhookPayload(payload: any) {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages;
  if (!messages) return; // delivery/read status updates also land here — ignored for now

  for (const message of messages) {
    const firstTimeSeeingThis = await claimInboxEvent(message.id, message.type, payload);
    if (!firstTimeSeeingThis) continue; // WhatsApp retried a message we already processed
    await handleIncomingMessage(message);
  }
}

// Claims a WhatsApp message by its wamid before processing it, so a
// retried delivery can't double-fire a status change. Returns true the
// first time an eventId is seen, false on every retry after that.
async function claimInboxEvent(eventId: string, eventType: string, payload: unknown): Promise<boolean> {
  try {
    await db.orm.public.WebhookInbox.create({
      provider: "WHATSAPP",
      eventId,
      eventType,
      payload,
    });
    return true;
  } catch (err) {
    // ⚠️ This assumes any create() failure here means "eventId already
    // claimed" (the unique constraint doing its job). That's true for a
    // genuine retry, but it would also silently swallow an unrelated
    // error (a bad connection, a schema mismatch) as if it were a
    // harmless duplicate. Worth narrowing to the actual conflict error
    // once you know what Prisma 8 throws for a unique violation —
    // ask me to tighten this once you've seen one in the logs.
    return false;
  }
}