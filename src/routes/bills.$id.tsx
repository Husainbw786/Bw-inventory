import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useDB, fmtINR, fmtDate, findCustomer, findItem, itemLabel, billTotal, taxableBase, gstAmount } from "@/lib/store";
import { downloadBillPdf, printBillPdf } from "@/lib/billPdf";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/bills/$id")({
  component: BillDetail,
});

function BillDetail() {
  const { id } = Route.useParams();
  const [db] = useDB();
  const sale = db.sales.find((s) => s.id === id);

  useEffect(() => {
    if (typeof window === "undefined" || !sale) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = window.setTimeout(() => printBillPdf(db, sale), 200);
      return () => window.clearTimeout(t);
    }
  }, [sale, db]);

  if (!sale) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="mb-2"><Link to="/sales"><ArrowLeft />Back</Link></Button>
        <p>Bill not found.</p>
      </>
    );
  }

  const customer = findCustomer(db, sale.customerId);
  const total = billTotal(sale);
  const rate = sale.gstRate ?? 0;
  const gst = gstAmount(sale);
  const base = taxableBase(sale);

  return (
    <>
      <div className="flex items-center justify-between print:hidden mb-2 gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/sales"><ArrowLeft />Back</Link></Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => downloadBillPdf(db, sale)}><Download />Download PDF</Button>
          <Button onClick={() => printBillPdf(db, sale)}><Printer />Print</Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 print:border-0 print:rounded-none print:p-0 print:shadow-none">
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold">{db.shop.name}</h1>
          <p className="text-xs text-muted-foreground">{db.shop.address}</p>
          <p className="text-xs text-muted-foreground">{db.shop.phone}</p>
        </div>

        <div className="flex justify-between text-sm mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Bill to</div>
            <div className="font-medium">{customer?.name ?? <span className="italic text-muted-foreground">(deleted customer)</span>}</div>
            {customer?.phone && <div className="text-xs">{customer.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Bill #</div>
            <div className="font-medium">{sale.id.slice(0, 8).toUpperCase()}</div>
            <div className="text-xs">{fmtDate(sale.date)}</div>
          </div>
        </div>

        <div className="-mx-2 overflow-x-auto print:mx-0 print:overflow-visible">
          <table className="w-full min-w-[420px] text-sm px-2">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium text-right">Qty</th>
                <th className="py-2 font-medium text-right">Rate</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l, i) => {
                const it = findItem(db, l.itemId);
                return (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-2">{it ? itemLabel(it) : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="py-2 text-right tabular-nums">{fmtINR(l.rate)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtINR(l.qty * l.rate)}</td>
                  </tr>
                );
              })}
              {sale.extraExpensesChargeCustomer && (sale.extraExpenses ?? 0) > 0 && (
                <tr className="border-b">
                  <td className="py-2 pr-2">Extra charges (transport, etc.)</td>
                  <td className="py-2 text-right tabular-nums"></td>
                  <td className="py-2 text-right tabular-nums"></td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtINR(sale.extraExpenses)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {rate > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="pt-3 text-right text-muted-foreground">Sub total</td>
                    <td className="pt-3 text-right tabular-nums">{fmtINR(base)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="text-right text-muted-foreground">CGST ({rate / 2}%)</td>
                    <td className="text-right tabular-nums">{fmtINR(gst / 2)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="text-right text-muted-foreground">SGST ({rate / 2}%)</td>
                    <td className="text-right tabular-nums">{fmtINR(gst / 2)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={3} className={(rate > 0 ? "" : "pt-3 ") + "text-right font-semibold"}>Total</td>
                <td className={(rate > 0 ? "" : "pt-3 ") + "text-right font-bold text-lg tabular-nums"}>{fmtINR(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {sale.notes && <p className="mt-4 text-xs text-muted-foreground">Note: {sale.notes}</p>}

        <p className="mt-8 text-center text-xs text-muted-foreground">Thank you for your business!</p>
      </div>
    </>
  );
}
