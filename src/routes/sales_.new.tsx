import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { AddDialog } from "@/components/EntityPicker";
import { ShareSheet, useWaConnected } from "@/components/BillShare";
import {
  useDB,
  today,
  fmtINR,
  fmtDate,
  findCustomer,
  findItem,
  newId,
  nowStamp,
  billPayable,
  billNoLabel,
  stockAvailableFor,
  lastSaleRate,
  isInterState,
  gstStateCode,
  partyBalance,
  type Sale,
  type SaleLine,
  type PaymentMode,
  type Item,
  type Person,
} from "@/lib/store";
import { downloadBillPdf } from "@/lib/billPdf";
import { sendBillOnWhatsApp } from "@/lib/whatsapp";
import { useIsAdmin, useCanWrite } from "@/lib/auth";
import {
  PeAvatar,
  PeBtn,
  PeCard,
  PeEmpty,
  PeFormError,
  PeModePicker,
  PeMoneyInput,
  PeStep,
  PeTable,
  PeTHead,
  PeTitle,
} from "@/components/ui/pe";
import {
  Search,
  X,
  Check,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Download,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sales_/new")({
  // ?edit=<saleId> loads an existing bill into the composer
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    ...(typeof search.edit === "string" && search.edit ? { edit: search.edit } : {}),
  }),
  head: () => ({ meta: [{ title: "New bill — Shop Manager" }] }),
  component: NewBillPage,
});

type Line = {
  key: string;
  id?: string;
  itemId: string;
  qty: number;
  rate: number;
  gstRate?: number | null;
};
const LINE_COLS = "minmax(0,1fr) 124px 96px 60px 104px 32px";
const MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
];

