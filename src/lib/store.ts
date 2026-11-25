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
import { readSnapshot, writeSnapshot } from "./localCache";

// Fire-and-forget Sheets backup; never block UI or surface errors to user.
type MirrorJob = {
  table:
    | "items" | "dealers" | "customers" | "purchases"
    | "sales" | "sale_lines" | "expenses"
    | "payments" | "stock_adjustments";
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

// GST slabs allowed on items (percent).
export const GST_SLABS = [0, 5, 12, 18, 28] as const;

export type Item = {
  id: ID;
  name: string;
  company: string;
  unit?: string;
  lowStock?: number;
  hsn?: string; // HSN/SAC code printed on invoices
  gstRate?: number | null; // GST slab; null = not set (sale-level rate applies)
  price?: number | null; // default selling price
  createdAt: string;
  createdBy?: string | null;
};

export type Person = {
  id: ID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  gstin?: string;
  openingBalance?: number; // khata starting point: + = they owe us (customer) / we owe them (dealer)
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

// gstRate is snapshotted from the item's slab when the sale is saved (null =
// legacy line, taxed at the sale-level rate) so slab edits don't rewrite history.
export type SaleLine = { id?: ID; itemId: ID | null; qty: number; rate: number; gstRate?: number | null };

export type Sale = {
  id: ID;
  date: string;
  customerId: ID | null;
  lines: SaleLine[];
  notes?: string;
  isBill: boolean;
  billNo?: number | null; // assigned by the DB when isBill becomes true; read-only here
  paymentReceived: boolean;
  amountPaid: number;
  extraExpenses: number;
  extraExpensesChargeCustomer: boolean;
  gstRate?: number | null;
  archived: boolean;
  // How the money in amountPaid arrived (bill composer). Client-side hint only:
  // it's stamped onto the sale-linked payment row the store creates, never
  // stored on the sale itself, so it's undefined on rows read back from the DB.
  paidMode?: PaymentMode | null;
  addedBy: string;
  createdAt: string;
  createdBy?: string | null;
};

// Dated money movement in the party ledger (khata). Customer payments are money
// received; dealer payments are money paid out. Negative amount = correction.
// Rows with saleId are auto-created by setDB from amountPaid changes — UI code
// must never add sale-linked payments itself, only standalone ones (saleId null).
export type PaymentMode = "cash" | "upi" | "bank" | "cheque" | "other";
export const PAYMENT_MODES: PaymentMode[] = ["cash", "upi", "bank", "cheque", "other"];
export type Payment = {
  id: ID;
  date: string;
  partyType: "customer" | "dealer";
  partyId: ID;
  saleId?: ID | null;
  purchaseId?: ID | null; // "Paid now" entries die with their purchase (CASCADE)
  amount: number;
  mode?: PaymentMode | null;
  notes?: string;
  addedBy: string;
  createdAt: string;
  createdBy?: string | null;
};

// Manual stock movement: qty > 0 adds stock, qty < 0 removes it.
export type AdjustmentReason = "opening" | "correction" | "damage" | "sale_return" | "purchase_return";
export const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string; sign: 1 | -1 }[] = [
  { value: "opening", label: "Opening stock", sign: 1 },
  { value: "sale_return", label: "Sale return (back in)", sign: 1 },
  { value: "purchase_return", label: "Purchase return (sent back)", sign: -1 },
  { value: "damage", label: "Damage / loss", sign: -1 },
  { value: "correction", label: "Count correction", sign: 1 },
];
export type StockAdjustment = {
  id: ID;
  date: string;
  itemId: ID;
  qty: number;
  reason: AdjustmentReason;
  notes?: string;
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
  payments: Payment[];
  adjustments: StockAdjustment[];
  shop: { name: string; address: string; phone: string; gstin: string };
  currentUser: string;
};

const DEFAULT_SHOP = {
  name: "BW Inventory",
  address: "",
  phone: "",
  gstin: "",
};

const EMPTY: DB = {
  items: [],
  dealers: [],
  customers: [],
  purchases: [],
  sales: [],
  expenses: [],
  payments: [],
  adjustments: [],
  shop: DEFAULT_SHOP,
  currentUser: "",
};

const QK = (bid: string) => ["biz-db", bid] as const;

// What fetchAll returns and what the device cache stores.
type CachedDB = Omit<DB, "shop" | "currentUser">;
// Last snapshot handed to the device cache per business, so the many useDB
// callers don't each queue the same write.
const lastSaved = new Map<string, CachedDB>();

// Schema capability flags, detected on every fetch. False = the DB migrations
// haven't been applied yet (mid-rollout); writes then omit the new fields so
// every dialog keeps working against the old schema instead of erroring with
// "Could not find the '…' column in the schema cache" (PGRST204).
let hasGstColumns = true;
let hasPaymentsTable = true;
let hasAdjustmentsTable = true;
let hasPurchaseLink = true;
let hasWaSession = true;
const MIGRATION_HINT = "Database upgrade pending — apply the latest Supabase migrations to use this feature.";

// Every save resolves to this; dialogs await it and stay open on failure.
export type SaveResult = { ok: true } | { ok: false; error: string };

// True while the connected database is missing the latest migrations.
// Refreshed on every fetchAll; the admin upgrade banner keys off this.
export function schemaUpgradePending() {
  return !hasGstColumns || !hasPaymentsTable || !hasAdjustmentsTable || !hasPurchaseLink || !hasWaSession;
}
// Which schema features the connected DB already has — the upgrade banner
// composes its SQL from only the missing segments (re-running an applied
// migration errors on CREATE TABLE, so never offer the full history).
export function schemaFlags() {
  return {
    khata: hasPaymentsTable && hasAdjustmentsTable,
    gst: hasGstColumns,
    purchaseLink: hasPurchaseLink,
    waSession: hasWaSession,
  };
}
// Payments/khata capability alone — gates "Paid now" style UI without
// coupling it to unrelated pending migrations.
export function khataReady() {
  return hasPaymentsTable;
}

// Turn raw Postgres/PostgREST/network errors into words a shop owner can act on.
function friendlyError(e: any): string {
  const msg: string = e?.message ?? String(e);
  if (e?.code === "PGRST204" || /schema cache/i.test(msg)) return MIGRATION_HINT;
  if (/failed to fetch|networkerror|load failed|network request/i.test(msg))
    return "No internet — the change was not saved. Check your connection and try again.";
  if (/violates row-level security/i.test(msg)) return "You don't have permission to do this.";
  if (/duplicate key/i.test(msg)) return "This already exists — it may have been saved twice.";
  if (/JWT|token|not authenticated/i.test(msg)) return "Session expired — please sign in again.";
  return msg;
}

// PostgREST caps each response (1000 rows by default), so a single select
// silently truncates big businesses. Page through with .range(); `id` breaks
// created_at ties (bulk imports share one timestamp) so pages never overlap or
// skip rows. The first page also asks for the row count, so the remaining
// pages are fetched in parallel instead of one after another.
const PAGE = 1000;
const PARALLEL_PAGES = 6;
type Page<T> = { data: T[] | null; error: any; count?: number | null };
async function selectAll<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>,
): Promise<{ data: T[] | null; error: any }> {
  const first = await page(0, PAGE - 1, true);
  if (first.error) return { data: null, error: first.error };
  const rows: T[] = [...(first.data ?? [])];
  if (rows.length < PAGE) return { data: rows, error: null };

  const starts: number[] = [];
  for (let from = PAGE; from < (first.count ?? 0); from += PAGE) starts.push(from);
  let last = rows.length;
  for (let i = 0; i < starts.length; i += PARALLEL_PAGES) {
    const batch = await Promise.all(
      starts.slice(i, i + PARALLEL_PAGES).map((from) => page(from, from + PAGE - 1, false)),
    );
    for (const r of batch) {
      if (r.error) return { data: null, error: r.error };
      rows.push(...(r.data ?? []));
      last = r.data?.length ?? 0;
    }
  }
  // Rows added after the count (or no count returned): keep going until a short page.
  for (let from = PAGE * (starts.length + 1); last === PAGE; from += PAGE) {
    const r = await page(from, from + PAGE - 1, false);
    if (r.error) return { data: null, error: r.error };
    rows.push(...(r.data ?? []));
    last = r.data?.length ?? 0;
  }
  return { data: rows, error: null };
}
const counted = (withCount: boolean) => (withCount ? { count: "exact" as const } : undefined);

