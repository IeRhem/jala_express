import { Temporal } from "temporal-polyfill/full";
import { db } from "@/prisma/db";
import { sendText, sendButtons } from "@/lib/whatsapp";
import { initiateSellerPayout, initiateBuyerRefund } from "@/lib/paystack";

/**
 * Drains pending OutboxEvent rows so WhatsApp notifications and Paystack
 * transfers/refunds are guaranteed to execute even if an external API hiccups.
 */
export async function processPendingOutbox(limit = 20): Promise<number> {
  const pendingEvents = await db.orm.public.OutboxEvent.where({
    status: "PENDING",
  }).all();

  const batch = pendingEvents.slice(0, limit);
  let processed = 0;

  for (const ev of batch) {
    if ((ev.attempts || 0) >= 5) continue;

    try {
      await db.orm.public.OutboxEvent.where({ id: ev.id }).update({
        status: "PROCESSING",
        attempts: (ev.attempts || 0) + 1,
      });

      const payload = (ev.payload || {}) as Record<string, any>;

      if (ev.kind === "WHATSAPP_TEXT") {
        await sendText(payload.to, payload.text);
      } else if (ev.kind === "WHATSAPP_BUTTONS") {
        await sendButtons(payload.to, payload.bodyText, payload.buttons);
      } else if (ev.kind === "PAYSTACK_TRANSFER" && ev.transactionId) {
        await initiateSellerPayout(ev.transactionId);
      } else if (ev.kind === "PAYSTACK_REFUND" && ev.transactionId) {
        await initiateBuyerRefund(ev.transactionId, payload.reason || "SafeDrop Escrow Refund");
      }

      await db.orm.public.OutboxEvent.where({ id: ev.id }).update({
        status: "SENT",
        sentAt: Temporal.Now.instant(),
        lastError: null,
      });
      processed++;
    } catch (err: any) {
      await db.orm.public.OutboxEvent.where({ id: ev.id }).update({
        status: "FAILED",
        lastError: err?.message || String(err),
      });
    }
  }

  return processed;
}
