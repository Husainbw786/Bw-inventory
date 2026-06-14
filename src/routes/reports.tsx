import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/AppLayout";
import {
  useDB,
  fmtINR,
  today,
  totalsForRange,
  itemLabel,
  avgCostFor,
  cogsForLines,
} from "@/lib/store";

import { TrendingUp, TrendingDown, ShoppingCart, Wallet, Receipt, Coins } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Shop Manager" }] }),
  component: ReportsPage,
});

type Preset = "today" | "week" | "month" | "custom";

function rangeFor(preset: Preset, from: string, to: string) {
  const t = today();
  const d = new Date();
  if (preset === "today") return { from: t, to: t };
  if (preset === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: t };
  }
  if (preset === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: start.toISOString().slice(0, 10), to: t };
  }
  return { from, to };
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  if (b < a) return out;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${n}`;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const COLORS = ["hsl(var(--primary))", "hsl(217 91% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(346 87% 60%)", "hsl(280 65% 60%)"];

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
      : tone === "negative"
      ? "text-rose-600 bg-rose-50 dark:bg-rose-950/40"
      : "text-primary bg-primary/10";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg md:text-xl font-semibold tabular-nums truncate">{value}</div>
          </div>
          <div className={`shrink-0 rounded-lg p-2 ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsPage() {
  const [db] = useDB();
  const [preset, setPreset] = React.useState<Preset>("month");
  const [from, setFrom] = React.useState(today());
  const [to, setTo] = React.useState(today());

  const r = rangeFor(preset, from, to);
  const totals = totalsForRange(db, r.from, r.to);
  const inRange = (d: string) => d >= r.from && d <= r.to;

  // Daily series
  const daily = React.useMemo(() => {
    const days = eachDay(r.from, r.to);
    return days.map((d) => {
      const salesToday = db.sales.filter((s) => s.date === d);
      const sales = salesToday.reduce(
        (sum, s) => sum + s.lines.reduce((a, l) => a + l.qty * l.rate, 0),
        0,
      );
      const cogs = salesToday.reduce((sum, s) => sum + cogsForLines(db, s.lines), 0);
      const saleExtras = salesToday.reduce(
        (sum, s) => sum + (s.extraExpensesChargeCustomer ? 0 : (s.extraExpenses ?? 0)),
        0,
      );
      const billedExtras = salesToday.reduce(
        (sum, s) => sum + (s.extraExpensesChargeCustomer ? (s.extraExpenses ?? 0) : 0),
        0,
      );
      const purchases = db.purchases
        .filter((p) => p.date === d)
        .reduce((a, p) => a + p.qty * p.rate, 0);
      const expenses = db.expenses.filter((e) => e.date === d).reduce((a, e) => a + e.amount, 0);
      return {
        date: d,
        label: dayLabel(d),
        Sales: Math.round(sales + billedExtras),
        Purchases: Math.round(purchases),
        Expenses: Math.round(expenses + saleExtras),
        Profit: Math.round(sales + billedExtras - cogs - expenses - saleExtras),
      };
    });
  }, [db, r.from, r.to]);

  // Per-item profit (uses lifetime weighted-avg cost for COGS, not just
  // purchases in range — so selling stock you bought earlier still nets profit).
  const perItem = React.useMemo(() => {
    return db.items
      .map((it) => {
        const sold = db.sales
          .filter((s) => inRange(s.date))
          .flatMap((s) => s.lines.filter((l) => l.itemId === it.id));
        const revenue = sold.reduce((a, l) => a + l.qty * l.rate, 0);
        const qtySold = sold.reduce((a, l) => a + l.qty, 0);
        const cost = qtySold * avgCostFor(db, it.id);
        return {
          id: it.id,
          label: itemLabel(it),
          revenue: Math.round(revenue),
          cost: Math.round(cost),
          profit: Math.round(revenue - cost),
          qtySold,
        };
      })
      .filter((x) => x.revenue > 0 || x.cost > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [db, r.from, r.to]);


  const topItems = perItem.slice(0, 5);

  // Breakdown for pie
  const breakdown = [
    { name: "Purchases", value: Math.round(totals.purchases) },
    { name: "Expenses", value: Math.round(totals.expenses) },
    { name: "Profit", value: Math.max(0, Math.round(totals.profit)) },
  ].filter((x) => x.value > 0);

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
    formatter: (v: number) => fmtINR(v as number),
  } as const;

  const profitTone = totals.profit >= 0 ? "positive" : "negative";

  return (
    <>
      <PageHeader title="Reports" subtitle="Profit, trends & top items" />

      {/* Range selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? "default" : "outline"}
            onClick={() => setPreset(p)}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </Button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Sales" value={fmtINR(totals.sales)} icon={ShoppingCart} />
        <StatCard label="Purchases" value={fmtINR(totals.purchases)} icon={Wallet} />
        <StatCard label="Expenses" value={fmtINR(totals.expenses)} icon={Receipt} />
        <StatCard
          label="Profit"
          value={fmtINR(totals.profit)}
          icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Profit trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" /> Profit trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64 w-full">
              {daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtShort} width={56} />
                    <Tooltip {...tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="Profit"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#profitFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sales vs Purchases vs Expenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales · Purchases · Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64 w-full">
              {daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtShort} width={56} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Sales" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Purchases" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="hsl(346 87% 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Money flow donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Money flow</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64 w-full">
              {breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top items bar */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top items by revenue</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-72 w-full">
              {topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topItems}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtShort} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="hsl(142 71% 45%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-item table */}
      <h2 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">Per item breakdown</h2>
      <Card>
        <CardContent className="p-0">
          {perItem.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No activity in this range.</p>
          ) : (
            <ul className="divide-y">
              {perItem.map((row) => (
                <li key={row.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{row.label}</div>
                      <div className="text-xs text-muted-foreground">Sold {row.qtySold}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div>
                        Sales: <span className="tabular-nums font-medium text-foreground">{fmtINR(row.revenue)}</span>
                      </div>
                      <div>
                        Cost: <span className="tabular-nums font-medium text-foreground">{fmtINR(row.cost)}</span>
                      </div>
                      <div className={row.profit >= 0 ? "text-emerald-700" : "text-rose-600"}>
                        Profit: <span className="tabular-nums font-semibold">{fmtINR(row.profit)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
