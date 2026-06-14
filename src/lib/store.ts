// Supabase-backed store with the same API surface as the previous localStorage version.
// Components keep using useDB() and setDB(updater) as before; this layer diffs the
// updater's result against the live snapshot and dispatches Supabase mutations.

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { useBusiness } from "./business";
import { toast } from "sonner";
import { mirrorToSheets } from "./sheets.functions";

// Fire-and-forget Sheets backup; never block UI or surface errors to user.
type MirrorJob = {
  table:
    | "items" | "dealers" | "customers" | "purchases"
    | "sales" | "sale_lines" | "expenses";
  action: "insert" | "update" | "delete";
  id: string;
  row?: Record<string, any>;
};
function backupMirror(jobs: MirrorJob[], businessId: string) {
  for (const j of jobs) {
    try {
      Promise.resolve(mirrorToSheets({ data: { ...j, businessId } })).catch((e) =>
        console.warn("[sheets-backup]", j.table, j.action, j.id, e?.message ?? String(e)),
      );
    } catch (e: any) {
      console.warn("[sheets-backup:sync]", j.table, j.action, j.id, e?.message ?? String(e));
    }
  }
}

export type ID = string;

export type Item = {
  id: ID;
  name: string;
  company: string;
  unit?: string;
  lowStock?: number;
  createdAt: string;
  createdBy?: string | null;
};

export type Person = {
  id: ID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string | null;
};

export type Purchase = {
  id: ID;
  date: string;
  itemId: ID | null;
  dealerId: ID | null;
  qty: number;
  rate: number;
  notes?: string;
  addedBy: string;
  createdAt: string;
  createdBy?: string | null;
};

export type SaleLine = { id?: ID; itemId: ID | null; qty: number; rate: number };

export type Sale = {
  id: ID;
  date: string;
  customerId: ID | null;
  lines: SaleLine[];
  notes?: string;
  isBill: boolean;
  paymentReceived: boolean;
  amountPaid: number;
  extraExpenses: number;
  extraExpensesChargeCustomer: boolean;
  gstRate?: number | null;
  archived: boolean;
  addedBy: string;
  createdAt: string;
  createdBy?: string | null;
};


export type Expense = {
  id: ID;
  date: string;
  category: string;
  amount: number;
  note?: string;
  addedBy: string;
  createdAt: string;
  createdBy?: string | null;
};

export type DB = {
  items: Item[];
  dealers: Person[];
  customers: Person[];
  purchases: Purchase[];
  sales: Sale[];
  expenses: Expense[];
  shop: { name: string; address: string; phone: string };
  currentUser: string;
};

const DEFAULT_SHOP = {
  name: "BW Inventory",
  address: "",
  phone: "",
};

const EMPTY: DB = {
  items: [],
  dealers: [],
  customers: [],
  purchases: [],
  sales: [],
  expenses: [],
  shop: DEFAULT_SHOP,
  currentUser: "",
};

const QK = (bid: string) => ["biz-db", bid] as const;

