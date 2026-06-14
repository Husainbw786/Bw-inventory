import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/AppLayout";
import { EntityPicker } from "@/components/EntityPicker";
import { useDB, today, fmtINR, fmtDate, findCustomer, findItem, itemLabel, newId, nowStamp, billTotal, stockAvailableFor, type Sale, type SaleLine } from "@/lib/store";
import { downloadBillPdf, printBillPdf } from "@/lib/billPdf";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Trash2, Receipt, Pencil, AlertTriangle, Archive, IndianRupee, ArchiveRestore, MessageCircle, Wallet, BellRing, CheckCircle2, Printer, Download, Share2, MoreHorizontal, Package, Eye, ChevronRight } from "lucide-react";
import { PeAvatar, PeStatusPill, toneStyle, type PeTone } from "@/components/ui/pe";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";

export const Route = createFileRoute("/sales")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === "1" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "Sales — Shop Manager" }] }),
  component: SalesPage,
});

// Compact money box for the mobile sale card (Bill total / Paid / Still due).
function MoneyBox({ label, value, tone }: { label: string; value: number; tone?: PeTone }) {
  const color = tone ? toneStyle(tone).fg : "var(--pe-ink)";
  return (
    <div className="rounded-xl border border-[color:var(--pe-line)]" style={{ background: "var(--pe-bg)", padding: "8px 10px" }}>
      <div className="text-[11px] font-semibold text-[color:var(--pe-ink-3)] mb-0.5 whitespace-nowrap">{label}</div>
      <div className="text-[15px] font-extrabold tabular-nums truncate" style={{ color }}>{fmtINR(value)}</div>
    </div>
  );
}

function SalesPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"single" | "group">("single");
  const [editing, setEditing] = React.useState<Sale | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);

  // The mobile "+" FAB navigates here with ?new=1 — open the New Bill dialog, then clear the param.
  React.useEffect(() => {
    if (search.new && canWrite) {
      setEditing(null);
      setMode("group");
      setOpen(true);
      navigate({ to: "/sales", search: {}, replace: true });
    }
  }, [search.new, canWrite, navigate]);

  const [statusTab, setStatusTab] = React.useState<"all" | "unpaid" | "partial" | "paid">("all");

  const all = db.sales.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = showArchived ? all : all.filter((s) => !s.archived);
  const statusOf = (s: Sale): "unpaid" | "partial" | "paid" => {
    const total = billTotal(s);
    const paid = s.amountPaid ?? 0;
    if (s.paymentReceived || paid >= total) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
  };
  const counts = {
    all: visible.length,
    unpaid: visible.filter((s) => statusOf(s) === "unpaid").length,
    partial: visible.filter((s) => statusOf(s) === "partial").length,
    paid: visible.filter((s) => statusOf(s) === "paid").length,
  };
  const list = statusTab === "all" ? visible : visible.filter((s) => statusOf(s) === statusTab);
  const archivedCount = all.filter((s) => s.archived).length;
  const avatarTones: PeTone[] = ["warn", "green", "info", "good", "neutral"];

  const [unpaidTarget, setUnpaidTarget] = React.useState<Sale | null>(null);
  const [unpaidReason, setUnpaidReason] = React.useState("");
  const [payTarget, setPayTarget] = React.useState<Sale | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [shareTarget, setShareTarget] = React.useState<Sale | null>(null);

  const openPayment = (s: Sale) => {
    const due = Math.max(0, billTotal(s) - (s.amountPaid ?? 0));
    setPayAmount(String(due > 0 ? due : ""));
    setPayTarget(s);
  };
  const savePayment = () => {
    if (!payTarget) return;
    const total = billTotal(payTarget);
    const addRaw = Number(payAmount);
    if (!Number.isFinite(addRaw) || addRaw <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    const newPaid = Math.min(total, (payTarget.amountPaid ?? 0) + addRaw);
    const id = payTarget.id;
    set((d) => ({
      ...d,
      sales: d.sales.map((x) =>
        x.id === id ? { ...x, amountPaid: newPaid, paymentReceived: newPaid >= total } : x,
      ),
    }));
    toast.success(newPaid >= total ? "Fully paid" : `Recorded ${fmtINR(addRaw)} — ${fmtINR(total - newPaid)} still due`);
    setPayTarget(null);
  };
  const markFullyPaid = (s: Sale) => {
    const total = billTotal(s);
    set((d) => ({
      ...d,
      sales: d.sales.map((x) => (x.id === s.id ? { ...x, amountPaid: total, paymentReceived: true } : x)),
    }));
    toast.success("Marked fully paid");
  };
  const requestUnmark = (s: Sale) => {
    setUnpaidReason("");
    setUnpaidTarget(s);
  };
  const confirmUnpaid = () => {
    const r = unpaidReason.trim();
    if (!unpaidTarget || r.length < 3) return;
    const id = unpaidTarget.id;
    set((d) => ({
      ...d,
      sales: d.sales.map((x) => (x.id === id ? { ...x, paymentReceived: false, amountPaid: 0 } : x)),
    }));
    toast.success(`Marked unpaid — ${r}`);
    setUnpaidTarget(null);
  };
  const archive = (s: Sale) => {
    set((d) => ({ ...d, sales: d.sales.map((x) => (x.id === s.id ? { ...x, archived: true } : x)) }));
    toast.success("Archived");
  };
  const unarchive = (s: Sale) => {
    set((d) => ({ ...d, sales: d.sales.map((x) => (x.id === s.id ? { ...x, archived: false } : x)) }));
    toast.success("Restored");
  };


  return (
    <>

      <PageHeader
        title="Sales"
        subtitle="Everything you've sold — and who still owes you"
        action={
          canWrite ? (
            <Button onClick={() => { setEditing(null); setMode("group"); setOpen(true); }}><Receipt />New bill</Button>
          ) : null
        }
      />

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {([
          { k: "all", label: "All" },
          { k: "unpaid", label: "Unpaid" },
          { k: "partial", label: "Part-paid" },
          { k: "paid", label: "Paid" },
        ] as const).map((t) => {
          const active = statusTab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setStatusTab(t.k)}
              className={
                "h-9 px-4 rounded-full text-sm font-semibold transition-colors border " +
                (active
                  ? "bg-card border-[color:var(--pe-line)] text-[color:var(--pe-ink)] shadow-sm"
                  : "bg-transparent border-transparent text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)]")
              }
            >
              {t.label} <span className={active ? "text-[color:var(--pe-ink-3)] font-medium" : "text-[color:var(--pe-ink-3)]/70 font-medium"}>({counts[t.k]})</span>
            </button>
          );
        })}
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
          </button>
        )}
      </div>


      <div className="grid gap-3">

        {list.map((s) => {
          const cust = findCustomer(db, s.customerId);
          const canEdit = canWrite && (isAdmin || (user && s.createdBy === user.id));
          const total = billTotal(s);
          const paid = s.amountPaid ?? 0;
          const due = Math.max(0, total - paid);
          const isFullyPaid = s.paymentReceived || due <= 0;
          const isPartial = !isFullyPaid && paid > 0;
          const phone = (cust?.phone ?? "").replace(/\D/g, "");
          const waNumber = phone.length === 10 ? `91${phone}` : phone;
          const billUrl = typeof window !== "undefined"
            ? `${window.location.origin}/bills/${s.id}`
            : `/bills/${s.id}`;
          const reminderMsg = `Hi ${cust?.name ?? ""}, this is a gentle reminder to clear the pending payment of ${fmtINR(due)} for bill #${s.id.slice(0, 6).toUpperCase()} (total ${fmtINR(total)}, paid ${fmtINR(paid)}). Bill: ${billUrl}. Thank you!`;
          const waLink = (msg: string) =>
            waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}` : undefined;
          const status = statusOf(s);
          const statusTone: PeTone = status === "paid" ? "good" : status === "partial" ? "warn" : "bad";
          const statusLabel = status === "paid" ? "Paid" : status === "partial" ? "Part-paid" : "Unpaid";
          const nameForAvatar = cust?.name ?? "?";
          const avatarTone = avatarTones[
            Math.abs(nameForAvatar.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % avatarTones.length
          ];
          const billNo = "#" + s.id.slice(0, 6).toUpperCase();
          return (
            <div
              key={s.id}
              className={
                "rounded-2xl border border-[color:var(--pe-line)] bg-card overflow-hidden " +
                (s.archived ? "opacity-60" : "")
              }
              style={{ boxShadow: "0 1px 2px rgba(20,32,29,.04), 0 4px 16px rgba(20,32,29,.05)" }}
            >
              {/* Top — mobile: identity row + 3-col money block */}
              <div className="md:hidden p-4">
                <div className="flex items-center gap-3">
                  <PeAvatar name={nameForAvatar} tone={avatarTone} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold text-[color:var(--pe-ink)] truncate tracking-[-0.01em]">
                      {cust?.name ?? <span className="italic text-muted-foreground">(deleted)</span>}
                    </div>
                    <div className="text-[12.5px] text-[color:var(--pe-ink-3)] mt-0.5">{fmtDate(s.date)} · {billNo}</div>
                  </div>
                  <PeStatusPill tone={statusTone} label={statusLabel} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <MoneyBox label="Bill total" value={total} />
                  <MoneyBox label="Paid" value={paid} tone="good" />
                  <MoneyBox label="Still due" value={due} tone={due > 0 ? "bad" : "good"} />
                </div>
                {s.archived && <div className="mt-2"><PeStatusPill tone="neutral" label="Archived" /></div>}
              </div>

              {/* Top — desktop: avatar + name/meta + total/paid/due */}
              <div className="hidden md:flex p-5 items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <PeAvatar name={nameForAvatar} tone={avatarTone} size={44} />
                  <div className="min-w-0">
                    <div className="text-[17px] md:text-[18px] font-bold text-[color:var(--pe-ink)] truncate tracking-[-0.01em]">
                      {cust?.name ?? <span className="italic text-muted-foreground">(deleted customer)</span>}
                    </div>
                    <div className="text-[13px] text-[color:var(--pe-ink-3)] mt-0.5">
                      {fmtDate(s.date)} · Bill {billNo}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <PeStatusPill tone={statusTone} label={statusLabel} />
                      {s.archived && <PeStatusPill tone="neutral" label="Archived" />}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wider text-[color:var(--pe-ink-3)] font-semibold">Bill total</div>
                  <div className="text-[26px] md:text-[28px] font-extrabold text-[color:var(--pe-ink)] tabular-nums leading-none mt-1 tracking-[-0.02em]">
                    {fmtINR(total)}
                  </div>
                  <div className="mt-2 text-[12.5px] tabular-nums flex items-center gap-2 justify-end flex-wrap">
                    {status === "paid" ? (
                      <span className="text-[color:var(--pe-good)] font-semibold">Paid {fmtINR(total)}</span>
                    ) : (
                      <>
                        <span className="text-[color:var(--pe-good)] font-semibold">Paid {fmtINR(paid)}</span>
                        <span className="text-[color:var(--pe-bad)] font-semibold">Due {fmtINR(due)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Item rows inset */}
              <div className="mx-4 md:mx-5 mb-3 rounded-xl bg-[color:var(--pe-bg)] border border-[color:var(--pe-line)]">
                <ul className="divide-y divide-[color:var(--pe-line)]">
                  {s.lines.map((l, i) => {
                    const it = findItem(db, l.itemId);
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13.5px]">
                        <span className="flex items-center gap-2 min-w-0 text-[color:var(--pe-ink-2)]">
                          <Package className="h-4 w-4 text-[color:var(--pe-ink-3)] shrink-0" />
                          <span className="truncate font-medium">{it ? itemLabel(it) : "—"}</span>
                        </span>
                        <span className="tabular-nums text-[color:var(--pe-ink-2)] font-semibold shrink-0">
                          {l.qty} × {fmtINR(l.rate)}
                        </span>
                      </li>
                    );
                  })}
                  {(s.extraExpenses ?? 0) > 0 && (
                    s.extraExpensesChargeCustomer ? (
                      <li className="flex justify-between px-3.5 py-2 text-[12.5px] text-[color:var(--pe-ink-2)]">
                        <span>Extra expenses (charged to customer)</span>
                        <span className="tabular-nums font-semibold">+{fmtINR(s.extraExpenses)}</span>
                      </li>
                    ) : (
                      <li className="flex justify-between px-3.5 py-2 text-[12.5px] text-[color:var(--pe-bad)]">
                        <span>Extra expenses (shop cost)</span>
                        <span className="tabular-nums font-semibold">−{fmtINR(s.extraExpenses)}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              {/* Action footer */}
              <div className="px-4 md:px-5 py-3 border-t border-[color:var(--pe-line)] bg-card flex items-center gap-2 flex-wrap">
                {canEdit && !s.archived && !isFullyPaid ? (
                  <Button
                    onClick={() => openPayment(s)}
                    className="h-10 px-4 rounded-xl gap-2 font-semibold w-full md:w-auto justify-center"
                  >
                    <Wallet className="h-4 w-4" />
                    Record payment
                  </Button>
                ) : (
                  <div className="inline-flex items-center justify-center gap-2 h-10 px-3 text-[13px] font-semibold text-[color:var(--pe-good)] w-full md:w-auto">
                    <CheckCircle2 className="h-4 w-4" />
                    Fully paid
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShareTarget(s)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-[color:var(--pe-line)] bg-card text-[13px] font-semibold text-[color:var(--pe-ink)] hover:bg-[color:var(--pe-bg)] flex-1 md:flex-none"
                  title="Send this bill"
                >
                  <Share2 className="h-4 w-4 text-[color:var(--pe-good)]" />
                  Send bill
                </button>

                <Link
                  to="/bills/$id"
                  params={{ id: s.id }}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-[color:var(--pe-line)] bg-card text-[13px] font-semibold text-[color:var(--pe-ink)] hover:bg-[color:var(--pe-bg)] flex-1 md:flex-none"
                >
                  View bill
                </Link>

                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[color:var(--pe-line)] bg-card text-[13px] font-semibold text-[color:var(--pe-ink)] hover:bg-[color:var(--pe-bg)]"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        More
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => printBillPdf(db, s)}>
                        <Printer className="h-4 w-4" /> Print bill
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadBillPdf(db, s)}>
                        <Download className="h-4 w-4" /> Download PDF
                      </DropdownMenuItem>
                      {!isFullyPaid && (
                        <DropdownMenuItem
                          onClick={() => {
                            const link = waLink(reminderMsg);
                            if (!link) { toast.error("Add a phone number to this customer first"); return; }
                            window.open(link, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <BellRing className="h-4 w-4" /> Send payment reminder
                        </DropdownMenuItem>
                      )}
                      {canEdit && !s.archived && isFullyPaid && (
                        <DropdownMenuItem onClick={() => requestUnmark(s)}>
                          <CheckCircle2 className="h-4 w-4" /> Unmark paid
                        </DropdownMenuItem>
                      )}
                      {canEdit && !s.archived && (
                        <DropdownMenuItem onClick={() => { setEditing(s); setMode(s.isBill ? "group" : "single"); setOpen(true); }}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                      )}
                      {isAdmin && isFullyPaid && !s.archived && (
                        <DropdownMenuItem onClick={() => archive(s)}>
                          <Archive className="h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      )}
                      {isAdmin && s.archived && (
                        <DropdownMenuItem onClick={() => unarchive(s)}>
                          <ArchiveRestore className="h-4 w-4" /> Restore
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <div className="px-1 py-1">
                        {!isFullyPaid && (
                          <AdminDelete
                            label={s.isBill ? "bill" : "sale"}
                            requireReason
                            detail="Stock will be restored since payment isn't fully received."
                            onConfirm={(reason) => {
                              set((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }));
                              if (reason) toast.success(`Deleted — ${reason}`);
                            }}
                          />
                        )}
                        {isFullyPaid && !s.archived && (
                          <AdminDelete
                            label={s.isBill ? "bill" : "sale"}
                            requireReason
                            blockReason="This sale is marked as Payment received. Use Archive instead so stock isn't restored, or unmark payment first to delete."
                            onConfirm={() => {}}
                          />
                        )}
                        {isFullyPaid && s.archived && (
                          <AdminDelete
                            label={s.isBill ? "bill" : "sale"}
                            requireReason
                            detail="This is an archived paid sale. Deleting WILL restore stock — only do this if the sale never actually happened."
                            onConfirm={(reason) => {
                              set((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }));
                              if (reason) toast.success(`Deleted — ${reason}`);
                            }}
                          />
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}

        {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>}
      </div>

      <SaleDialog open={open} onOpenChange={setOpen} initialMode={mode} editing={editing} />

      <ShareSheet sale={shareTarget} onClose={() => setShareTarget(null)} />

      <AlertDialog open={!!unpaidTarget} onOpenChange={(o) => !o && setUnpaidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmark payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This sale is currently marked as paid. Type a short reason for unmarking.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea value={unpaidReason} onChange={(e) => setUnpaidReason(e.target.value)} rows={2} placeholder="e.g. Payment was refunded" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unpaidReason.trim().length < 3}
              className="disabled:opacity-50 disabled:pointer-events-none"
              onClick={(e) => {
                if (unpaidReason.trim().length < 3) { e.preventDefault(); return; }
                confirmUnpaid();
              }}
            >
              Unmark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {payTarget && (() => {
            const total = billTotal(payTarget);
            const alreadyPaid = payTarget.amountPaid ?? 0;
            const due = Math.max(0, total - alreadyPaid);
            const addNum = Number(payAmount);
            const safeAdd = Number.isFinite(addNum) && addNum > 0 ? Math.min(addNum, due) : 0;
            const remainingAfter = Math.max(0, due - safeAdd);
            return (
              <div className="grid gap-3">
                <div className="rounded-lg border p-3 text-sm grid gap-1 bg-muted/40">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bill total</span><span className="tabular-nums font-medium">{fmtINR(total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Already paid</span><span className="tabular-nums text-emerald-700">{fmtINR(alreadyPaid)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Currently due</span><span className="tabular-nums font-semibold text-rose-600">{fmtINR(due)}</span></div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Amount received now (₹)</Label>
                  <NumberInput
                    value={payAmount}
                    onValueChange={(v) => setPayAmount(v)}
                    min={0}
                    max={due}
                    className="h-11"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayAmount(String(due))}>Full ({fmtINR(due)})</Button>
                    {due >= 2 && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayAmount(String(Math.round(due / 2)))}>Half</Button>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  After this entry: <span className="tabular-nums font-medium text-foreground">{fmtINR(alreadyPaid + safeAdd)}</span> paid,
                  {" "}
                  <span className={"tabular-nums font-medium " + (remainingAfter === 0 ? "text-emerald-700" : "text-rose-600")}>
                    {remainingAfter === 0 ? "fully cleared" : `${fmtINR(remainingAfter)} still due`}
                  </span>.
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            {payTarget && (() => {
              const total = billTotal(payTarget);
              const due = Math.max(0, total - (payTarget.amountPaid ?? 0));
              return (
                <>
                  {due > 0 && (
                    <Button variant="secondary" onClick={() => { markFullyPaid(payTarget); setPayTarget(null); }}>
                      Mark fully paid
                    </Button>
                  )}
                  <Button onClick={savePayment}>Save payment</Button>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


// Bill share chooser — clear, labelled options instead of mystery icons.
function ShareSheet({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [db] = useDB();
  const navigate = useNavigate();
  if (!sale) return null;

  const cust = findCustomer(db, sale.customerId);
  const total = billTotal(sale);
  const phone = (cust?.phone ?? "").replace(/\D/g, "");
  const waNumber = phone.length === 10 ? `91${phone}` : phone;
  const billUrl = typeof window !== "undefined" ? `${window.location.origin}/bills/${sale.id}` : `/bills/${sale.id}`;
  const shareMsg = `Hi ${cust?.name ?? ""}, your bill #${sale.id.slice(0, 6).toUpperCase()} for ${fmtINR(total)} — ${billUrl}`;

  const options = [
    {
      icon: MessageCircle,
      tone: "good" as PeTone,
      primary: true,
      title: "Send on WhatsApp",
      body: cust?.name
        ? `Opens WhatsApp with the bill ready to send to ${cust.name}.`
        : "Opens WhatsApp with the bill ready to send.",
      onClick: () => {
        if (!waNumber) { toast.error("Add a phone number to this customer first"); return; }
        window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(shareMsg)}`, "_blank", "noopener,noreferrer");
        onClose();
      },
    },
    {
      icon: Download,
      tone: "info" as PeTone,
      primary: false,
      title: "Download as PDF",
      body: "Save the bill to your phone or computer.",
      onClick: () => { downloadBillPdf(db, sale); onClose(); },
    },
    {
      icon: Printer,
      tone: "neutral" as PeTone,
      primary: false,
      title: "Print a paper copy",
      body: "Send the bill to a connected printer.",
      onClick: () => { printBillPdf(db, sale); onClose(); },
    },
  ];

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send this bill</DialogTitle>
          <p className="text-sm text-[color:var(--pe-ink-3)]">Bill {fmtINR(total)} · {cust?.name ?? "—"}</p>
        </DialogHeader>
        <div className="grid gap-3">
          {options.map((o) => {
            const c = toneStyle(o.tone);
            const Icon = o.icon;
            return (
              <button
                key={o.title}
                onClick={o.onClick}
                className="pe-card-hover flex items-center gap-4 text-left w-full rounded-2xl p-4"
                style={{
                  border: o.primary ? "1px solid var(--pe-green-soft-2)" : "1px solid var(--pe-line)",
                  background: o.primary ? "var(--pe-green-soft)" : "var(--pe-surface)",
                }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0"
                  style={{ width: 46, height: 46, borderRadius: 13, background: o.primary ? "#fff" : c.bg, color: c.fg }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16.5px] font-bold text-[color:var(--pe-ink)] tracking-[-0.02em]">{o.title}</span>
                  <span className="block text-[13.5px] text-[color:var(--pe-ink-3)] mt-0.5 leading-snug">{o.body}</span>
                </span>
                <ChevronRight className="h-5 w-5 text-[color:var(--pe-ink-3)] shrink-0" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => { onClose(); navigate({ to: "/bills/$id", params: { id: sale.id } }); }}
          className="mt-1 w-full inline-flex items-center justify-center gap-2 text-[color:var(--pe-green)] font-semibold text-sm py-1"
        >
          <Eye className="h-[18px] w-[18px]" /> Preview the bill first
        </button>
      </DialogContent>
    </Dialog>
  );
}

function SaleDialog({ open, onOpenChange, initialMode, editing }: { open: boolean; onOpenChange: (b: boolean) => void; initialMode: "single" | "group"; editing: Sale | null }) {
  const [db, set] = useDB();
  const isAdmin = useIsAdmin();
  const [mode, setMode] = React.useState<"single" | "group">(initialMode);
  const [date, setDate] = React.useState(today());
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<SaleLine[]>([{ itemId: "", qty: 1, rate: 0 }]);
  const [notes, setNotes] = React.useState("");
  const [extraExpenses, setExtraExpenses] = React.useState("0");
  const [chargeExtraToCustomer, setChargeExtraToCustomer] = React.useState(false);
  const [gstEnabled, setGstEnabled] = React.useState(false);
  const [gstRate, setGstRate] = React.useState("18");
  const [override, setOverride] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setOverride(false);
      if (editing) {
        setMode(editing.isBill ? "group" : "single");
        setDate(editing.date);
        setCustomerId(editing.customerId);
        setLines(editing.lines.length ? editing.lines.map((l) => ({ ...l })) : [{ itemId: "", qty: 1, rate: 0 }]);
        setNotes(editing.notes ?? "");
        setExtraExpenses(String(editing.extraExpenses ?? 0));
        setChargeExtraToCustomer(!!editing.extraExpensesChargeCustomer);
        setGstEnabled(!!(editing.gstRate && editing.gstRate > 0));
        setGstRate(String(editing.gstRate && editing.gstRate > 0 ? editing.gstRate : 18));
      } else {
        setMode(initialMode);
        setDate(today());
        setCustomerId(null);
        setLines([{ itemId: "", qty: 1, rate: 0 }]);
        setNotes("");
        setExtraExpenses("0");
        setChargeExtraToCustomer(false);
        setGstEnabled(false);
        setGstRate("18");
      }
    }
  }, [open, initialMode, editing]);

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0 }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<SaleLine>) =>
    setLines((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);

  // For each row, compute available stock excluding this sale (when editing)
  // and the qty already claimed by *earlier* rows of this same dialog (for the
  // same item), so two rows with the same item don't both look fine.
  const rowChecks = (mode === "single" ? lines.slice(0, 1) : lines).map((l, idx, arr) => {
    if (!l.itemId) return { available: 0, qty: 0, short: 0 };
    const baseAvail = stockAvailableFor(db, l.itemId, editing?.id);
    const earlierClaim = arr
      .slice(0, idx)
      .filter((x) => x.itemId === l.itemId)
      .reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const available = baseAvail - earlierClaim;
    const qty = Number(l.qty) || 0;
    return { available, qty, short: Math.max(0, qty - available) };
  });
  const anyShort = rowChecks.some((c) => c.short > 0);

  const submit = () => {
    if (!customerId) return toast.error("Choose customer");
    const cleaned = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.rate) >= 0);
    if (cleaned.length === 0) return toast.error("Add at least one item");
    if (mode === "single" && cleaned.length > 1) {
      toast.message("Single sale uses first row only");
    }
    const finalLines = mode === "single" ? cleaned.slice(0, 1) : cleaned;

    if (anyShort) {
      if (!isAdmin) return toast.error("Not enough stock for one or more items");
      if (!override) return toast.error("Tick the override box to save with negative stock");
    }

    const extraNum = Math.max(0, Number(extraExpenses) || 0);
    const chargeExtra = extraNum > 0 && chargeExtraToCustomer;
    const gstRateNum = gstEnabled ? Math.max(0, Number(gstRate) || 0) : null;

    if (editing) {
      const patch = { date, customerId, lines: finalLines, isBill: mode === "group", notes: notes || undefined, extraExpenses: extraNum, extraExpensesChargeCustomer: chargeExtra, gstRate: gstRateNum };
      set((d) => ({ ...d, sales: d.sales.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }));
      toast.success("Updated");
    } else {
      const sale: Sale = {
        id: newId(),
        date,
        customerId,
        lines: finalLines,
        isBill: mode === "group",
        notes: notes || undefined,
        paymentReceived: false,
        amountPaid: 0,
        extraExpenses: extraNum,
        extraExpensesChargeCustomer: chargeExtra,
        gstRate: gstRateNum,
        archived: false,

        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      set((d) => ({ ...d, sales: [...d.sales, sale] }));
      toast.success(mode === "group" ? "Bill created" : "Sale saved");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit bill" : "New bill"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
              </div>
              <div className="grid gap-1.5">
                <Label>Customer</Label>
                <EntityPicker kind="customer" value={customerId} onChange={setCustomerId} placeholder="Choose" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Items</Label>
              {lines.map((l, i) => {
                const c = rowChecks[i];
                return (
                  <div key={i} className="rounded-lg border p-2 grid gap-2">
                    <EntityPicker kind="item" value={l.itemId || null} onChange={(id) => updateLine(i, { itemId: id })} placeholder="Choose item" />
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <NumberInput value={String(l.qty)} onValueChange={(v) => updateLine(i, { qty: v === "" ? 0 : Number(v) })} min={0} max={1000000} className="h-11" />
                      </div>
                      <div>
                        <Label className="text-xs">Rate (₹)</Label>
                        <NumberInput value={String(l.rate)} onValueChange={(v) => updateLine(i, { rate: v === "" ? 0 : Number(v) })} min={0} max={10000000} className="h-11" />
                      </div>
                      {lines.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="text-destructive" /></Button>
                      )}
                    </div>
                    {l.itemId && c.short > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Only {c.available} in stock — short by {c.short}.</span>
                      </div>
                    )}
                    <div className="text-right text-xs text-muted-foreground">Subtotal: <span className="font-semibold text-foreground">{fmtINR((Number(l.qty)||0)*(Number(l.rate)||0))}</span></div>
                  </div>
                );
              })}
              <Button variant="outline" onClick={addLine}><Plus />Add another item</Button>
            </div>

            {anyShort && isAdmin && (
              <label className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-2 cursor-pointer">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                <span>Save anyway and let stock go negative (admin override)</span>
              </label>
            )}

            <div className="grid gap-1.5">
              <Label>Extra expenses (₹)</Label>
              <NumberInput
                value={extraExpenses}
                onValueChange={(v) => setExtraExpenses(v)}
                min={0}
                max={10000000}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">e.g. transportation, packing, loading.</p>
              {(Number(extraExpenses) || 0) > 0 && (
                <label className="flex items-start gap-2 text-sm rounded-md border bg-muted/40 px-2 py-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={chargeExtraToCustomer}
                    onChange={(e) => setChargeExtraToCustomer(e.target.checked)}
                  />
                  <span>
                    Charge this extra expense to the customer
                    <span className="block text-xs text-muted-foreground">
                      {chargeExtraToCustomer
                        ? "Added to the bill — customer pays it."
                        : "Not added to the bill — shop absorbs it (reduces profit)."}
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* GST */}
            <div className="grid gap-2">
              <label className="flex items-start gap-2 text-sm rounded-md border bg-muted/40 px-2 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={gstEnabled}
                  onChange={(e) => setGstEnabled(e.target.checked)}
                />
                <span>
                  Add GST to this bill
                  <span className="block text-xs text-muted-foreground">
                    {gstEnabled ? "Tax is added on top and shown on the invoice." : "No tax rows on the invoice."}
                  </span>
                </span>
              </label>
              {gstEnabled && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">GST rate (%)</Label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <NumberInput value={gstRate} onValueChange={(v) => setGstRate(v)} min={0} max={100} className="h-11 w-28" />
                    {["5", "12", "18", "28"].map((r) => (
                      <Button key={r} type="button" size="sm" variant={gstRate === r ? "secondary" : "outline"} className="h-8 text-xs" onClick={() => setGstRate(r)}>{r}%</Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(() => {
              const taxBase = total + (chargeExtraToCustomer ? (Number(extraExpenses) || 0) : 0);
              const rateNum = gstEnabled ? Math.max(0, Number(gstRate) || 0) : 0;
              const gstAmt = taxBase * (rateNum / 100);
              return (
                <div className="rounded-md bg-muted p-3 text-sm grid gap-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Items total</span><span className="tabular-nums">{fmtINR(total)}</span></div>
                  {(Number(extraExpenses) || 0) > 0 && (
                    chargeExtraToCustomer ? (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Extra expenses (added to bill)</span><span className="tabular-nums">+{fmtINR(Number(extraExpenses) || 0)}</span></div>
                    ) : (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Extra expenses (cost only)</span><span className="tabular-nums text-rose-600">−{fmtINR(Number(extraExpenses) || 0)}</span></div>
                    )
                  )}
                  {rateNum > 0 && (
                    <>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">CGST ({(rateNum / 2)}%)</span><span className="tabular-nums">+{fmtINR(gstAmt / 2)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">SGST ({(rateNum / 2)}%)</span><span className="tabular-nums">+{fmtINR(gstAmt / 2)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between text-base pt-1 border-t mt-1"><span className="text-muted-foreground">Customer pays</span><span className="font-semibold tabular-nums">{fmtINR(taxBase + gstAmt)}</span></div>
                </div>
              );
            })()}

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{editing ? "Update" : "Create bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
