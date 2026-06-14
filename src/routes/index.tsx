import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { PeCard, PeSectionLabel, PeAvatar, toneStyle, type PeTone } from "@/components/ui/pe";
import {
  ShoppingCart, TrendingDown, Wallet, Package, AlertTriangle,
  ArrowDownRight, ArrowUpRight, ChevronRight, TrendingUp,
} from "lucide-react";
import { useDB, fmtINR, today, totalsForRange, stockOf, itemLabel, billTotal } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Pioneer Enterprises" },
      { name: "description", content: "Today's money picture: sales, money to collect, profit and low stock." },
    ],
  }),
  component: Home,
});

function Home() {
  const [db] = useDB();
  const { displayName } = useAuth();
  const t = today();
  const totals = totalsForRange(db, t, t);

  // Money to collect = sum of (bill total − amountPaid) across non-archived sales
  const toCollect = db.sales
    .filter((s) => !s.archived)
    .reduce((sum, s) => sum + Math.max(0, billTotal(s) - (s.amountPaid ?? 0)), 0);

  // Low stock list
  const low = db.items
    .map((i) => ({ ...i, stock: stockOf(db, i.id) }))
    .filter((i) => i.stock <= (i.lowStock ?? 5))
    .slice(0, 6);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <div className="mb-6">
        <div className="text-[15px] font-semibold text-[color:var(--pe-ink-3)]">
          {greeting}{displayName ? `, ${displayName}` : ""} · {dateLabel}
        </div>
        <h1 className="text-[28px] md:text-[32px] font-extrabold text-[color:var(--pe-ink)] tracking-[-0.04em] mt-1">
          Here&apos;s your shop today
        </h1>
      </div>

      {/* Money hero */}
      <div className="pe-money-hero">
        <BigMoneyCard
          tone="bad"
          label="Money to collect"
          value={toCollect}
          sub="Customers still owe you"
          cta="See who owes"
          to="/sales"
          icon={ArrowDownRight}
        />
        <BigMoneyCard
          tone="green"
          label="Sold today"
          value={totals.sales}
          sub="Money that came in today"
          cta="View bills"
          to="/sales"
          icon={ArrowUpRight}
        />
      </div>

      <div className="pe-3grid mt-3.5">
        <MiniStat label="Sold today" value={totals.sales} tone="good" />
        <MiniStat label="Spent today" value={totals.purchases + totals.expenses} tone="neutral" />
        <MiniStat label="Profit today" value={totals.profit} tone="green" />
      </div>

      <PeSectionLabel>What do you want to do?</PeSectionLabel>
      <div className="pe-qa-grid">
        <QuickAction big tone="green" icon={ShoppingCart} label="New bill" sub="Sell items to a customer" to="/sales" />
        <QuickAction icon={TrendingDown} label="New purchase" sub="Stock from a dealer" to="/purchases" />
        <QuickAction icon={Wallet} label="Add expense" sub="Rent, transport, salary" to="/expenses" />
        <QuickAction icon={Package} label="Add item" sub="New product to sell" to="/items" />
      </div>

      {low.length > 0 && (
        <PeCard pad={0} className="mt-4 overflow-hidden">
          <div
            className="flex items-center gap-2.5"
            style={{ padding: "16px 20px", borderBottom: "1px solid var(--pe-line-2)" }}
          >
            <span
              className="inline-flex items-center justify-center"
              style={{ width: 32, height: 32, borderRadius: 9, background: "var(--pe-warn-bg)", color: "var(--pe-warn)" }}
            >
              <AlertTriangle className="h-[19px] w-[19px]" />
            </span>
            <div className="flex-1">
              <div className="text-[15.5px] font-bold text-[color:var(--pe-ink)]">Running low on stock</div>
              <div className="text-[13px] text-[color:var(--pe-ink-3)]">
                {low.length} item{low.length > 1 ? "s" : ""} need restocking soon
              </div>
            </div>
            <Link
              to="/items"
              className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[color:var(--pe-line)] hover:bg-muted"
            >View items</Link>
          </div>
          {low.map((it, i) => {
            const threshold = it.lowStock ?? 5;
            return (
              <Link
                key={it.id}
                to="/items/$id"
                params={{ id: it.id }}
                className="flex items-center justify-between"
                style={{ padding: "13px 20px", borderTop: i ? "1px solid var(--pe-line-2)" : "none" }}
              >
                <div className="flex items-center gap-3">
                  <PeAvatar name={it.name} tone="warn" size={38} />
                  <div>
                    <div className="font-semibold text-[color:var(--pe-ink)] text-[15px]">{it.name}</div>
                    <div className="text-[13px] text-[color:var(--pe-ink-3)]">{it.company}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[17px] font-extrabold tabular-nums" style={{ color: "var(--pe-warn)" }}>
                    {it.stock} left
                  </div>
                  <div className="text-[12.5px] text-[color:var(--pe-ink-3)]">reorder at {threshold}</div>
                </div>
              </Link>
            );
          })}
        </PeCard>
      )}
    </>
  );
}

