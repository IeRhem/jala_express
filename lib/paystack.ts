import crypto from "crypto";
import { db } from "@/prisma/db";
import { applySafeTransition } from "@/lib/escrow-ledger";
import { processPendingOutbox } from "@/lib/outbox";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!PAYSTACK_SECRET_KEY || !signatureHeader) return false;
  const expected = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function initializeCollectionCheckout(transactionId: string, callbackUrl?: string) {
  const tx = await db.orm.public.Transaction.where({ id: transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();
  if (!buyer) throw new Error("Buyer not found");

  const reference = `sd_col_${transactionId.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
  const checkoutAmountKobo = tx.totalAmount || tx.amount;

  let checkoutUrl = `https://checkout.paystack.com/mock-${reference}`;

  if (PAYSTACK_SECRET_KEY) {
    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${buyer.phone}@safedrop.ng`,
        amount: checkoutAmountKobo,
        currency: tx.currency || "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          transactionId: tx.id,
          buyerPhone: buyer.phone,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Paystack initialize failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    checkoutUrl = json.data.authorization_url;
  }

  const payment = await db.orm.public.Payment.create({
    transactionId: tx.id,
    type: "COLLECTION",
    provider: "PAYSTACK",
    reference,
    checkoutUrl,
    idempotencyKey: `col:${tx.id}:${reference}`,
    amount: checkoutAmountKobo,
    status: "PENDING",
  });

  return payment;
}

export async function initiateSellerPayout(transactionId: string) {
  const tx = await db.orm.public.Transaction.where({ id: transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const vendor = await db.orm.public.Vendor.where({ id: tx.vendorId }).first();
  if (!vendor || !vendor.payoutRecipientRef) {
    throw new Error(`Vendor ${vendor?.businessName ?? tx.vendorId} is missing a Paystack payoutRecipientRef`);
  }

  const idempotencyKey = `payout:${tx.id}`;
  const existing = await db.orm.public.Payment.where({ idempotencyKey }).first();
  if (existing) return existing;

  const reference = `sd_pay_${tx.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;

  let providerId: string | null = null;
  if (PAYSTACK_SECRET_KEY) {
    const res = await fetch(`${PAYSTACK_BASE_URL}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: tx.amount, // Seller gets item price in kobo
        recipient: vendor.payoutRecipientRef,
        reference,
        reason: `SafeDrop Escrow Release: ${tx.itemDescription}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Paystack transfer failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    providerId = String(json.data?.id ?? "");
  }

  return db.orm.public.Payment.create({
    transactionId: tx.id,
    type: "PAYOUT",
    provider: "PAYSTACK",
    reference,
    providerId,
    idempotencyKey,
    amount: tx.amount,
    status: "PROCESSING",
  });
}

export async function initiateBuyerRefund(transactionId: string, reason: string) {
  const tx = await db.orm.public.Transaction.where({ id: transactionId }).first();
  if (!tx) throw new Error("Transaction not found");

  const colPayment = await db.orm.public.Payment.where({
    transactionId: tx.id,
    type: "COLLECTION",
    status: "SUCCESS",
  }).first();

  if (!colPayment) {
    throw new Error(`No successful COLLECTION payment found for transaction ${tx.id}`);
  }

  const idempotencyKey = `refund:${tx.id}`;
  const existing = await db.orm.public.Payment.where({ idempotencyKey }).first();
  if (existing) return existing;

  const reference = `sd_ref_${tx.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
  let providerId: string | null = null;

  if (PAYSTACK_SECRET_KEY) {
    const res = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: colPayment.reference,
        amount: colPayment.amount,
        merchant_note: reason,
      }),
    });

    if (!res.ok) {
      throw new Error(`Paystack refund failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    providerId = String(json.data?.id ?? "");
  }

  return db.orm.public.Payment.create({
    transactionId: tx.id,
    type: "REFUND",
    provider: "PAYSTACK",
    reference,
    providerId,
    idempotencyKey,
    amount: colPayment.amount,
    status: "PROCESSING",
  });
}

export async function handlePaystackWebhookEvent(eventType: string, data: Record<string, any>) {
  const reference: string | undefined = data.reference || data.transaction_reference;
  if (!reference) return;

  if (eventType === "charge.success") {
    const payment = await db.orm.public.Payment.where({ reference }).first();
    if (!payment || payment.status === "SUCCESS") return;

    await db.orm.public.Payment.where({ id: payment.id }).update({
      status: "SUCCESS",
      providerId: String(data.id ?? ""),
      paidAt: new Date(),
    });

    const tx = await db.orm.public.Transaction.where({ id: payment.transactionId }).first();
    if (!tx || tx.status !== "PENDING_PAYMENT") return;

    const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();
    const vendor = await db.orm.public.Vendor.where({ id: tx.vendorId }).first();

    if (buyer) {
      await applySafeTransition({
        transactionId: tx.id,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "HELD",
        actorType: "SYSTEM",
        notes: `Paystack payment (${reference}) cleared into escrow.`,
        outboxEvents: [
          {
            kind: "WHATSAPP_TEXT",
            idempotencyKey: `wa:held:${tx.id}`,
            payload: {
              to: buyer.phone,
              text: `🔒 Payment of ₦${((tx.totalAmount || tx.amount) / 100).toLocaleString()} received and safely held in SafeDrop Escrow! Our agent will now collect and inspect "${tx.itemDescription}" from ${vendor?.businessName ?? "the seller"}.`,
            },
          },
        ],
      });
      await processPendingOutbox();
    }
  } else if (eventType === "transfer.success") {
    const payment = await db.orm.public.Payment.where({ reference }).first();
    if (!payment || payment.status === "SUCCESS") return;

    await db.orm.public.Payment.where({ id: payment.id }).update({
      status: "SUCCESS",
      paidAt: new Date(),
    });

    const tx = await db.orm.public.Transaction.where({ id: payment.transactionId }).first();
    if (!tx || tx.status !== "PAYOUT_PENDING") return;

    const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();
    const vendor = await db.orm.public.Vendor.where({ id: tx.vendorId }).first();

    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "PAYOUT_PENDING",
      toStatus: "RELEASED",
      actorType: "SYSTEM",
      notes: `Paystack transfer (${reference}) released to seller.`,
      outboxEvents: buyer
        ? [
            {
              kind: "WHATSAPP_TEXT",
              idempotencyKey: `wa:released:${tx.id}`,
              payload: {
                to: buyer.phone,
                text: `🎉 Escrow complete! Payment has been released to ${vendor?.businessName ?? "the seller"}. Thank you for using SafeDrop Taraba.`,
              },
            },
          ]
        : [],
    });
    await processPendingOutbox();
  } else if (eventType === "refund.processed") {
    const colPayment = await db.orm.public.Payment.where({
      reference,
      type: "COLLECTION",
    }).first();
    if (!colPayment) return;

    const refundPayment = await db.orm.public.Payment.where({
      transactionId: colPayment.transactionId,
      type: "REFUND",
    }).first();

    if (refundPayment) {
      await db.orm.public.Payment.where({ id: refundPayment.id }).update({
        status: "SUCCESS",
        paidAt: new Date(),
      });
    }

    const tx = await db.orm.public.Transaction.where({ id: colPayment.transactionId }).first();
    if (!tx || tx.status !== "REFUND_PENDING") return;

    const buyer = await db.orm.public.Buyer.where({ id: tx.buyerId }).first();

    await applySafeTransition({
      transactionId: tx.id,
      fromStatus: "REFUND_PENDING",
      toStatus: "REFUNDED",
      actorType: "SYSTEM",
      notes: "Paystack refund processed to buyer.",
      outboxEvents: buyer
        ? [
            {
              kind: "WHATSAPP_TEXT",
              idempotencyKey: `wa:refunded:${tx.id}`,
              payload: {
                to: buyer.phone,
                text: `✅ Your refund of ₦${(colPayment.amount / 100).toLocaleString()} has been processed by Paystack.`,
              },
            },
          ]
        : [],
    });
    await processPendingOutbox();
  }
}