async function fetchAll(bid: string): Promise<Omit<DB, "shop" | "currentUser">> {
  const [itemsR, dealersR, customersR, purchasesR, salesR, linesR, expensesR, profilesR] =
    await Promise.all([
      supabase.from("items").select("*").eq("business_id", bid).order("created_at", { ascending: false }),
      supabase.from("dealers").select("*").eq("business_id", bid).order("created_at"),
      supabase.from("customers").select("*").eq("business_id", bid).order("created_at"),
      supabase.from("purchases").select("*").eq("business_id", bid).order("created_at", { ascending: false }),
      supabase.from("sales").select("*").eq("business_id", bid).order("created_at", { ascending: false }),
      supabase.from("sale_lines").select("*, sales!inner(business_id)").eq("sales.business_id", bid),
      supabase.from("expenses").select("*").eq("business_id", bid).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, display_name"),
    ]);

  for (const r of [itemsR, dealersR, customersR, purchasesR, salesR, linesR, expensesR, profilesR]) {
    if (r.error) throw r.error;
  }

  const nameOf = new Map<string, string>(
    (profilesR.data ?? []).map((p) => [p.id, p.display_name]),
  );
  const addedBy = (uid: string | null) => (uid ? nameOf.get(uid) ?? "—" : "—");

  const items: Item[] = (itemsR.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    unit: r.unit ?? undefined,
    lowStock: r.low_stock ?? 5,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  const mapPerson = (r: any): Person => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    address: r.address ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  });
  const dealers = (dealersR.data ?? []).map(mapPerson);
  const customers = (customersR.data ?? []).map(mapPerson);

  const purchases: Purchase[] = (purchasesR.data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    itemId: r.item_id,
    dealerId: r.dealer_id,
    qty: Number(r.qty),
    rate: Number(r.rate),
    notes: r.notes ?? undefined,
    addedBy: addedBy(r.created_by),
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  const linesBySale = new Map<string, SaleLine[]>();
  for (const l of linesR.data ?? []) {
    const arr = linesBySale.get(l.sale_id) ?? [];
    arr.push({ id: l.id, itemId: l.item_id, qty: Number(l.qty), rate: Number(l.rate) });
    linesBySale.set(l.sale_id, arr);
  }
  const sales: Sale[] = (salesR.data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    customerId: r.customer_id,
    lines: linesBySale.get(r.id) ?? [],
    notes: r.notes ?? undefined,
    isBill: r.is_bill,
    paymentReceived: !!r.payment_received,
    amountPaid: Number(r.amount_paid ?? 0),
    extraExpenses: Number(r.extra_expenses ?? 0),
    extraExpensesChargeCustomer: !!(r as any).extra_expenses_charge_customer,
    gstRate: r.gst_rate != null ? Number(r.gst_rate) : null,
    archived: !!r.archived,
    addedBy: addedBy(r.created_by),
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));


  const expenses: Expense[] = (expensesR.data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    category: r.category,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    addedBy: addedBy(r.created_by),
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  return { items, dealers, customers, purchases, sales, expenses };
}

// Stable stringify (sorts object keys at every level) so reordering the
// fields we read from the DB never produces a spurious "update" diff.
function stable(x: any): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stable).join(",") + "]";
  const keys = Object.keys(x).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable(x[k])).join(",") + "}";
}

// Diff two arrays by id and return added / removed / updated.
// `compareKeys` lets us ignore fields that are not user-editable
// (e.g. createdAt, createdBy, addedBy) so they don't trigger spurious updates.
function diff<T extends { id: string }>(
  prev: T[],
  next: T[],
  compareKeys?: (keyof T)[],
) {
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextIds = new Set(next.map((x) => x.id));
  const added = next.filter((x) => !prevMap.has(x.id));
  const removed = prev.filter((x) => !nextIds.has(x.id));
  const pick = (x: T) => {
    if (!compareKeys) return x;
    const o: Record<string, unknown> = {};
    for (const k of compareKeys) o[k as string] = x[k];
    return o;
  };
  const updated = next.filter((x) => {
    const p = prevMap.get(x.id);
    return p && stable(pick(p)) !== stable(pick(x));
  });
  return { added, removed, updated };
}

