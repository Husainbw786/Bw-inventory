import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EntityPicker } from "@/components/EntityPicker";
import {
  useDB,
  stockOf,
  lastPurchaseRate,
  lastSaleRate,
  avgCostFor,
  fmtINR,
  itemLabel,
  newId,
  nowStamp,
  today,
  usageCount,
  GST_SLABS,
  type Item,
} from "@/lib/store";
import { AdminDelete } from "@/components/AdminDelete";
import { useAuth, useIsAdmin, useCanWrite } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { MobileHeader } from "@/components/AppLayout";
import { khataReady, type Purchase, type Payment, type PaymentMode } from "@/lib/store";
import { toast } from "sonner";
import { NumberInput } from "@/components/ui/number-input";
import {
  PeAvatar,
  PeFormError,
  PeBtn,
  PeCard,
  PeEmpty,
  PeFilterPill,
  PeTable,
  PeTHead,
  PeTRow,
  PeTitle,
  toneFor,
} from "@/components/ui/pe";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StockFilter = "all" | "low" | "out";

export const Route = createFileRoute("/items")({
  // ?filter=low|out pre-selects a stock filter (dashboard "View items", alerts bell)
  validateSearch: (search: Record<string, unknown>): { filter?: "low" | "out"; new?: boolean } => ({
    ...(search.filter === "low" || search.filter === "out" ? { filter: search.filter } : {}),
    ...(search.new === true || search.new === "true" || search.new === "1" ? { new: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Items — Shop Manager" },
      { name: "description", content: "Browse stock and rates of every part." },
    ],
  }),
  component: ItemsPage,
});

const COLS = "minmax(0,2.2fr) 70px 60px 90px 90px 80px 130px 40px";

function ItemsPage() {
  const [db, set] = useDB();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const { filter: filterParam, new: newParam } = Route.useSearch();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<StockFilter>(filterParam ?? "all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjustItem, setAdjustItem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (filterParam) setFilter(filterParam);
  }, [filterParam]);
  // ?new=1 (mobile "+" menu) opens the add-item form straight away.
  React.useEffect(() => {
    if (newParam && canWrite) {
      setEditing(null);
      setOpen(true);
      navigate({ to: "/items", search: filterParam ? { filter: filterParam } : {}, replace: true });
    }
  }, [newParam, canWrite, filterParam, navigate]);

  const rows = db.items.map((i) => {
    const stock = stockOf(db, i.id);
    const low = i.lowStock ?? 5;
    const lp = lastPurchaseRate(db, i.id);
    const ls = i.price ?? lastSaleRate(db, i.id);
    const state: "out" | "low" | "ok" = stock <= 0 ? "out" : stock <= low ? "low" : "ok";
    const margin = lp && ls && lp > 0 ? Math.round(((ls - lp) / lp) * 100) : null;
    return { ...i, stock, low, lp, ls, state, margin };
  });
  const counts = {
    all: rows.length,
    low: rows.filter((r) => r.state === "low").length,
    out: rows.filter((r) => r.state === "out").length,
  };
  const ql = q.trim().toLowerCase();
  const list = rows
    .filter((r) => (filter === "all" ? true : r.state === filter))
    .filter((r) =>
      ql ? (r.name + " " + r.company + " " + (r.hsn ?? "")).toLowerCase().includes(ql) : true,
    )
    .sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
  const stockValue = rows.reduce((a, r) => a + Math.max(0, r.stock) * avgCostFor(db, r.id), 0);

  const stockColor = (state: "out" | "low" | "ok") =>
    state === "out" ? "var(--pe-bad)" : state === "low" ? "var(--pe-warn)" : "var(--pe-ink)";
  const stockBadge = (r: (typeof rows)[number]) =>
    r.state === "out" ? "Out of stock" : r.state === "low" ? `Reorder at ${r.low}` : "";

  const menuFor = (r: (typeof rows)[number]) => {
    const canEdit = canWrite && (isAdmin || (user && r.createdBy === user.id));
    const usage = usageCount(db, "item", r.id);
    const detail =
      usage.total > 0
        ? `Warning: this item is referenced by ${usage.purchases} purchase(s) and ${usage.sales} sale(s). Those records will show "—" for the item after deletion. Continue?`
        : "This permanently removes the item. This action cannot be undone.";
    return (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More"
              className="pe-hover-bg inline-flex items-center justify-center rounded-lg text-[color:var(--pe-ink-3)]"
              style={{ width: 32, height: 32 }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate({ to: "/items/$id", params: { id: r.id } })}>
              View details
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
            )}
            {canWrite && (
              <DropdownMenuItem
                onClick={() =>
                  navigate({ to: "/items/$id", params: { id: r.id }, search: { adjust: "1" } })
                }
              >
                Adjust stock
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-1 py-1">
              <AdminDelete
                label="item"
                detail={detail}
                onConfirm={() =>
                  set((d) => ({ ...d, items: d.items.filter((x) => x.id !== r.id) }))
                }
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <>
      <MobileHeader>
        <div className="flex items-center gap-2.5" style={{ padding: "6px 18px 14px" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-bold">Items</div>
            <div className="text-[12px]" style={{ color: "rgba(255,255,255,.62)" }}>
              {db.items.length} {db.items.length === 1 ? "product" : "products"} ·{" "}
              {fmtINR(Math.round(stockValue))} stock value
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="inline-flex items-center text-[13.5px] font-bold"
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 10,
                background: "var(--pe-gold)",
                color: "var(--pe-gold-ink)",
              }}
            >
              + Add
            </button>
          )}
        </div>
      </MobileHeader>
      <div className="hidden md:block">
        <PeTitle
          title="Items"
          sub={`${db.items.length} ${db.items.length === 1 ? "product" : "products"} · stock value ${fmtINR(Math.round(stockValue))} at cost`}
          actions={
            canWrite ? (
              <>
                <PeBtn
                  variant="outline"
                  onClick={() => {
                    setAdjustItem(null);
                    setAdjustOpen(true);
                  }}
                >
                  <SlidersHorizontal className="h-4 w-4" /> Adjust stock
                </PeBtn>
                <PeBtn
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> Add item
                </PeBtn>
              </>
            ) : null
          }
        />
      </div>

      <PeCard pad={0} flat className="overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 flex-wrap"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--pe-line-2)" }}
        >
          <div
            className="flex-1 flex items-center gap-2.5"
            style={{
              minWidth: 220,
              height: 40,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid var(--pe-line)",
              background: "var(--pe-bg-2)",
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-[color:var(--pe-ink-3)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by item, company or HSN…"
              className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[14px] text-[color:var(--pe-ink)]"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <PeFilterPill
              active={filter === "all"}
              label="All"
              count={counts.all}
              onClick={() => setFilter("all")}
            />
            <PeFilterPill
              active={filter === "low"}
              label="Running low"
              count={counts.low}
              onClick={() => setFilter("low")}
            />
            <PeFilterPill
              active={filter === "out"}
              label="Out of stock"
              count={counts.out}
              onClick={() => setFilter("out")}
            />
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <PeTable minWidth={820}>
            <PeTHead template={COLS}>
              <span>Item</span>
              <span>HSN</span>
              <span>GST</span>
              <span className="text-right">Buy at</span>
              <span className="text-right">Sell at</span>
              <span className="text-right">Margin</span>
              <span className="text-right">In stock</span>
              <span />
            </PeTHead>
            {list.map((r) => (
              <PeTRow
                key={r.id}
                template={COLS}
                onClick={() => navigate({ to: "/items/$id", params: { id: r.id } })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PeAvatar name={r.name} tone={toneFor(r.name)} size={38} />
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold text-[color:var(--pe-ink)] truncate">
                      {r.name}
                    </div>
                    <div className="text-[12.5px] text-[color:var(--pe-ink-3)] truncate">
                      {r.company}
                    </div>
                  </div>
                </div>
                <span className="text-[color:var(--pe-ink-2)]">{r.hsn || "—"}</span>
                <span className="text-[color:var(--pe-ink-2)]">
                  {r.gstRate != null ? `${r.gstRate}%` : "—"}
                </span>
                <span className="text-right text-[color:var(--pe-ink-2)] tabular-nums">
                  {r.lp != null ? fmtINR(r.lp) : "—"}
                </span>
                <span
                  className="text-right font-bold tabular-nums"
                  style={{ color: r.ls != null ? "var(--pe-good)" : "var(--pe-ink-3)" }}
                >
                  {r.ls != null ? fmtINR(r.ls) : "—"}
                </span>
                <span
                  className="text-right text-[13px] font-semibold tabular-nums"
                  style={{
                    color:
                      r.margin == null
                        ? "var(--pe-ink-3)"
                        : r.margin >= 0
                          ? "var(--pe-ink-2)"
                          : "var(--pe-bad)",
                  }}
                >
                  {r.margin == null ? "—" : `${r.margin >= 0 ? "+" : ""}${r.margin}%`}
                </span>
                <div className="text-right">
                  <div
                    className="text-[17px] font-bold tabular-nums"
                    style={{ color: stockColor(r.state) }}
                  >
                    {r.stock}{" "}
                    <span className="text-[12px] font-semibold text-[color:var(--pe-ink-3)]">
                      {r.unit || "pc"}
                    </span>
                  </div>
                  {stockBadge(r) && (
                    <div
                      className="text-[11.5px] font-semibold"
                      style={{ color: stockColor(r.state) }}
                    >
                      {stockBadge(r)}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">{menuFor(r)}</div>
              </PeTRow>
            ))}
          </PeTable>
        </div>

        {/* Mobile list (design: 03 Items) */}
        <div className="md:hidden grid gap-2.5" style={{ padding: 12, background: "var(--pe-bg)" }}>
          {list.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate({ to: "/items/$id", params: { id: r.id } })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate({ to: "/items/$id", params: { id: r.id } });
                }
              }}
              className="bg-white cursor-pointer"
              style={{ border: "1px solid var(--pe-line)", borderRadius: 14, padding: "13px 14px" }}
            >
              <div className="flex items-center gap-2.5">
                <PeAvatar name={r.name} tone={toneFor(r.name)} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-[color:var(--pe-ink)] truncate">
                    {r.name}
                  </div>
                  <div className="text-[12.5px] text-[color:var(--pe-ink-3)] truncate">
                    {r.company}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--pe-ink-3)]">
                    In stock
                  </div>
                  <div
                    className="text-[21px] font-bold tabular-nums leading-[1.1]"
                    style={{ color: stockColor(r.state) }}
                  >
                    {r.stock}
                  </div>
                </div>
                {menuFor(r)}
              </div>
              <div
                className="grid items-center gap-2 mt-2.5"
                style={{ gridTemplateColumns: "1fr 1fr auto" }}
              >
                <div style={{ background: "var(--pe-bg)", borderRadius: 10, padding: "7px 10px" }}>
                  <div className="text-[11px] font-semibold text-[color:var(--pe-ink-3)]">
                    Buy at
                  </div>
                  <div className="text-[14.5px] font-bold tabular-nums text-[color:var(--pe-ink)]">
                    {r.lp != null ? fmtINR(r.lp) : "—"}
                  </div>
                </div>
                <div style={{ background: "var(--pe-bg)", borderRadius: 10, padding: "7px 10px" }}>
                  <div className="text-[11px] font-semibold text-[color:var(--pe-ink-3)]">
                    Sell at
                  </div>
                  <div
                    className="text-[14.5px] font-bold tabular-nums"
                    style={{ color: "var(--pe-good)" }}
                  >
                    {r.ls != null ? fmtINR(r.ls) : "—"}
                  </div>
                </div>
                <span
                  className="text-[11.5px] font-bold"
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background:
                      r.state === "out"
                        ? "var(--pe-bad-bg)"
                        : r.state === "low"
                          ? "var(--pe-warn-bg)"
                          : "var(--pe-green-soft)",
                    color:
                      r.state === "out"
                        ? "var(--pe-bad)"
                        : r.state === "low"
                          ? "var(--pe-warn)"
                          : "var(--pe-green)",
                  }}
                >
                  {r.state === "out"
                    ? "Out"
                    : r.state === "low"
                      ? "Low"
                      : r.margin != null
                        ? `${r.margin >= 0 ? "+" : ""}${r.margin}%`
                        : "OK"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {list.length === 0 && (
          <PeEmpty>
            {db.items.length === 0
              ? "No items yet — add your first product."
              : "No items match your search."}
          </PeEmpty>
        )}
      </PeCard>

      <ItemDialog open={open} onOpenChange={setOpen} editing={editing} />

      {/* Pick which item to adjust, then hand off to the item page's adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Which item?</Label>
            <EntityPicker
              kind="item"
              value={adjustItem}
              onChange={setAdjustItem}
              placeholder="Choose item"
            />
            <p className="text-xs text-muted-foreground">
              Opening stock, count corrections, damage, and returns.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!adjustItem}
              onClick={() => {
                if (adjustItem) {
                  setAdjustOpen(false);
                  navigate({
                    to: "/items/$id",
                    params: { id: adjustItem },
                    search: { adjust: "1" },
                  });
                }
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: Item | null;
}) {
  const [, set] = useDB();
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [unit, setUnit] = React.useState("pc");
  const [low, setLow] = React.useState("5");
  const [hsn, setHsn] = React.useState("");
  const [gstSlab, setGstSlab] = React.useState("none"); // "none" | "0" | "5" | "12" | "18" | "28"
  const [price, setPrice] = React.useState("");
  // Opening stock (new items only): recorded as a purchase from a dealer so
  // stock, cost and the dealer's khata all start from the right place.
  const [buyRate, setBuyRate] = React.useState("");
  const [openQty, setOpenQty] = React.useState("");
  const [dealerId, setDealerId] = React.useState<string | null>(null);
  const [payStatus, setPayStatus] = React.useState<"full" | "partial" | "credit">("full");
  const [paidNow, setPaidNow] = React.useState("");
  const [payMode, setPayMode] = React.useState<PaymentMode>("cash");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError(null);
      setBuyRate("");
      setOpenQty("");
      setDealerId(null);
      setPayStatus("full");
      setPaidNow("");
      setPayMode("cash");
      setName(editing?.name ?? "");
      setCompany(editing?.company ?? "");
      setUnit(editing?.unit ?? "pc");
      setLow(String(editing?.lowStock ?? 5));
      setHsn(editing?.hsn ?? "");
      setGstSlab(editing?.gstRate != null ? String(editing.gstRate) : "none");
      setPrice(editing?.price != null ? String(editing.price) : "");
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim() || !company.trim()) {
      setError("Item name and company are required");
      return;
    }
    const fields = {
      name: name.trim(),
      company: company.trim(),
      unit: unit.trim() || "pc",
      lowStock: Number(low) || 5,
      hsn: hsn.trim() || undefined,
      gstRate: gstSlab === "none" ? null : Number(gstSlab),
      price: price.trim() === "" ? null : Math.max(0, Number(price) || 0),
    };
    const openQtyNum = Number(openQty) || 0;
    const buyRateNum = Number(buyRate) || 0;
    const hasOpening = !editing && openQtyNum > 0;
    if (hasOpening && !dealerId) {
      setError("Choose the dealer the opening stock was bought from (or clear the opening qty)");
      return;
    }
    const openValue = openQtyNum * buyRateNum;
    const openPaid =
      payStatus === "full"
        ? openValue
        : payStatus === "credit"
          ? 0
          : Math.min(openValue, Number(paidNow) || 0);
    setSaving(true);
    setError(null);
    const res = editing
      ? await set((db) => ({
          ...db,
          items: db.items.map((x) => (x.id === editing.id ? { ...x, ...fields } : x)),
        }))
      : await set((db) => {
          const item = { id: newId(), ...fields, createdAt: nowStamp() } as Item;
          if (!hasOpening) return { ...db, items: [...db.items, item] };
          const purchase: Purchase = {
            id: newId(),
            date: today(),
            itemId: item.id,
            dealerId: dealerId!,
            qty: openQtyNum,
            rate: buyRateNum,
            notes: "Opening stock",
            addedBy: db.currentUser,
            createdAt: nowStamp(),
          };
          const pay: Payment | null =
            openPaid > 0 && khataReady()
              ? {
                  id: newId(),
                  date: today(),
                  partyType: "dealer",
                  partyId: dealerId!,
                  saleId: null,
                  purchaseId: purchase.id,
                  amount: openPaid,
                  mode: payMode,
                  notes: "Paid with purchase",
                  addedBy: db.currentUser,
                  createdAt: nowStamp(),
                }
              : null;
          return {
            ...db,
            items: [...db.items, item],
            purchases: [...db.purchases, purchase],
            payments: pay ? [...db.payments, pay] : db.payments,
          };
        });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(editing ? "Item updated" : "Item added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Item name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brake Shoe"
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Company</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Hero Honda"
              maxLength={80}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Unit</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value.replace(/[^a-zA-Z/ ]/g, "").slice(0, 12))}
                placeholder="pc / set / btl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Low-stock alert</Label>
              <NumberInput
                value={low}
                onValueChange={setLow}
                allowDecimal={false}
                min={0}
                max={99999}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Selling price (₹)</Label>
              <NumberInput
                value={price}
                onValueChange={setPrice}
                min={0}
                max={10000000}
                placeholder="auto-fills bills"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>GST slab</Label>
              <div className="grid grid-cols-6 gap-1.5">
                {[["none", "None"], ...GST_SLABS.map((r) => [String(r), `${r}%`])].map(
                  ([v, label]) => {
                    const on = gstSlab === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setGstSlab(v)}
                        className="text-[12.5px] font-bold"
                        style={{
                          height: 40,
                          borderRadius: 10,
                          border: `1px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
                          background: on ? "var(--pe-green)" : "#fff",
                          color: on ? "#fff" : "var(--pe-ink-2)",
                        }}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>HSN/SAC code</Label>
            <Input
              value={hsn}
              onChange={(e) => setHsn(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))}
              placeholder="e.g. 8708"
            />
            <p className="text-xs text-muted-foreground">
              Printed on GST invoices. The slab is applied per item on bills with GST enabled.
            </p>
          </div>
        </div>
        {!editing &&
          (() => {
            const value = (Number(openQty) || 0) * (Number(buyRate) || 0);
            const paidV =
              payStatus === "full"
                ? value
                : payStatus === "credit"
                  ? 0
                  : Math.min(value, Number(paidNow) || 0);
            const dueV = value - paidV;
            const tile = (k: typeof payStatus, label: string, sub: string) => {
              const on = payStatus === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPayStatus(k)}
                  className="text-center"
                  style={{
                    padding: "9px 6px",
                    borderRadius: 10,
                    border: `1.5px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
                    background: on ? "var(--pe-green-soft)" : "#fff",
                  }}
                >
                  <span
                    className="block text-[13px] font-bold"
                    style={{ color: on ? "var(--pe-green-dark)" : "var(--pe-ink)" }}
                  >
                    {label}
                  </span>
                  <span className="block text-[11px] text-[color:var(--pe-ink-3)] mt-px">
                    {sub}
                  </span>
                </button>
              );
            };
            return (
              <div className="grid gap-3 mt-1">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--pe-ink-3)]">
                  Opening stock &amp; payment (optional)
                </div>
                <div
                  className="grid gap-3 bg-white"
                  style={{ border: "1px solid var(--pe-line)", borderRadius: 14, padding: 14 }}
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="grid gap-1.5">
                      <Label>Buy price (₹)</Label>
                      <NumberInput
                        value={buyRate}
                        onValueChange={setBuyRate}
                        min={0}
                        max={10000000}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Opening qty</Label>
                      <NumberInput
                        value={openQty}
                        onValueChange={setOpenQty}
                        min={0}
                        max={1000000}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                  {(Number(openQty) || 0) > 0 && (
                    <>
                      <div className="grid gap-1.5">
                        <Label>Bought from (dealer)</Label>
                        <EntityPicker
                          kind="dealer"
                          value={dealerId}
                          onChange={setDealerId}
                          placeholder="Choose dealer"
                        />
                      </div>
                      <div className="flex justify-between text-[13.5px] text-[color:var(--pe-ink-2)]">
                        <span>Stock value</span>
                        <span className="font-bold text-[color:var(--pe-ink)] tabular-nums">
                          {fmtINR(value)}
                        </span>
                      </div>
                      {khataReady() && (
                        <>
                          <div className="grid grid-cols-3 gap-1.5">
                            {tile("full", "Paid", "Full amount")}
                            {tile("partial", "Partial", "Some paid")}
                            {tile("credit", "Unpaid", "Pay later")}
                          </div>
                          {payStatus === "partial" && (
                            <div className="grid gap-1.5">
                              <Label>Amount paid now (₹)</Label>
                              <NumberInput
                                value={paidNow}
                                onValueChange={setPaidNow}
                                min={0}
                                max={10000000}
                                className="h-11 rounded-xl"
                              />
                            </div>
                          )}
                          {payStatus !== "credit" && (
                            <div className="grid grid-cols-4 gap-1.5">
                              {(["cash", "upi", "bank", "cheque"] as PaymentMode[]).map((m) => {
                                const on = payMode === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => setPayMode(m)}
                                    className="text-[12.5px] font-bold uppercase"
                                    style={{
                                      height: 36,
                                      borderRadius: 9,
                                      border: `1px solid ${on ? "var(--pe-green)" : "var(--pe-line)"}`,
                                      background: on ? "var(--pe-green)" : "#fff",
                                      color: on ? "#fff" : "var(--pe-ink-2)",
                                    }}
                                  >
                                    {m}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div
                            className="grid gap-1.5 text-[13.5px]"
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: "var(--pe-bg-2)",
                            }}
                          >
                            <div className="flex justify-between text-[color:var(--pe-ink-2)]">
                              <span>Paid to dealer</span>
                              <span
                                className="font-bold tabular-nums"
                                style={{ color: "var(--pe-good)" }}
                              >
                                {fmtINR(paidV)}
                              </span>
                            </div>
                            <div
                              className="flex justify-between font-bold"
                              style={{ color: dueV > 0 ? "var(--pe-warn)" : "var(--pe-good)" }}
                            >
                              <span>{dueV > 0 ? "Added to dealer khata" : "Nothing due"}</span>
                              <span className="tabular-nums">{fmtINR(dueV)}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        <PeFormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Save item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
