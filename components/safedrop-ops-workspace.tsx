"use client";

import React, { useState, useTransition } from "react";
import type { EnrichedTransactionRow } from "@/lib/dashboard-queries";
import { COMMON_NIGERIAN_BANKS } from "@/lib/paystack-banks";
import {
  createTransactionAction,
  verifyVendorBankAction,
  createVendorWithRecipientAction,
  getEvidenceUploadUrlAction,
  recordPickupInspectionAction,
  markDeliveredAction,
  manualOpsResolutionAction,
} from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Props {
  view: "ledger" | "new-order" | "vendors";
  transactions: EnrichedTransactionRow[];
  vendors: {
    id: string;
    businessName: string;
    phone: string;
    town: string;
    payoutRecipientRef: string | null;
    bankName: string | null;
    accountNumber: string | null;
  }[];
  categories: { id: string; name: string; slug: string }[];
  areas: { id: string; name: string }[];
  staff: { id: string; name: string; phone: string; roleName: string; roleSlug: string }[];
}

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "RELEASED" || status === "CONFIRMED" || status === "VERIFIED") return "default";
  if (
    status === "DISPUTED" ||
    status === "REJECTED_AT_PICKUP" ||
    status === "REJECTED_AT_DELIVERY"
  ) {
    return "destructive";
  }
  if (status === "HELD" || status === "COLLECTING" || status === "DELIVERED") return "secondary";
  return "outline";
}

