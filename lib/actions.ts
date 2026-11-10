"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/prisma/db";
import { findOrCreateBuyer } from "@/lib/whatsapp-handlers";
import { initializeCollectionCheckout } from "@/lib/paystack";
import { applySafeTransition } from "@/lib/escrow-ledger";
import { processPendingOutbox } from "@/lib/outbox";
import { createPresignedUploadUrl } from "@/lib/r2";

/**
 * 1. Ops Action: Create a new Escrow Transaction from a WhatsApp order
 * and generate the Paystack payment link immediately.
 */
export async function createTransactionAction(input: {
  buyerPhone: string;
  buyerName?: string;
  vendorId: string;
  categoryId: string;
  riderId?: string;
  itemDescription: string;
  amountNaira: number;
  escrowFeeNaira: number;
  deliveryFeeNaira: number;
}) {
  const buyer = await findOrCreateBuyer(input.buyerPhone, input.buyerName);

  const amountKobo = Math.round(input.amountNaira * 100);
  const escrowFeeKobo = Math.round(input.escrowFeeNaira * 100);
  const deliveryFeeKobo = Math.round(input.deliveryFeeNaira * 100);
  const totalAmountKobo = amountKobo + escrowFeeKobo + deliveryFeeKobo;

  const tx = await db.orm.public.Transaction.create({
    buyerId: buyer.id,
    vendorId: input.vendorId,
    categoryId: input.categoryId,
    riderId: input.riderId || null,
    itemDescription: input.itemDescription,
    amount: amountKobo,
    escrowFee: escrowFeeKobo,
    deliveryFee: deliveryFeeKobo,
    totalAmount: totalAmountKobo,
    currency: "NGN",
    status: "PENDING_PAYMENT",
  });

  const payment = await initializeCollectionCheckout(tx.id);

  revalidatePath("/");
  return {
    transactionId: tx.id,
    checkoutUrl: payment.checkoutUrl,
    reference: payment.reference,
    totalAmountNaira: totalAmountKobo / 100,
  };
}

/**
 * 2. Rider/Ops Action: Get a pre-signed Cloudflare R2 upload URL for inspection photos.
 */
export async function getEvidenceUploadUrlAction(
  transactionId: string,
  evidenceType: "PICKUP_INSPECTION" | "DELIVERY_PROOF" | "DISPUTE_EVIDENCE",
  filename: string
) {
  return createPresignedUploadUrl(transactionId, evidenceType, filename);
}

/**
 * 3. Rider/Ops Action: Log Pickup Inspection outcome + photo in R2.
 * Verified -> VERIFIED (notifies buyer item is on the way).
 * Rejected -> REJECTED_AT_PICKUP -> REFUND_PENDING (initiates immediate Paystack refund).
 */
export async function recordPickupInspectionAction(input: {
  transactionId: string;
  staffId: string;
  verified: boolean;
  objectKey: string;
  notes?: string;
}) {
  const tx = await db.orm.public.Transaction.where({ id: input.transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();
  if (!buyer) throw new Error("Buyer not found");

  if (tx.status === "HELD") {
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "HELD",
      toStatus: "COLLECTING",
      actorType: "STAFF",
      staffId: input.staffId,
      notes: "Rider arrived at seller for pickup inspection",
    });
  }

  const outcome = input.verified ? "VERIFIED" : "REJECTED";

  await db.orm.public.DeliveryEvidence.create({
    transactionId: tx.id,
    type: "PICKUP_INSPECTION",
    outcome,
    actorType: "STAFF",
    staffId: input.staffId,
    objectKey: input.objectKey,
    notes: input.notes || null,
    capturedAt: new Date(),
  });

  if (input.verified) {
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "COLLECTING",
      toStatus: "VERIFIED",
      actorType: "STAFF",
      staffId: input.staffId,
      outcome: "VERIFIED",
      notes: input.notes || "Item verified against listing at pickup.",
      outboxEvents: [
        {
          kind: "WHATSAPP_TEXT",
          idempotencyKey: `wa:verified:${tx.id}:${tx.deliveryAttempt}`,
          payload: {
            to: buyer.phone,
            text: `✅ SafeDrop has inspected and verified your order ("${tx.itemDescription}"). Our rider is now on the way to deliver it to you!`,
          },
        },
      ],
    });
  } else {
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "COLLECTING",
      toStatus: "REJECTED_AT_PICKUP",
      actorType: "STAFF",
      staffId: input.staffId,
      outcome: "REJECTED",
      notes: input.notes || "Item rejected at pickup; did not match listing.",
    });

    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "REJECTED_AT_PICKUP",
      toStatus: "REFUND_PENDING",
      actorType: "SYSTEM",
      notes: "Auto-initiated buyer refund after pickup rejection.",
      outboxEvents: [
        {
          kind: "PAYSTACK_REFUND",
          idempotencyKey: `paystack:refund:${tx.id}`,
          payload: {
            transactionId: tx.id,
            reason: "Rejected at pickup inspection",
          },
        },
        {
          kind: "WHATSAPP_TEXT",
          idempotencyKey: `wa:rejected_pickup:${tx.id}`,
          payload: {
            to: buyer.phone,
            text: `⚠️ SafeDrop inspected "${tx.itemDescription}" at the seller's location and it did NOT match the listing. We did not collect it, and your full refund has been initiated.`,
          },
        },
      ],
    });
  }

  await processPendingOutbox();
  revalidatePath("/");
}

/**
 * 4. Rider/Ops Action: Mark item DELIVERED at the buyer's door and send
 * the WhatsApp interactive Accept / Reject buttons.
 */
export async function markDeliveredAction(input: {
  transactionId: string;
  staffId: string;
  objectKey?: string;
  notes?: string;
}) {
  const tx = await db.orm.public.Transaction.where({ id: input.transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();
  if (!buyer) throw new Error("Buyer not found");

  if (input.objectKey) {
    await db.orm.public.DeliveryEvidence.create({
      transactionId: tx.id,
      type: "DELIVERY_PROOF",
      outcome: "VERIFIED",
      actorType: "STAFF",
      staffId: input.staffId,
      objectKey: input.objectKey,
      notes: input.notes || null,
      capturedAt: new Date(),
    });
  }

  await applySafeTransition({
    transactionId: tx.id,
    fromStatus: "VERIFIED",
    toStatus: "DELIVERED",
    actorType: "STAFF",
    staffId: input.staffId,
    notes: input.notes || "Delivered to buyer at door; awaiting buyer WhatsApp confirmation.",
    outboxEvents: [
      {
        kind: "WHATSAPP_BUTTONS",
        idempotencyKey: `wa:door_check:${tx.id}:${tx.deliveryAttempt}`,
        payload: {
          to: buyer.phone,
          bodyText: `📦 Your order ("${tx.itemDescription}") has arrived! Please inspect it with our rider right now. Does it match what you ordered?`,
          buttons: [
            { id: `confirm:${tx.id}`, title: "Accept & Release" },
            { id: `reject:${tx.id}`, title: "Reject Item" },
          ],
        },
      },
    ],
  });

  await processPendingOutbox();
  revalidatePath("/");
}
