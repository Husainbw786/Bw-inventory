import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  PeCard,
  PeCardHead,
  PeArrow,
  PeAvatar,
  PeSegmented,
  PeStatusPill,
  PeTable,
  PeTHead,
  PeTRow,
  PeEmpty,
  toneFor,
  type PeTone,
} from "@/components/ui/pe";
import {
  Receipt,
  TrendingDown,
  Wallet,
  IndianRupee,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  MessageCircle,
} from "lucide-react";
import {
  useDB,
  fmtINR,
  fmtDate,
  today,
  localISO,
  totalsForRange,
  stockOf,
  totalReceivable,
  partyBalance,
  billPayable,
  billNoLabel,
} from "@/lib/store";
import { useAuth, useCanWrite } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Pioneer Enterprises" },
      {
        name: "description",
        content: "Today's money picture: sales, money to collect, profit and low stock.",
      },
    ],
  }),
  component: Home,
});

type Range = "today" | "7d" | "30d";
const RANGES: { value: Range; label: string; days: number; vs: string }[] = [
  { value: "today", label: "Today", days: 1, vs: "yesterday" },
  { value: "7d", label: "7 days", days: 7, vs: "previous week" },
  { value: "30d", label: "30 days", days: 30, vs: "previous 30 days" },
];
const BILL_COLS = "90px minmax(0,2fr) minmax(0,1fr) 70px 120px 110px";