export function SafeDropOpsWorkspace({
  view,
  transactions,
  vendors,
  categories,
  areas,
  staff,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedTx, setSelectedTx] = useState<EnrichedTransactionRow | null>(null);
  const [isPending, startTransition] = useTransition();

  // New Order Form State
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [vendorId, setVendorId] = useState(vendors[0]?.id || "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [riderId, setRiderId] = useState(
    staff.find((s) => s.roleSlug === "rider")?.id || staff[0]?.id || ""
  );
  const [itemDescription, setItemDescription] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [escrowFeeNaira, setEscrowFeeNaira] = useState("500");
  const [deliveryFeeNaira, setDeliveryFeeNaira] = useState("1000");
  const [createdCheckoutUrl, setCreatedCheckoutUrl] = useState<string | null>(null);
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);

  // Vendor Onboarding Form State
  const [vBusinessName, setVBusinessName] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vAreaId, setVAreaId] = useState(areas[0]?.id || "");
  const [vCategoryId, setVCategoryId] = useState(categories[0]?.id || "");
  const [vBankCode, setVBankCode] = useState(COMMON_NIGERIAN_BANKS[0].code);
  const [vAccountNumber, setVAccountNumber] = useState("");
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(null);
  const [vendorFeedback, setVendorFeedback] = useState<string | null>(null);

  // Pickup Inspection & Delivery Drawer State
  const [activeStaffId, setActiveStaffId] = useState(staff[0]?.id || "");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [inspectionFile, setInspectionFile] = useState<File | null>(null);
  const [drawerFeedback, setDrawerFeedback] = useState<string | null>(null);

  const filteredTransactions =
    statusFilter === "ALL"
      ? transactions
      : transactions.filter((t) => t.status === statusFilter);

  async function uploadFileToR2(txId: string, evidenceType: "PICKUP_INSPECTION" | "DELIVERY_PROOF", file: File) {
    const presigned = await getEvidenceUploadUrlAction(txId, evidenceType, file.name);
    if (!presigned.uploadUrl.includes("r2-mock.safedrop.ng")) {
      await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
    }
    return presigned.objectKey;
  }

  function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setOrderFeedback(null);
    setCreatedCheckoutUrl(null);

    startTransition(async () => {
      try {
        const res = await createTransactionAction({
          buyerPhone,
          buyerName: buyerName || undefined,
          vendorId,
          categoryId,
          riderId: riderId || undefined,
          itemDescription,
          amountNaira: Number(amountNaira),
          escrowFeeNaira: Number(escrowFeeNaira || 0),
          deliveryFeeNaira: Number(deliveryFeeNaira || 0),
        });
        setCreatedCheckoutUrl(res.checkoutUrl || null);
        setOrderFeedback(
          `Order created! Total: ₦${res.totalAmountNaira.toLocaleString()}. Copy the Paystack link below and send to buyer on WhatsApp.`
        );
        setItemDescription("");
        setAmountNaira("");
      } catch (err: unknown) {
        setOrderFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  function handleVerifyBank() {
    setVendorFeedback(null);
    startTransition(async () => {
      try {
        const res = await verifyVendorBankAction(vAccountNumber, vBankCode);
        setVerifiedAccountName(res.accountName);
        setVendorFeedback(`Verified Account Holder: ${res.accountName}`);
      } catch (err: unknown) {
        setVerifiedAccountName(null);
        setVendorFeedback(
          `Bank resolution error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  function handleCreateVendor(e: React.FormEvent) {
    e.preventDefault();
    setVendorFeedback(null);
    startTransition(async () => {
      try {
        const res = await createVendorWithRecipientAction({
          businessName: vBusinessName,
          phone: vPhone,
          areaId: vAreaId,
          categoryIds: [vCategoryId],
          bankCode: vBankCode,
          accountNumber: vAccountNumber,
          verifiedAccountName: verifiedAccountName || undefined,
        });
        setVendorFeedback(
          `Vendor onboarded! Paystack Recipient Code: ${res.recipientCode} (${res.bankName})`
        );
        setVBusinessName("");
        setVPhone("");
        setVAccountNumber("");
        setVerifiedAccountName(null);
      } catch (err: unknown) {
        setVendorFeedback(
          `Failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  function handlePickupInspection(verified: boolean) {
    if (!selectedTx) return;
    setDrawerFeedback(null);

    startTransition(async () => {
      try {
        let objectKey = `transactions/${selectedTx.id}/pickup_inspection/manual-${Date.now()}.jpg`;
        if (inspectionFile) {
          objectKey = await uploadFileToR2(selectedTx.id, "PICKUP_INSPECTION", inspectionFile);
        }

        await recordPickupInspectionAction({
          transactionId: selectedTx.id,
          staffId: activeStaffId,
          verified,
          objectKey,
          notes: inspectionNotes,
        });

        setDrawerFeedback(
          verified
            ? "✅ Marked VERIFIED at pickup! Buyer notified via WhatsApp."
            : "⚠️ Marked REJECTED AT PICKUP! Automatic Paystack refund queued."
        );
        setInspectionNotes("");
        setInspectionFile(null);
      } catch (err: unknown) {
        setDrawerFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  function handleMarkDelivered() {
    if (!selectedTx) return;
    setDrawerFeedback(null);

    startTransition(async () => {
      try {
        let objectKey: string | undefined;
        if (inspectionFile) {
          objectKey = await uploadFileToR2(selectedTx.id, "DELIVERY_PROOF", inspectionFile);
        }
        await markDeliveredAction({
          transactionId: selectedTx.id,
          staffId: activeStaffId,
          objectKey,
          notes: inspectionNotes || "Delivered at buyer doorstep.",
        });
        setDrawerFeedback(
          "📦 Marked DELIVERED! Interactive Accept/Reject buttons sent to buyer's WhatsApp."
        );
        setInspectionNotes("");
        setInspectionFile(null);
      } catch (err: unknown) {
        setDrawerFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  function handleManualResolution(action: "RELEASE" | "REFUND" | "DISPUTE") {
    if (!selectedTx) return;
    setDrawerFeedback(null);

    startTransition(async () => {
      try {
        await manualOpsResolutionAction({
          transactionId: selectedTx.id,
          staffId: activeStaffId,
          action,
          notes: inspectionNotes || `Ops manual ${action} action`,
        });
        setDrawerFeedback(`✔ Executed manual ${action} action.`);
        setInspectionNotes("");
      } catch (err: unknown) {
        setDrawerFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }

  return (
    <div className="px-4 lg:px-6">
      {view === "ledger" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {["ALL", "PENDING_PAYMENT", "HELD", "VERIFIED", "DELIVERED", "DISPUTED", "RELEASED"].map(
              (st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={statusFilter === st ? "default" : "outline"}
                  onClick={() => setStatusFilter(st)}
                >
                  {st.replace(/_/g, " ")}
                </Button>
              )
            )}
          </div>
        </div>
      )}

      {view === "ledger" && (
          <Card>
            <CardHeader>
              <CardTitle>SafeDrop Taraba — Live Escrow Transactions</CardTitle>
              <CardDescription>
                Click any transaction row to inspect pickup photos, mark delivery, or trigger Paystack payouts/refunds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Item & Category</TableHead>
                    <TableHead>Buyer (WhatsApp)</TableHead>
                    <TableHead>Seller (Town)</TableHead>
                    <TableHead>Assigned Rider</TableHead>
                    <TableHead className="text-right">Item Price</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No escrow transactions match this filter yet. Use &ldquo;+ New WhatsApp Order&rdquo; to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedTx(tx);
                          setDrawerFeedback(null);
                        }}
                      >
                        <TableCell>
                          <Badge variant={statusBadgeVariant(tx.status)}>
                            {tx.status.replace(/_/g, " ")}
                          </Badge>
                          {tx.deliveryAttempt > 1 && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (Try #{tx.deliveryAttempt})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{tx.itemDescription}</div>
                          <div className="text-xs text-muted-foreground">{tx.categoryName}</div>
                        </TableCell>
                        <TableCell>
                          <div>{tx.buyerPhone}</div>
                          {tx.buyerName && (
                            <div className="text-xs text-muted-foreground">{tx.buyerName}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{tx.vendorName}</div>
                          <div className="text-xs text-muted-foreground">{tx.vendorTown}</div>
                        </TableCell>
                        <TableCell>{tx.riderName || "Unassigned"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNaira(tx.amountKobo)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatNaira(tx.totalAmountKobo)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTx(tx);
                              setDrawerFeedback(null);
                            }}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      )}

      {view === "new-order" && (
          <Card>
            <CardHeader>
              <CardTitle>Create Escrow Order from WhatsApp Intake</CardTitle>
              <CardDescription>
                Generates a unique Paystack checkout link for the buyer. Funds move to HELD automatically as soon as payment clears.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateOrder} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="buyerPhone">Buyer WhatsApp Number (e.g. 234803...)</Label>
                  <Input
                    id="buyerPhone"
                    placeholder="2348031234567"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerName">Buyer Name (Optional)</Label>
                  <Input
                    id="buyerName"
                    placeholder="e.g. Danladi Musa"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendorSelect">Verified Seller / Vendor</Label>
                  <select
                    id="vendorSelect"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    required
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.businessName} ({v.town})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categorySelect">Category</Label>
                  <select
                    id="categorySelect"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="itemDescription">Item Description & Specs to Verify at Pickup</Label>
                  <Input
                    id="itemDescription"
                    placeholder="e.g. Samsung Galaxy A35 (128GB, Black, Sealed Box) or 2x Large Beef Suya Packs"
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amountNaira">Seller Item Price (₦)</Label>
                  <Input
                    id="amountNaira"
                    type="number"
                    placeholder="e.g. 15000"
                    value={amountNaira}
                    onChange={(e) => setAmountNaira(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="escrowFeeNaira">SafeDrop Escrow Fee (₦)</Label>
                    <Input
                      id="escrowFeeNaira"
                      type="number"
                      value={escrowFeeNaira}
                      onChange={(e) => setEscrowFeeNaira(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryFeeNaira">Rider Delivery Fee (₦)</Label>
                    <Input
                      id="deliveryFeeNaira"
                      type="number"
                      value={deliveryFeeNaira}
                      onChange={(e) => setDeliveryFeeNaira(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="riderSelect">Assign Pilot Rider</Label>
                  <select
                    id="riderSelect"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={riderId}
                    onChange={(e) => setRiderId(e.target.value)}
                  >
                    <option value="">-- Assign Later --</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roleName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Generating Paystack Escrow Link..." : "Create Transaction & Generate Paystack Link"}
                  </Button>
                </div>
              </form>

              {orderFeedback && (
                <div className="mt-4 rounded-md border p-4 text-sm">
                  <p className="font-medium">{orderFeedback}</p>
                  {createdCheckoutUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input readOnly value={createdCheckoutUrl} className="font-mono text-xs" />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigator.clipboard.writeText(createdCheckoutUrl)}
                      >
                        Copy Link
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
      )}

      {view === "vendors" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Onboard Vendor & Verify Bank (Paystack NUBAN)</CardTitle>
                <CardDescription>
                  Resolves the seller&apos;s 10-digit account number and creates a Paystack `RCP_xxx` transfer recipient automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateVendor} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Business / Seller Name</Label>
                    <Input
                      placeholder="e.g. Alhaji Bala Electronics"
                      value={vBusinessName}
                      onChange={(e) => setVBusinessName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>WhatsApp Phone</Label>
                      <Input
                        placeholder="23480..."
                        value={vPhone}
                        onChange={(e) => setVPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taraba Town</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        value={vAreaId}
                        onChange={(e) => setVAreaId(e.target.value)}
                      >
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Primary Category</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={vCategoryId}
                      onChange={(e) => setVCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Bank</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        value={vBankCode}
                        onChange={(e) => setVBankCode(e.target.value)}
                      >
                        {COMMON_NIGERIAN_BANKS.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>10-Digit Account Number</Label>
                      <div className="flex gap-2">
                        <Input
                          maxLength={10}
                          placeholder="0123456789"
                          value={vAccountNumber}
                          onChange={(e) => setVAccountNumber(e.target.value)}
                          required
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleVerifyBank}
                          disabled={isPending || vAccountNumber.length !== 10}
                        >
                          Verify
                        </Button>
                      </div>
                    </div>
                  </div>

                  {vendorFeedback && (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs font-medium">
                      {vendorFeedback}
                    </div>
                  )}

                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Registering Recipient..." : "Save Vendor & Create Paystack Recipient"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Pilot Vendors</CardTitle>
                <CardDescription>
                  Sellers across Jalingo, Wukari, and Takum ready for automated Paystack releases.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead>Bank & Account</TableHead>
                      <TableHead>Recipient Code</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="font-medium">{v.businessName}</div>
                          <div className="text-xs text-muted-foreground">{v.phone}</div>
                        </TableCell>
                        <TableCell>{v.town}</TableCell>
                        <TableCell className="text-xs">
                          <div>{v.bankName || "—"}</div>
                          <div className="font-mono text-muted-foreground">
                            {v.accountNumber || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.payoutRecipientRef ? "default" : "destructive"}>
                            {v.payoutRecipientRef || "Missing RCP"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
      )}

      {/* TRANSACTION INSPECTION & OPS DRAWER */}
      {view === "ledger" && (
        <Sheet open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedTx && (
            <div className="space-y-6 pr-2">
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between gap-2">
                  <span>Order #{selectedTx.id.slice(0, 8)}</span>
                  <Badge variant={statusBadgeVariant(selectedTx.status)}>
                    {selectedTx.status}
                  </Badge>
                </SheetTitle>
                <SheetDescription>
                  {selectedTx.itemDescription} • {selectedTx.vendorName} ({selectedTx.vendorTown})
                </SheetDescription>
              </SheetHeader>

              {/* Financial Breakdown */}
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buyer WhatsApp:</span>
                  <span className="font-mono">{selectedTx.buyerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seller Item Price:</span>
                  <span className="font-mono">{formatNaira(selectedTx.amountKobo)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SafeDrop Escrow Fee:</span>
                  <span className="font-mono">{formatNaira(selectedTx.escrowFeeKobo)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rider Delivery Fee:</span>
                  <span className="font-mono">{formatNaira(selectedTx.deliveryFeeKobo)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total Buyer Checkout:</span>
                  <span className="font-mono">{formatNaira(selectedTx.totalAmountKobo)}</span>
                </div>
                {selectedTx.checkoutUrl && (
                  <div className="pt-2 flex items-center gap-2">
                    <Input readOnly value={selectedTx.checkoutUrl} className="text-xs font-mono h-8" />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigator.clipboard.writeText(selectedTx.checkoutUrl!)}
                    >
                      Copy Link
                    </Button>
                  </div>
                )}
              </div>

              {/* Rider / Ops Inspection & Delivery Controls */}
              <div className="space-y-3 rounded-lg border p-4">
                <h4 className="text-sm font-semibold">Rider & Ops Verification Actions</h4>

                <div className="space-y-1.5">
                  <Label className="text-xs">Acting Staff / Rider</Label>
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                    value={activeStaffId}
                    onChange={(e) => setActiveStaffId(e.target.value)}
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roleName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Inspection / Delivery Photo (Cloudflare R2 Private Bucket)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="text-xs"
                    onChange={(e) => setInspectionFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Inspection / Resolution Notes</Label>
                  <Input
                    placeholder="e.g. Checked IMEI & screen at seller shop; matches listing."
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Contextual Action Buttons based on current Escrow State */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {(selectedTx.status === "HELD" || selectedTx.status === "COLLECTING") && (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => handlePickupInspection(true)}
                      >
                        ✅ Verify at Pickup
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handlePickupInspection(false)}
                      >
                        ✕ Reject at Pickup (Auto-Refund)
                      </Button>
                    </>
                  )}

                  {selectedTx.status === "VERIFIED" && (
                    <Button size="sm" disabled={isPending} onClick={handleMarkDelivered}>
                      📦 Mark Delivered at Door (Send WhatsApp Prompt)
                    </Button>
                  )}

                  {(selectedTx.status === "DELIVERED" || selectedTx.status === "DISPUTED") && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isPending}
                        onClick={() => handleManualResolution("RELEASE")}
                      >
                        💰 Manual Release to Seller
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handleManualResolution("REFUND")}
                      >
                        💳 Manual Refund to Buyer
                      </Button>
                    </>
                  )}

                  {selectedTx.status !== "DISPUTED" &&
                    selectedTx.status !== "RELEASED" &&
                    selectedTx.status !== "REFUNDED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleManualResolution("DISPUTE")}
                      >
                        🚩 Flag Dispute
                      </Button>
                    )}
                </div>

                {drawerFeedback && (
                  <p className="rounded bg-muted p-2 text-xs font-medium">{drawerFeedback}</p>
                )}
              </div>

              {/* R2 Evidence Gallery */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Logged Inspection Evidence ({selectedTx.evidence.length})
                </h4>
                {selectedTx.evidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No photos uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTx.evidence.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between rounded border p-2 text-xs">
                        <div>
                          <div className="font-medium">
                            {ev.type.replace(/_/g, " ")} — {ev.outcome}
                          </div>
                          {ev.notes && <div className="text-muted-foreground">{ev.notes}</div>}
                        </div>
                        <a
                          href={ev.signedViewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-medium"
                        >
                          View R2 Photo
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Immutable Audit Trail */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Transaction Audit Log ({selectedTx.events.length})
                </h4>
                <div className="space-y-2 border-l-2 pl-3 text-xs">
                  {selectedTx.events.map((ev) => (
                    <div key={ev.id} className="space-y-0.5">
                      <div className="font-medium">
                        {ev.fromStatus ? `${ev.fromStatus} → ` : ""}
                        {ev.toStatus} <span className="text-muted-foreground">({ev.actorType})</span>
                      </div>
                      {ev.notes && <div className="text-muted-foreground">{ev.notes}</div>}
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(ev.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
