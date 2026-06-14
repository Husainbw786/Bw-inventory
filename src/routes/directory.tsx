import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/AppLayout";
import { useDB, newId, nowStamp, fmtINR, usageCount, type Person, billTotal } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Plus, Phone, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";

export const Route = createFileRoute("/directory")({
  head: () => ({ meta: [{ title: "Directory — Shop Manager" }] }),
  component: DirectoryPage,
});

function DirectoryPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [tab, setTab] = React.useState<"dealers" | "customers">("dealers");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Person | null>(null);

  const list = tab === "dealers" ? db.dealers : db.customers;

  return (
    <>
      <PageHeader title="Directory" subtitle="Dealers & customers" action={canWrite ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Add</Button> : null} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full mb-3">
          <TabsTrigger value="dealers">Dealers ({db.dealers.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({db.customers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="grid gap-2">
          {list.map((p) => {
            const stats = tab === "dealers"
              ? {
                  count: db.purchases.filter((x) => x.dealerId === p.id).length,
                  total: db.purchases.filter((x) => x.dealerId === p.id).reduce((s, x) => s + x.qty * x.rate, 0),
                  label: "purchases",
                }
              : {
                  count: db.sales.filter((x) => x.customerId === p.id).length,
                  total: db.sales.filter((x) => x.customerId === p.id).reduce((s, x) => s + billTotal(x), 0),
                  label: "sales",
                };
            const canEdit = canWrite && (isAdmin || (user && p.createdBy === user.id));
            const usage = usageCount(db, tab === "dealers" ? "dealer" : "customer", p.id);
            const detail = usage.total > 0
              ? tab === "dealers"
                ? `Warning: this dealer is referenced by ${usage.purchases} purchase(s). Those records will show "—" for the dealer after deletion. Continue?`
                : `Warning: this customer is referenced by ${usage.sales} sale(s)/bill(s). Those records will show "—" for the customer after deletion. Continue?`
              : undefined;
            return (
              <Card key={p.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      {p.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</div>}
                      {p.address && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{p.address}</div>}
                    </div>
                    <div className="text-right flex items-start gap-1">
                      <div>
                        <div className="text-sm font-semibold tabular-nums">{fmtINR(stats.total)}</div>
                        <div className="text-xs text-muted-foreground">{stats.count} {stats.label}</div>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => { setEditing(p); setOpen(true); }}
                          aria-label="Edit"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      <AdminDelete
                        label={tab === "dealers" ? "dealer" : "customer"}
                        detail={detail}
                        onConfirm={() =>
                          set((d) =>
                            tab === "dealers"
                              ? { ...d, dealers: d.dealers.filter((x) => x.id !== p.id) }
                              : { ...d, customers: d.customers.filter((x) => x.id !== p.id) },
                          )
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">None yet.</p>}
        </TabsContent>
      </Tabs>

      <PersonDialog open={open} onOpenChange={setOpen} kind={tab === "dealers" ? "dealer" : "customer"} editing={editing} />
    </>
  );
}

function PersonDialog({ open, onOpenChange, kind, editing }: { open: boolean; onOpenChange: (b: boolean) => void; kind: "dealer" | "customer"; editing: Person | null }) {
  const [, set] = useDB();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setPhone(editing?.phone ?? "");
      setAddress(editing?.address ?? "");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return toast.error("Name required");
    if (name.trim().length > 80) return toast.error("Name too long");
    if (!isValidPhone(phone.trim())) return toast.error("Enter a valid phone (7–15 digits)");
    if (editing) {
      const patch = { name: name.trim(), phone: phone || undefined, address: address || undefined };
      set((d) =>
        kind === "dealer"
          ? { ...d, dealers: d.dealers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }
          : { ...d, customers: d.customers.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) },
      );
      toast.success("Updated");
    } else {
      const p: Person = { id: newId(), name: name.trim(), phone: phone || undefined, address: address || undefined, createdAt: nowStamp() };
      if (kind === "dealer") set((d) => ({ ...d, dealers: [...d.dealers, p] }));
      else set((d) => ({ ...d, customers: [...d.customers, p] }));
      toast.success("Added");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `Edit ${kind}` : `Add ${kind}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} className="h-11" /></div>
          <div className="grid gap-1.5"><Label>Phone</Label><PhoneInput value={phone} onValueChange={setPhone} className="h-11" placeholder="e.g. +91 98765 43210" /></div>
          <div className="grid gap-1.5"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="h-11" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
