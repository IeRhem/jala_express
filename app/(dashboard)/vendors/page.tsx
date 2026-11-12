import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SafeDropOpsWorkspace } from "@/components/safedrop-ops-workspace";
import { getDashboardData } from "@/lib/dashboard-queries";

export const metadata: Metadata = {
  title: "Vendors",
};

export default function VendorsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading vendors...</div>}>
      <VendorsContent />
    </Suspense>
  );
}

async function VendorsContent() {
  await connection();
  const { transactions, vendors, categories, areas, staff } = await getDashboardData();

  return (
    <div className="py-4 md:py-6">
      <SafeDropOpsWorkspace
        view="vendors"
        transactions={transactions}
        vendors={vendors}
        categories={categories}
        areas={areas}
        staff={staff}
      />
    </div>
  );
}
