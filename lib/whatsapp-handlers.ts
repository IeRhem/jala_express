import { Temporal } from "temporal-polyfill/full";
import { db } from "@/prisma/db";
import { applySafeTransition } from "@/lib/escrow-ledger";
import { processPendingOutbox } from "@/lib/outbox";

export async function handleIncomingMessage(message: any) {
  const fromPhone: string = (message.from || "").replace(/^\+/, "");
  if (!fromPhone) return;

  const buyer = await findOrCreateBuyer(fromPhone);

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    await handleButtonReply(buyer.id, buyer.phone, message.interactive.button_reply.id);
    await processPendingOutbox();
    return;
  }

  if (message.type === "text") {
    await handleTextMessage(buyer.id, buyer.phone, message.text?.body || "");
    await processPendingOutbox();
    return;
  }
}

export async function findOrCreateBuyer(phone: string, name?: string) {
  const cleanPhone = phone.replace(/^\+/, "").trim();
  const existing = await db.orm.public.Buyer.where({ phone: cleanPhone }).first();
  if (existing) return existing;

  try {
    return await db.orm.public.Buyer.create({
      phone: cleanPhone,
      contactChannel: "whatsapp",
      name: name ?? null,
    });
  } catch {
    const buyer = await db.orm.public.Buyer.where({ phone: cleanPhone }).first();
    if (buyer) return buyer;
    throw new Error(`Failed to find or create buyer for ${cleanPhone}`);
  }
}

async function handleButtonReply(buyerId: string, buyerPhone: string, buttonId: string) {
  const [action, transactionId] = buttonId.split(":");
  if (!action || !transactionId) return;

  const transaction = await db.orm.public.Transaction.where({ id: transactionId }).first();
  if (!transaction || transaction.buyerId !== buyerId) return;

  // 1. Buyer accepts item at the door -> CONFIRMED -> PAYOUT_PENDING (never lie that money is already released)
  if (action === "confirm" && transaction.status === "DELIVERED") {
    const confirmed = await applySafeTransition({
      transactionId,
      fromStatus: "DELIVERED",
      toStatus: "CONFIRMED",
      actorType: "BUYER",
      outcome: "ACCEPTED",
      notes: "Buyer confirmed delivery via WhatsApp interactive button",
    });

    if (confirmed) {
      await applySafeTransition({
        transactionId,
        fromStatus: "CONFIRMED",
        toStatus: "PAYOUT_PENDING",
        actorType: "SYSTEM",
        notes: "Queued seller payout via Paystack Transfers API",
        outboxEvents: [
          {
            kind: "PAYSTACK_TRANSFER",
            idempotencyKey: `paystack:payout:${transactionId}`,
            payload: { transactionId },
          },
          {
            kind: "WHATSAPP_TEXT",
            idempotencyKey: `wa:confirm_ack:${transactionId}`,
            payload: {
              to: buyerPhone,
              text: "✅ Thank you for confirming! We are now releasing the held payment to the seller.",
            },
          },
        ],
      });
    }
    return;
  }

  // 2. Buyer rejects item at the door -> REJECTED_AT_DELIVERY -> ask Refund vs Replacement
  if (action === "reject" && transaction.status === "DELIVERED") {
    await applySafeTransition({
      transactionId,
      fromStatus: "DELIVERED",
      toStatus: "REJECTED_AT_DELIVERY",
      actorType: "BUYER",
      outcome: "REJECTED_BY_BUYER",
      notes: "Buyer rejected item at delivery via WhatsApp button",
      outboxEvents: [
        {
          kind: "WHATSAPP_BUTTONS",
          idempotencyKey: `wa:reject_choice:${transactionId}:${transaction.deliveryAttempt}`,
          payload: {
            to: buyerPhone,
            bodyText: "Sorry to hear the item didn't match. How would you like SafeDrop to resolve this?",
            buttons: [
              { id: `refund:${transactionId}`, title: "Refund me" },
              { id: `replace:${transactionId}`, title: "Send replacement" },
            ],
          },
        },
      ],
    });
    return;
  }

  // 3. Buyer chooses Refund -> REFUND_PENDING (waits for Paystack refund webhook before marking REFUNDED)
  if (action === "refund" && transaction.status === "REJECTED_AT_DELIVERY") {
    await applySafeTransition({
      transactionId,
      fromStatus: "REJECTED_AT_DELIVERY",
      toStatus: "REFUND_PENDING",
      actorType: "BUYER",
      notes: "Buyer requested refund via WhatsApp button",
      outboxEvents: [
        {
          kind: "PAYSTACK_REFUND",
          idempotencyKey: `paystack:refund:${transactionId}`,
          payload: {
            transactionId,
            reason: "Buyer rejected item at delivery",
          },
        },
        {
          kind: "WHATSAPP_TEXT",
          idempotencyKey: `wa:refund_pending:${transactionId}`,
          payload: {
            to: buyerPhone,
            text: "💳 Understood — your refund has been initiated with Paystack. You'll receive confirmation as soon as it clears.",
          },
        },
      ],
    });
    return;
  }

  // 4. Buyer chooses Replacement -> COLLECTING (increments deliveryAttempt)
  if (action === "replace" && transaction.status === "REJECTED_AT_DELIVERY") {
    const nextAttempt = (transaction.deliveryAttempt || 1) + 1;
    await applySafeTransition({
      transactionId,
      fromStatus: "REJECTED_AT_DELIVERY",
      toStatus: "COLLECTING",
      actorType: "BUYER",
      notes: `Buyer requested replacement via WhatsApp button (Attempt #${nextAttempt})`,
      incrementDeliveryAttempt: true,
      outboxEvents: [
        {
          kind: "WHATSAPP_TEXT",
          idempotencyKey: `wa:replace_ack:${transactionId}:${nextAttempt}`,
          payload: {
            to: buyerPhone,
            text: `🔄 Got it — we have notified the seller and our dispatch team to inspect and bring a working replacement (Attempt #${nextAttempt}).`,
          },
        },
      ],
    });
  }
}

async function handleTextMessage(buyerId: string, buyerPhone: string, text: string) {
  // Phase 0 pilot: Ops creates the Transaction record from the dashboard.
  // Conversation state is tracked for Phase 1 automated intake.
  const existingConv = await db.orm.public.Conversation.where({ buyerId }).first();
  if (!existingConv) {
    await db.orm.public.Conversation.create({
      buyerId,
      state: "IDLE",
      context: { lastText: text },
      lastMessageAt: Temporal.Now.instant(),
    });
  } else {
    await db.orm.public.Conversation.where({ id: existingConv.id }).update({
      lastMessageAt: Temporal.Now.instant(),
      context: { lastText: text },
    });
  }
}
