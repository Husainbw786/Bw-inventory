import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/AppLayout";
import { EntityPicker } from "@/components/EntityPicker";
import { useDB, today, fmtINR, fmtDate, findItem, findDealer, itemLabel, newId, nowStamp, stockOf, type Purchase , type Payment, schemaUpgradePending } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Pencil, Truck } from "lucide-react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import { PeAvatar, PeFormError } from "@/components/ui/pe";

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

      <div className="grid gap-3">
        {list.map((p) => {
          const item = findItem(db, p.itemId);
          const dealer = findDealer(db, p.dealerId);
          const canEdit = canWrite && (isAdmin || (user && p.createdBy === user.id));
          const remainingStock = p.itemId ? stockOf(db, p.itemId) - p.qty : 0;
          const wouldGoNegative = p.itemId && remainingStock < 0;
          const shortBy = wouldGoNegative ? Math.abs(remainingStock) : 0;
          const itemName = item ? itemLabel(item) : "—";

          const editBtn = canEdit ? (
            <button
              onClick={() => { setEditing(p); setOpen(true); }}
              aria-label="Edit purchase"
              className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[color:var(--pe-line)] text-[color:var(--pe-ink-2)] hover:bg-[color:var(--pe-bg)]"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null;
          const deleteBtn = (
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
          );

          return (
            <div
              key={p.id}
              className="rounded-2xl border border-[color:var(--pe-line)] bg-card"
              style={{ boxShadow: "0 1px 2px rgba(20,32,29,.04), 0 4px 16px rgba(20,32,29,.05)" }}
            >
              {/* ---- Mobile ---- */}
              <div className="md:hidden p-4">
                <div className="flex items-center gap-3">
                  <PeAvatar name={item?.name ?? "?"} tone="info" size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-bold text-[color:var(--pe-ink)] truncate">{itemName}</div>
                    <div className="text-[12.5px] text-[color:var(--pe-ink-3)] truncate flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 shrink-0" /> {dealer?.name ?? "—"} · {fmtDate(p.date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">{editBtn}{deleteBtn}</div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[color:var(--pe-line-2)]">
                  <div className="text-[12px] text-[color:var(--pe-ink-3)]">by {p.addedBy}</div>
                  <div className="text-right">
                    <div className="text-[12px] text-[color:var(--pe-ink-3)] tabular-nums">{p.qty} × {fmtINR(p.rate)}</div>
                    <div className="text-[18px] font-extrabold tabular-nums text-[color:var(--pe-ink)]">{fmtINR(p.qty * p.rate)}</div>
                  </div>
                </div>
              </div>

              {/* ---- Desktop ---- */}
              <div className="hidden md:flex p-4 items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PeAvatar name={item?.name ?? "?"} tone="info" size={44} />
                  <div className="min-w-0">
                    <div className="font-bold text-[color:var(--pe-ink)] truncate">{itemName}</div>
                    <div className="text-xs text-[color:var(--pe-ink-3)] flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> From {dealer?.name ?? "—"} · {fmtDate(p.date)} · by {p.addedBy}</div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <div className="text-sm tabular-nums text-[color:var(--pe-ink-3)]">{p.qty} × {fmtINR(p.rate)}</div>
                    <div className="text-[18px] font-extrabold tabular-nums text-[color:var(--pe-ink)]">{fmtINR(p.qty * p.rate)}</div>
                  </div>
                  {editBtn}
                  {deleteBtn}
                </div>
              </div>
            </div>
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
  const [paidNow, setPaidNow] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError(null);
      setDate(editing?.date ?? today());
      setItemId(editing?.itemId ?? null);
      setDealerId(editing?.dealerId ?? null);
      setQty(editing ? String(editing.qty) : "");
      setRate(editing ? String(editing.rate) : "");
      setNotes(editing?.notes ?? "");
      setPaidNow("");
    }
  }, [open, editing]);

  const total = (Number(qty) || 0) * (Number(rate) || 0);

  const submit = async () => {
    if (!itemId || !dealerId || !qty || !rate) {
      setError("Fill item, dealer, quantity and rate");
      return;
    }
    setSaving(true);
    setError(null);
    const res = editing
      ? await set((d) => {
          const patch = { date, itemId, dealerId, qty: Number(qty), rate: Number(rate), notes: notes || undefined };
          return { ...d, purchases: d.purchases.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) };
        })
      : await set((d) => {
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
          // "Paid now" settles (part of) this purchase in the dealer's khata
          // in the same save — no separate payment step for cash purchases.
          const paid = Math.min(Number(qty) * Number(rate), Math.max(0, Number(paidNow) || 0));
          const pay: Payment | null = paid > 0 && !schemaUpgradePending()
            ? {
                id: newId(),
                date,
                partyType: "dealer",
                partyId: dealerId,
                saleId: null,
                purchaseId: p.id, // deleting the purchase deletes this entry too
                amount: paid,
                mode: "cash",
                notes: "Paid with purchase",
                addedBy: db.currentUser,
                createdAt: nowStamp(),
              }
            : null;
          return { ...d, purchases: [...d.purchases, p], payments: pay ? [...d.payments, pay] : d.payments };
        });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(editing ? "Purchase updated" : "Purchase saved");
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
          {!editing && !schemaUpgradePending() && (
            <div className="grid gap-1.5">
              <Label>Paid now (₹)</Label>
              <div className="flex gap-2">
                <NumberInput value={paidNow} onValueChange={setPaidNow} min={0} max={10000000} className="h-11 flex-1" />
                <Button type="button" variant="outline" className="h-11" onClick={() => setPaidNow(String(total))}>
                  Full
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave 0 if bought on credit — the amount stays in the dealer&apos;s khata as &quot;to pay&quot;.
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
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
