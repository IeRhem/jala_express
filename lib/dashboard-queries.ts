import { db } from "@/prisma/db";
import { createPresignedViewUrl } from "@/lib/r2";

export interface EnrichedTransactionRow {
  id: string;
  buyerPhone: string;
  buyerName: string | null;
  vendorId: string;
  vendorName: string;
  vendorTown: string;
  categoryId: string;
  categoryName: string;
  riderId: string | null;
  riderName: string | null;
  itemDescription: string;
  amountKobo: number;
  escrowFeeKobo: number;
  deliveryFeeKobo: number;
  totalAmountKobo: number;
  status: string;
  deliveryAttempt: number;
  checkoutUrl: string | null;
  paymentReference: string | null;
  createdAt: string;
  events: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    outcome: string | null;
    actorType: string;
    notes: string | null;
    createdAt: string;
  }[];
  evidence: {
    id: string;
    type: string;
    outcome: string | null;
    objectKey: string;
    signedViewUrl: string;
    notes: string | null;
    createdAt: string;
  }[];
}

export interface PilotDashboardMetrics {
  totalTransactions: number;
  activeEscrowCount: number;
  completedReleasedCount: number;
  disputedOrRejectedCount: number;
  disputeRatePercent: number;
  activeEscrowVolumeKobo: number;
  realizedEscrowRevenueKobo: number;
  realizedDeliveryPayoutsKobo: number;
}

