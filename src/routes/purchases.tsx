import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/AppLayout";
import { EntityPicker } from "@/components/EntityPicker";
import { useDB, today, fmtINR, fmtDate, findItem, findDealer, itemLabel, newId, nowStamp, stockOf, type Purchase } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [{ title: "Purchases — Shop Manager" }] }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Purchase | null>(null);

  const list = db.purchases.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock you bought from dealers" action={canWrite ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />New</Button> : null} />

      <div className="grid gap-2">
        {list.map((p) => {
          const item = findItem(db, p.itemId);
          const dealer = findDealer(db, p.dealerId);
          const canEdit = canWrite && (isAdmin || (user && p.createdBy === user.id));
          const remainingStock = p.itemId ? stockOf(db, p.itemId) - p.qty : 0;
          const wouldGoNegative = p.itemId && remainingStock < 0;
          const shortBy = wouldGoNegative ? Math.abs(remainingStock) : 0;
          return (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{item ? itemLabel(item) : "—"}</div>
                  <div className="text-xs text-muted-foreground">From {dealer?.name ?? "—"} · {fmtDate(p.date)} · by {p.addedBy}</div>
                </div>
                <div className="text-right flex items-start gap-1">
                  <div>
                    <div className="text-sm tabular-nums">{p.qty} × {fmtINR(p.rate)}</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtINR(p.qty * p.rate)}</div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => { setEditing(p); setOpen(true); }}
                      aria-label="Edit purchase"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <AdminDelete
                    label="purchase"
                    requireReason
                    blockReason={wouldGoNegative && !isAdmin ? `Can't delete — ${shortBy} unit(s) from this purchase have already been sold. Edit the qty/rate instead, or ask an admin.` : undefined}
                    detail={wouldGoNegative && isAdmin ? `Warning: deleting this will make stock go negative by ${shortBy}. Only do this if the purchase was never received. Edit instead if you just want to fix the qty/rate.` : undefined}
                    onConfirm={(reason) => {
                      set((d) => ({ ...d, purchases: d.purchases.filter((x) => x.id !== p.id) }));
                      if (reason) toast.success(`Purchase deleted — ${reason}`);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No purchases yet.</p>}
      </div>

      <PurchaseDialog open={open} onOpenChange={setOpen} editing={editing} />
    </>
  );
}

function PurchaseDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (b: boolean) => void; editing: Purchase | null }) {
  const [db, set] = useDB();
  const [date, setDate] = React.useState(today());
  const [itemId, setItemId] = React.useState<string | null>(null);
  const [dealerId, setDealerId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDate(editing?.date ?? today());
      setItemId(editing?.itemId ?? null);
      setDealerId(editing?.dealerId ?? null);
      setQty(editing ? String(editing.qty) : "");
      setRate(editing ? String(editing.rate) : "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const total = (Number(qty) || 0) * (Number(rate) || 0);

  const submit = () => {
    if (!itemId || !dealerId || !qty || !rate) {
      toast.error("Fill item, dealer, quantity and rate");
      return;
    }
    if (editing) {
      const patch = { date, itemId, dealerId, qty: Number(qty), rate: Number(rate), notes: notes || undefined };
      set((d) => ({ ...d, purchases: d.purchases.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }));
      toast.success("Purchase updated");
    } else {
      const p: Purchase = {
        id: newId(),
        date,
        itemId,
        dealerId,
        qty: Number(qty),
        rate: Number(rate),
        notes: notes || undefined,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      set((d) => ({ ...d, purchases: [...d.purchases, p] }));
      toast.success("Purchase saved");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit purchase" : "New purchase"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Dealer</Label>
            <EntityPicker kind="dealer" value={dealerId} onChange={setDealerId} placeholder="Choose dealer" />
          </div>
          <div className="grid gap-1.5">
            <Label>Item</Label>
            <EntityPicker kind="item" value={itemId} onChange={setItemId} placeholder="Choose item" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Quantity</Label>
              <NumberInput value={qty} onValueChange={setQty} min={0} max={1000000} className="h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label>Rate (₹)</Label>
              <NumberInput value={rate} onValueChange={setRate} min={0} max={10000000} className="h-11" />
            </div>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{fmtINR(total)}</span>
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
