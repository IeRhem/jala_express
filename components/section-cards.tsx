import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PilotDashboardMetrics } from "@/lib/dashboard-queries";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function SectionCards({ metrics }: { metrics?: PilotDashboardMetrics }) {
  const m: PilotDashboardMetrics = metrics ?? {
    totalTransactions: 0,
    activeEscrowCount: 0,
    completedReleasedCount: 0,
    disputedOrRejectedCount: 0,
    disputeRatePercent: 0,
    activeEscrowVolumeKobo: 0,
    realizedEscrowRevenueKobo: 0,
    realizedDeliveryPayoutsKobo: 0,
  };

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Held in Escrow</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNaira(m.activeEscrowVolumeKobo)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">{m.activeEscrowCount} active deals</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Funds custody via Paystack
          </div>
          <div className="text-muted-foreground">
            Awaiting pickup inspection or door confirmation
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Completed & Released</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {m.completedReleasedCount} / {m.totalTransactions}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">Pilot Ledger</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Verified at pickup & accepted at door
          </div>
          <div className="text-muted-foreground">
            Across Jalingo, Wukari & Takum
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Dispute & Rejection Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {m.disputeRatePercent}%
          </CardTitle>
          <CardAction>
            <Badge variant={m.disputedOrRejectedCount > 0 ? "destructive" : "outline"}>
              {m.disputedOrRejectedCount} flagged
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Includes fake/mismatched items caught at pickup
          </div>
          <div className="text-muted-foreground">
            Protected buyers from blind transfer loss
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Realized Escrow Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNaira(m.realizedEscrowRevenueKobo)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              Rider Pay: {formatNaira(m.realizedDeliveryPayoutsKobo)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Net platform escrow fees earned
          </div>
          <div className="text-muted-foreground">
            Separated from seller payout & rider delivery fees
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