export function useDB(): [DB, (u: (db: DB) => DB) => void] {
  const { user, displayName } = useAuth();
  const { current } = useBusiness();
  const bid = current?.id ?? null;
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: QK(bid ?? "none"),
    queryFn: () => fetchAll(bid!),
    enabled: !!user && !!bid,
    staleTime: 10_000,
  });

  const db: DB = React.useMemo(
    () => ({
      ...EMPTY,
      ...(data ?? {}),
      shop: {
        name: current?.name ?? DEFAULT_SHOP.name,
        address: current?.address ?? "",
        phone: current?.phone ?? "",
      },
      currentUser: displayName,
    }),
    [data, displayName, current?.name, current?.address, current?.phone],
  );

  const setDB = React.useCallback(
    (updater: (db: DB) => DB) => {
      if (!user) {
        toast.error("Sign in required");
        return;
      }
      if (!bid) {
        toast.error("Select a business first");
        return;
      }
      const uid = user.id;
      const next = updater(db);

      const work = async () => {
        const tasks: PromiseLike<any>[] = [];
        const mirrorJobs: MirrorJob[] = [];
        const nowIso = new Date().toISOString();

        // ITEMS
        {
          const { added, removed, updated } = diff(
            db.items,
            next.items,
            ["name", "company", "unit", "lowStock"],
          );
          if (added.length)
            tasks.push(
              supabase.from("items").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  name: x.name,
                  company: x.company,
                  unit: x.unit ?? null,
                  low_stock: x.lowStock ?? 5,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "items", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, company: x.company, unit: x.unit ?? "", low_stock: x.lowStock ?? 5, created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, company: x.company, unit: x.unit ?? null, low_stock: x.lowStock ?? 5 };
            tasks.push(supabase.from("items").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "items", action: "update", id: x.id, row: { id: x.id, ...row, low_stock: x.lowStock ?? 5 } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("items").delete().eq("id", r.id));
            mirrorJobs.push({ table: "items", action: "delete", id: r.id });
          }
        }

        // DEALERS
        {
          const { added, removed, updated } = diff(
            db.dealers,
            next.dealers,
            ["name", "phone", "address", "notes"],
          );
          if (added.length)
            tasks.push(
              supabase.from("dealers").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  name: x.name,
                  phone: x.phone ?? null,
                  address: x.address ?? null,
                  notes: x.notes ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "dealers", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, phone: x.phone ?? "", address: x.address ?? "", notes: x.notes ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null };
            tasks.push(supabase.from("dealers").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "dealers", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("dealers").delete().eq("id", r.id));
            mirrorJobs.push({ table: "dealers", action: "delete", id: r.id });
          }
        }

        // CUSTOMERS
        {
          const { added, removed, updated } = diff(
            db.customers,
            next.customers,
            ["name", "phone", "address", "notes"],
          );
          if (added.length)
            tasks.push(
              supabase.from("customers").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  name: x.name,
                  phone: x.phone ?? null,
                  address: x.address ?? null,
                  notes: x.notes ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "customers", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, phone: x.phone ?? "", address: x.address ?? "", notes: x.notes ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null };
            tasks.push(supabase.from("customers").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "customers", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("customers").delete().eq("id", r.id));
            mirrorJobs.push({ table: "customers", action: "delete", id: r.id });
          }
        }

        // PURCHASES
        {
          const { added, removed, updated } = diff(
            db.purchases,
            next.purchases,
            ["date", "itemId", "dealerId", "qty", "rate", "notes"],
          );
          if (added.length)
            tasks.push(
              supabase.from("purchases").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  date: x.date,
                  item_id: x.itemId,
                  dealer_id: x.dealerId,
                  qty: x.qty,
                  rate: x.rate,
                  notes: x.notes ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "purchases", action: "insert", id: x.id,
              row: { id: x.id, date: x.date, item_id: x.itemId, dealer_id: x.dealerId, qty: x.qty, rate: x.rate, notes: x.notes ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { date: x.date, item_id: x.itemId, dealer_id: x.dealerId, qty: x.qty, rate: x.rate, notes: x.notes ?? null };
            tasks.push(supabase.from("purchases").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "purchases", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("purchases").delete().eq("id", r.id));
            mirrorJobs.push({ table: "purchases", action: "delete", id: r.id });
          }
        }

        // SALES (+ lines, per-line diff so partial failure can't blank a bill)
        {
          const { added, removed, updated } = diff(
            db.sales,
            next.sales,
            ["date", "customerId", "isBill", "notes", "lines", "paymentReceived", "amountPaid", "extraExpenses", "extraExpensesChargeCustomer", "gstRate", "archived"],
          );
          if (added.length) {
            tasks.push(
              (async () => {
                const { error } = await supabase.from("sales").insert(
                  added.map((x) => ({
                    id: x.id,
                    business_id: bid,
                    date: x.date,
                    customer_id: x.customerId,
                    is_bill: x.isBill,
                    notes: x.notes ?? null,
                    payment_received: x.paymentReceived,
                    amount_paid: x.amountPaid,
                    extra_expenses: x.extraExpenses,
                    extra_expenses_charge_customer: x.extraExpensesChargeCustomer,
                    gst_rate: x.gstRate ?? null,
                    archived: x.archived,
                    created_by: uid,
                  })),
                );
                if (error) throw error;
                const linesPayload = added.flatMap((s) =>
                  s.lines.map((l) => ({
                    id: l.id ?? newId(),
                    sale_id: s.id,
                    item_id: l.itemId,
                    qty: l.qty,
                    rate: l.rate,
                  })),
                );
                if (linesPayload.length) {
                  const { error: e2 } = await supabase.from("sale_lines").insert(linesPayload);
                  if (e2) throw e2;
                }
              })(),
            );
            for (const s of added) {
              mirrorJobs.push({
                table: "sales", action: "insert", id: s.id,
                row: { id: s.id, date: s.date, customer_id: s.customerId, is_bill: s.isBill, notes: s.notes ?? "", payment_received: s.paymentReceived, archived: s.archived, created_by: uid, created_at: nowIso },
              });
              s.lines.forEach((l, idx) => {
                const lineId = `${s.id}:${idx}`;
                mirrorJobs.push({
                  table: "sale_lines", action: "insert", id: lineId,
                  row: { id: lineId, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate },
                });
              });
            }
          }
          for (const s of updated) {
            const prev = db.sales.find((x) => x.id === s.id)!;
            const headChanged =
              prev.date !== s.date ||
              prev.customerId !== s.customerId ||
              prev.isBill !== s.isBill ||
              (prev.notes ?? null) !== (s.notes ?? null) ||
              prev.paymentReceived !== s.paymentReceived ||
              prev.amountPaid !== s.amountPaid ||
              prev.extraExpenses !== s.extraExpenses ||
              prev.extraExpensesChargeCustomer !== s.extraExpensesChargeCustomer ||
              (prev.gstRate ?? null) !== (s.gstRate ?? null) ||
              prev.archived !== s.archived;


            // Per-line diff by id. New lines (no id) get one assigned now.
            const nextLines = s.lines.map((l) => ({ ...l, id: l.id ?? newId() }));
            const lineCmp = (l: SaleLine) => `${l.itemId}|${l.qty}|${l.rate}`;
            const prevLineMap = new Map(prev.lines.filter((l) => l.id).map((l) => [l.id!, l]));
            const nextLineIds = new Set(nextLines.map((l) => l.id!));
            const linesAdded = nextLines.filter((l) => !prevLineMap.has(l.id!));
            const linesRemoved = prev.lines.filter((l) => l.id && !nextLineIds.has(l.id));
            const linesUpdated = nextLines.filter((l) => {
              const p = prevLineMap.get(l.id!);
              return p && lineCmp(p) !== lineCmp(l);
            });

            tasks.push(
              (async () => {
                if (headChanged) {
                  const { error } = await supabase.from("sales").update({
                    date: s.date,
                    customer_id: s.customerId,
                    is_bill: s.isBill,
                    notes: s.notes ?? null,
                    payment_received: s.paymentReceived,
                    amount_paid: s.amountPaid,
                    extra_expenses: s.extraExpenses,
                    extra_expenses_charge_customer: s.extraExpensesChargeCustomer,
                    gst_rate: s.gstRate ?? null,
                    archived: s.archived,

                  }).eq("id", s.id);
                  if (error) throw error;
                }
                // Order: updates first, then inserts, then deletes — so a
                // partial failure leaves the bill at worst with extra lines,
                // never empty.
                for (const l of linesUpdated) {
                  const { error } = await supabase
                    .from("sale_lines")
                    .update({ item_id: l.itemId, qty: l.qty, rate: l.rate })
                    .eq("id", l.id!);
                  if (error) throw error;
                }
                if (linesAdded.length) {
                  const { error } = await supabase.from("sale_lines").insert(
                    linesAdded.map((l) => ({
                      id: l.id,
                      sale_id: s.id,
                      item_id: l.itemId,
                      qty: l.qty,
                      rate: l.rate,
                    })),
                  );
                  if (error) throw error;
                }
                for (const l of linesRemoved) {
                  const { error } = await supabase.from("sale_lines").delete().eq("id", l.id!);
                  if (error) throw error;
                }
              })(),
            );

            mirrorJobs.push({
              table: "sales", action: "update", id: s.id,
              row: { id: s.id, date: s.date, customer_id: s.customerId, is_bill: s.isBill, notes: s.notes ?? "", payment_received: s.paymentReceived, archived: s.archived },
            });
            for (const l of linesRemoved) {
              if (l.id) mirrorJobs.push({ table: "sale_lines", action: "delete", id: l.id });
            }
            for (const l of linesAdded) {
              mirrorJobs.push({
                table: "sale_lines", action: "insert", id: l.id!,
                row: { id: l.id, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate },
              });
            }
            for (const l of linesUpdated) {
              mirrorJobs.push({
                table: "sale_lines", action: "update", id: l.id!,
                row: { id: l.id, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate },
              });
            }
          }
          for (const r of removed) {
            tasks.push(supabase.from("sales").delete().eq("id", r.id));
            mirrorJobs.push({ table: "sales", action: "delete", id: r.id });
            for (const l of r.lines) {
              if (l.id) mirrorJobs.push({ table: "sale_lines", action: "delete", id: l.id });
            }
          }
        }

        // EXPENSES
        {
          const { added, removed, updated } = diff(
            db.expenses,
            next.expenses,
            ["date", "category", "amount", "note"],
          );
          if (added.length)
            tasks.push(
              supabase.from("expenses").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  date: x.date,
                  category: x.category,
                  amount: x.amount,
                  note: x.note ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "expenses", action: "insert", id: x.id,
              row: { id: x.id, date: x.date, category: x.category, amount: x.amount, note: x.note ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { date: x.date, category: x.category, amount: x.amount, note: x.note ?? null };
            tasks.push(supabase.from("expenses").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "expenses", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("expenses").delete().eq("id", r.id));
            mirrorJobs.push({ table: "expenses", action: "delete", id: r.id });
          }
        }

        const results = await Promise.allSettled(tasks);
        const failed = results.find(
          (r) =>
            r.status === "rejected" ||
            (r.status === "fulfilled" && (r.value as any)?.error),
        );
        if (failed) {
          const msg =
            failed.status === "rejected"
              ? (failed.reason as Error)?.message
              : (failed.value as any).error?.message;
          throw new Error(msg ?? "Save failed");
        }
        return mirrorJobs;
      };

      work()
        .then((jobs) => {
          if (bid) backupMirror(jobs, bid);
          if (bid) qc.invalidateQueries({ queryKey: QK(bid) });
        })
        .catch((e: Error) => {
          toast.error(e.message);
          if (bid) qc.invalidateQueries({ queryKey: QK(bid) });
        });
    },
    [db, user, qc, bid],
  );

  return [db, setDB];
}

