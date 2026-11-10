import { db } from '@/prisma/db';
import { sendText, sendButtons } from '@/lib/whatsapp';

export async function handleIncomingMessage(message: any) {
  const fromPhone: string = message.from; // e.g. "2348012345678", no "+"
  const buyer = await findOrCreateBuyer(fromPhone);

  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return handleButtonReply(buyer.id, message.interactive.button_reply.id);
  }

  if (message.type === 'text') {
    return handleTextMessage(buyer.id, message.text.body);
  }

  // Other message types (image, location, etc.) — not handled yet.
}

// find-then-create, not upsert — upsert's exact name/shape in Prisma 8
// isn't confirmed yet, and .where().first() + .create() are.
async function findOrCreateBuyer(phone: string) {
  const existing = await db.orm.public.Buyer.where({ phone }).first();
  if (existing) return existing;

  try {
    return await db.orm.public.Buyer.create({ phone, contactChannel: 'whatsapp' });
  } catch {
    // A near-simultaneous message for the same new number can race this —
    // the unique constraint on `phone` catches the duplicate. Whoever lost
    // the race just re-fetches what the winner created.
    const buyer = await db.orm.public.Buyer.where({ phone }).first();
    if (buyer) return buyer;
    throw new Error(`Failed to find or create buyer for ${phone}`);
  }
}

// Button ids are ones we generated ourselves when we sent the question,
// in the form "<action>:<transactionId>" — encoding the transaction id
// avoids having to guess which transaction a reply belongs to.
async function handleButtonReply(buyerId: string, buttonId: string) {
  const [action, transactionId] = buttonId.split(':');

  const transaction = await db.orm.public.Transaction.where({ id: transactionId }).first();
  if (!transaction || transaction.buyerId !== buyerId) return; // no match, or not this buyer's — ignore

  const buyer = await db.orm.public.Buyer.where({ id: transaction.buyerId }).first();
  if (!buyer) return; // buyerId is a foreign key, but don't assume — fail quiet, not loud
  const buyerPhone = buyer.phone;

  if (action === 'confirm' && transaction.status === 'DELIVERED') {
    await applyTransition(transactionId, 'DELIVERED', 'CONFIRMED', 'BUYER', 'Buyer confirmed via WhatsApp button');
    await sendText(buyerPhone, 'Thanks! Payment has been released to the seller.');
    // Trigger the actual Paystack payout (a new Payment row + transfer
    // call) separately — that's payment logic, doesn't belong here.
    return;
  }

  if (action === 'reject' && transaction.status === 'DELIVERED') {
    await applyTransition(transactionId, 'DELIVERED', 'REJECTED_AT_DELIVERY', 'BUYER', 'Buyer rejected at delivery via WhatsApp button');
    await sendButtons(buyerPhone, 'Sorry to hear that. What would you like?', [
      { id: `refund:${transactionId}`, title: 'Refund me' },
      { id: `replace:${transactionId}`, title: 'Send replacement' },
    ]);
    return;
  }

  if (action === 'refund' && transaction.status === 'REJECTED_AT_DELIVERY') {
    await applyTransition(transactionId, 'REJECTED_AT_DELIVERY', 'REFUNDED', 'BUYER', 'Buyer chose refund via WhatsApp button');
    await sendText(buyerPhone, 'Understood — your refund is being processed.');
    // Trigger the actual Paystack refund separately.
    return;
  }

  if (action === 'replace' && transaction.status === 'REJECTED_AT_DELIVERY') {
    // ⚠️ `.update()` below is pattern-matched against the confirmed
    // `.where().first()` / `.where().all()` shape — not directly confirmed.
    // If your editor/tsc flags it, tell me what it suggests instead.
    await db.transaction(async (tx) => {
      await tx.orm.public.Transaction
        .where({ id: transactionId })
        .update({ status: 'COLLECTING', deliveryAttempt: transaction.deliveryAttempt + 1 });
      await tx.orm.public.TransactionEvent.create({
        transactionId,
        fromStatus: 'REJECTED_AT_DELIVERY',
        toStatus: 'COLLECTING',
        actorType: 'BUYER',
        notes: 'Buyer chose replacement via WhatsApp button',
      });
    });
    await sendText(buyerPhone, 'Got it — the seller is sending a replacement.');
    // Dispatch isn't automated yet (see PRD) — this needs to notify ops
    // to assign a rider for the replacement run, not shown here.
  }
}

// ⚠️ `.update()` is the same unconfirmed guess noted above — every call
// here goes through this one function specifically so there's exactly
// one place to fix once the real method name is confirmed.
async function applyTransition(
  transactionId: string,
  fromStatus: string,
  toStatus: string,
  actorType: 'BUYER' | 'STAFF' | 'SYSTEM',
  notes: string
) {
  await db.transaction(async (tx) => {
    await tx.orm.public.Transaction.where({ id: transactionId }).update({ status: toStatus });
    await tx.orm.public.TransactionEvent.create({
      transactionId,
      fromStatus,
      toStatus,
      actorType,
      notes,
    });
  });
}

async function handleTextMessage(buyerId: string, text: string) {
  // Order intake isn't implemented here on purpose — still an open
  // design decision (see chat). Conversation.state now has a home for
  // it, but no defined values yet.
}