import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useDB,
  fmtINR,
  fmtDate,
  today,
  findCustomer,
  findItem,
  itemLabel,
  billPayable,
  billNoLabel,
  type Sale,
} from "@/lib/store";
import { downloadBillPdf, printBillPdf } from "@/lib/billPdf";
import { ShareSheet } from "@/components/BillShare";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Wallet,
  BellRing,
  CheckCircle2,
  Printer,
  Download,
  Share2,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import {
  PeAvatar,
  PeStatusPill,
  PeBtn,
  PeCard,
  PeEmpty,
  PeFilterPill,
  PeTable,
  PeTHead,
  PeTRow,
  PeTitle,
  toneFor,
  type PeTone,
} from "@/components/ui/pe";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import { MobileHeader } from "@/components/AppLayout";

export const Route = createFileRoute("/sales")({
  // Legacy: ?new=1 used to open the bill dialog here; it now forwards to /sales/new.
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === "1" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "Sales & bills — Shop Manager" }] }),
  component: SalesPage,
});

type Status = "unpaid" | "partial" | "paid";
const COLS = "84px minmax(0,2fr) minmax(0,1fr) 52px 110px 96px 270px";

const statusOf = (s: Sale): Status => {
  const total = billPayable(s);
  const paid = s.amountPaid ?? 0;
  if (s.paymentReceived || paid >= total) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
};
const STATUS: Record<Status, { label: string; tone: PeTone }> = {
  paid: { label: "Paid", tone: "good" },
  partial: { label: "Partial", tone: "warn" },
  unpaid: { label: "Unpaid", tone: "bad" },
};

function SalesPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [showArchived, setShowArchived] = React.useState(false);
  const [statusTab, setStatusTab] = React.useState<"all" | Status>("all");

  React.useEffect(() => {
    if (search.new) navigate({ to: "/sales/new", replace: true });
  }, [search.new, navigate]);

  const all = db.sales.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = showArchived ? all : all.filter((s) => !s.archived);
  const counts = {
    all: visible.length,
    unpaid: visible.filter((s) => statusOf(s) === "unpaid").length,
    partial: visible.filter((s) => statusOf(s) === "partial").length,
    paid: visible.filter((s) => statusOf(s) === "paid").length,
  };
  const list = statusTab === "all" ? visible : visible.filter((s) => statusOf(s) === statusTab);
  const archivedCount = all.filter((s) => s.archived).length;
  const t = today();
  const dueTotal = visible.reduce(
    (a, s) => a + Math.max(0, billPayable(s) - (s.amountPaid ?? 0)),
    0,
  );

  const [unpaidTarget, setUnpaidTarget] = React.useState<Sale | null>(null);
  const [unpaidReason, setUnpaidReason] = React.useState("");
  const [payTarget, setPayTarget] = React.useState<Sale | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [shareTarget, setShareTarget] = React.useState<Sale | null>(null);

  const openPayment = (s: Sale) => {
    const due = Math.max(0, billPayable(s) - (s.amountPaid ?? 0));
    setPayAmount(String(due > 0 ? due : ""));
    setPayTarget(s);
  };
  const savePayment = () => {
    if (!payTarget) return;
    const total = billPayable(payTarget);
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
    toast.success(
      newPaid >= total
        ? "Fully paid"
        : `Recorded ${fmtINR(addRaw)} — ${fmtINR(total - newPaid)} still due`,
    );
    setPayTarget(null);
  };
  const markFullyPaid = (s: Sale) => {
    const total = billPayable(s);
    set((d) => ({
      ...d,
      sales: d.sales.map((x) =>
        x.id === s.id ? { ...x, amountPaid: total, paymentReceived: true } : x,
      ),
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
      sales: d.sales.map((x) =>
        x.id === id ? { ...x, paymentReceived: false, amountPaid: 0 } : x,
      ),
    }));
    toast.success(`Marked unpaid — ${r}`);
    setUnpaidTarget(null);
  };
  const archive = (s: Sale) => {
    set((d) => ({
      ...d,
      sales: d.sales.map((x) => (x.id === s.id ? { ...x, archived: true } : x)),
    }));
    toast.success("Archived");
  };
  const unarchive = (s: Sale) => {
    set((d) => ({
      ...d,
      sales: d.sales.map((x) => (x.id === s.id ? { ...x, archived: false } : x)),
    }));
    toast.success("Restored");
  };

  const rowInfo = (s: Sale) => {
    const cust = findCustomer(db, s.customerId);
    const canEdit = canWrite && (isAdmin || (user && s.createdBy === user.id));
    const total = billPayable(s);
    const paid = s.amountPaid ?? 0;
    const due = Math.max(0, total - paid);
    const isFullyPaid = s.paymentReceived || due <= 0;
    const phone = (cust?.phone ?? "").replace(/\D/g, "");
    const waNumber = phone.length === 10 ? `91${phone}` : phone;
    // No bill URL in the message — /bills/$id needs a signed-in member.
    const reminderMsg = `Hi ${cust?.name ?? ""}, this is a gentle reminder to clear the pending payment of ${fmtINR(due)} for bill ${billNoLabel(s)} (total ${fmtINR(total)}, paid ${fmtINR(paid)}). Thank you!`;
    const remind = () => {
      if (!waNumber) {
        toast.error("Add a phone number to this customer first");
        return;
      }
      window.open(
        `https://wa.me/${waNumber}?text=${encodeURIComponent(reminderMsg)}`,
        "_blank",
        "noopener,noreferrer",
      );
    };
    const time =
      s.date === t
        ? new Date(s.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : null;
    const items = s.lines
      .map((l) => {
        const it = findItem(db, l.itemId);
        return `${l.qty} × ${it ? itemLabel(it) : "—"}`;
      })
      .join(", ");
    return {
      cust,
      canEdit,
      total,
      paid,
      due,
      isFullyPaid,
      remind,
      time,
      items,
      st: STATUS[statusOf(s)],
    };
  };

  const menuFor = (s: Sale, info: ReturnType<typeof rowInfo>) => (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More"
            className="pe-hover-bg inline-flex items-center justify-center text-[color:var(--pe-ink-2)] bg-white"
            style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--pe-line)" }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => navigate({ to: "/bills/$id", params: { id: s.id } })}>
            <Eye className="h-4 w-4" /> View bill
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => printBillPdf(db, s)}>
            <Printer className="h-4 w-4" /> Print bill
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadBillPdf(db, s)}>
            <Download className="h-4 w-4" /> Download PDF
          </DropdownMenuItem>
          {!info.isFullyPaid && (
            <DropdownMenuItem onClick={info.remind}>
              <BellRing className="h-4 w-4" /> Send payment reminder
            </DropdownMenuItem>
          )}
          {info.canEdit && !s.archived && info.isFullyPaid && (
            <DropdownMenuItem onClick={() => requestUnmark(s)}>
              <CheckCircle2 className="h-4 w-4" /> Unmark paid
            </DropdownMenuItem>
          )}
          {info.canEdit && !s.archived && (
            <DropdownMenuItem
              onClick={() => navigate({ to: "/sales/new", search: { edit: s.id } })}
            >
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
          )}
          {isAdmin && info.isFullyPaid && !s.archived && (
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
            {!info.isFullyPaid && (
              <AdminDelete
                label={s.isBill ? "bill" : "sale"}
                requireReason
                detail="Stock will be restored since payment isn't fully received. Any payments already recorded against this bill will also be removed from the customer's khata."
                onConfirm={(reason) => {
                  set((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }));
                  if (reason) toast.success(`Deleted — ${reason}`);
                }}
              />
            )}
            {info.isFullyPaid && !s.archived && (
              <AdminDelete
                label={s.isBill ? "bill" : "sale"}
                requireReason
                blockReason="This sale is marked as Payment received. Use Archive instead so stock isn't restored, or unmark payment first to delete."
                onConfirm={() => {}}
              />
            )}
            {info.isFullyPaid && s.archived && (
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
  );

  const payBtn = (s: Sale, info: ReturnType<typeof rowInfo>, full?: boolean) =>
    info.canEdit && !s.archived && !info.isFullyPaid ? (
      <PeBtn
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          openPayment(s);
        }}
        className={full ? "flex-1" : ""}
      >
        <Wallet className="h-4 w-4" /> {full ? "Record payment" : "Record"}
      </PeBtn>
    ) : (
      <span
        className={
          "inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold " +
          (full ? "flex-1" : "")
        }
        style={{ height: 34, padding: "0 10px", color: "var(--pe-good)" }}
      >
        <CheckCircle2 className="h-4 w-4" /> Fully paid
      </span>
    );
  const sendBtn = (s: Sale, full?: boolean) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShareTarget(s);
      }}
      className={
        "pe-hover-bg inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--pe-ink)] bg-white " +
        (full ? "flex-1" : "")
      }
      style={{ height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid var(--pe-line)" }}
    >
      <Share2 className="h-4 w-4" style={{ color: "var(--pe-good)" }} /> Send
    </button>
  );

  return (
    <>
      <MobileHeader>
        <div className="flex items-center gap-2.5" style={{ padding: "6px 18px 14px" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-bold">Sales &amp; bills</div>
            <div className="text-[12px]" style={{ color: "rgba(255,255,255,.62)" }}>
              {visible.length} bill{visible.length === 1 ? "" : "s"}
              {dueTotal > 0 ? ` · ${fmtINR(dueTotal)} to collect` : ""}
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => navigate({ to: "/sales/new" })}
              className="inline-flex items-center text-[13.5px] font-bold"
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 10,
                background: "var(--pe-gold)",
                color: "var(--pe-gold-ink)",
              }}
            >
              + New bill
            </button>
          )}
        </div>
      </MobileHeader>
      <div className="hidden md:block">
        <PeTitle
          title="Sales & bills"
          sub={
            dueTotal > 0 ? (
              <>
                Everything you&apos;ve sold ·{" "}
                <span className="font-bold" style={{ color: "var(--pe-bad)" }}>
                  {fmtINR(dueTotal)}
                </span>{" "}
                still to collect
              </>
            ) : (
              "Everything you've sold — and who still owes you"
            )
          }
          actions={
            canWrite ? (
              <PeBtn onClick={() => navigate({ to: "/sales/new" })}>
                <Plus className="h-4 w-4" strokeWidth={2.5} /> New bill
              </PeBtn>
            ) : null
          }
        />
      </div>

      <PeCard pad={0} flat className="overflow-hidden">
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--pe-line-2)" }}
        >
          <PeFilterPill
            active={statusTab === "all"}
            label="All"
            count={counts.all}
            onClick={() => setStatusTab("all")}
          />
          <PeFilterPill
            active={statusTab === "unpaid"}
            label="Unpaid"
            count={counts.unpaid}
            onClick={() => setStatusTab("unpaid")}
          />
          <PeFilterPill
            active={statusTab === "partial"}
            label="Part-paid"
            count={counts.partial}
            onClick={() => setStatusTab("partial")}
          />
          <PeFilterPill
            active={statusTab === "paid"}
            label="Paid"
            count={counts.paid}
            onClick={() => setStatusTab("paid")}
          />
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="ml-auto text-xs text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)] underline"
            >
              {showArchived
                ? `Hide archived (${archivedCount})`
                : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <PeTable minWidth={960}>
            <PeTHead template={COLS}>
              <span>Bill</span>
              <span>Customer</span>
              <span>Date</span>
              <span className="text-right">Items</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              <span />
            </PeTHead>
            {list.map((s) => {
              const info = rowInfo(s);
              return (
                <PeTRow
                  key={s.id}
                  template={COLS}
                  onClick={() => navigate({ to: "/bills/$id", params: { id: s.id } })}
                  style={{ opacity: s.archived ? 0.6 : 1 }}
                >
                  <span className="font-bold text-[color:var(--pe-ink-2)]">{billNoLabel(s)}</span>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PeAvatar
                      name={info.cust?.name ?? "?"}
                      tone={toneFor(info.cust?.name)}
                      size={34}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-[color:var(--pe-ink)] truncate">
                        {info.cust?.name ?? (
                          <span className="italic text-[color:var(--pe-ink-3)]">
                            (deleted customer)
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[color:var(--pe-ink-3)] truncate">
                        {info.items}
                      </div>
                    </div>
                  </div>
                  <span className="text-[color:var(--pe-ink-3)] truncate">
                    {info.time ? `Today, ${info.time}` : fmtDate(s.date)}
                  </span>
                  <span className="text-right text-[color:var(--pe-ink-2)] tabular-nums">
                    {s.lines.length}
                  </span>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{fmtINR(info.total)}</div>
                    {!info.isFullyPaid && (
                      <div
                        className="text-[11.5px] font-semibold tabular-nums"
                        style={{ color: "var(--pe-bad)" }}
                      >
                        due {fmtINR(info.due)}
                      </div>
                    )}
                  </div>
                  <span className="flex justify-end">
                    <PeStatusPill
                      tone={s.archived ? "neutral" : info.st.tone}
                      label={s.archived ? "Archived" : info.st.label}
                    />
                  </span>
                  <div
                    className="flex items-center justify-end gap-1.5 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {payBtn(s, info)}
                    {sendBtn(s)}
                    {menuFor(s, info)}
                  </div>
                </PeTRow>
              );
            })}
          </PeTable>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          {list.map((s) => {
            const info = rowInfo(s);
            return (
              <div
                key={s.id}
                style={{
                  padding: "14px 16px",
                  borderTop: "1px solid var(--pe-line-3)",
                  opacity: s.archived ? 0.6 : 1,
                }}
              >
                <Link to="/bills/$id" params={{ id: s.id }} className="flex items-center gap-3">
                  <PeAvatar
                    name={info.cust?.name ?? "?"}
                    tone={toneFor(info.cust?.name)}
                    size={42}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-[color:var(--pe-ink)] truncate">
                      {info.cust?.name ?? (
                        <span className="italic text-[color:var(--pe-ink-3)]">(deleted)</span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-[color:var(--pe-ink-3)]">
                      {info.time ? `Today, ${info.time}` : fmtDate(s.date)} · {billNoLabel(s)} ·{" "}
                      {s.lines.length} item{s.lines.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <PeStatusPill
                    tone={s.archived ? "neutral" : info.st.tone}
                    label={s.archived ? "Archived" : info.st.label}
                  />
                </Link>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { label: "Bill total", value: info.total, color: "var(--pe-ink)" },
                    { label: "Paid", value: info.paid, color: "var(--pe-good)" },
                    {
                      label: "Still due",
                      value: info.due,
                      color: info.due > 0 ? "var(--pe-bad)" : "var(--pe-good)",
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg"
                      style={{
                        background: "var(--pe-bg-2)",
                        border: "1px solid var(--pe-line-2)",
                        padding: "7px 10px",
                      }}
                    >
                      <div className="text-[11px] font-semibold text-[color:var(--pe-ink-3)] whitespace-nowrap">
                        {m.label}
                      </div>
                      <div
                        className="text-[15px] font-bold tabular-nums truncate"
                        style={{ color: m.color }}
                      >
                        {fmtINR(m.value)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {payBtn(s, info, true)}
                  {sendBtn(s, true)}
                  {menuFor(s, info)}
                </div>
              </div>
            );
          })}
        </div>

        {list.length === 0 && (
          <PeEmpty>
            {visible.length === 0
              ? "No bills yet — create your first one."
              : "No bills in this filter."}
          </PeEmpty>
        )}
      </PeCard>

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
            <Textarea
              value={unpaidReason}
              onChange={(e) => setUnpaidReason(e.target.value)}
              rows={2}
              placeholder="e.g. Payment was refunded"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unpaidReason.trim().length < 3}
              className="disabled:opacity-50 disabled:pointer-events-none"
              onClick={(e) => {
                if (unpaidReason.trim().length < 3) {
                  e.preventDefault();
                  return;
                }
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
          {payTarget &&
            (() => {
              const total = billPayable(payTarget);
              const alreadyPaid = payTarget.amountPaid ?? 0;
              const due = Math.max(0, total - alreadyPaid);
              const addNum = Number(payAmount);
              const safeAdd = Number.isFinite(addNum) && addNum > 0 ? Math.min(addNum, due) : 0;
              const remainingAfter = Math.max(0, due - safeAdd);
              return (
                <div className="grid gap-3">
                  <div className="rounded-lg border p-3 text-sm grid gap-1 bg-muted/40">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bill total</span>
                      <span className="tabular-nums font-medium">{fmtINR(total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already paid</span>
                      <span className="tabular-nums" style={{ color: "var(--pe-good)" }}>
                        {fmtINR(alreadyPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Currently due</span>
                      <span
                        className="tabular-nums font-semibold"
                        style={{ color: "var(--pe-bad)" }}
                      >
                        {fmtINR(due)}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Amount received now (₹)</Label>
                    <NumberInput
                      value={payAmount}
                      onValueChange={setPayAmount}
                      min={0}
                      max={due}
                      className="h-11"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setPayAmount(String(due))}
                      >
                        Full ({fmtINR(due)})
                      </Button>
                      {due >= 2 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setPayAmount(String(Math.round(due / 2)))}
                        >
                          Half
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    After this entry:{" "}
                    <span className="tabular-nums font-medium text-foreground">
                      {fmtINR(alreadyPaid + safeAdd)}
                    </span>{" "}
                    paid,{" "}
                    <span
                      className="tabular-nums font-medium"
                      style={{ color: remainingAfter === 0 ? "var(--pe-good)" : "var(--pe-bad)" }}
                    >
                      {remainingAfter === 0
                        ? "fully cleared"
                        : `${fmtINR(remainingAfter)} still due`}
                    </span>
                    .
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            {payTarget && Math.max(0, billPayable(payTarget) - (payTarget.amountPaid ?? 0)) > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  markFullyPaid(payTarget);
                  setPayTarget(null);
                }}
              >
                Mark fully paid
              </Button>
            )}
            <Button onClick={savePayment}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