// ---------- Helpers ----------

export function newId() {
  return crypto.randomUUID();
}
export function nowStamp() {
  return new Date().toISOString();
}
export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function fmtINR(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
export function fmtDate(iso: string) {
  try {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
export function stockOf(db: DB, itemId: ID) {
  const inQty = db.purchases.filter((p) => p.itemId === itemId).reduce((s, p) => s + p.qty, 0);
  const outQty = db.sales
    .flatMap((s) => s.lines.filter((l) => l.itemId === itemId))
    .reduce((s, l) => s + l.qty, 0);
  return inQty - outQty;
}
// Stock available for a sale, optionally excluding a specific sale (the one
// being edited) so editing 10 → 12 against current stock 10 doesn't pretend
// you've already sold those 10.
export function stockAvailableFor(db: DB, itemId: ID, excludeSaleId?: ID) {
  const inQty = db.purchases.filter((p) => p.itemId === itemId).reduce((s, p) => s + p.qty, 0);
  const outQty = db.sales
    .filter((s) => s.id !== excludeSaleId)
    .flatMap((s) => s.lines.filter((l) => l.itemId === itemId))
    .reduce((s, l) => s + l.qty, 0);
  return inQty - outQty;
}
export function lastPurchaseRate(db: DB, itemId: ID): number | null {
  const ps = db.purchases
    .filter((p) => p.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ps[0]?.rate ?? null;
}
export function lastSaleRate(db: DB, itemId: ID): number | null {
  const lines = db.sales
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((s) => s.lines.filter((l) => l.itemId === itemId));
  return lines[0]?.rate ?? null;
}
// Weighted-average cost per unit for an item, across ALL purchases (lifetime).
// Returns 0 if there are no purchases for the item.
export function avgCostFor(db: DB, itemId: ID): number {
  const ps = db.purchases.filter((p) => p.itemId === itemId);
  const qty = ps.reduce((s, p) => s + p.qty, 0);
  if (qty <= 0) return 0;
  const val = ps.reduce((s, p) => s + p.qty * p.rate, 0);
  return val / qty;
}
// Cost of goods sold for a set of sale lines, using lifetime weighted-avg cost
// per item. This is the right number for profit; raw purchase spend in a date
// range is cash outflow, not COGS.
export function cogsForLines(
  db: DB,
  lines: { itemId: ID | null; qty: number }[],
): number {
  return lines.reduce((s, l) => (l.itemId ? s + l.qty * avgCostFor(db, l.itemId) : s), 0);
}
export function totalsForRange(db: DB, fromISO: string, toISO: string) {
  const inRange = (d: string) => d >= fromISO && d <= toISO;
  const purchases = db.purchases
    .filter((p) => inRange(p.date))
    .reduce((s, p) => s + p.qty * p.rate, 0);
  const salesInRange = db.sales.filter((s) => inRange(s.date));
  const sales = salesInRange.reduce(
    (sum, s) => sum + s.lines.reduce((a, l) => a + l.qty * l.rate, 0),
    0,
  );
  const cogs = salesInRange.reduce((sum, s) => sum + cogsForLines(db, s.lines), 0);
  // Only extra expenses NOT charged to the customer count as a business cost
  const saleExtras = salesInRange.reduce(
    (sum, s) => sum + (s.extraExpensesChargeCustomer ? 0 : (s.extraExpenses ?? 0)),
    0,
  );
  // Bill totals include extras when charged to the customer
  const billedExtras = salesInRange.reduce(
    (sum, s) => sum + (s.extraExpensesChargeCustomer ? (s.extraExpenses ?? 0) : 0),
    0,
  );
  const expenses = db.expenses.filter((e) => inRange(e.date)).reduce((s, e) => s + e.amount, 0);
  return {
    purchases,
    sales: sales + billedExtras,
    expenses: expenses + saleExtras,
    cogs,
    profit: sales + billedExtras - cogs - expenses - saleExtras,
  };
}

// Taxable value = items + any extra charged to the customer (the base GST applies to).
export function taxableBase(s: Sale) {
  const items = s.lines.reduce((a, l) => a + l.qty * l.rate, 0);
  return items + (s.extraExpensesChargeCustomer ? (s.extraExpenses ?? 0) : 0);
}
// GST amount in rupees for a sale (0 when no rate set).
export function gstAmount(s: Sale) {
  const rate = s.gstRate ?? 0;
  return rate > 0 ? taxableBase(s) * (rate / 100) : 0;
}
export function billTotal(s: Sale) {
  return taxableBase(s) + gstAmount(s);
}
export function itemLabel(it: Item) {
  return `${it.company} ${it.name}`;
}
export function findItem(db: DB, id: ID | null | undefined) {
  return id ? db.items.find((i) => i.id === id) : undefined;
}
export function findDealer(db: DB, id: ID | null | undefined) {
  return id ? db.dealers.find((i) => i.id === id) : undefined;
}
export function findCustomer(db: DB, id: ID | null | undefined) {
  return id ? db.customers.find((i) => i.id === id) : undefined;
}

// Count references to a master record across child tables. Used to block
// deletions that would leave dangling references (orphaned purchases/sales).
export function usageCount(
  db: DB,
  kind: "item" | "dealer" | "customer",
  id: ID,
): { purchases: number; sales: number; total: number } {
  let purchases = 0;
  let sales = 0;
  if (kind === "item") {
    purchases = db.purchases.filter((p) => p.itemId === id).length;
    sales = db.sales.filter((s) => s.lines.some((l) => l.itemId === id)).length;
  } else if (kind === "dealer") {
    purchases = db.purchases.filter((p) => p.dealerId === id).length;
  } else if (kind === "customer") {
    sales = db.sales.filter((s) => s.customerId === id).length;
  }
  return { purchases, sales, total: purchases + sales };
}