// sale_lines carries business_id since the 20261125 migration, which avoids a
// join with sales per line. Until that migration is applied, filter via the join.
let hasLineBusinessId = true;
async function fetchSaleLines(bid: string) {
  if (hasLineBusinessId) {
    const r = await selectAll((f, t, c) => supabase.from("sale_lines").select("*", counted(c)).eq("business_id", bid).order("id").range(f, t));
    if (r.error?.code !== "42703") return r;
    hasLineBusinessId = false;
  }
  return selectAll((f, t, c) => supabase.from("sale_lines").select("*, sales!inner(business_id)", counted(c)).eq("sales.business_id", bid).order("id").range(f, t));
}

async function fetchAll(bid: string): Promise<CachedDB> {
  const [itemsR, dealersR, customersR, purchasesR, salesR, linesR, expensesR, paymentsR, adjustmentsR, profilesR, gstProbeR, purchaseLinkProbeR, waSessionProbeR] =
    await Promise.all([
      selectAll((f, t, c) => supabase.from("items").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("dealers").select("*", counted(c)).eq("business_id", bid).order("created_at").order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("customers").select("*", counted(c)).eq("business_id", bid).order("created_at").order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("purchases").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("sales").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      fetchSaleLines(bid),
      selectAll((f, t, c) => supabase.from("expenses").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("payments").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      selectAll((f, t, c) => supabase.from("stock_adjustments").select("*", counted(c)).eq("business_id", bid).order("created_at", { ascending: false }).order("id").range(f, t)),
      supabase.from("profiles").select("id, display_name"),
      supabase.from("items").select("gst_rate").limit(1), // capability probe: 42703 = old schema
      supabase.from("payments").select("purchase_id").limit(1), // capability probe: 42703 = old schema
      supabase.from("businesses").select("wa_session_id").limit(1), // capability probe: 42703 = old schema
    ]);

  for (const r of [itemsR, dealersR, customersR, purchasesR, salesR, linesR, expensesR, profilesR]) {
    if (r.error) throw r.error;
  }
  // Detect a not-yet-migrated DB and degrade instead of blocking the app:
  // missing tables read as empty, and setDB writes skip the new columns.
  hasGstColumns = gstProbeR.error?.code !== "42703";
  hasPaymentsTable = paymentsR.error?.code !== "PGRST205";
  hasAdjustmentsTable = adjustmentsR.error?.code !== "PGRST205";
  hasPurchaseLink = !purchaseLinkProbeR.error;
  hasWaSession = !waSessionProbeR.error;
  if (!hasGstColumns || !hasPaymentsTable || !hasAdjustmentsTable || !hasPurchaseLink || !hasWaSession) {
    console.warn("[store] DB migrations pending — running in legacy-schema mode");
  }
  const optionalRows = (r: { data: any[] | null; error: { code?: string } | null }): any[] => {
    if (!r.error) return r.data ?? [];
    if (r.error.code === "PGRST205") return [];
    throw r.error;
  };
  const paymentsRows = optionalRows(paymentsR);
  const adjustmentsRows = optionalRows(adjustmentsR);

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
    hsn: r.hsn ?? undefined,
    gstRate: r.gst_rate != null ? Number(r.gst_rate) : null,
    price: r.price != null ? Number(r.price) : null,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  const mapPerson = (r: any): Person => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    address: r.address ?? undefined,
    notes: r.notes ?? undefined,
    gstin: r.gstin ?? undefined,
    openingBalance: r.opening_balance != null ? Number(r.opening_balance) : 0,
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
    arr.push({ id: l.id, itemId: l.item_id, qty: Number(l.qty), rate: Number(l.rate), gstRate: l.gst_rate != null ? Number(l.gst_rate) : null });
    linesBySale.set(l.sale_id, arr);
  }
  const sales: Sale[] = (salesR.data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    customerId: r.customer_id,
    lines: linesBySale.get(r.id) ?? [],
    notes: r.notes ?? undefined,
    isBill: r.is_bill,
    billNo: r.bill_no ?? null,
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

  const payments: Payment[] = paymentsRows.map((r) => ({
    id: r.id,
    date: r.date,
    partyType: r.party_type as Payment["partyType"],
    partyId: r.party_id,
    saleId: r.sale_id ?? null,
    purchaseId: r.purchase_id ?? null,
    amount: Number(r.amount),
    mode: (r.mode as PaymentMode | null) ?? null,
    notes: r.notes ?? undefined,
    addedBy: addedBy(r.created_by),
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  const adjustments: StockAdjustment[] = adjustmentsRows.map((r) => ({
    id: r.id,
    date: r.date,
    itemId: r.item_id,
    qty: Number(r.qty),
    reason: r.reason as AdjustmentReason,
    notes: r.notes ?? undefined,
    addedBy: addedBy(r.created_by),
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  }));

  return { items, dealers, customers, purchases, sales, expenses, payments, adjustments };
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

export function useDB(): [DB, (u: (db: DB) => DB) => Promise<SaveResult>] {
  const { user, displayName } = useAuth();
  const { current } = useBusiness();
  const bid = current?.id ?? null;
  const qc = useQueryClient();

  const uid = user?.id ?? null;
  const { data } = useQuery({
    queryKey: QK(bid ?? "none"),
    queryFn: () => fetchAll(bid!),
    enabled: !!uid && !!bid,
    // Every screen calls useDB; a short staleTime re-downloaded the whole
    // business on each navigation. Saves and app refocus still refresh it.
    staleTime: 60_000,
  });

  // Show the copy kept on this device while the network catches up. Marked as
  // old (updatedAt 0) so the fetch that's already running replaces it.
  React.useEffect(() => {
    if (!uid || !bid || qc.getQueryData(QK(bid))) return;
    let cancelled = false;
    readSnapshot<CachedDB>(uid, bid).then((snap) => {
      if (!cancelled && snap && !qc.getQueryData(QK(bid))) qc.setQueryData(QK(bid), snap, { updatedAt: 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, bid, qc]);

  React.useEffect(() => {
    if (uid && bid && data && data !== lastSaved.get(bid)) {
      lastSaved.set(bid, data);
      writeSnapshot(uid, bid, data);
    }
  }, [uid, bid, data]);

  const db: DB = React.useMemo(
    () => ({
      ...EMPTY,
      ...(data ?? {}),
      shop: {
        name: current?.name ?? DEFAULT_SHOP.name,
        address: current?.address ?? "",
        phone: current?.phone ?? "",
        gstin: current?.gstin ?? "",
      },
      currentUser: displayName,
    }),
    [data, displayName, current?.name, current?.address, current?.phone, current?.gstin],
  );

  const setDB = React.useCallback(
    (updater: (db: DB) => DB): Promise<SaveResult> => {
      if (!user) {
        toast.error("Sign in required");
        return Promise.resolve({ ok: false, error: "Sign in required" });
      }
      if (!bid) {
        toast.error("Select a business first");
        return Promise.resolve({ ok: false, error: "Select a business first" });
      }
      const uid = user.id;
      const proposed = updater(db);
      // Give new sale lines their ids now: the screen shows this state before
      // the refetch, and a later edit must diff lines by id.
      const next: DB = {
        ...proposed,
        sales: proposed.sales.map((s) =>
          s.lines.every((l) => l.id) ? s : { ...s, lines: s.lines.map((l) => (l.id ? l : { ...l, id: newId() })) },
        ),
      };
      // Sale-linked payment rows this save creates, shown with the sale so the
      // khata never lags behind the bill.
      const autoPayments: Payment[] = [];
      const movedSales = new Map<ID, ID>(); // sale id → new customer id

      const work = async () => {
        const tasks: PromiseLike<any>[] = [];
        const mirrorJobs: MirrorJob[] = [];
        const nowIso = new Date().toISOString();

        // ITEMS
        {
          const { added, removed, updated } = diff(
            db.items,
            next.items,
            ["name", "company", "unit", "lowStock", "hsn", "gstRate", "price"],
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
                  ...(hasGstColumns ? { hsn: x.hsn ?? null, gst_rate: x.gstRate ?? null, price: x.price ?? null } : {}),
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "items", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, company: x.company, unit: x.unit ?? "", low_stock: x.lowStock ?? 5, hsn: x.hsn ?? "", gst_rate: x.gstRate ?? "", price: x.price ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, company: x.company, unit: x.unit ?? null, low_stock: x.lowStock ?? 5, ...(hasGstColumns ? { hsn: x.hsn ?? null, gst_rate: x.gstRate ?? null, price: x.price ?? null } : {}) };
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
            ["name", "phone", "address", "notes", "gstin", "openingBalance"],
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
                  ...(hasGstColumns ? { gstin: x.gstin ?? null, opening_balance: x.openingBalance ?? 0 } : {}),
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "dealers", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, phone: x.phone ?? "", address: x.address ?? "", notes: x.notes ?? "", gstin: x.gstin ?? "", opening_balance: x.openingBalance ?? 0, created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null, ...(hasGstColumns ? { gstin: x.gstin ?? null, opening_balance: x.openingBalance ?? 0 } : {}) };
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
            ["name", "phone", "address", "notes", "gstin", "openingBalance"],
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
                  ...(hasGstColumns ? { gstin: x.gstin ?? null, opening_balance: x.openingBalance ?? 0 } : {}),
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "customers", action: "insert", id: x.id,
              row: { id: x.id, name: x.name, phone: x.phone ?? "", address: x.address ?? "", notes: x.notes ?? "", gstin: x.gstin ?? "", opening_balance: x.openingBalance ?? 0, created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { name: x.name, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null, ...(hasGstColumns ? { gstin: x.gstin ?? null, opening_balance: x.openingBalance ?? 0 } : {}) };
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
            // Ledger: a new sale that already has money received gets a
            // matching payment entry (inserted after the sale row, for the FK).
            const paidRows = (hasPaymentsTable ? added.filter((s) => s.customerId && s.amountPaid > 0) : []).map((s) => ({
              id: newId(),
              business_id: bid,
              party_type: "customer" as const,
              party_id: s.customerId!,
              sale_id: s.id,
              date: s.date,
              amount: s.amountPaid,
              mode: s.paidMode ?? null,
              created_by: uid,
            }));
            for (const r of paidRows)
              autoPayments.push({
                id: r.id, date: r.date, partyType: "customer", partyId: r.party_id, saleId: r.sale_id,
                purchaseId: null, amount: r.amount, mode: r.mode, addedBy: next.currentUser, createdAt: nowIso, createdBy: uid,
              });
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
                    id: l.id,
                    sale_id: s.id,
                    item_id: l.itemId,
                    qty: l.qty,
                    rate: l.rate,
                    ...(hasGstColumns ? { gst_rate: l.gstRate ?? null } : {}),
                  })),
                );
                if (linesPayload.length) {
                  const { error: e2 } = await supabase.from("sale_lines").insert(linesPayload);
                  if (e2) {
                    // Lines rejected (e.g. stock trigger): drop the just-created
                    // header so the failure doesn't leave an empty bill behind.
                    await supabase.from("sales").delete().in("id", added.map((s) => s.id));
                    throw e2;
                  }
                }
                if (paidRows.length) {
                  const { error: e3 } = await supabase.from("payments").insert(paidRows);
                  if (e3) throw e3;
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
                  row: { id: lineId, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate, gst_rate: l.gstRate ?? "" },
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


            // Per-line diff by id (new lines got theirs when `next` was built).
            const nextLines = s.lines;
            const lineCmp = (l: SaleLine) => `${l.itemId}|${l.qty}|${l.rate}|${l.gstRate ?? ""}`;
            const prevLineMap = new Map(prev.lines.filter((l) => l.id).map((l) => [l.id!, l]));
            const nextLineIds = new Set(nextLines.map((l) => l.id!));
            const linesAdded = nextLines.filter((l) => !prevLineMap.has(l.id!));
            const linesRemoved = prev.lines.filter((l) => l.id && !nextLineIds.has(l.id));
            const linesUpdated = nextLines.filter((l) => {
              const p = prevLineMap.get(l.id!);
              return p && lineCmp(p) !== lineCmp(l);
            });

            // Ledger: a sale moved to another customer takes its linked payment
            // rows along, or the old customer keeps phantom credit; and the
            // paid-amount delta is logged so the khata stays in step with
            // per-sale figures (negative delta = correction).
            const moveTo = headChanged && prev.customerId !== s.customerId && s.customerId && hasPaymentsTable ? s.customerId : null;
            if (moveTo) movedSales.set(s.id, moveTo);
            const delta = s.amountPaid - prev.amountPaid;
            const deltaRow =
              headChanged && delta !== 0 && s.customerId && hasPaymentsTable
                ? {
                    id: newId(),
                    business_id: bid,
                    party_type: "customer" as const,
                    party_id: s.customerId,
                    sale_id: s.id,
                    date: today(),
                    amount: delta,
                    mode: s.paidMode ?? null,
                    created_by: uid,
                  }
                : null;
            if (deltaRow)
              autoPayments.push({
                id: deltaRow.id, date: deltaRow.date, partyType: "customer", partyId: deltaRow.party_id, saleId: s.id,
                purchaseId: null, amount: delta, mode: deltaRow.mode, addedBy: next.currentUser, createdAt: nowIso, createdBy: uid,
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
                  if (moveTo) {
                    const { error: re } = await supabase.from("payments").update({ party_id: moveTo }).eq("sale_id", s.id);
                    if (re) throw re;
                  }
                  if (deltaRow) {
                    const { error: pe } = await supabase.from("payments").insert(deltaRow);
                    if (pe) throw pe;
                  }
                }
                // Order: updates first, then inserts, then deletes — so a
                // partial failure leaves the bill at worst with extra lines,
                // never empty.
                for (const l of linesUpdated) {
                  const { error } = await supabase
                    .from("sale_lines")
                    .update({ item_id: l.itemId, qty: l.qty, rate: l.rate, ...(hasGstColumns ? { gst_rate: l.gstRate ?? null } : {}) })
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
                      ...(hasGstColumns ? { gst_rate: l.gstRate ?? null } : {}),
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
                row: { id: l.id, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate, gst_rate: l.gstRate ?? "" },
              });
            }
            for (const l of linesUpdated) {
              mirrorJobs.push({
                table: "sale_lines", action: "update", id: l.id!,
                row: { id: l.id, sale_id: s.id, item_id: l.itemId, qty: l.qty, rate: l.rate, gst_rate: l.gstRate ?? "" },
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

        // PAYMENTS (standalone khata entries; sale-linked rows are handled in
        // the SALES section above and must not be added/edited via this diff)
        {
          const { added, removed, updated } = diff(
            db.payments,
            next.payments,
            ["date", "partyType", "partyId", "saleId", "purchaseId", "amount", "mode", "notes"],
          );
          if (!hasPaymentsTable && (added.length || updated.length || removed.length)) {
            throw new Error(MIGRATION_HINT);
          }
          if (added.length)
            tasks.push(
              supabase.from("payments").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  party_type: x.partyType,
                  party_id: x.partyId,
                  sale_id: x.saleId ?? null,
                  ...(hasPurchaseLink ? { purchase_id: x.purchaseId ?? null } : {}),
                  date: x.date,
                  amount: x.amount,
                  mode: x.mode ?? null,
                  notes: x.notes ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "payments", action: "insert", id: x.id,
              row: { id: x.id, date: x.date, party_type: x.partyType, party_id: x.partyId, sale_id: x.saleId ?? "", purchase_id: x.purchaseId ?? "", amount: x.amount, mode: x.mode ?? "", notes: x.notes ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { date: x.date, amount: x.amount, mode: x.mode ?? null, notes: x.notes ?? null };
            tasks.push(supabase.from("payments").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "payments", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("payments").delete().eq("id", r.id));
            mirrorJobs.push({ table: "payments", action: "delete", id: r.id });
          }
        }

        // STOCK ADJUSTMENTS
        {
          const { added, removed, updated } = diff(
            db.adjustments,
            next.adjustments,
            ["date", "itemId", "qty", "reason", "notes"],
          );
          if (!hasAdjustmentsTable && (added.length || updated.length || removed.length)) {
            throw new Error(MIGRATION_HINT);
          }
          if (added.length)
            tasks.push(
              supabase.from("stock_adjustments").insert(
                added.map((x) => ({
                  id: x.id,
                  business_id: bid,
                  item_id: x.itemId,
                  date: x.date,
                  qty: x.qty,
                  reason: x.reason,
                  notes: x.notes ?? null,
                  created_by: uid,
                })),
              ),
            );
          for (const x of added)
            mirrorJobs.push({
              table: "stock_adjustments", action: "insert", id: x.id,
              row: { id: x.id, date: x.date, item_id: x.itemId, qty: x.qty, reason: x.reason, notes: x.notes ?? "", created_by: uid, created_at: nowIso },
            });
          for (const x of updated) {
            const row = { date: x.date, item_id: x.itemId, qty: x.qty, reason: x.reason, notes: x.notes ?? null };
            tasks.push(supabase.from("stock_adjustments").update(row).eq("id", x.id));
            mirrorJobs.push({ table: "stock_adjustments", action: "update", id: x.id, row: { id: x.id, ...row } });
          }
          for (const r of removed) {
            tasks.push(supabase.from("stock_adjustments").delete().eq("id", r.id));
            mirrorJobs.push({ table: "stock_adjustments", action: "delete", id: r.id });
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

      const key = QK(bid);
      const before = qc.getQueryData<CachedDB>(key);
      const writes = work(); // runs the diff now, filling autoPayments/movedSales
      // Show the saved state at once instead of after a full re-download. A
      // refresh already in flight is stopped first so it can't paint the old
      // data back; the refetch after the writes fills in server-made fields
      // (bill numbers, names).
      const shown = before
        ? qc.cancelQueries({ queryKey: key }).then(() => {
            const { shop: _shop, currentUser: _user, ...rest } = next;
            const payments = rest.payments.map((p) =>
              p.saleId && movedSales.has(p.saleId) ? { ...p, partyId: movedSales.get(p.saleId)! } : p,
            );
            qc.setQueryData<CachedDB>(key, { ...rest, payments: [...autoPayments, ...payments] });
          })
        : Promise.resolve();

      // What the database changes on its own after these writes, so the cache
      // can be patched with a tiny query instead of re-downloading the business.
      const prevSales = new Map(db.sales.map((s) => [s.id, s]));
      const nextSaleIds = new Set(next.sales.map((s) => s.id));
      const nextPurchaseIds = new Set(next.purchases.map((p) => p.id));
      // Bill numbers come from a trigger: new bills, and sales just marked as bills.
      const needBillNo = next.sales
        .filter((s) => s.isBill && s.billNo == null && (!prevSales.has(s.id) || !prevSales.get(s.id)!.isBill))
        .map((s) => s.id);
      // A deleted sale or purchase takes its linked khata rows with it (ON DELETE CASCADE).
      const goneSales = new Set(db.sales.filter((s) => !nextSaleIds.has(s.id)).map((s) => s.id));
      const gonePurchases = new Set(db.purchases.filter((p) => !nextPurchaseIds.has(p.id)).map((p) => p.id));
      // Deleting an item, dealer or customer nulls references in other tables; rare, so reload fully.
      const goneParty = (a: { id: string }[], b: { id: string }[]) => {
        const ids = new Set(b.map((x) => x.id));
        return a.some((x) => !ids.has(x.id));
      };
      const needFullReload =
        !before ||
        goneParty(db.items, next.items) ||
        goneParty(db.dealers, next.dealers) ||
        goneParty(db.customers, next.customers);

      const patchAfterSave = async () => {
        if (needFullReload) return qc.invalidateQueries({ queryKey: key });
        let billNos = new Map<string, number | null>();
        if (needBillNo.length) {
          const { data: rows, error } = await supabase.from("sales").select("id, bill_no").in("id", needBillNo);
          if (error) return qc.invalidateQueries({ queryKey: key });
          billNos = new Map((rows ?? []).map((r) => [r.id, r.bill_no ?? null]));
        }
        if (!billNos.size && !goneSales.size && !gonePurchases.size) return;
        qc.setQueryData<CachedDB>(key, (cur) =>
          cur && {
            ...cur,
            sales: billNos.size
              ? cur.sales.map((s) => (billNos.has(s.id) ? { ...s, billNo: billNos.get(s.id)! } : s))
              : cur.sales,
            payments:
              goneSales.size || gonePurchases.size
                ? cur.payments.filter(
                    (p) => !(p.saleId && goneSales.has(p.saleId)) && !(p.purchaseId && gonePurchases.has(p.purchaseId)),
                  )
                : cur.payments,
          },
        );
      };

      return Promise.all([writes, shown])
        .then(([jobs]): SaveResult => {
          backupMirror(jobs, bid);
          patchAfterSave().catch(() => qc.invalidateQueries({ queryKey: key }));
          return { ok: true };
        })
        .catch(async (e: Error): Promise<SaveResult> => {
          // Undo what was shown (after it was shown, or it would win), then
          // reload: some of the writes may have gone through.
          await shown.catch(() => {});
          if (before) qc.setQueryData(key, before);
          const friendly = friendlyError(e);
          toast.error(friendly);
          qc.invalidateQueries({ queryKey: key });
          return { ok: false, error: friendly };
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
// Calendar date in the user's timezone. Never derive a YYYY-MM-DD via
// toISOString() — that's UTC and shifts dates before 5:30 AM IST.
export function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function today() {
  return localISO(new Date());
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
// ---------- Per-snapshot indexes ----------
// Screens call the helpers below once per row (every item, every bill), and
// each call used to rescan all purchases and sales — O(rows²) on every render,
// which is what made big businesses sluggish. Each index is built once per
// array and reused until that array is replaced (setDB and refetches always
// replace arrays, never mutate them).
function perArray<T extends object, V>(build: (rows: T) => V): (rows: T) => V {
  const cache = new WeakMap<T, V>();
  return (rows) => {
    let v = cache.get(rows);
    if (v === undefined) {
      v = build(rows);
      cache.set(rows, v);
    }
    return v;
  };
}
const add = (m: Map<string, number>, k: string | null | undefined, n: number) => {
  if (k != null) m.set(k, (m.get(k) ?? 0) + n);
};
const byIdIndex = perArray((rows: { id: ID }[]) => new Map(rows.map((r) => [r.id, r])));

const purchaseIndex = perArray((purchases: Purchase[]) => {
  const qty = new Map<ID, number>();
  const value = new Map<ID, number>();
  const count = new Map<ID, number>();
  const last = new Map<ID, Purchase>();
  const dealerValue = new Map<ID, number>();
  const dealerCount = new Map<ID, number>();
  for (const p of purchases) {
    add(dealerValue, p.dealerId, p.qty * p.rate);
    add(dealerCount, p.dealerId, 1);
    if (!p.itemId) continue;
    add(qty, p.itemId, p.qty);
    add(value, p.itemId, p.qty * p.rate);
    add(count, p.itemId, 1);
    const cur = last.get(p.itemId);
    if (!cur || p.createdAt > cur.createdAt) last.set(p.itemId, p);
  }
  return { qty, value, count, last, dealerValue, dealerCount };
});

const saleIndex = perArray((sales: Sale[]) => {
  const outQty = new Map<ID, number>();
  const salesWithItem = new Map<ID, number>();
  const lastRate = new Map<ID, number>();
  const customerPayable = new Map<ID, number>();
  const customerCount = new Map<ID, number>();
  for (const s of sales) {
    add(customerPayable, s.customerId, billPayable(s));
    add(customerCount, s.customerId, 1);
    const seen = new Set<ID>();
    for (const l of s.lines) {
      if (!l.itemId) continue;
      add(outQty, l.itemId, l.qty);
      if (!seen.has(l.itemId)) add(salesWithItem, l.itemId, 1);
      seen.add(l.itemId);
    }
  }
  // Newest sale first; ties keep list order (same as a stable sort).
  const newest = sales.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const s of newest)
    for (const l of s.lines) if (l.itemId && !lastRate.has(l.itemId)) lastRate.set(l.itemId, l.rate);
  return { outQty, salesWithItem, lastRate, customerPayable, customerCount };
});

const adjustmentIndex = perArray((adjustments: StockAdjustment[]) => {
  const qty = new Map<ID, number>();
  const count = new Map<ID, number>();
  for (const a of adjustments) {
    add(qty, a.itemId, a.qty);
    add(count, a.itemId, 1);
  }
  return { qty, count };
});

const paymentIndex = perArray((payments: Payment[]) => {
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const p of payments) {
    add(sum, `${p.partyType}:${p.partyId}`, p.amount);
    add(count, `${p.partyType}:${p.partyId}`, 1);
  }
  return { sum, count };
});

function soldIn(sale: Sale | undefined, itemId: ID) {
  return sale ? sale.lines.reduce((s, l) => (l.itemId === itemId ? s + l.qty : s), 0) : 0;
}
export function stockOf(db: DB, itemId: ID) {
  return (
    (purchaseIndex(db.purchases).qty.get(itemId) ?? 0) +
    (adjustmentIndex(db.adjustments).qty.get(itemId) ?? 0) -
    (saleIndex(db.sales).outQty.get(itemId) ?? 0)
  );
}
// Stock available for a sale, optionally excluding a specific sale (the one
// being edited) so editing 10 → 12 against current stock 10 doesn't pretend
// you've already sold those 10.
export function stockAvailableFor(db: DB, itemId: ID, excludeSaleId?: ID) {
  const excluded = excludeSaleId ? (byIdIndex(db.sales).get(excludeSaleId) as Sale | undefined) : undefined;
  return stockOf(db, itemId) + soldIn(excluded, itemId);
}
export function lastPurchaseRate(db: DB, itemId: ID): number | null {
  return purchaseIndex(db.purchases).last.get(itemId)?.rate ?? null;
}
export function lastSaleRate(db: DB, itemId: ID): number | null {
  return saleIndex(db.sales).lastRate.get(itemId) ?? null;
}
// Weighted-average cost per unit for an item, across ALL purchases (lifetime).
// Returns 0 if there are no purchases for the item.
export function avgCostFor(db: DB, itemId: ID): number {
  const idx = purchaseIndex(db.purchases);
  const qty = idx.qty.get(itemId) ?? 0;
  if (qty <= 0) return 0;
  return (idx.value.get(itemId) ?? 0) / qty;
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
    // Charged extras are a pass-through: the customer's payment covers a cost
    // the shop already incurred, so they appear in revenue AND cost (net 0).
    profit: sales - cogs - expenses - saleExtras,
  };
}

// Taxable value = items + any extra charged to the customer (the base GST applies to).
export function taxableBase(s: Sale) {
  const items = s.lines.reduce((a, l) => a + l.qty * l.rate, 0);
  return items + (s.extraExpensesChargeCustomer ? (s.extraExpenses ?? 0) : 0);
}
// GST amount in rupees for a sale. Lines carrying their own snapshotted slab
// use it; lines without (legacy) and chargeable extras use the sale-level rate.
export function gstAmount(s: Sale) {
  const saleRate = s.gstRate ?? 0;
  const linesGst = s.lines.reduce(
    (a, l) => a + l.qty * l.rate * (((l.gstRate ?? saleRate) || 0) / 100),
    0,
  );
  const extrasGst = s.extraExpensesChargeCustomer ? (s.extraExpenses ?? 0) * (saleRate / 100) : 0;
  return linesGst + extrasGst;
}
// Single effective GST % when every taxed component shares one rate (for
// "CGST (9%)"-style labels); null when rates are mixed across lines.
export function gstRateSummary(s: Sale): number | null {
  const saleRate = s.gstRate ?? 0;
  const rates = new Set<number>();
  for (const l of s.lines) rates.add((l.gstRate ?? saleRate) || 0);
  if (s.extraExpensesChargeCustomer && (s.extraExpenses ?? 0) > 0) rates.add(saleRate);
  rates.delete(0);
  if (rates.size === 0) return 0;
  return rates.size === 1 ? [...rates][0] : null;
}

// ---------- GST place-of-supply ----------
// The first two digits of a GSTIN are the state code. Same state (or buyer
// without a GSTIN, i.e. local B2C) → CGST + SGST; different states → IGST.
export function gstStateCode(gstin?: string | null): string | null {
  const m = (gstin ?? "").trim().match(/^(\d{2})/);
  return m ? m[1] : null;
}
export function isInterState(sellerGstin?: string | null, buyerGstin?: string | null): boolean {
  const a = gstStateCode(sellerGstin);
  const b = gstStateCode(buyerGstin);
  return !!a && !!b && a !== b;
}
// Split a sale's GST into the components the invoice must show.
export function gstSplit(s: Sale, sellerGstin?: string | null, buyerGstin?: string | null) {
  const gst = gstAmount(s);
  const inter = isInterState(sellerGstin, buyerGstin);
  return inter
    ? { inter: true as const, igst: gst, cgst: 0, sgst: 0 }
    : { inter: false as const, igst: 0, cgst: gst / 2, sgst: gst / 2 };
}
// Loose GSTIN shape check: 2-digit state code + 13 alphanumerics.
export function isValidGstin(g: string): boolean {
  return /^[0-9]{2}[0-9A-Z]{13}$/.test(g.trim().toUpperCase());
}
export function billTotal(s: Sale) {
  return taxableBase(s) + gstAmount(s);
}
// What the customer actually owes: the invoice rounds to whole rupees (the
// PDF's "Round Off" row), so dues, payment status, and the khata must use the
// same figure — otherwise paise residues keep bills "part-paid" forever.
export function billPayable(s: Sale) {
  return Math.round(billTotal(s));
}
// Display label for a bill's serial number. Falls back to a UUID slice for
// sales saved before sequential numbering existed (or not yet refetched).
export function billNoLabel(s: Sale) {
  return s.billNo != null ? "#" + String(s.billNo).padStart(4, "0") : "#" + s.id.slice(0, 6).toUpperCase();
}
export function itemLabel(it: Item) {
  return `${it.company} ${it.name}`;
}
export function findItem(db: DB, id: ID | null | undefined) {
  return id ? (byIdIndex(db.items).get(id) as Item | undefined) : undefined;
}
export function findDealer(db: DB, id: ID | null | undefined) {
  return id ? (byIdIndex(db.dealers).get(id) as Person | undefined) : undefined;
}
export function findCustomer(db: DB, id: ID | null | undefined) {
  return id ? (byIdIndex(db.customers).get(id) as Person | undefined) : undefined;
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
  let other = 0;
  if (kind === "item") {
    purchases = purchaseIndex(db.purchases).count.get(id) ?? 0;
    sales = saleIndex(db.sales).salesWithItem.get(id) ?? 0;
    other = adjustmentIndex(db.adjustments).count.get(id) ?? 0;
  } else if (kind === "dealer") {
    purchases = purchaseIndex(db.purchases).dealerCount.get(id) ?? 0;
    other = paymentIndex(db.payments).count.get(`dealer:${id}`) ?? 0;
  } else if (kind === "customer") {
    sales = saleIndex(db.sales).customerCount.get(id) ?? 0;
    other = paymentIndex(db.payments).count.get(`customer:${id}`) ?? 0;
  }
  return { purchases, sales, total: purchases + sales + other };
}

// ---------- Party ledger (khata) ----------

export type LedgerEntry = {
  id: string;
  date: string;
  kind: "sale" | "purchase" | "payment" | "opening";
  label: string;
  debit: number; // what the party owes us more of (customer) / we owe them (dealer)
  credit: number; // money settled against it
  createdAt: string;
  payment?: Payment; // set when kind === "payment"
};

// Opening balance as the khata's first entry (negative opening = advance held).
function openingEntry(p: Person | undefined): LedgerEntry[] {
  const ob = p?.openingBalance ?? 0;
  if (!p || ob === 0) return [];
  return [{
    id: `opening-${p.id}`,
    date: p.createdAt.slice(0, 10),
    kind: "opening",
    label: "Opening balance",
    debit: ob > 0 ? ob : 0,
    credit: ob < 0 ? -ob : 0,
    createdAt: "", // sorts before same-day transactions
  }];
}

// Customer khata: sales are debits (they owe us), payments are credits.
export function customerLedger(db: DB, customerId: ID): LedgerEntry[] {
  const entries: LedgerEntry[] = openingEntry(db.customers.find((c) => c.id === customerId));
  for (const s of db.sales) {
    if (s.customerId !== customerId) continue;
    entries.push({
      id: s.id,
      date: s.date,
      kind: "sale",
      label: s.isBill ? `Bill${s.billNo ? " #" + s.billNo : ""}` : "Sale",
      debit: billPayable(s),
      credit: 0,
      createdAt: s.createdAt,
    });
  }
  for (const p of db.payments) {
    if (p.partyType !== "customer" || p.partyId !== customerId) continue;
    entries.push({
      id: p.id,
      date: p.date,
      kind: "payment",
      label: p.amount >= 0 ? "Payment received" : "Correction / refund",
      debit: 0,
      credit: p.amount,
      createdAt: p.createdAt,
      payment: p,
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// Dealer khata: purchases are debits (we owe them), payments made are credits.
export function dealerLedger(db: DB, dealerId: ID): LedgerEntry[] {
  const entries: LedgerEntry[] = openingEntry(db.dealers.find((d) => d.id === dealerId));
  for (const p of db.purchases) {
    if (p.dealerId !== dealerId) continue;
    entries.push({
      id: p.id,
      date: p.date,
      kind: "purchase",
      label: "Purchase",
      debit: p.qty * p.rate,
      credit: 0,
      createdAt: p.createdAt,
    });
  }
  for (const p of db.payments) {
    if (p.partyType !== "dealer" || p.partyId !== dealerId) continue;
    entries.push({
      id: p.id,
      date: p.date,
      kind: "payment",
      label: p.amount >= 0 ? "Payment made" : "Correction / refund",
      debit: 0,
      credit: p.amount,
      createdAt: p.createdAt,
      payment: p,
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// Positive = customer still owes us / we still owe the dealer. Same total as
// summing the party's ledger (opening + bills/purchases − payments), read from
// the indexes; rounded to paise so float residue never shows a 0 balance as due.
export function partyBalance(db: DB, kind: "customer" | "dealer", id: ID): number {
  const person = kind === "customer" ? findCustomer(db, id) : findDealer(db, id);
  const owed =
    kind === "customer"
      ? (saleIndex(db.sales).customerPayable.get(id) ?? 0)
      : (purchaseIndex(db.purchases).dealerValue.get(id) ?? 0);
  const paid = paymentIndex(db.payments).sum.get(`${kind}:${id}`) ?? 0;
  return Math.round(((person?.openingBalance ?? 0) + owed - paid) * 100) / 100;
}
// Total receivable across all customers (advances don't offset other parties' dues).
export function totalReceivable(db: DB): number {
  return db.customers.reduce((s, c) => s + Math.max(0, partyBalance(db, "customer", c.id)), 0);
}