const shiftISO = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
};
const shortDate = (iso: string) => {
  const t = today();
  if (iso === t) return "Today";
  if (iso === shiftISO(t, -1)) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
const compactINR = (n: number) =>
  n >= 100000
    ? `${(n / 100000).toFixed(1)}L`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(Math.round(n));

function Home() {
  const [db] = useDB();
  const { displayName } = useAuth();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const [range, setRange] = React.useState<Range>("today");
  const t = today();
  const r = RANGES.find((x) => x.value === range)!;
  const from = shiftISO(t, -(r.days - 1));
  const totals = totalsForRange(db, from, t);
  const prev = totalsForRange(db, shiftISO(from, -r.days), shiftISO(from, -1));
  const spent = totals.purchases + totals.expenses;

  // Money to collect = true receivable from the khata: sales + opening balances
  // − every payment received (per customer, advances don't offset others' dues).
  const toCollect = totalReceivable(db);
  const owes = db.customers
    .map((c) => ({ c, balance: partyBalance(db, "customer", c.id) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const lastBillOf = (customerId: string) =>
    db.sales
      .filter((s) => s.customerId === customerId)
      .map((s) => s.date)
      .sort()
      .pop();

  const low = db.items
    .map((i) => ({ ...i, stock: stockOf(db, i.id), low: i.lowStock ?? 5 }))
    .filter((i) => i.stock <= i.low)
    .sort((a, b) => a.stock - b.stock);

  // Last 7 days of sales for the bar chart.
  const week = Array.from({ length: 7 }, (_, i) => {
    const iso = shiftISO(t, i - 6);
    const d = new Date(iso + "T00:00:00");
    return {
      iso,
      day: i === 6 ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" }),
      value: totalsForRange(db, iso, iso).sales,
    };
  });
  const weekTotal = week.reduce((a, d) => a + d.value, 0);
  const weekMax = Math.max(1, ...week.map((d) => d.value));
  const best = week.reduce((a, d) => (d.value > a.value ? d : a), week[0]);

  const bills = db.sales
    .filter((s) => !s.archived)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const statusOf = (s: (typeof bills)[number]) => {
    const total = billPayable(s);
    const paid = s.amountPaid ?? 0;
    if (s.paymentReceived || paid >= total) return { label: "Paid", tone: "good" as PeTone };
    if (paid > 0) return { label: "Partial", tone: "warn" as PeTone };
    return { label: "Unpaid", tone: "bad" as PeTone };
  };

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const pctNote = (cur: number, before: number) => {
    if (before <= 0)
      return cur > 0
        ? { text: `No sales ${r.vs}`, color: "var(--pe-ink-3)" }
        : { text: "No sales yet", color: "var(--pe-ink-3)" };
    const pct = Math.round(((cur - before) / before) * 100);
    return {
      text: `${pct >= 0 ? "+" : ""}${pct}% vs ${r.vs}`,
      color: pct >= 0 ? "var(--pe-good)" : "var(--pe-bad)",
    };
  };
  const salesNote = pctNote(totals.sales, prev.sales);

  const kpis: {
    label: string;
    value: number;
    color: string;
    note: string;
    noteColor?: string;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconFg: string;
    onClick?: () => void;
  }[] = [
    {
      label: "Sales",
      value: totals.sales,
      color: "var(--pe-ink)",
      note: salesNote.text,
      noteColor: salesNote.color,
      icon: ArrowUpRight,
      iconBg: "var(--pe-good-bg)",
      iconFg: "var(--pe-good)",
      onClick: () => navigate({ to: "/sales" }),
    },
    {
      label: "Money to collect",
      value: toCollect,
      color: "var(--pe-bad)",
      note: `From ${owes.length} customer${owes.length === 1 ? "" : "s"} · view khata`,
      icon: ArrowDownRight,
      iconBg: "var(--pe-bad-bg)",
      iconFg: "var(--pe-bad)",
      onClick: () => navigate({ to: "/directory", search: { tab: "customers" } }),
    },
    {
      label: "Spent",
      value: spent,
      color: "var(--pe-ink)",
      note: `Purchases ${fmtINR(totals.purchases)} · Expenses ${fmtINR(totals.expenses)}`,
      icon: Wallet,
      iconBg: "#F0EEE5",
      iconFg: "var(--pe-ink-2)",
    },
    {
      label: "Profit",
      value: totals.profit,
      color: totals.profit < 0 ? "var(--pe-bad)" : "var(--pe-green)",
      note:
        totals.sales > 0
          ? `${Math.round((totals.profit / totals.sales) * 100)}% of sales`
          : "No sales in this period",
      icon: TrendingUp,
      iconBg: "var(--pe-green-soft)",
      iconFg: "var(--pe-green)",
      onClick: () => navigate({ to: "/reports" }),
    },
  ];

  const quick = [
    {
      label: "New bill",
      sub: "Sell to a customer",
      icon: Receipt,
      primary: true,
      go: () => navigate({ to: "/sales/new" }),
    },
    {
      label: "New purchase",
      sub: "Stock in from a dealer",
      icon: TrendingDown,
      go: () => navigate({ to: "/purchases", search: { new: true } }),
    },
    {
      label: "Add expense",
      sub: "Rent, transport, salary",
      icon: Wallet,
      go: () => navigate({ to: "/expenses", search: { new: true } }),
    },
    {
      label: "Record payment",
      sub: "Money received or paid",
      icon: IndianRupee,
      go: () => navigate({ to: "/directory", search: { tab: "customers" } }),
    },
  ];

  const remind = (c: { name: string; phone?: string }, balance: number) => {
    const digits = (c.phone ?? "").replace(/\D/g, "");
    const wa = digits.length === 10 ? `91${digits}` : digits;
    if (!wa) {
      toast.error(`Add a phone number for ${c.name} first`);
      return;
    }
    const msg = `Hi ${c.name}, this is a gentle reminder that ${fmtINR(balance)} is pending. Thank you!`;
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="text-[14px] font-semibold text-[color:var(--pe-ink-3)]">
            {greeting}
            {displayName ? `, ${displayName.split(" ")[0]}` : ""}
          </div>
          <h1 className="text-[24px] md:text-[26px] font-bold tracking-[-0.02em] text-[color:var(--pe-ink)] mt-1 m-0">
            Here&apos;s your shop today
          </h1>
        </div>
        <PeSegmented
          value={range}
          onChange={setRange}
          options={RANGES.map((x) => ({ value: x.value, label: x.label }))}
        />
      </div>

      {/* KPI row */}
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}
      >
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <PeCard
              key={k.label}
              flat
              hover={!!k.onClick}
              onClick={k.onClick}
              style={{ padding: "18px 20px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-[color:var(--pe-ink-2)]">
                  {k.label}
                </span>
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: k.iconBg,
                    color: k.iconFg,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div
                className="text-[26px] md:text-[28px] font-bold tracking-[-0.02em] tabular-nums mt-2"
                style={{ color: k.color }}
              >
                {fmtINR(k.value)}
              </div>
              <div
                className="text-[12.5px] font-semibold mt-1 truncate"
                style={{ color: k.noteColor ?? "var(--pe-ink-3)" }}
              >
                {k.note}
              </div>
            </PeCard>
          );
        })}
      </div>

      {/* Chart + quick actions */}
      <div className="flex flex-wrap gap-3.5 mt-3.5">
        <PeCard flat className="min-w-0" style={{ flex: "2 1 460px", padding: "20px 22px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[15.5px] font-bold text-[color:var(--pe-ink)]">
                Sales this week
              </div>
              <div className="text-[13px] text-[color:var(--pe-ink-3)] mt-0.5">
                {fmtINR(weekTotal)} total
                {weekTotal > 0 ? ` · best day ${best.day === "Today" ? "today" : best.day}` : ""}
              </div>
            </div>
            <PeArrow onClick={() => navigate({ to: "/reports" })}>Open reports</PeArrow>
          </div>
          <div
            className="flex items-end gap-2 md:gap-3.5 mt-5 pb-1"
            style={{ height: 200, borderBottom: "1px solid var(--pe-line-2)" }}
          >
            {week.map((d) => {
              const isToday = d.iso === t;
              return (
                <div
                  key={d.iso}
                  className="flex-1 h-full flex flex-col justify-end items-center gap-1.5"
                >
                  <span
                    className="text-[11.5px] font-bold tabular-nums"
                    style={{ color: isToday ? "var(--pe-green)" : "var(--pe-ink-3)" }}
                  >
                    {d.value > 0 ? compactINR(d.value) : ""}
                  </span>
                  <div
                    className="w-full"
                    style={{
                      maxWidth: 52,
                      borderRadius: "7px 7px 3px 3px",
                      height: Math.max(6, (d.value / weekMax) * 160),
                      background: isToday ? "var(--pe-green)" : "var(--pe-green-soft-2)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 md:gap-3.5 mt-2">
            {week.map((d) => {
              const isToday = d.iso === t;
              return (
                <div
                  key={d.iso}
                  className="flex-1 text-center text-[12px]"
                  style={{
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? "var(--pe-ink)" : "var(--pe-ink-3)",
                  }}
                >
                  {d.day}
                </div>
              );
            })}
          </div>
        </PeCard>

        {canWrite && (
          <PeCard
            flat
            className="min-w-0 flex flex-col gap-2"
            style={{ flex: "1 1 280px", padding: 18 }}
          >
            <div
              className="text-[15.5px] font-bold text-[color:var(--pe-ink)]"
              style={{ padding: "2px 4px 6px" }}
            >
              Quick actions
            </div>
            {quick.map((q) => {
              const Icon = q.icon;
              const p = !!q.primary;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={q.go}
                  className={"flex items-center gap-3 text-left " + (p ? "" : "pe-chip-hover")}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${p ? "var(--pe-green)" : "var(--pe-line-2)"}`,
                    background: p ? "var(--pe-green)" : "var(--pe-surface)",
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: p ? "rgba(255,255,255,.18)" : "#F0EEE5",
                      color: p ? "#fff" : "var(--pe-ink-2)",
                    }}
                  >
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block text-[14.5px] font-bold"
                      style={{ color: p ? "#fff" : "var(--pe-ink)" }}
                    >
                      {q.label}
                    </span>
                    <span
                      className="block text-[12.5px] mt-px"
                      style={{ color: p ? "rgba(255,255,255,.78)" : "var(--pe-ink-3)" }}
                    >
                      {q.sub}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0"
                    style={{ color: p ? "rgba(255,255,255,.78)" : "var(--pe-ink-3)" }}
                  />
                </button>
              );
            })}
          </PeCard>
        )}
      </div>

      {/* Who owes you + low stock */}
      <div
        className="grid gap-3.5 mt-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}
      >
        <PeCard pad={0} flat className="overflow-hidden">
          <PeCardHead
            title="Who owes you"
            sub={
              owes.length
                ? `${owes.length} customer${owes.length === 1 ? "" : "s"} · ${fmtINR(toCollect)} due`
                : "Nobody owes you right now"
            }
            action={
              <PeArrow onClick={() => navigate({ to: "/directory", search: { tab: "customers" } })}>
                Open khata
              </PeArrow>
            }
          />
          {owes.slice(0, 5).map(({ c, balance }) => {
            const last = lastBillOf(c.id);
            return (
              <div
                key={c.id}
                className="flex items-center gap-3"
                style={{ padding: "12px 20px", borderTop: "1px solid var(--pe-line-3)" }}
              >
                <Link
                  to="/directory"
                  search={{ tab: "customers", party: c.id }}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <PeAvatar name={c.name} tone="green" size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold text-[color:var(--pe-ink)] truncate">
                      {c.name}
                    </div>
                    <div className="text-[12.5px] text-[color:var(--pe-ink-3)]">
                      {last ? `Last bill ${shortDate(last)}` : "Opening balance"}
                    </div>
                  </div>
                </Link>
                <div
                  className="text-[15px] font-bold tabular-nums mr-1.5"
                  style={{ color: "var(--pe-bad)" }}
                >
                  {fmtINR(balance)}
                </div>
                <button
                  type="button"
                  onClick={() => remind(c, balance)}
                  className="pe-hover-bg inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--pe-ink)]"
                  style={{
                    height: 32,
                    padding: "0 11px",
                    borderRadius: 8,
                    border: "1px solid var(--pe-line)",
                    background: "var(--pe-surface)",
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--pe-good)" }} />{" "}
                  Remind
                </button>
              </div>
            );
          })}
          {owes.length === 0 && <PeEmpty pad={24}>All customer khatas are settled.</PeEmpty>}
        </PeCard>

        <PeCard pad={0} flat className="overflow-hidden">
          <PeCardHead
            title="Running low on stock"
            sub={
              low.length
                ? `${low.length} item${low.length === 1 ? "" : "s"} need restocking`
                : "Stock levels look healthy"
            }
            action={
              <PeArrow onClick={() => navigate({ to: "/items", search: { filter: "low" } })}>
                View items
              </PeArrow>
            }
          />
          {low.slice(0, 5).map((it) => {
            const out = it.stock <= 0;
            const tone = out ? "var(--pe-bad)" : "var(--pe-warn)";
            const pct = it.low > 0 ? Math.max(0, Math.min(100, (it.stock / it.low) * 100)) : 0;
            return (
              <Link
                key={it.id}
                to="/items/$id"
                params={{ id: it.id }}
                className="flex items-center gap-3 pe-row-hover"
                style={{ padding: "12px 20px", borderTop: "1px solid var(--pe-line-3)" }}
              >
                <PeAvatar name={it.name} tone={out ? "bad" : "warn"} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-[color:var(--pe-ink)] truncate">
                    {it.name}
                  </div>
                  <div className="text-[12.5px] text-[color:var(--pe-ink-3)] truncate">
                    {it.company} · reorder at {it.low}
                  </div>
                </div>
                <div
                  className="hidden sm:block overflow-hidden"
                  style={{ width: 90, height: 6, borderRadius: 999, background: "#EFEDE4" }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 999,
                      width: `${pct}%`,
                      background: tone,
                    }}
                  />
                </div>
                <div
                  className="text-right text-[14.5px] font-bold tabular-nums"
                  style={{ width: 64, color: tone }}
                >
                  {out ? "Out" : `${it.stock} left`}
                </div>
              </Link>
            );
          })}
          {low.length === 0 && <PeEmpty pad={24}>Nothing needs reordering.</PeEmpty>}
        </PeCard>
      </div>

      {/* Recent bills */}
      <PeCard pad={0} flat className="overflow-hidden mt-3.5">
        <PeCardHead
          title="Recent bills"
          divider={false}
          action={<PeArrow onClick={() => navigate({ to: "/sales" })}>All bills</PeArrow>}
        />
        <PeTable minWidth={640}>
          <PeTHead template={BILL_COLS} top>
            <span>Bill</span>
            <span>Customer</span>
            <span>Date</span>
            <span className="text-right">Items</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
          </PeTHead>
          {bills.map((s) => {
            const cust = db.customers.find((c) => c.id === s.customerId);
            const st = statusOf(s);
            const time =
              s.date === t
                ? new Date(s.createdAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;
            return (
              <PeTRow
                key={s.id}
                template={BILL_COLS}
                onClick={() => navigate({ to: "/bills/$id", params: { id: s.id } })}
              >
                <span className="font-bold text-[color:var(--pe-ink-2)]">{billNoLabel(s)}</span>
                <span className="font-semibold truncate text-[color:var(--pe-ink)]">
                  {cust?.name ?? (
                    <span className="italic text-[color:var(--pe-ink-3)]">(deleted)</span>
                  )}
                </span>
                <span className="text-[color:var(--pe-ink-3)] truncate">
                  {time ? `Today, ${time}` : fmtDate(s.date)}
                </span>
                <span className="text-right text-[color:var(--pe-ink-2)] tabular-nums">
                  {s.lines.length}
                </span>
                <span className="text-right font-bold tabular-nums">{fmtINR(billPayable(s))}</span>
                <span className="flex justify-end">
                  <PeStatusPill tone={st.tone} label={st.label} />
                </span>
              </PeTRow>
            );
          })}
        </PeTable>
        {bills.length === 0 && <PeEmpty pad={24}>No bills yet — create your first one.</PeEmpty>}
      </PeCard>
    </>
  );
}
