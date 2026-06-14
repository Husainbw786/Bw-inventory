import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/AppLayout";
import { useDB, today, fmtINR, fmtDate, newId, nowStamp, type Expense } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";

const CATS = ["Transport", "Rent", "Tea & Snacks", "Electricity", "Repairs", "Stationery", "Other"];

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Shop Manager" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const list = db.expenses.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const monthTotal = list
    .filter((e) => e.date.slice(0, 7) === today().slice(0, 7))
    .reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader title="Expenses" subtitle={`This month: ${fmtINR(monthTotal)}`} action={canWrite ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Add</Button> : null} />

      <div className="grid gap-2">
        {list.map((e) => {
          const canEdit = canWrite && (isAdmin || (user && e.createdBy === user.id));
          return (
            <Card key={e.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.category}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(e.date)} · by {e.addedBy}{e.note ? ` · ${e.note}` : ""}</div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="font-semibold tabular-nums">{fmtINR(e.amount)}</div>
                  {canEdit && (
                    <button
                      onClick={() => { setEditing(e); setOpen(true); }}
                      aria-label="Edit expense"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <AdminDelete label="expense" onConfirm={() => set((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }))} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No expenses yet.</p>}
      </div>

      <ExpenseDialog open={open} onOpenChange={setOpen} editing={editing} />
    </>
  );
}

function ExpenseDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (b: boolean) => void; editing: Expense | null }) {
  const [db, set] = useDB();
  const [date, setDate] = React.useState(today());
  const [cat, setCat] = React.useState(CATS[0]);
  const [customCat, setCustomCat] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        const known = CATS.includes(editing.category);
        setCat(known ? editing.category : "Other");
        setCustomCat(known ? "" : editing.category);
        setAmount(String(editing.amount));
        setNote(editing.note ?? "");
      } else {
        setDate(today());
        setCat(CATS[0]);
        setCustomCat("");
        setAmount("");
        setNote("");
      }
    }
  }, [open, editing]);

  const submit = () => {
    const finalCat = cat === "Other" ? customCat.trim() || "Other" : cat;
    if (!amount || Number(amount) <= 0) return toast.error("Enter amount");
    if (editing) {
      const patch = { date, category: finalCat, amount: Number(amount), note: note || undefined };
      set((d) => ({ ...d, expenses: d.expenses.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }));
      toast.success("Expense updated");
    } else {
      const e: Expense = {
        id: newId(),
        date,
        category: finalCat,
        amount: Number(amount),
        note: note || undefined,
        addedBy: db.currentUser,
        createdAt: nowStamp(),
      };
      set((d) => ({ ...d, expenses: [...d.expenses, e] }));
      toast.success("Expense added");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit expense" : "New expense"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATS.map((c) => (
                <Button key={c} type="button" variant={cat === c ? "default" : "outline"} size="sm" onClick={() => setCat(c)}>
                  {c}
                </Button>
              ))}
            </div>
            {cat === "Other" && <Input value={customCat} onChange={(e) => setCustomCat(e.target.value)} placeholder="Custom category" maxLength={40} className="h-11 mt-1" />}
          </div>
          <div className="grid gap-1.5">
            <Label>Amount (₹)</Label>
            <NumberInput value={amount} onValueChange={setAmount} min={0} max={10000000} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-11" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