// Search box with an inline result list (design: "Search or scan an item to add…").
function SearchDrop<T extends { id: string }>({
  placeholder,
  items,
  render,
  onPick,
  onAdd,
  addLabel,
  autoFocus,
}: {
  placeholder: string;
  items: T[];
  render: (t: T) => {
    primary: React.ReactNode;
    secondary?: React.ReactNode;
    right?: React.ReactNode;
  };
  onPick: (t: T) => void;
  onAdd?: (query: string) => void;
  addLabel?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const ql = q.trim().toLowerCase();
  const results = ql
    ? items.filter((t) => JSON.stringify(t).toLowerCase().includes(ql)).slice(0, 8)
    : items.slice(0, 8);
  const pick = (t: T) => {
    onPick(t);
    setQ("");
    setOpen(false);
    setHi(0);
  };
  return (
    <div className="relative">
      <div
        className="flex items-center gap-2.5"
        style={{
          height: 44,
          padding: "0 14px",
          borderRadius: 8,
          border: `1px solid ${open ? "var(--pe-green)" : "var(--pe-line)"}`,
          background: "var(--pe-bg-2)",
        }}
      >
        <Search className="h-[17px] w-[17px] shrink-0 text-[color:var(--pe-ink-3)]" />
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(results.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[hi]) pick(results[hi]);
              else if (onAdd && ql) {
                onAdd(q.trim());
                setQ("");
                setOpen(false);
              }
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[14px] text-[color:var(--pe-ink)]"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQ("")}
            className="text-[color:var(--pe-ink-3)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (results.length > 0 || (onAdd && ql)) && (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden bg-white"
          style={{
            borderRadius: 10,
            border: "1px solid var(--pe-line)",
            boxShadow: "var(--pe-shadow-lg)",
          }}
        >
          {results.map((t, i) => {
            const r = render(t);
            return (
              <div
                key={t.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(t);
                }}
                onMouseEnter={() => setHi(i)}
                className="flex items-center gap-3 cursor-pointer"
                style={{
                  padding: "10px 14px",
                  background: i === hi ? "var(--pe-bg-2)" : undefined,
                  borderTop: i ? "1px solid var(--pe-line-3)" : undefined,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[color:var(--pe-ink)] truncate">
                    {r.primary}
                  </div>
                  {r.secondary && (
                    <div className="text-[12px] text-[color:var(--pe-ink-3)] truncate">
                      {r.secondary}
                    </div>
                  )}
                </div>
                {r.right && (
                  <div className="text-right shrink-0 text-[13px] tabular-nums text-[color:var(--pe-ink-2)]">
                    {r.right}
                  </div>
                )}
              </div>
            );
          })}
          {onAdd && ql && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(q.trim());
                setQ("");
                setOpen(false);
              }}
              className="flex items-center gap-2 cursor-pointer text-[13.5px] font-semibold"
              style={{
                padding: "10px 14px",
                borderTop: results.length ? "1px solid var(--pe-line-3)" : undefined,
                color: "var(--pe-green)",
              }}
            >
              <Plus className="h-4 w-4" /> {addLabel ?? "Add"} “{q.trim()}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewBillPage() {
  const [db, set] = useDB();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const editing = edit ? (db.sales.find((s) => s.id === edit) ?? null) : null;
  const { connected: waConnected, businessId } = useWaConnected();

  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(today());
  const [lines, setLines] = React.useState<Line[]>([]);
  const [paid, setPaid] = React.useState("");
  const [mode, setMode] = React.useState<PaymentMode>("cash");
  const [gstEnabled, setGstEnabled] = React.useState(false);
  const [gstRate, setGstRate] = React.useState("18");
  const [extraExpenses, setExtraExpenses] = React.useState("0");
  const [chargeExtra, setChargeExtra] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [sendWa, setSendWa] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [shareTarget, setShareTarget] = React.useState<Sale | null>(null);
  const [addKind, setAddKind] = React.useState<"item" | "customer" | null>(null);
  const [savedSnapshot, setSavedSnapshot] = React.useState<{
    sale: Sale;
    customer: string;
    paid: number;
    due: number;
    mode: PaymentMode;
  } | null>(null);
  const loadedFor = React.useRef<string | null>(null);
  // Lines added via "New item" before the catalog refetch: fill the rate once the item is known.
  const pendingRate = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (pendingRate.current.size === 0) return;
    setLines((ls) =>
      ls.map((l) => {
        if (!pendingRate.current.has(l.key)) return l;
        const it = findItem(db, l.itemId);
        if (!it) return l;
        pendingRate.current.delete(l.key);
        return { ...l, rate: it.price ?? lastSaleRate(db, it.id) ?? 0 };
      }),
    );
  }, [db]);

  // Load the bill being edited exactly once (db refetches must not clobber edits).
  React.useEffect(() => {
    if (!editing || loadedFor.current === editing.id) return;
    loadedFor.current = editing.id;
    setCustomerId(editing.customerId);
    setDate(editing.date);
    setLines(
      editing.lines
        .filter((l) => l.itemId)
        .map((l) => ({
          key: l.id ?? newId(),
          id: l.id,
          itemId: l.itemId!,
          qty: l.qty,
          rate: l.rate,
          gstRate: l.gstRate,
        })),
    );
    setNotes(editing.notes ?? "");
    setExtraExpenses(String(editing.extraExpenses ?? 0));
    setChargeExtra(!!editing.extraExpensesChargeCustomer);
    setGstEnabled(
      !!(editing.gstRate && editing.gstRate > 0) || editing.lines.some((l) => (l.gstRate ?? 0) > 0),
    );
    setGstRate(String(editing.gstRate && editing.gstRate > 0 ? editing.gstRate : 18));
    setMore(!!editing.notes || (editing.extraExpenses ?? 0) > 0);
  }, [editing]);
  React.useEffect(() => {
    if (!editing && typeof window !== "undefined")
      setSendWa(window.localStorage.getItem(`waAutoSend:${businessId ?? ""}`) === "1");
  }, [editing, businessId]);

  const customer = findCustomer(db, customerId);
  const custDue = customer ? partyBalance(db, "customer", customer.id) : 0;

  // Recent customers first (by latest bill), then the rest alphabetically.
  const recentCustomers = React.useMemo(() => {
    const lastSale = new Map<string, string>();
    for (const s of db.sales)
      if (s.customerId) {
        const prev = lastSale.get(s.customerId);
        if (!prev || s.createdAt > prev) lastSale.set(s.customerId, s.createdAt);
      }
    return db.customers
      .slice()
      .sort(
        (a, b) =>
          (lastSale.get(b.id) ?? "").localeCompare(lastSale.get(a.id) ?? "") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 6);
  }, [db.customers, db.sales]);
  // Frequently sold, in-stock items not already on the bill.
  const quickItems = React.useMemo(() => {
    const freq = new Map<string, number>();
    for (const s of db.sales)
      for (const l of s.lines) if (l.itemId) freq.set(l.itemId, (freq.get(l.itemId) ?? 0) + 1);
    return db.items
      .filter(
        (i) =>
          stockAvailableFor(db, i.id, editing?.id) > 0 && !lines.some((l) => l.itemId === i.id),
      )
      .sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [db, lines, editing?.id]);

  const priceOf = (it: Item) => it.price ?? lastSaleRate(db, it.id) ?? 0;
  const addItem = (it: Item) => {
    setSavedId(null);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.itemId === it.id);
      if (i >= 0) return ls.map((l, idx) => (idx === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: newId(), itemId: it.id, qty: 1, rate: priceOf(it) }];
    });
  };
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  // Stock check per row: available (excluding this sale when editing) minus qty
  // already claimed by earlier rows of the same item.
  const checks = lines.map((l, idx, arr) => {
    const base = stockAvailableFor(db, l.itemId, editing?.id);
    const earlier = arr
      .slice(0, idx)
      .filter((x) => x.itemId === l.itemId)
      .reduce((s, x) => s + x.qty, 0);
    const available = base - earlier;
    return { available, short: Math.max(0, l.qty - available) };
  });
  const anyShort = checks.some((c) => c.short > 0);

  // Totals — same maths as gstAmount()/billPayable() in the store.
  const rateNum = gstEnabled ? Math.max(0, Number(gstRate) || 0) : 0;
  const extraNum = Math.max(0, Number(extraExpenses) || 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.rate, 0);
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const slabOf = (l: Line) =>
    l.id ? (l.gstRate ?? null) : (findItem(db, l.itemId)?.gstRate ?? null);
  const gst = !gstEnabled
    ? 0
    : lines.reduce((a, l) => a + l.qty * l.rate * (((slabOf(l) ?? rateNum) || 0) / 100), 0) +
      (chargeExtra ? extraNum * (rateNum / 100) : 0);
  const taxBase = subtotal + (chargeExtra ? extraNum : 0);
  const total = Math.round(taxBase + gst);
  const inter = isInterState(db.shop.gstin, customer?.gstin);
  const needsFallback =
    gstEnabled && (lines.some((l) => slabOf(l) == null) || (chargeExtra && extraNum > 0));
  const paidNum = editing ? (editing.amountPaid ?? 0) : Math.min(Number(paid) || 0, total);
  const due = Math.max(0, total - paidNum);

  const submit = async () => {
    if (!canWrite) return setError("You don't have permission to create bills");
    if (!customerId) return setError("Choose a customer first");
    const cleaned = lines.filter((l) => l.itemId && l.qty > 0 && l.rate >= 0);
    if (cleaned.length === 0) return setError("Add at least one item");
    if (anyShort) {
      if (!isAdmin) return setError("Not enough stock for one or more items");
      if (!override) return setError("Tick the override box to save with negative stock");
    }
    // Snapshot each NEW line's GST slab from the catalog at save time; lines
    // that already have an id keep their stored snapshot (see AGENTS.md).
    const finalLines: SaleLine[] = cleaned.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      itemId: l.itemId,
      qty: l.qty,
      rate: l.rate,
      gstRate: gstEnabled
        ? l.id
          ? (l.gstRate ?? null)
          : (findItem(db, l.itemId)?.gstRate ?? null)
        : null,
    }));
    const gstRateNum = gstEnabled ? rateNum : null;
    const charge = extraNum > 0 && chargeExtra;

    setSaving(true);
    setError(null);
    let res;
    let created: Sale | null = null;
    if (editing) {
      const patch = {
        date,
        customerId,
        lines: finalLines,
        isBill: true,
        notes: notes || undefined,
        extraExpenses: extraNum,
        extraExpensesChargeCustomer: charge,
        gstRate: gstRateNum,
      };
      // amountPaid is never clamped down (that would erase received money);
      // "fully paid" is re-derived because the total may have changed.
      res = await set((d) => ({
        ...d,
        sales: d.sales.map((x) => {
          if (x.id !== editing.id) return x;
          const updated = { ...x, ...patch };
          return { ...updated, paymentReceived: (x.amountPaid ?? 0) >= billPayable(updated) };
        }),
      }));
    } else {
      const sale: Sale = {
        id: newId(),
        date,
        customerId,
        lines: finalLines,
        isBill: true,
        notes: notes || undefined,
        paymentReceived: paidNum >= total,
        amountPaid: paidNum,
        paidMode: paidNum > 0 ? mode : null,
        extraExpenses: extraNum,
        extraExpensesChargeCustomer: charge,
        gstRate: gstRateNum,
        archived: false,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      res = await set((d) => ({ ...d, sales: [...d.sales, sale] }));
      created = sale;
    }
    setSaving(false);
    if (!res.ok) return setError(res.error);
    if (editing) {
      toast.success("Bill updated");
      navigate({ to: "/sales" });
      return;
    }
    toast.success("Bill saved");
    if (created && sendWa && waConnected && businessId) {
      sendBillOnWhatsApp(db, created, businessId).then(
        () => toast.success("Bill sent on WhatsApp"),
        (e) => toast.error(`Bill saved, but WhatsApp send failed — ${(e as Error).message}`),
      );
    }
    setSavedId(created!.id);
    setSavedSnapshot({ sale: created!, customer: customer?.name ?? "", paid: paidNum, due, mode });
    reset(false);
  };
  const reset = (clearBanner: boolean) => {
    setCustomerId(null);
    setLines([]);
    setPaid("");
    setNotes("");
    setExtraExpenses("0");
    setChargeExtra(false);
    setOverride(false);
    setError(null);
    setDate(today());
    setMore(false);
    if (clearBanner) {
      setSavedId(null);
      setSavedSnapshot(null);
    }
  };
  // The saved bill as the store now sees it (with the DB-assigned bill number).
  const savedSale = savedId
    ? (db.sales.find((s) => s.id === savedId) ?? savedSnapshot?.sale ?? null)
    : null;

  const chip = (on: boolean): React.CSSProperties => ({
    cursor: "pointer",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    border: `1px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
    background: on ? "var(--pe-green-soft)" : "var(--pe-surface)",
    color: on ? "var(--pe-green-dark)" : "var(--pe-ink-2)",
  });
  const row = (label: React.ReactNode, value: React.ReactNode, strong?: boolean) => (
    <div className="flex justify-between text-[14px] text-[color:var(--pe-ink-2)]">
      <span>{label}</span>
      <span
        className={"tabular-nums " + (strong ? "font-semibold text-[color:var(--pe-ink)]" : "")}
      >
        {value}
      </span>
    </div>
  );

  if (!canWrite) {
    return (
      <>
        <PeTitle eyebrow="Sales" title="New bill" />
        <PeCard flat>
          <PeEmpty>You have view-only access to this business.</PeEmpty>
        </PeCard>
      </>
    );
  }
  if (edit && !editing && db.sales.length > 0) {
    return (
      <>
        <PeTitle eyebrow="Sales" title="Edit bill" />
        <PeCard flat>
          <PeEmpty>
            This bill no longer exists.{" "}
            <Link to="/sales" className="font-semibold" style={{ color: "var(--pe-green)" }}>
              Back to sales
            </Link>
          </PeEmpty>
        </PeCard>
      </>
    );
  }

  return (
    <>
      <PeTitle
        eyebrow={editing ? `Sales · Bill ${billNoLabel(editing)}` : "Sales · New bill"}
        title={editing ? "Edit bill" : "New bill"}
        actions={
          <label
            className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[color:var(--pe-ink-2)] bg-white cursor-pointer"
            style={{
              height: 38,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid var(--pe-line)",
            }}
          >
            <span>Date ·</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Bill date"
              className="border-0 bg-transparent outline-none text-[13.5px] font-semibold text-[color:var(--pe-ink)] cursor-pointer"
            />
          </label>
        }
      />

      {savedSale && savedSnapshot && (
        <div
          className="flex items-center gap-3.5 flex-wrap mb-4"
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            background: "var(--pe-good-bg)",
            border: "1px solid #BFE5CB",
          }}
        >
          <span
            className="inline-flex items-center justify-center text-white shrink-0"
            style={{ width: 30, height: 30, borderRadius: 999, background: "var(--pe-good)" }}
          >
            <Check className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[14.5px] font-bold" style={{ color: "#14532D" }}>
              Bill {billNoLabel(savedSale)} saved for {savedSnapshot.customer}
            </div>
            <div className="text-[13px]" style={{ color: "#166534" }}>
              {savedSnapshot.paid > 0
                ? `${fmtINR(savedSnapshot.paid)} received by ${savedSnapshot.mode.toUpperCase()}`
                : "Nothing received yet"}
              {savedSnapshot.due > 0
                ? ` · ${fmtINR(savedSnapshot.due)} added to khata`
                : " · fully paid"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShareTarget(savedSale)}
            className="inline-flex items-center gap-1.5 text-white text-[13px] font-bold"
            style={{ height: 34, padding: "0 13px", borderRadius: 9, background: "var(--pe-good)" }}
          >
            <MessageCircle className="h-4 w-4" /> Share on WhatsApp
          </button>
          <button
            type="button"
            onClick={() => downloadBillPdf(db, savedSale)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-white"
            style={{
              height: 34,
              padding: "0 13px",
              borderRadius: 9,
              border: "1px solid #BFE5CB",
              color: "#14532D",
            }}
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <Link
            to="/bills/$id"
            params={{ id: savedSale.id }}
            className="text-[13px] font-bold"
            style={{ color: "#14532D", padding: "0 6px" }}
          >
            View bill
          </Link>
          <button
            type="button"
            onClick={() => reset(true)}
            className="text-[13px] font-bold"
            style={{ color: "#14532D", padding: "0 6px" }}
          >
            Start next bill
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-start">
        {/* Left column: customer + items */}
        <div className="flex flex-col gap-3.5 min-w-0" style={{ flex: "999 1 480px" }}>
          <PeCard flat style={{ padding: "18px 20px" }}>
            <PeStep n={1}>Customer</PeStep>
            {customer ? (
              <div
                className="flex items-center gap-3 mt-3"
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1.5px solid var(--pe-green)",
                  background: "#FBFDFC",
                }}
              >
                <PeAvatar name={customer.name} tone="green" size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] font-bold text-[color:var(--pe-ink)] truncate">
                    {customer.name}
                  </div>
                  <div className="text-[12.5px] text-[color:var(--pe-ink-3)] truncate">
                    {[customer.phone, customer.gstin ? `GSTIN ${customer.gstin}` : customer.address]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11.5px] font-semibold text-[color:var(--pe-ink-3)]">
                    Previous due
                  </div>
                  <div
                    className="text-[14.5px] font-bold tabular-nums"
                    style={{ color: custDue > 0 ? "var(--pe-bad)" : "var(--pe-good)" }}
                  >
                    {custDue > 0
                      ? fmtINR(custDue)
                      : custDue < 0
                        ? `${fmtINR(-custDue)} adv`
                        : "Settled"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Change customer"
                  onClick={() => setCustomerId(null)}
                  className="pe-x-hover inline-flex items-center justify-center rounded-md text-[color:var(--pe-ink-3)]"
                  style={{ width: 28, height: 28 }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <SearchDrop<Person>
                  placeholder="Search customer by name or phone…"
                  items={db.customers}
                  render={(c) => ({
                    primary: c.name,
                    secondary: [c.phone, c.address].filter(Boolean).join(" · "),
                  })}
                  onPick={(c) => {
                    setCustomerId(c.id);
                    setSavedId(null);
                  }}
                  onAdd={() => setAddKind("customer")}
                  addLabel="New customer"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {recentCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCustomerId(c.id)}
                  style={chip(c.id === customerId)}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAddKind("customer")}
                className="pe-chip-hover"
                style={{ ...chip(false), borderStyle: "dashed" }}
              >
                + New customer
              </button>
            </div>
          </PeCard>

          <PeCard pad={0} flat className="overflow-hidden">
            <div style={{ padding: "18px 20px 14px" }}>
              <PeStep n={2}>Items</PeStep>
              <div className="mt-3">
                <SearchDrop<Item>
                  placeholder="Search an item to add…"
                  items={db.items}
                  render={(it) => {
                    const st = stockAvailableFor(db, it.id, editing?.id);
                    return {
                      primary: it.name,
                      secondary: `${it.company}${it.hsn ? ` · HSN ${it.hsn}` : ""}`,
                      right: (
                        <>
                          <b>{fmtINR(priceOf(it))}</b>
                          <div
                            className="text-[11.5px]"
                            style={{ color: st <= 0 ? "var(--pe-bad)" : "var(--pe-ink-3)" }}
                          >
                            {st} in stock
                          </div>
                        </>
                      ),
                    };
                  }}
                  onPick={addItem}
                  onAdd={() => setAddKind("item")}
                  addLabel="New item"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {quickItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => addItem(it)}
                    className="pe-chip-hover inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--pe-ink-2)]"
                    style={{
                      padding: "6px 11px",
                      borderRadius: 8,
                      border: "1px dashed #D7D3C6",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    + {it.name}{" "}
                    <span className="text-[color:var(--pe-ink-3)]">{fmtINR(priceOf(it))}</span>
                  </button>
                ))}
              </div>
            </div>
            <PeTable minWidth={560}>
              <PeTHead template={LINE_COLS} top>
                <span>Item</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Rate</span>
                <span className="text-right">GST</span>
                <span className="text-right">Amount</span>
                <span />
              </PeTHead>
              {lines.map((l, i) => {
                const it = findItem(db, l.itemId);
                const c = checks[i];
                const slab = slabOf(l);
                return (
                  <div
                    key={l.key}
                    className="grid gap-2.5 items-center"
                    style={{
                      gridTemplateColumns: LINE_COLS,
                      padding: "12px 20px",
                      borderTop: "1px solid var(--pe-line-3)",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-[color:var(--pe-ink)] truncate">
                        {it?.name ?? "—"}
                      </div>
                      <div
                        className="text-[12px] truncate"
                        style={{ color: c.short > 0 ? "var(--pe-bad)" : "var(--pe-ink-3)" }}
                      >
                        {it?.company}
                        {it?.hsn ? ` · HSN ${it.hsn}` : ""} ·{" "}
                        {c.short > 0
                          ? `only ${c.available} in stock`
                          : `${c.available - l.qty} left after sale`}
                      </div>
                    </div>
                    <div
                      className="flex items-center overflow-hidden"
                      style={{ height: 34, borderRadius: 9, border: "1px solid var(--pe-line)" }}
                    >
                      <button
                        type="button"
                        aria-label="Less"
                        onClick={() =>
                          l.qty <= 1 ? removeLine(l.key) : updateLine(l.key, { qty: l.qty - 1 })
                        }
                        className="h-full font-bold text-[16px] text-[color:var(--pe-ink-2)]"
                        style={{ width: 34, background: "var(--pe-bg-2)" }}
                      >
                        −
                      </button>
                      <input
                        value={l.qty}
                        inputMode="decimal"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          updateLine(l.key, { qty: v === "" ? 0 : Number(v) });
                        }}
                        onBlur={() => {
                          if (!l.qty) updateLine(l.key, { qty: 1 });
                        }}
                        className="flex-1 min-w-0 w-full text-center border-0 outline-none text-[14px] font-bold bg-transparent"
                        aria-label="Quantity"
                      />
                      <button
                        type="button"
                        aria-label="More"
                        onClick={() => updateLine(l.key, { qty: l.qty + 1 })}
                        className="h-full font-bold text-[16px] text-[color:var(--pe-ink-2)]"
                        style={{ width: 34, background: "var(--pe-bg-2)" }}
                      >
                        +
                      </button>
                    </div>
                    <NumberInput
                      value={String(l.rate)}
                      onValueChange={(v) => updateLine(l.key, { rate: v === "" ? 0 : Number(v) })}
                      min={0}
                      max={10000000}
                      aria-label="Rate"
                      className="h-[34px] rounded-lg text-right tabular-nums text-[14px] px-2 bg-white"
                    />
                    <span className="text-right text-[13px] text-[color:var(--pe-ink-3)] tabular-nums">
                      {gstEnabled ? `${slab ?? rateNum}%` : "—"}
                    </span>
                    <span className="text-right text-[14.5px] font-bold tabular-nums">
                      {fmtINR(l.qty * l.rate)}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => removeLine(l.key)}
                      className="pe-x-hover inline-flex items-center justify-center rounded-[7px] text-[color:var(--pe-ink-3)]"
                      style={{ width: 28, height: 28 }}
                    >
                      <X className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                );
              })}
            </PeTable>
            {lines.length === 0 && (
              <PeEmpty pad={28}>No items yet. Search above or tap a suggestion to add one.</PeEmpty>
            )}
            {anyShort && (
              <div
                className="flex items-start gap-2 text-[12.5px] font-medium"
                style={{
                  margin: "0 20px 16px",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--pe-warn-bg)",
                  color: "var(--pe-warn)",
                }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                {isAdmin ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    Not enough stock — save anyway and let stock go negative (admin override)
                  </label>
                ) : (
                  <span>
                    Not enough stock for one or more items. Reduce the quantity or add a purchase
                    first.
                  </span>
                )}
              </div>
            )}
          </PeCard>

          {/* Less-used fields, tucked away like the prototype's clean composer */}
          <PeCard pad={0} flat className="overflow-hidden">
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              className="w-full flex items-center justify-between text-[13.5px] font-semibold text-[color:var(--pe-ink-2)]"
              style={{ padding: "14px 20px" }}
            >
              <span>More options · notes, extra charges{waConnected ? ", WhatsApp" : ""}</span>
              {more ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {more && (
              <div className="grid gap-3.5" style={{ padding: "0 20px 18px" }}>
                <div className="grid gap-1.5">
                  <Label>Notes on the bill</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Printed under the items"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Extra expenses (₹)</Label>
                  <NumberInput
                    value={extraExpenses}
                    onValueChange={setExtraExpenses}
                    min={0}
                    max={10000000}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. transportation, packing, loading.
                  </p>
                  {extraNum > 0 && (
                    <label className="flex items-start gap-2 text-sm rounded-md border bg-muted/40 px-2 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={chargeExtra}
                        onChange={(e) => setChargeExtra(e.target.checked)}
                      />
                      <span>
                        Charge this extra expense to the customer
                        <span className="block text-xs text-muted-foreground">
                          {chargeExtra
                            ? "Added to the bill — customer pays it."
                            : "Not added to the bill — shop absorbs it (reduces profit)."}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
                {!editing &&
                  waConnected &&
                  (() => {
                    const noPhone = !!customer && !customer.phone;
                    return (
                      <label
                        className={
                          "flex items-start gap-2 text-sm rounded-md border bg-muted/40 px-2 py-2 " +
                          (noPhone ? "opacity-60" : "cursor-pointer")
                        }
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={noPhone}
                          checked={sendWa && !noPhone}
                          onChange={(e) => {
                            setSendWa(e.target.checked);
                            if (businessId)
                              window.localStorage.setItem(
                                `waAutoSend:${businessId}`,
                                e.target.checked ? "1" : "0",
                              );
                          }}
                        />
                        <span>
                          Send bill to customer on WhatsApp after saving
                          <span className="block text-xs text-muted-foreground">
                            {noPhone
                              ? "This customer has no phone number — add one to send."
                              : "The invoice PDF goes out from your connected WhatsApp."}
                          </span>
                        </span>
                      </label>
                    );
                  })()}
              </div>
            )}
          </PeCard>
        </div>

        {/* Right column: payment (sticky on desktop) */}
        <PeCard
          pad={0}
          className="overflow-hidden min-w-0 md:sticky"
          style={{ flex: "1 1 320px", top: 96 }}
        >
          <div className="flex flex-col gap-2.5" style={{ padding: "18px 20px" }}>
            <PeStep n={3}>Payment</PeStep>
            <div className="mt-1">
              {row(`Subtotal · ${units} ${units === 1 ? "unit" : "units"}`, fmtINR(subtotal), true)}
            </div>
            {extraNum > 0 && chargeExtra && row("Extra charges", `+${fmtINR(extraNum)}`)}
            {extraNum > 0 &&
              !chargeExtra &&
              row(
                <span className="text-[color:var(--pe-ink-3)]">Extra cost (shop bears)</span>,
                <span style={{ color: "var(--pe-bad)" }}>−{fmtINR(extraNum)}</span>,
              )}
            <label className="flex items-center justify-between text-[14px] text-[color:var(--pe-ink-2)] cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={gstEnabled}
                  onChange={(e) => setGstEnabled(e.target.checked)}
                />{" "}
                Add GST
              </span>
              {gstEnabled && <span className="tabular-nums">{fmtINR(gst)}</span>}
            </label>
            {gstEnabled && (
              <>
                {inter ? (
                  row("IGST", fmtINR(gst))
                ) : (
                  <>
                    {row("CGST", fmtINR(gst / 2))}
                    {row("SGST", fmtINR(gst / 2))}
                  </>
                )}
                <div className="text-[11.5px] text-[color:var(--pe-ink-3)]">
                  {inter
                    ? `Different state (${gstStateCode(db.shop.gstin)} → ${gstStateCode(customer?.gstin)}) — IGST applied`
                    : `Same state${gstStateCode(db.shop.gstin) ? ` (${gstStateCode(db.shop.gstin)})` : ""} — CGST + SGST applied`}
                </div>
                {needsFallback && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-[color:var(--pe-ink-3)]">
                    <span>Rate for items without a slab:</span>
                    {["5", "12", "18", "28"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setGstRate(r)}
                        style={{ ...chip(gstRate === r), padding: "3px 9px", fontSize: 12 }}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div
              className="flex justify-between items-baseline pt-3 mt-0.5"
              style={{ borderTop: "1px dashed var(--pe-line)" }}
            >
              <span className="text-[15px] font-bold text-[color:var(--pe-ink)]">Bill total</span>
              <span
                className="text-[28px] font-bold tracking-[-0.02em] tabular-nums"
                style={{ color: "var(--pe-green)" }}
              >
                {fmtINR(total)}
              </span>
            </div>
          </div>
          <div
            className="flex flex-col gap-3"
            style={{
              padding: "16px 20px 20px",
              background: "var(--pe-bg-2)",
              borderTop: "1px solid var(--pe-line-2)",
            }}
          >
            {editing ? (
              <div
                className="text-[13px] text-[color:var(--pe-ink-2)]"
                style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: "#fff",
                  border: "1px solid var(--pe-line)",
                }}
              >
                Paid so far <b className="tabular-nums">{fmtINR(paidNum)}</b>. Record further
                payments from the sales list so the khata stays in step.
              </div>
            ) : (
              <>
                <PeModePicker options={MODES} value={mode} onChange={setMode} filled />
                <div>
                  <div className="text-[12.5px] font-semibold text-[color:var(--pe-ink-2)] mb-1.5">
                    Amount received now
                  </div>
                  <PeMoneyInput
                    value={paid}
                    onChange={(v) => {
                      setPaid(v);
                      setSavedId(null);
                    }}
                    size="lg"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setPaid(String(total))}
                      style={{ ...chip(false), padding: "5px 10px", borderRadius: 7, fontSize: 12 }}
                    >
                      Full amount
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaid("")}
                      style={{ ...chip(false), padding: "5px 10px", borderRadius: 7, fontSize: 12 }}
                    >
                      On credit
                    </button>
                  </div>
                </div>
              </>
            )}
            <div
              className="flex justify-between items-center"
              style={{
                padding: "10px 12px",
                borderRadius: 9,
                background: due > 0 ? "var(--pe-bad-bg)" : "var(--pe-good-bg)",
              }}
            >
              <span
                className="text-[13.5px] font-semibold"
                style={{ color: due > 0 ? "var(--pe-bad)" : "var(--pe-good)" }}
              >
                {due > 0 ? "Goes to khata as due" : "Fully paid"}
              </span>
              <span
                className="text-[16px] font-bold tabular-nums"
                style={{ color: due > 0 ? "var(--pe-bad)" : "var(--pe-good)" }}
              >
                {fmtINR(due)}
              </span>
            </div>
            <PeFormError message={error} />
            <PeBtn
              size="lg"
              onClick={submit}
              disabled={saving}
              style={{ borderRadius: 8, boxShadow: "0 6px 18px rgba(14,107,87,.22)" }}
            >
              {saving
                ? "Saving…"
                : editing
                  ? `Update bill · ${fmtINR(total)}`
                  : `Save bill · ${fmtINR(total)}`}
            </PeBtn>
            {editing && (
              <Link
                to="/sales"
                className="text-center text-[13px] font-semibold text-[color:var(--pe-ink-3)]"
              >
                Cancel
              </Link>
            )}
          </div>
        </PeCard>
      </div>

      <ShareSheet sale={shareTarget} onClose={() => setShareTarget(null)} />
      <AddDialog
        kind={addKind ?? "item"}
        open={addKind !== null}
        onOpenChange={(o) => {
          if (!o) setAddKind(null);
        }}
        onCreated={(id) => {
          if (addKind === "customer") setCustomerId(id);
          else {
            const key = newId();
            pendingRate.current.add(key);
            setLines((ls) => [...ls, { key, itemId: id, qty: 1, rate: 0 }]);
          }
          setAddKind(null);
        }}
      />
    </>
  );
}
