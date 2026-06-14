import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppLayout";
import { useDB, stockOf, lastPurchaseRate, lastSaleRate, fmtINR, itemLabel, newId, nowStamp, usageCount, type Item } from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import { PeAvatar, type PeTone } from "@/components/ui/pe";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


export const Route = createFileRoute("/items")({
  head: () => ({
    meta: [{ title: "Items — Shop Manager" }, { name: "description", content: "Browse stock and rates of every part." }],
  }),
  component: ItemsPage,
});

function ItemsPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);

  const list = db.items
    .map((i) => ({ ...i, stock: stockOf(db, i.id), lp: lastPurchaseRate(db, i.id), ls: lastSaleRate(db, i.id) }))
    .filter((i) => (q ? itemLabel(i).toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));

  const navigate = useNavigate();
  const avatarTones: PeTone[] = ["warn", "green", "info", "good", "neutral"];

  return (
    <>
      <PageHeader
        title="Items"
        subtitle={`${db.items.length} ${db.items.length === 1 ? "product" : "products"} you buy and sell`}
        action={canWrite ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Add item</Button> : null}
      />

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--pe-ink-3)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items by name…"
          className="pl-12 h-14 rounded-2xl bg-card border-[color:var(--pe-line)] text-[15px] shadow-[0_1px_2px_rgba(20,32,29,.04),0_4px_16px_rgba(20,32,29,.05)]"
        />
      </div>

      <div className="grid gap-3">
        {list.map((i) => {
          const canEdit = canWrite && (isAdmin || (user && i.createdBy === user.id));
          const usage = usageCount(db, "item", i.id);
          const detail = usage.total > 0
            ? `Warning: this item is referenced by ${usage.purchases} purchase(s) and ${usage.sales} sale(s). Those records will show "—" for the item after deletion. Continue?`
            : "This permanently removes the item. This action cannot be undone.";
          const lowThreshold = i.lowStock ?? 5;
          const stockState: "out" | "low" | "ok" = i.stock <= 0 ? "out" : i.stock <= lowThreshold ? "low" : "ok";
          const stockColor =
            stockState === "out" ? "var(--pe-bad)"
            : stockState === "low" ? "var(--pe-warn)"
            : "var(--pe-ink)";
          const stockBadge =
            stockState === "out" ? "Out of stock"
            : stockState === "low" ? "Running low"
            : null;
          const avatarTone = avatarTones[
            Math.abs(i.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % avatarTones.length
          ];
          const margin = i.lp && i.ls && i.lp > 0 ? Math.round(((i.ls - i.lp) / i.lp) * 100) : null;
          const goToDetail = () => navigate({ to: "/items/$id", params: { id: i.id } });
          return (
            <div
              key={i.id}
              role="button"
              tabIndex={0}
              onClick={goToDetail}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToDetail(); } }}
              className="pe-card-hover rounded-2xl border border-[color:var(--pe-line)] bg-card cursor-pointer"
              style={{ boxShadow: "0 1px 2px rgba(20,32,29,.04), 0 4px 16px rgba(20,32,29,.05)" }}
            >
              <div className="p-4 md:p-5 flex items-center gap-3 md:gap-4">
                {/* Avatar */}
                <PeAvatar name={i.name} tone={avatarTone} size={48} />

                {/* Name + unit + buy/sell */}
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] md:text-[18px] font-bold text-[color:var(--pe-ink)] truncate tracking-[-0.01em]">{i.name}</div>
                  <div className="text-[13px] text-[color:var(--pe-ink-3)] truncate">
                    {i.company ? i.company : (i.unit ? i.unit : "")}
                  </div>
                  <div className="mt-3 flex items-end gap-5 flex-wrap">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[color:var(--pe-ink-3)] font-semibold">You buy at</div>
                      <div className="text-[15px] font-bold text-[color:var(--pe-ink)] tabular-nums">
                        {i.lp != null ? fmtINR(i.lp) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[color:var(--pe-ink-3)] font-semibold">You sell at</div>
                      <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--pe-good)" }}>
                        {i.ls != null ? fmtINR(i.ls) : "—"}
                      </div>
                    </div>
                    {margin != null && (
                      <div
                        className="text-[12.5px] font-semibold tabular-nums"
                        style={{ color: margin >= 0 ? "var(--pe-good)" : "var(--pe-bad)" }}
                      >
                        {margin >= 0 ? "+" : ""}{margin}% margin
                      </div>
                    )}
                  </div>
                </div>

                {/* Stock */}
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wider text-[color:var(--pe-ink-3)] font-semibold">In stock</div>
                  <div
                    className="text-[28px] md:text-[30px] font-extrabold tabular-nums leading-none mt-1 tracking-[-0.02em]"
                    style={{ color: stockColor }}
                  >
                    {i.stock}
                  </div>
                  {stockBadge && (
                    <div className="mt-1 text-[12px] font-semibold" style={{ color: stockColor }}>
                      {stockBadge}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 md:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(i); setOpen(true); }}
                      className="inline-flex items-center gap-2 h-10 px-3 sm:px-4 rounded-xl border border-[color:var(--pe-line)] bg-card text-[13px] font-semibold text-[color:var(--pe-ink)] hover:bg-[color:var(--pe-bg)]"
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 h-10 px-3 sm:px-4 rounded-xl border border-[color:var(--pe-line)] bg-card text-[13px] font-semibold text-[color:var(--pe-ink)] hover:bg-[color:var(--pe-bg)]"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="hidden sm:inline">More</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={goToDetail}>View details</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-1 py-1">
                        <AdminDelete
                          label="item"
                          detail={detail}
                          onConfirm={() => set((d) => ({ ...d, items: d.items.filter((x) => x.id !== i.id) }))}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No items.</p>}
      </div>

      <ItemDialog open={open} onOpenChange={setOpen} editing={editing} />
    </>
  );
}


function ItemDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (b: boolean) => void; editing: Item | null }) {
  const [, set] = useDB();
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [unit, setUnit] = React.useState("pc");
  const [low, setLow] = React.useState("5");

  React.useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCompany(editing?.company ?? "");
      setUnit(editing?.unit ?? "pc");
      setLow(String(editing?.lowStock ?? 5));
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim() || !company.trim()) {
      toast.error("Item name and company are required");
      return;
    }
    if (editing) {
      const patch = { name: name.trim(), company: company.trim(), unit: unit.trim() || "pc", lowStock: Number(low) || 5 };
      set((db) => ({ ...db, items: db.items.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) }));
      toast.success("Item updated");
    } else {
      const item: Item = {
        id: newId(),
        name: name.trim(),
        company: company.trim(),
        unit: unit.trim() || "pc",
        lowStock: Number(low) || 5,
        createdAt: nowStamp(),
      };
      set((db) => ({ ...db, items: [...db.items, item] }));
      toast.success("Item added");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Item name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brake Shoe" autoFocus maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Hero Honda" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value.replace(/[^a-zA-Z/ ]/g, "").slice(0, 12))} placeholder="pc / set / btl" />
            </div>
            <div className="grid gap-1.5">
              <Label>Low-stock alert</Label>
              <NumberInput value={low} onValueChange={setLow} allowDecimal={false} min={0} max={99999} />
            </div>
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
