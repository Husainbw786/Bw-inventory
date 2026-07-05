import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppLayout";
import {
  useDB, newId, nowStamp, today, stockOf, lastPurchaseRate, lastSaleRate, fmtINR, fmtDate,
  findItem, findDealer, findCustomer, ADJUSTMENT_REASONS, type AdjustmentReason, type StockAdjustment,
} from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useCanWrite } from "@/lib/auth";
import { ArrowLeft, ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PeFormError } from "@/components/ui/pe";

export const Route = createFileRoute("/items/$id")({
  // ?adjust=1 opens the stock-adjust dialog straight away (from the items list menu)
  validateSearch: (search: Record<string, unknown>): { adjust?: "1" } => ({
    ...(search.adjust === "1" ? { adjust: "1" as const } : {}),
  }),
  component: ItemDetail,
  notFoundComponent: () => <p className="p-6">Item not found.</p>,
});

function ItemDetail() {
  const { id } = Route.useParams();
  const { adjust } = Route.useSearch();
  const [db, set] = useDB();
  const canWrite = useCanWrite();
  const [adjustOpen, setAdjustOpen] = React.useState(adjust === "1");
  const item = findItem(db, id);
  if (!item) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="mb-2"><Link to="/items"><ArrowLeft /> Back</Link></Button>
        <p className="text-muted-foreground">Item not found.</p>
      </>
    );
  }

  const stock = stockOf(db, item.id);
  const lp = lastPurchaseRate(db, item.id);
  const ls = lastSaleRate(db, item.id);

  type Row = {
    kind: "purchase" | "sale" | "adjustment";
    id?: string;
    date: string; createdAt: string; qty: number; rate: number | null;
    who: string; party: string; addedBy: string;
  };
  const rows: Row[] = [
    ...db.purchases
      .filter((p) => p.itemId === item.id)
      .map((p) => ({
        kind: "purchase" as const,
        date: p.date,
        createdAt: p.createdAt,
        qty: p.qty,
        rate: p.rate as number | null,
        who: "From",
        party: findDealer(db, p.dealerId)?.name ?? "—",
        addedBy: p.addedBy,
      })),
    ...db.sales.flatMap((s) =>
      s.lines
        .filter((l) => l.itemId === item.id)
        .map((l) => ({
          kind: "sale" as const,
          date: s.date,
          createdAt: s.createdAt,
          qty: l.qty,
          rate: l.rate as number | null,
          who: "To",
          party: findCustomer(db, s.customerId)?.name ?? "—",
          addedBy: s.addedBy,
        })),
    ),
    ...db.adjustments
      .filter((a) => a.itemId === item.id)
      .map((a) => ({
        kind: "adjustment" as const,
        id: a.id,
        date: a.date,
        createdAt: a.createdAt,
        qty: a.qty,
        rate: null,
        who: "",
        party: (ADJUSTMENT_REASONS.find((r) => r.value === a.reason)?.label ?? a.reason) + (a.notes ? ` — ${a.notes}` : ""),
        addedBy: a.addedBy,
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2"><Link to="/items"><ArrowLeft /> Back</Link></Button>

      <PageHeader
        title={item.name}
        subtitle={item.company}
        action={
          canWrite ? (
            <Button variant="outline" onClick={() => setAdjustOpen(true)}>
              <SlidersHorizontal /> Adjust stock
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="p-3 min-w-0"><div className="text-xs text-muted-foreground">Stock</div><div className="text-lg sm:text-xl font-semibold tabular-nums truncate">{stock} <span className="text-xs text-muted-foreground">{item.unit}</span></div></CardContent></Card>
        <Card><CardContent className="p-3 min-w-0"><div className="text-xs text-muted-foreground">Last buy</div><div className="text-base font-semibold truncate">{lp != null ? fmtINR(lp) : "—"}</div></CardContent></Card>
        <Card><CardContent className="p-3 min-w-0"><div className="text-xs text-muted-foreground">Last sell</div><div className="text-base font-semibold truncate">{ls != null ? fmtINR(ls) : "—"}</div></CardContent></Card>
      </div>

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">History</h2>
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r, i) => (
                <li key={r.id ?? i} className="p-3 flex items-center gap-3">
                  <div
                    className={`rounded-md p-2 ${
                      r.kind === "purchase"
                        ? "bg-blue-100 text-blue-700"
                        : r.kind === "sale"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.kind === "adjustment"
                      ? <SlidersHorizontal className="h-4 w-4" />
                      : r.kind === "purchase"
                        ? <ArrowDown className="h-4 w-4" />
                        : <ArrowUp className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.who ? `${r.who} ${r.party}` : r.party}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.date)} · by {r.addedBy}</div>
                  </div>
                  <div className="text-right">
                    {r.kind === "adjustment" ? (
                      <div className={`text-sm font-semibold tabular-nums ${r.qty > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {r.qty > 0 ? `+${r.qty}` : r.qty} {item.unit}
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold tabular-nums">{r.qty} × {fmtINR(r.rate ?? 0)}</div>
                        <div className="text-xs text-muted-foreground">{fmtINR(r.qty * (r.rate ?? 0))}</div>
                      </>
                    )}
                  </div>
                  {r.kind === "adjustment" && r.id && (
                    <AdminDelete
                      label="stock adjustment"
                      onConfirm={() => set((d) => ({ ...d, adjustments: d.adjustments.filter((a) => a.id !== r.id) }))}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} itemId={item.id} unit={item.unit} stock={stock} />
    </>
  );
}

function AdjustStockDialog({ open, onOpenChange, itemId, unit, stock }: {
  open: boolean; onOpenChange: (b: boolean) => void; itemId: string; unit?: string; stock: number;
}) {
  const [db, set] = useDB();
  const [reason, setReason] = React.useState<AdjustmentReason>("opening");
  const [qty, setQty] = React.useState("");
  const [removeIt, setRemoveIt] = React.useState(false); // only for "correction"
  const [date, setDate] = React.useState(today());
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason("opening");
      setQty("");
      setRemoveIt(false);
      setDate(today());
      setNote("");
      setSaving(false);
      setError(null);
    }
  }, [open]);

  const meta = ADJUSTMENT_REASONS.find((r) => r.value === reason)!;
  const sign = reason === "correction" ? (removeIt ? -1 : 1) : meta.sign;

  const submit = async () => {
    const n = Number(qty);
    if (!n || n <= 0) return setError("Enter a quantity");
    const signed = sign * n;
    if (signed < 0 && stock + signed < 0) return setError(`Only ${stock} in stock`);
    const adj: StockAdjustment = {
      id: newId(),
      date,
      itemId,
      qty: signed,
      reason,
      notes: note.trim() || undefined,
      addedBy: db.currentUser,
      createdAt: nowStamp(),
    };
    setSaving(true);
    setError(null);
    const res = await set((d) => ({ ...d, adjustments: [...d.adjustments, adj] }));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(`Stock ${signed > 0 ? "increased" : "reduced"} by ${Math.abs(signed)}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust stock</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AdjustmentReason)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reason === "correction" && (
            <div className="grid gap-1.5">
              <Label>Direction</Label>
              <Select value={removeIt ? "remove" : "add"} onValueChange={(v) => setRemoveIt(v === "remove")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add to stock</SelectItem>
                  <SelectItem value="remove">Remove from stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Quantity {unit ? `(${unit})` : ""}</Label>
              <NumberInput value={qty} onValueChange={setQty} className="h-11" autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="h-11" />
          </div>
          <p className="text-xs text-muted-foreground">
            This will {sign > 0 ? "add to" : "remove from"} stock. Current stock: {stock} {unit ?? ""}
          </p>
        </div>
        <PeFormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
