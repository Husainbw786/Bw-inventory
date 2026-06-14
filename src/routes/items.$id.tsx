import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppLayout";
import { useDB, stockOf, lastPurchaseRate, lastSaleRate, fmtINR, fmtDate, findItem, findDealer, findCustomer, itemLabel } from "@/lib/store";
import { ArrowLeft, ArrowDown, ArrowUp } from "lucide-react";

export const Route = createFileRoute("/items/$id")({
  component: ItemDetail,
  notFoundComponent: () => <p className="p-6">Item not found.</p>,
});

function ItemDetail() {
  const { id } = Route.useParams();
  const [db] = useDB();
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

  type Row = { kind: "purchase" | "sale"; date: string; createdAt: string; qty: number; rate: number; who: string; party: string; addedBy: string };
  const rows: Row[] = [
    ...db.purchases
      .filter((p) => p.itemId === item.id)
      .map((p) => ({
        kind: "purchase" as const,
        date: p.date,
        createdAt: p.createdAt,
        qty: p.qty,
        rate: p.rate,
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
          rate: l.rate,
          who: "To",
          party: findCustomer(db, s.customerId)?.name ?? "—",
          addedBy: s.addedBy,
        })),
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2"><Link to="/items"><ArrowLeft /> Back</Link></Button>

      <PageHeader title={item.name} subtitle={item.company} />

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
                <li key={i} className="p-3 flex items-center gap-3">
                  <div className={`rounded-md p-2 ${r.kind === "purchase" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {r.kind === "purchase" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.who} {r.party}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.date)} · by {r.addedBy}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{r.qty} × {fmtINR(r.rate)}</div>
                    <div className="text-xs text-muted-foreground">{fmtINR(r.qty * r.rate)}</div>
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
