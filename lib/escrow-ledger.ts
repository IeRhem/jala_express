import { db } from "@/prisma/db";

export type TransactionStatusType =
  | "PENDING_PAYMENT"
  | "HELD"
  | "COLLECTING"
  | "VERIFIED"
  | "REJECTED_AT_PICKUP"
  | "DELIVERED"
  | "CONFIRMED"
  | "REJECTED_AT_DELIVERY"
  | "PAYOUT_PENDING"
  | "RELEASED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "DISPUTED"
  | "CANCELLED"
  | "EXPIRED";

export const ALLOWED_TRANSITIONS: Record<TransactionStatusType, TransactionStatusType[]> = {
  PENDING_PAYMENT: ["HELD", "CANCELLED", "EXPIRED"],
  HELD: ["COLLECTING", "REFUND_PENDING", "DISPUTED"],
  COLLECTING: ["VERIFIED", "REJECTED_AT_PICKUP", "DISPUTED"],
  REJECTED_AT_PICKUP: ["REFUND_PENDING", "REFUNDED"],
  VERIFIED: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["CONFIRMED", "REJECTED_AT_DELIVERY", "DISPUTED"],
  CONFIRMED: ["PAYOUT_PENDING", "RELEASED"],
  PAYOUT_PENDING: ["RELEASED", "DISPUTED"],
  REJECTED_AT_DELIVERY: ["REFUND_PENDING", "COLLECTING", "DISPUTED"],
  REFUND_PENDING: ["REFUNDED", "DISPUTED"],
  DISPUTED: ["REFUND_PENDING", "PAYOUT_PENDING", "COLLECTING", "RELEASED", "REFUNDED"],
  RELEASED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export interface OutboxDraft {
  kind: "WHATSAPP_TEXT" | "WHATSAPP_BUTTONS" | "PAYSTACK_TRANSFER" | "PAYSTACK_REFUND";
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/**
 * Race-safe state transition helper.
 * Filters by BOTH `id` and `status: fromStatus` inside the DB transaction
 * to prevent TOCTOU double-tap bugs, writes the audit event, and queues
 * any OutboxEvent records in the exact same atomic transaction.
 */
export async function applySafeTransition(params: {
  transactionId: string;
  fromStatus: TransactionStatusType;
  toStatus: TransactionStatusType;
  actorType: "BUYER" | "STAFF" | "SYSTEM";
  staffId?: string;
  outcome?: "VERIFIED" | "REJECTED" | "ACCEPTED" | "REJECTED_BY_BUYER";
  notes: string;
  incrementDeliveryAttempt?: boolean;
  outboxEvents?: OutboxDraft[];
}): Promise<boolean> {
  const {
    transactionId,
    fromStatus,
    toStatus,
    actorType,
    staffId,
    outcome,
    notes,
    incrementDeliveryAttempt,
    outboxEvents = [],
  } = params;

  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Invalid escrow state transition: ${fromStatus} -> ${toStatus}`);
  }

  let transitioned = false;

  await db.transaction(async (tx: any) => {
    const current = await tx.orm.public.Transaction.where({
      id: transactionId,
      status: fromStatus,
    }).first();

    if (!current) {
      // Another concurrent webhook/request already transitioned this record
      transitioned = false;
      return;
    }

    const updatePayload: Record<string, unknown> = { status: toStatus };
    if (incrementDeliveryAttempt) {
      updatePayload.deliveryAttempt = (current.deliveryAttempt || 1) + 1;
    }

    await tx.orm.public.Transaction.where({
      id: transactionId,
      status: fromStatus,
    }).update(updatePayload);

    await tx.orm.public.TransactionEvent.create({
      transactionId,
      fromStatus,
      toStatus,
      outcome: outcome ?? null,
      actorType,
      staffId: staffId ?? null,
      notes,
    });

    for (const outbox of outboxEvents) {
      const existingOutbox = await tx.orm.public.OutboxEvent.where({
        idempotencyKey: outbox.idempotencyKey,
      }).first();

      if (!existingOutbox) {
        await tx.orm.public.OutboxEvent.create({
          transactionId,
          kind: outbox.kind,
          idempotencyKey: outbox.idempotencyKey,
          payload: outbox.payload,
          status: "PENDING",
        });
      }
    }

    transitioned = true;
  });

  return transitioned;
}
