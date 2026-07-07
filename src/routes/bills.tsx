import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/AppLayout";
import { useDB, fmtINR, fmtDate, findCustomer, billPayable, billNoLabel, type Sale } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useIsAdmin, useCanWrite } from "@/lib/auth";
import { Archive, ArchiveRestore, IndianRupee } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/bills")({
  head: () => ({ meta: [{ title: "Bills — Shop Manager" }] }),
  component: BillsList,
});

function BillsList() {
  const [db, set] = useDB();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [showArchived, setShowArchived] = React.useState(false);

  const all = db.sales.filter((s) => s.isBill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bills = showArchived ? all : all.filter((s) => !s.archived);
  const archivedCount = all.filter((s) => s.archived).length;

  const [unpaidTarget, setUnpaidTarget] = React.useState<Sale | null>(null);
  const [unpaidReason, setUnpaidReason] = React.useState("");

  const togglePaid = (s: Sale) => {
    if (s.paymentReceived) {
      setUnpaidReason("");
      setUnpaidTarget(s);
      return;
    }
    set((d) => ({ ...d, sales: d.sales.map((x) => (x.id === s.id ? { ...x, paymentReceived: true } : x)) }));
    toast.success("Payment received");
  };
  const confirmUnpaid = () => {
    const r = unpaidReason.trim();
    if (!unpaidTarget || r.length < 3) return;
    const id = unpaidTarget.id;
    set((d) => ({ ...d, sales: d.sales.map((x) => (x.id === id ? { ...x, paymentReceived: false } : x)) }));
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
      <PageHeader title="Bills" subtitle={`${bills.length} bills`} />
      <p className="mb-3 text-sm text-muted-foreground">Create new bills from the Sales tab → "Bill".</p>

      {archivedCount > 0 && (
        <div className="mb-2 flex items-center justify-end">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
          </button>
        </div>
      )}

      <div className="grid gap-2">
        {bills.map((s) => {
          const c = findCustomer(db, s.customerId);
          return (
            <div key={s.id} className="relative">
              <Link to="/bills/$id" params={{ id: s.id }}>
                <Card className={"active:scale-[0.99] transition " + (s.archived ? "opacity-60" : "")}>
                  <CardContent className="p-3 flex items-center justify-between gap-3 pr-32">
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-2 flex-wrap">
                        {c?.name ?? <span className="italic text-muted-foreground">(deleted)</span>}
                        {s.paymentReceived && <span className="text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded px-1.5 py-0.5">Paid</span>}
                        {s.archived && <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5">Archived</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtDate(s.date)} · {s.lines.length} item{s.lines.length > 1 ? "s" : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{fmtINR(billPayable(s))}</div>
                      <div className="text-xs text-muted-foreground">{billNoLabel(s)}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-background/80 backdrop-blur rounded-md">
                {canWrite && !s.archived && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePaid(s); }}
                    aria-label={s.paymentReceived ? "Mark unpaid" : "Mark payment received"}
                    title={s.paymentReceived ? "Mark unpaid" : "Mark payment received"}
                    className={
                      "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-emerald-500/10 " +
                      (s.paymentReceived ? "text-emerald-600" : "text-muted-foreground hover:text-emerald-600")
                    }
                  >
                    <IndianRupee className="h-4 w-4" />
                  </button>
                )}
                {isAdmin && s.archived && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); unarchive(s); }}
                    aria-label="Restore"
                    title="Restore from archive"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </button>
                )}
                {isAdmin && s.paymentReceived && !s.archived && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); archive(s); }}
                    aria-label="Archive"
                    title="Archive (keeps stock decremented)"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                )}
                {!s.paymentReceived && (
                  <AdminDelete
                    label="bill"
                    requireReason
                    detail="Stock will be restored since payment isn't received."
                    onConfirm={(reason) => {
                      set((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }));
                      if (reason) toast.success(`Deleted — ${reason}`);
                    }}
                  />
                )}
                {s.paymentReceived && !s.archived && (
                  <AdminDelete
                    label="bill"
                    requireReason
                    blockReason="This bill is marked as Payment received. Use Archive instead so stock isn't restored, or unmark payment first to delete."
                    onConfirm={() => {}}
                  />
                )}
                {s.paymentReceived && s.archived && (
                  <AdminDelete
                    label="bill"
                    requireReason
                    detail="This is an archived paid bill. Deleting WILL restore stock — only do this if the sale never actually happened."
                    onConfirm={(reason) => {
                      set((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }));
                      if (reason) toast.success(`Deleted — ${reason}`);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
        {bills.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No bills yet.</p>}
      </div>

      <AlertDialog open={!!unpaidTarget} onOpenChange={(o) => !o && setUnpaidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmark payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This bill is currently marked as paid. Type a short reason for unmarking.
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
    </>
  );
}
