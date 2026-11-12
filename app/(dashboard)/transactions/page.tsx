import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SafeDropOpsWorkspace } from "@/components/safedrop-ops-workspace";
import { getDashboardData } from "@/lib/dashboard-queries";

export const metadata: Metadata = {
  title: "Escrow Ledger",
};

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading transactions...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}

async function TransactionsContent() {
  await connection();
  const { transactions, vendors, categories, areas, staff } = await getDashboardData();

  return (
    <div className="py-4 md:py-6">
      <SafeDropOpsWorkspace
        view="ledger"
        transactions={transactions}
        vendors={vendors}
        categories={categories}
        areas={areas}
        staff={staff}
      />
    </div>
  );
}