export async function getDashboardData() {
  const [
    transactions,
    buyers,
    vendors,
    categories,
    areas,
    staffList,
    roles,
    payments,
    events,
    evidenceList,
  ] = await Promise.all([
    db.orm.public.Transaction.where({}).all(),
    db.orm.public.Buyer.where({}).all(),
    db.orm.public.Vendor.where({}).all(),
    db.orm.public.Category.where({ active: true }).all(),
    db.orm.public.ServiceArea.where({ active: true }).all(),
    db.orm.public.Staff.where({ active: true }).all(),
    db.orm.public.Role.where({ active: true }).all(),
    db.orm.public.Payment.where({}).all(),
    db.orm.public.TransactionEvent.where({}).all(),
    db.orm.public.DeliveryEvidence.where({}).all(),
  ]);

  const buyerMap = new Map(buyers.map((b: any) => [b.id, b]));
  const areaMap = new Map(areas.map((a: any) => [a.id, a]));
  const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
  const staffMap = new Map(staffList.map((s: any) => [s.id, s]));
  const roleMap = new Map(roles.map((r: any) => [r.id, r]));

  // Sort transactions newest first
  const sortedTxs = [...transactions].sort(
    (a: any, b: any) => b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds
  );

  const enrichedTransactions: EnrichedTransactionRow[] = sortedTxs.map((tx: any) => {
    const buyer: any = buyerMap.get(tx.buyerId);
    const vendor: any = vendorMap.get(tx.vendorId);
    const vendorArea: any = vendor ? areaMap.get(vendor.areaId) : null;
    const category: any = categoryMap.get(tx.categoryId);
    const rider: any = tx.riderId ? staffMap.get(tx.riderId) : null;

    const txPayments = payments
      .filter((p: any) => p.transactionId === tx.id && p.type === "COLLECTION")
      .sort((a: any, b: any) => b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds);
    const latestCollection = txPayments[0];

    const txEvents = events
      .filter((ev: any) => ev.transactionId === tx.id)
      .sort((a: any, b: any) => a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds)
      .map((ev: any) => ({
        id: ev.id,
        fromStatus: ev.fromStatus ?? null,
        toStatus: ev.toStatus,
        outcome: ev.outcome ?? null,
        actorType: ev.actorType,
        notes: ev.notes ?? null,
        createdAt: ev.createdAt.toString(),
      }));

    const txEvidence = evidenceList
      .filter((item: any) => item.transactionId === tx.id)
      .sort((a: any, b: any) => b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds)
      .map((item: any) => ({
        id: item.id,
        type: item.type,
        outcome: item.outcome ?? null,
        objectKey: item.objectKey,
        signedViewUrl: createPresignedViewUrl(item.objectKey),
        notes: item.notes ?? null,
        createdAt: item.createdAt.toString(),
      }));

    const amountKobo = tx.amount || 0;
    const escrowFeeKobo = tx.escrowFee || 0;
    const deliveryFeeKobo = tx.deliveryFee || 0;
    const totalAmountKobo = tx.totalAmount || amountKobo + escrowFeeKobo + deliveryFeeKobo;

    return {
      id: tx.id,
      buyerPhone: buyer?.phone || "Unknown",
      buyerName: buyer?.name || null,
      vendorId: tx.vendorId,
      vendorName: vendor?.businessName || "Unknown Vendor",
      vendorTown: vendorArea?.name || "Taraba",
      categoryId: tx.categoryId,
      categoryName: category?.name || "General",
      riderId: tx.riderId || null,
      riderName: rider?.name || null,
      itemDescription: tx.itemDescription,
      amountKobo,
      escrowFeeKobo,
      deliveryFeeKobo,
      totalAmountKobo,
      status: tx.status,
      deliveryAttempt: tx.deliveryAttempt || 1,
      checkoutUrl: latestCollection?.checkoutUrl || null,
      paymentReference: latestCollection?.reference || null,
      createdAt: tx.createdAt.toString(),
      events: txEvents,
      evidence: txEvidence,
    };
  });

  // Compute PRD Section 7 Pilot Metrics
  const activeStatuses = new Set([
    "HELD",
    "COLLECTING",
    "VERIFIED",
    "DELIVERED",
    "CONFIRMED",
    "PAYOUT_PENDING",
  ]);
  const disputeStatuses = new Set([
    "DISPUTED",
    "REJECTED_AT_PICKUP",
    "REJECTED_AT_DELIVERY",
    "REFUND_PENDING",
    "REFUNDED",
  ]);

  let activeEscrowCount = 0;
  let completedReleasedCount = 0;
  let disputedOrRejectedCount = 0;
  let activeEscrowVolumeKobo = 0;
  let realizedEscrowRevenueKobo = 0;
  let realizedDeliveryPayoutsKobo = 0;

  for (const row of enrichedTransactions) {
    if (activeStatuses.has(row.status)) {
      activeEscrowCount++;
      activeEscrowVolumeKobo += row.totalAmountKobo;
    }
    if (row.status === "RELEASED") {
      completedReleasedCount++;
      realizedEscrowRevenueKobo += row.escrowFeeKobo;
      realizedDeliveryPayoutsKobo += row.deliveryFeeKobo;
    }
    if (disputeStatuses.has(row.status)) {
      disputedOrRejectedCount++;
    }
  }

  const totalTransactions = enrichedTransactions.length;
  const disputeRatePercent =
    totalTransactions > 0 ? Number(((disputedOrRejectedCount / totalTransactions) * 100).toFixed(1)) : 0;

  const metrics: PilotDashboardMetrics = {
    totalTransactions,
    activeEscrowCount,
    completedReleasedCount,
    disputedOrRejectedCount,
    disputeRatePercent,
    activeEscrowVolumeKobo,
    realizedEscrowRevenueKobo,
    realizedDeliveryPayoutsKobo,
  };

  const formattedVendors = vendors
    .filter((v: any) => v.active)
    .map((v: any) => ({
      id: v.id,
      businessName: v.businessName,
      phone: v.phone,
      town: (areaMap.get(v.areaId) as any)?.name || "Taraba",
      payoutRecipientRef: v.payoutRecipientRef || null,
      bankName: v.bankName || null,
      accountNumber: v.accountNumber || null,
    }));

  const formattedStaff = staffList.map((s: any) => {
    const role: any = roleMap.get(s.roleId);
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      roleName: role?.name || "Staff",
      roleSlug: role?.slug || "staff",
    };
  });

  return {
    metrics,
    transactions: enrichedTransactions,
    vendors: formattedVendors,
    categories: categories.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
    areas: areas.map((a: any) => ({ id: a.id, name: a.name })),
    staff: formattedStaff,
  };
}
