import { NextRequest, NextResponse } from "next/server";
import { db } from "@/prisma/db";
import { verifyPaystackSignature, handlePaystackWebhookEvent } from "@/lib/paystack";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Paystack signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const eventType: string = body.event || "unknown";
  const data = body.data || {};
  const eventId = `paystack:${eventType}:${data.id || data.reference || Date.now()}`;

  const existingInbox = await db.orm.public.WebhookInbox.where({
    eventId,
  }).first();

  if (existingInbox && existingInbox.status === "PROCESSED") {
    return NextResponse.json({ status: "already_processed" });
  }

  const inbox =
    existingInbox ??
    (await db.orm.public.WebhookInbox.create({
      provider: "PAYSTACK",
      eventId,
      eventType,
      payload: body,
      status: "PROCESSING",
      attempts: 1,
    }));

  try {
    await handlePaystackWebhookEvent(eventType, data);
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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