function BigMoneyCard({ tone, label, value, sub, cta, to, icon: Icon }: {
  tone: PeTone; label: string; value: number; sub: string; cta: string; to: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const c = toneStyle(tone);
  return (
    <PeCard pad={22}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: c.bg, color: c.fg }}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-[15px] font-bold text-[color:var(--pe-ink-2)]">{label}</span>
      </div>
      <div className="text-[36px] md:text-[38px] font-extrabold tracking-[-0.04em] tabular-nums mt-1.5" style={{ color: c.fg }}>
        {fmtINR(value)}
      </div>
      <div className="text-[13.5px] text-[color:var(--pe-ink-3)] mb-3">{sub}</div>
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-[color:var(--pe-line)] hover:bg-muted self-start"
      >{cta} <ChevronRight className="h-3.5 w-3.5" /></Link>
    </PeCard>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: PeTone }) {
  const c = toneStyle(tone);
  return (
    <PeCard pad={16}>
      <div className="text-[13px] font-semibold text-[color:var(--pe-ink-3)] mb-1.5">{label}</div>
      <div className="text-[22px] font-extrabold tracking-[-0.03em] tabular-nums" style={{ color: c.fg }}>
        {fmtINR(value)}
      </div>
    </PeCard>
  );
}

function QuickAction({ icon: Icon, label, sub, tone, to, big }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; sub: string; tone?: PeTone; to: string; big?: boolean;
}) {
  const primary = tone === "green";
  const c = toneStyle(tone || "neutral");
  return (
    <Link
      to={to}
      className={"pe-card-hover flex items-center gap-3.5 rounded-2xl " + (big ? "pe-qa-big" : "")}
      style={{
        padding: 18,
        border: primary ? "1px solid var(--pe-green)" : "1px solid var(--pe-line)",
        background: primary ? "var(--pe-green)" : "var(--pe-surface)",
        boxShadow: "0 1px 2px rgba(20,32,29,.04), 0 4px 16px rgba(20,32,29,.05)",
      }}
    >
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 48, height: 48, borderRadius: 13,
          background: primary ? "rgba(255,255,255,.18)" : c.bg,
          color: primary ? "#fff" : c.fg,
        }}
      >
        <Icon className="h-[25px] w-[25px]" />
      </span>
      <span className="flex-1">
        <span className="block text-[16.5px] font-bold tracking-[-0.02em]" style={{ color: primary ? "#fff" : "var(--pe-ink)" }}>{label}</span>
        <span className="block text-[13px] mt-0.5" style={{ color: primary ? "rgba(255,255,255,.78)" : "var(--pe-ink-3)" }}>{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5" style={{ color: primary ? "rgba(255,255,255,.7)" : "var(--pe-ink-3)" }} />
    </Link>
  );
}
