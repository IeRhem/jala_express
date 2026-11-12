"use server";

import { revalidatePath } from "next/cache";
import { Temporal } from "temporal-polyfill/full";
import { db } from "@/prisma/db";
import { findOrCreateBuyer } from "@/lib/whatsapp-handlers";
import {
  initializeCollectionCheckout,
  resolveBankAccount,
  createPaystackTransferRecipient,
} from "@/lib/paystack";
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

  await db.orm.public.TransactionEvent.create({
    transactionId: tx.id,
    fromStatus: null,
    toStatus: "PENDING_PAYMENT",
    actorType: "STAFF",
    notes: "Order created in Ops Dashboard; Paystack checkout link generated.",
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
 * 2. Vendor Onboarding Step A: Verify 10-digit NUBAN account number with Paystack
 * and return the official bank account holder name.
 */
export async function verifyVendorBankAction(accountNumber: string, bankCode: string) {
  return resolveBankAccount(accountNumber, bankCode);
}

/**
 * 3. Vendor Onboarding Step B: Create Vendor + register Paystack Transfer Recipient (`RCP_xxx`)
 * and link the vendor to their selected pilot categories.
 */
export async function createVendorWithRecipientAction(input: {
  businessName: string;
  phone: string;
  areaId: string;
  categoryIds: string[];
  bankCode: string;
  accountNumber: string;
  verifiedAccountName?: string;
}) {
  const cleanPhone = input.phone.replace(/^\+/, "").trim();
  const recipientName = input.verifiedAccountName || input.businessName;

  const { recipientCode, bankName } = await createPaystackTransferRecipient({
    name: recipientName,
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
  });

  const vendor = await db.orm.public.Vendor.create({
    businessName: input.businessName.trim(),
    areaId: input.areaId,
    phone: cleanPhone,
    payoutProvider: "PAYSTACK",
    payoutRecipientRef: recipientCode,
    bankName,
    accountNumber: input.accountNumber.trim(),
    active: true,
  });

  for (const categoryId of input.categoryIds) {
    await db.orm.public.VendorCategory.create({
      vendorId: vendor.id,
      categoryId,
      active: true,
    });
  }

  revalidatePath("/");
  return {
    vendorId: vendor.id,
    recipientCode,
    bankName,
  };
}

/**
 * 4. Rider/Ops Action: Get a pre-signed Cloudflare R2 upload URL for inspection photos.
 */
export async function getEvidenceUploadUrlAction(
  transactionId: string,
  evidenceType: "PICKUP_INSPECTION" | "DELIVERY_PROOF" | "DISPUTE_EVIDENCE",
  filename: string
) {
  return createPresignedUploadUrl(transactionId, evidenceType, filename);
}

/**
 * 5. Rider/Ops Action: Log Pickup Inspection outcome + photo in R2.
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
    capturedAt: Temporal.Now.instant(),
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
 * 6. Rider/Ops Action: Mark item DELIVERED at the buyer's door and send
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
      capturedAt: Temporal.Now.instant(),
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

/**
 * 7. Ops Manual Resolution / Offline Fallback Action:
 * Allows Ops Admin to manually trigger Release, Refund, or Dispute when buyer is offline at the door
 * or when resolving a disputed order.
 */
export async function manualOpsResolutionAction(input: {
  transactionId: string;
  staffId: string;
  action: "RELEASE" | "REFUND" | "DISPUTE";
  notes: string;
}) {
  const tx = await db.orm.public.Transaction.where({ id: input.transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();

  if (input.action === "DISPUTE") {
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: tx.status as any,
      toStatus: "DISPUTED",
      actorType: "STAFF",
      staffId: input.staffId,
      notes: input.notes || "Flagged as DISPUTED by Ops Admin.",
    });
  } else if (input.action === "RELEASE") {
    if (tx.status === "DELIVERED") {
      await applySafeTransition({
        transactionId: tx.id,
        fromStatus: "DELIVERED",
        toStatus: "CONFIRMED",
        actorType: "STAFF",
        staffId: input.staffId,
        outcome: "ACCEPTED",
        notes: `Ops manual confirmation override: ${input.notes}`,
      });
    }
    const currentStatus = tx.status === "DELIVERED" ? "CONFIRMED" : (tx.status as any);
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: currentStatus,
      toStatus: "PAYOUT_PENDING",
      actorType: "STAFF",
      staffId: input.staffId,
      notes: `Ops triggered payout release: ${input.notes}`,
      outboxEvents: [
        {
          kind: "PAYSTACK_TRANSFER",
          idempotencyKey: `paystack:payout:${tx.id}`,
          payload: { transactionId: tx.id },
        },
      ],
    });
  } else if (input.action === "REFUND") {
    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: tx.status as any,
      toStatus: "REFUND_PENDING",
      actorType: "STAFF",
      staffId: input.staffId,
      notes: `Ops triggered buyer refund: ${input.notes}`,
      outboxEvents: [
        {
          kind: "PAYSTACK_REFUND",
          idempotencyKey: `paystack:refund:${tx.id}`,
          payload: { transactionId: tx.id, reason: input.notes },
        },
        ...(buyer
          ? [
              {
                kind: "WHATSAPP_TEXT" as const,
                idempotencyKey: `wa:ops_refund:${tx.id}`,
                payload: {
                  to: buyer.phone,
                  text: `💳 SafeDrop Ops has initiated a full refund for "${tx.itemDescription}".`,
                },
              },
            ]
          : []),
      ],
    });
  }

  await processPendingOutbox();
  revalidatePath("/");
}
