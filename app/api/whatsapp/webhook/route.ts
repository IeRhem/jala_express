import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/prisma/db";
import { handleIncomingMessage } from "@/lib/whatsapp-handlers";

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

type WhatsAppMessage = JsonObject & {
  id: string;
};

type WhatsAppStatus = JsonObject & {
  id: string;
  status: string;
  timestamp: string;
};

type WhatsAppChangeValue = JsonObject & {
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppWebhookBody = {
  object: string;
  entry: Array<{
    changes: Array<{
      value?: WhatsAppChangeValue;
    }>;
  }>;
};

class WebhookEventInProgressError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isWhatsAppMessage(value: unknown): value is WhatsAppMessage {
  return (
    isJsonObject(value) &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    isJsonObject(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.status === "string" &&
    typeof value.timestamp === "string"
  );
}

function isWebhookBody(value: unknown): value is WhatsAppWebhookBody {
  return (
    isRecord(value) &&
    typeof value.object === "string" &&
    Array.isArray(value.entry) &&
    value.entry.every(
      (entry) =>
        isRecord(entry) &&
        Array.isArray(entry.changes) &&
        entry.changes.every((change) => {
          if (!isRecord(change)) return false;
          if (change.value === undefined) return true;
          if (!isJsonObject(change.value)) return false;

          const messages = change.value.messages;
          const statuses = change.value.statuses;
          return (
            (messages === undefined ||
              (Array.isArray(messages) && messages.every(isWhatsAppMessage))) &&
            (statuses === undefined ||
              (Array.isArray(statuses) && statuses.every(isWhatsAppStatus)))
          );
        }),
    )
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const match = signatureHeader?.match(/^sha256=([a-fA-F0-9]{64})$/);
  if (!appSecret || !match) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(match[1], "hex");
  return crypto.timingSafeEqual(expected, received);
}

async function claimWebhookEvent(event: {
  eventId: string;
  eventType: string;
  payload: JsonObject;
}) {
  const existing = await db.orm.public.WebhookInbox.where({
    eventId: event.eventId,
  }).first();

  if (existing) {
    if (existing.status === "PROCESSED") return null;
    if (existing.status === "PROCESSING") throw new WebhookEventInProgressError();

    const claimed = await db.orm.public.WebhookInbox.where({
      id: existing.id,
      status: existing.status,
    }).update({
      status: "PROCESSING",
      attempts: existing.attempts + 1,
      lastError: null,
    });
    if (!claimed) throw new WebhookEventInProgressError();
    return claimed;
  }

  try {
    return await db.orm.public.WebhookInbox.create({
      provider: "WHATSAPP",
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event.payload,
      status: "PROCESSING",
      attempts: 1,
    });
  } catch (error) {
    // A concurrent delivery may have won the unique eventId insert.
    const concurrent = await db.orm.public.WebhookInbox.where({
      eventId: event.eventId,
    }).first();
    if (!concurrent) throw error;
    if (concurrent.status === "PROCESSED") return null;
    if (concurrent.status === "PROCESSING") throw new WebhookEventInProgressError();

    const claimed = await db.orm.public.WebhookInbox.where({
      id: concurrent.id,
      status: concurrent.status,
    }).update({
      status: "PROCESSING",
      attempts: concurrent.attempts + 1,
      lastError: null,
    });
    if (!claimed) throw new WebhookEventInProgressError();
    return claimed;
  }
}

async function processInboxEvent(
  event: {
    eventId: string;
    eventType: string;
    payload: JsonObject;
  },
  process: () => Promise<void>,
) {
  const inbox = await claimWebhookEvent(event);
  if (!inbox) return;

  try {
    await process();
    await db.orm.public.WebhookInbox.where({ id: inbox.id }).update({
      status: "PROCESSED",
      processedAt: new Date(),
      lastError: null,
    });
  } catch (error) {
    await db.orm.public.WebhookInbox.where({ id: inbox.id }).update({
      status: "FAILED",
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    return new NextResponse("Webhook verification is not configured", { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge !== null && safeEqual(token, verifyToken)) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json({ error: "Webhook signature verification is not configured" }, { status: 503 });
  }

  const rawBody = Buffer.from(await req.arrayBuffer());
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isWebhookBody(parsedBody)) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  try {
    for (const entry of parsedBody.entry) {
      for (const change of entry.changes) {
        const messages = Array.isArray(change.value?.messages) ? change.value.messages : [];
        for (const message of messages) {
          await processInboxEvent(
            {
              eventId: message.id,
              eventType: `whatsapp.${typeof message.type === "string" ? message.type : "unknown"}`,
              payload: change.value ?? message,
            },
            () => handleIncomingMessage(message),
          );
        }

        const statuses = Array.isArray(change.value?.statuses) ? change.value.statuses : [];
        for (const status of statuses) {
          await processInboxEvent(
            {
              eventId: `whatsapp:status:${status.id}:${status.status}:${status.timestamp}`,
              eventType: `whatsapp.status.${status.status}`,
              payload: change.value ?? status,
            },
            async () => {},
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof WebhookEventInProgressError) {
      return NextResponse.json({ error: "Webhook event is already being processed" }, { status: 503 });
    }
    console.error("WhatsApp webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
