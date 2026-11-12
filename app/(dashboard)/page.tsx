import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { SectionCards } from "@/components/section-cards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardData } from "@/lib/dashboard-queries";


export const metadata: Metadata = {
  title: "SafeDrop Taraba — Ops & Escrow Dashboard",
  description:
    "Live escrow transaction ledger, pickup verification, and Paystack release controls for Jalingo, Wukari, and Takum.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();
  const { metrics } = await getDashboardData();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards metrics={metrics} />
      <div className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Escrow Ledger</CardTitle>
            <CardDescription>Review orders and manage pickup, delivery, and escrow outcomes.</CardDescription>
            <Button className="mt-2 w-fit" render={<Link href="/transactions" />}>
              Open ledger
            </Button>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create an Order</CardTitle>
            <CardDescription>Create an escrow order and generate a Paystack checkout link.</CardDescription>
            <Button className="mt-2 w-fit" render={<Link href="/transactions/new" />}>
              Create order
            </Button>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendors</CardTitle>
            <CardDescription>Onboard sellers, verify bank accounts, and manage payout recipients.</CardDescription>
            <Button className="mt-2 w-fit" render={<Link href="/vendors" />}>
              Manage vendors
            </Button>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
