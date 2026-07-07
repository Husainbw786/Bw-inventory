import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/AppLayout";
import {
  useDB, newId, nowStamp, today, fmtINR, fmtDate, usageCount, type Person, type Payment,
  type PaymentMode, PAYMENT_MODES, billPayable, partyBalance, customerLedger, dealerLedger, isValidGstin,
} from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Phone, MapPin, Pencil, Contact, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";
import { PeAvatar, PeFormError } from "@/components/ui/pe";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contactsSupported, pickContacts } from "@/lib/contacts";

export const Route = createFileRoute("/directory")({
  head: () => ({ meta: [{ title: "Directory — Shop Manager" }] }),
  component: DirectoryPage,
});

function DirectoryPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [tab, setTab] = React.useState<"dealers" | "customers">("dealers");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Person | null>(null);
  const [ledgerFor, setLedgerFor] = React.useState<Person | null>(null);
  const [canImport, setCanImport] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    setCanImport(contactsSupported());
  }, []);

  const list = tab === "dealers" ? db.dealers : db.customers;

  const handleImport = async () => {
    const kind = tab === "dealers" ? "dealer" : "customer";
    try {
      setImporting(true);
      const picked = await pickContacts();
      if (picked.length === 0) return;

      const digits = (s?: string) => (s ? s.replace(/\D/g, "") : "");
      const existing = tab === "dealers" ? db.dealers : db.customers;
      const seenPhones = new Set(existing.map((p) => digits(p.phone)).filter(Boolean));
      const seenNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));

      const toAdd: Person[] = [];
      let skipped = 0;
      for (const c of picked) {
        const phoneOk = c.phone && isValidPhone(c.phone) ? c.phone : undefined;
        const d = digits(phoneOk);
        const nameKey = c.name.trim().toLowerCase();
        const dup = (d && seenPhones.has(d)) || (!d && seenNames.has(nameKey));
        if (dup) {
          skipped++;
          continue;
        }
        if (d) seenPhones.add(d);
        seenNames.add(nameKey);
        toAdd.push({ id: newId(), name: c.name, phone: phoneOk, createdAt: nowStamp() });
      }

      if (toAdd.length > 0) {
        set((d) =>
          tab === "dealers"
            ? { ...d, dealers: [...d.dealers, ...toAdd] }
            : { ...d, customers: [...d.customers, ...toAdd] },
        );
        toast.success(`Added ${toAdd.length} ${kind}${toAdd.length === 1 ? "" : "s"}`);
      }
      if (skipped > 0) toast.info(`${skipped} already existed, skipped`);
      if (toAdd.length === 0 && skipped === 0) toast.info("Nothing to import");
    } catch {
      toast.error("Couldn't read contacts");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Directory"
        subtitle="Dealers & customers"
        action={
          canWrite ? (
            <div className="flex gap-2">
              {canImport && (
                <Button variant="outline" onClick={handleImport} disabled={importing}>
                  <Contact />
                  Import
                </Button>
              )}
              <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Add</Button>
            </div>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full mb-3">
          <TabsTrigger value="dealers">Dealers ({db.dealers.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({db.customers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="grid gap-3">
          {list.map((p) => {
            const stats = tab === "dealers"
              ? {
                  count: db.purchases.filter((x) => x.dealerId === p.id).length,
                  total: db.purchases.filter((x) => x.dealerId === p.id).reduce((s, x) => s + x.qty * x.rate, 0),
                  label: "purchases",
                }
              : {
                  count: db.sales.filter((x) => x.customerId === p.id).length,
                  total: db.sales.filter((x) => x.customerId === p.id).reduce((s, x) => s + billPayable(x), 0),
                  label: "sales",
                };
            const balance = partyBalance(db, tab === "dealers" ? "dealer" : "customer", p.id);
            const balanceLabel = balance > 0
              ? (tab === "dealers" ? "To pay" : "To receive")
              : balance < 0
                ? "Advance"
                : "Settled";
            const balanceClass = balance > 0
              ? "text-[color:var(--pe-bad)]"
              : "text-[color:var(--pe-good)]";
            const canEdit = canWrite && (isAdmin || (user && p.createdBy === user.id));
            const usage = usageCount(db, tab === "dealers" ? "dealer" : "customer", p.id);
            const detail = usage.total > 0
              ? tab === "dealers"
                ? `Warning: this dealer is referenced by ${usage.purchases} purchase(s). Those records will show "—" for the dealer after deletion. Continue?`
                : `Warning: this customer is referenced by ${usage.sales} sale(s)/bill(s). Those records will show "—" for the customer after deletion. Continue?`
              : undefined;

            const ledgerBtn = (
              <button
                onClick={() => setLedgerFor(p)}
                aria-label="Khata"
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[color:var(--pe-line)] text-[color:var(--pe-ink-2)] hover:bg-[color:var(--pe-bg)]"
              >
                <BookOpen className="h-4 w-4" />
              </button>
            );
            const editBtn = canEdit ? (
              <button
                onClick={() => { setEditing(p); setOpen(true); }}
                aria-label="Edit"
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[color:var(--pe-line)] text-[color:var(--pe-ink-2)] hover:bg-[color:var(--pe-bg)]"
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null;
            const deleteBtn = (
              <AdminDelete
                label={tab === "dealers" ? "dealer" : "customer"}
                detail={detail}
                onConfirm={() =>
                  set((d) =>
                    tab === "dealers"
                      ? { ...d, dealers: d.dealers.filter((x) => x.id !== p.id) }
                      : { ...d, customers: d.customers.filter((x) => x.id !== p.id) },
                  )
                }
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
                  <div className="flex items-start gap-3">
                    <PeAvatar name={p.name} tone={tab === "dealers" ? "info" : "green"} size={46} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold text-[color:var(--pe-ink)] truncate tracking-[-0.01em]">{p.name}</div>
                      {p.phone && <div className="text-[13px] text-[color:var(--pe-ink-3)] mt-1 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /> {p.phone}</div>}
                      {p.address && <div className="text-[13px] text-[color:var(--pe-ink-3)] mt-0.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.address}</span></div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[color:var(--pe-line-2)]">
                    <div className="min-w-0">
                      <div className={`text-[16px] font-extrabold tabular-nums leading-none ${balance !== 0 ? balanceClass : "text-[color:var(--pe-ink)]"}`}>
                        {balance === 0 ? "Settled" : fmtINR(Math.abs(balance))}
                      </div>
                      <div className="text-[12px] text-[color:var(--pe-ink-3)] mt-1">
                        {balance === 0 ? `${stats.count} ${stats.label}` : `${balanceLabel} · ${stats.count} ${stats.label}`}
                      </div>
                    </div>
                    <div className="flex-1" />
                    {ledgerBtn}
                    {editBtn}
                    {deleteBtn}
                  </div>
                </div>

                {/* ---- Desktop ---- */}
                <div className="hidden md:flex p-4 items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PeAvatar name={p.name} tone={tab === "dealers" ? "info" : "green"} size={44} />
                    <div className="min-w-0">
                      <div className="font-bold text-[color:var(--pe-ink)] truncate">{p.name}</div>
                      <div className="flex gap-4 mt-0.5 text-xs text-[color:var(--pe-ink-3)] flex-wrap">
                        {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                        {p.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.address}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <div className={`text-sm font-semibold tabular-nums ${balance !== 0 ? balanceClass : "text-[color:var(--pe-ink)]"}`}>
                        {balance === 0 ? "Settled" : `${balanceLabel} ${fmtINR(Math.abs(balance))}`}
                      </div>
                      <div className="text-xs text-[color:var(--pe-ink-3)]">{fmtINR(stats.total)} · {stats.count} {stats.label}</div>
                    </div>
                    {ledgerBtn}
                    {editBtn}
                    {deleteBtn}
                  </div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">None yet.</p>}
        </TabsContent>
      </Tabs>

      <PersonDialog open={open} onOpenChange={setOpen} kind={tab === "dealers" ? "dealer" : "customer"} editing={editing} />
      <LedgerDialog
        person={ledgerFor}
        kind={tab === "dealers" ? "dealer" : "customer"}
        onClose={() => setLedgerFor(null)}
      />
    </>
  );
}

function LedgerDialog({ person, kind, onClose }: { person: Person | null; kind: "dealer" | "customer"; onClose: () => void }) {
  const [db, set] = useDB();
  const canWrite = useCanWrite();
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [mode, setMode] = React.useState<PaymentMode>("cash");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (person) {
      setAmount("");
      setDate(today());
      setMode("cash");
      setNote("");
      setSaving(false);
      setError(null);
    }
  }, [person]);

  if (!person) return null;

  const ledger = kind === "dealer" ? dealerLedger(db, person.id) : customerLedger(db, person.id);
  const balance = partyBalance(db, kind, person.id);
  // Running balance oldest → newest so each row shows where the khata stood.
  let running = 0;
  const rows = ledger.map((e) => {
    running += e.debit - e.credit;
    return { ...e, running };
  });

  const recordPayment = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Enter an amount");
    const p: Payment = {
      id: newId(),
      date,
      partyType: kind,
      partyId: person.id,
      saleId: null,
      amount: amt,
      mode,
      notes: note.trim() || undefined,
      addedBy: db.currentUser,
      createdAt: nowStamp(),
    };
    setSaving(true);
    setError(null);
    const res = await set((d) => ({ ...d, payments: [...d.payments, p] }));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(kind === "dealer" ? "Payment to dealer recorded" : "Payment received recorded");
    setAmount("");
    setNote("");
  };

  return (
    <Dialog open={!!person} onOpenChange={(b) => { if (!b) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {person.name} — Khata
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-[color:var(--pe-line)] px-4 py-3 flex items-baseline justify-between">
          <span className="text-sm text-[color:var(--pe-ink-3)]">
            {balance > 0 ? (kind === "dealer" ? "You owe them" : "They owe you") : balance < 0 ? "Advance held" : "All settled"}
          </span>
          <span className={`text-lg font-extrabold tabular-nums ${balance > 0 ? "text-[color:var(--pe-bad)]" : "text-[color:var(--pe-good)]"}`}>
            {fmtINR(Math.abs(balance))}
          </span>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-[color:var(--pe-line)] divide-y divide-[color:var(--pe-line-2)]">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No entries yet.</p>
          )}
          {rows.slice().reverse().map((e) => (
            <div key={`${e.kind}-${e.id}`} className="px-3 py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[color:var(--pe-ink)] truncate">
                  {e.label}
                  {e.payment?.mode ? <span className="ml-1.5 text-[11px] font-normal uppercase text-[color:var(--pe-ink-3)]">{e.payment.mode}</span> : null}
                </div>
                <div className="text-[11px] text-[color:var(--pe-ink-3)]">
                  {fmtDate(e.date)}
                  {e.payment?.notes ? ` · ${e.payment.notes}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[13px] font-bold tabular-nums ${e.debit > 0 ? "text-[color:var(--pe-bad)]" : "text-[color:var(--pe-good)]"}`}>
                  {e.debit > 0 ? `+ ${fmtINR(e.debit)}` : `− ${fmtINR(Math.abs(e.credit))}`}
                </div>
                <div className="text-[11px] tabular-nums text-[color:var(--pe-ink-3)]">bal {fmtINR(e.running)}</div>
              </div>
              {canWrite && e.kind === "payment" && !e.payment?.saleId && (
                <AdminDelete
                  label="payment entry"
                  onConfirm={() => set((d) => ({ ...d, payments: d.payments.filter((x) => x.id !== e.id) }))}
                />
              )}
            </div>
          ))}
        </div>

        {canWrite && (
          <div className="grid gap-2 rounded-xl border border-[color:var(--pe-line)] p-3">
            <div className="text-[13px] font-semibold text-[color:var(--pe-ink)]">
              {kind === "dealer" ? "Record payment to dealer" : "Record payment received"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={amount} onValueChange={setAmount} placeholder="Amount ₹" className="h-10" />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={120} className="h-10" />
            </div>
            <PeFormError message={error} />
            <Button onClick={recordPayment} className="h-10" disabled={saving}>{saving ? "Saving…" : "Record"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PersonDialog({ open, onOpenChange, kind, editing }: { open: boolean; onOpenChange: (b: boolean) => void; kind: "dealer" | "customer"; editing: Person | null }) {
  const [, set] = useDB();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [opening, setOpening] = React.useState("0");
  const [openingAdvance, setOpeningAdvance] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError(null);
      setName(editing?.name ?? "");
      setPhone(editing?.phone ?? "");
      setAddress(editing?.address ?? "");
      setGstin(editing?.gstin ?? "");
      setNotes(editing?.notes ?? "");
      const ob = editing?.openingBalance ?? 0;
      setOpening(String(Math.abs(ob)));
      setOpeningAdvance(ob < 0);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) return setError("Name required");
    if (name.trim().length > 80) return setError("Name too long");
    if (!isValidPhone(phone.trim())) return setError("Enter a valid phone (7–15 digits)");
    const g = gstin.trim().toUpperCase();
    if (g && !isValidGstin(g)) return setError("GSTIN must be 15 characters starting with a 2-digit state code");
    const ob = (openingAdvance ? -1 : 1) * Math.max(0, Number(opening) || 0);
    setSaving(true);
    setError(null);
    let res;
    if (editing) {
      const patch = { name: name.trim(), phone: phone || undefined, address: address || undefined, gstin: g || undefined, notes: notes.trim() || undefined, openingBalance: ob };
      res = await set((d) =>
        kind === "dealer"
          ? { ...d, dealers: d.dealers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }
          : { ...d, customers: d.customers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) },
      );
    } else {
      const p: Person = { id: newId(), name: name.trim(), phone: phone || undefined, address: address || undefined, gstin: g || undefined, notes: notes.trim() || undefined, openingBalance: ob, createdAt: nowStamp() };
      res = await set((d) =>
        kind === "dealer" ? { ...d, dealers: [...d.dealers, p] } : { ...d, customers: [...d.customers, p] },
      );
    }
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(editing ? "Updated" : "Added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `Edit ${kind}` : `Add ${kind}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} className="h-11" /></div>
          <div className="grid gap-1.5"><Label>Phone</Label><PhoneInput value={phone} onValueChange={setPhone} className="h-11" placeholder="e.g. +91 98765 43210" /></div>
          <div className="grid gap-1.5"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="h-11" /></div>
          <div className="grid gap-1.5">
            <Label>GSTIN (optional)</Label>
            <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="e.g. 27ABCDE1234F1Z5" className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Opening balance (₹)</Label>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={opening} onValueChange={setOpening} className="h-11" />
              <Select value={openingAdvance ? "advance" : "due"} onValueChange={(v) => setOpeningAdvance(v === "advance")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">{kind === "dealer" ? "You owe them" : "They owe you"}</SelectItem>
                  <SelectItem value="advance">Advance held</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Old dues from before you started using the app. Shows as the first khata entry.</p>
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
