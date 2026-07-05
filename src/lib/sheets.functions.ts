// Google Sheets backup mirror — non-blocking writes for safety.
// One spreadsheet per business; the id is stored on businesses.sheets_spreadsheet_id.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function gwHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const sk = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY missing");
  if (!sk) throw new Error("GOOGLE_SHEETS_API_KEY missing");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": sk,
    "Content-Type": "application/json",
  };
}

const SCHEMAS = {
  items: ["id", "name", "company", "unit", "low_stock", "hsn", "gst_rate", "price", "created_by", "created_at", "status"],
  dealers: ["id", "name", "phone", "address", "notes", "gstin", "opening_balance", "created_by", "created_at", "status"],
  customers: ["id", "name", "phone", "address", "notes", "gstin", "opening_balance", "created_by", "created_at", "status"],
  purchases: ["id", "date", "item_id", "dealer_id", "qty", "rate", "notes", "created_by", "created_at", "status"],
  sales: ["id", "date", "customer_id", "is_bill", "notes", "created_by", "created_at", "status"],
  sale_lines: ["id", "sale_id", "item_id", "qty", "rate", "gst_rate", "status"],
  expenses: ["id", "date", "category", "amount", "note", "created_by", "created_at", "status"],
  payments: ["id", "date", "party_type", "party_id", "sale_id", "amount", "mode", "notes", "created_by", "created_at", "status"],
  stock_adjustments: ["id", "date", "item_id", "qty", "reason", "notes", "created_by", "created_at", "status"],
} as const;

export type BackupTable = keyof typeof SCHEMAS;

async function gwFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: gwHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function getSpreadsheetIdForBusiness(supabase: any, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("sheets_spreadsheet_id")
    .eq("id", businessId)
    .maybeSingle();
  return data?.sheets_spreadsheet_id ?? null;
}

// ---------- Initialize / ensure spreadsheet for a business ----------
export const ensureBackupSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) =>
    z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_business_admin", {
      _user_id: userId, _business_id: data.businessId,
    });
    if (!isAdmin) throw new Error("Admin only");

    const { data: biz } = await supabase
      .from("businesses")
      .select("name, sheets_spreadsheet_id")
      .eq("id", data.businessId)
      .maybeSingle();
    if (!biz) throw new Error("Business not found");
    if (biz.sheets_spreadsheet_id) {
      // Heal older spreadsheets: add tabs for tables introduced after creation.
      try {
        const meta = await gwFetch(`/spreadsheets/${biz.sheets_spreadsheet_id}?fields=sheets.properties.title`);
        const existing = new Set((meta.sheets ?? []).map((s: any) => s.properties?.title));
        const missing = Object.keys(SCHEMAS).filter((name) => !existing.has(name));
        if (missing.length) {
          await gwFetch(`/spreadsheets/${biz.sheets_spreadsheet_id}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({
              requests: missing.map((name) => ({ addSheet: { properties: { title: name } } })),
            }),
          });
          await gwFetch(`/spreadsheets/${biz.sheets_spreadsheet_id}/values:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({
              valueInputOption: "RAW",
              data: missing.map((name) => ({
                range: `${name}!A1`,
                majorDimension: "ROWS",
                values: [SCHEMAS[name as BackupTable] as unknown as string[]],
              })),
            }),
          });
        }
      } catch (e) {
        console.warn("[ensureBackupSpreadsheet] tab heal failed:", (e as Error).message);
      }
      return {
        spreadsheetId: biz.sheets_spreadsheet_id,
        url: `https://docs.google.com/spreadsheets/d/${biz.sheets_spreadsheet_id}`,
        created: false,
      };
    }

    const created = await gwFetch(`/spreadsheets`, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: `${biz.name} — Backup` },
        sheets: Object.keys(SCHEMAS).map((name) => ({ properties: { title: name } })),
      }),
    });
    const spreadsheetId: string = created.spreadsheetId;

    const requests = Object.entries(SCHEMAS).map(([name, cols]) => ({
      range: `${name}!A1`,
      majorDimension: "ROWS",
      values: [cols as unknown as string[]],
    }));
    await gwFetch(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data: requests }),
    });

    const { error } = await supabase
      .from("businesses")
      .update({ sheets_spreadsheet_id: spreadsheetId })
      .eq("id", data.businessId);
    if (error) throw error;

    return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, created: true };
  });

// ---------- Mirror a single row change ----------
const mirrorInput = z.object({
  businessId: z.string().uuid(),
  table: z.enum(["items", "dealers", "customers", "purchases", "sales", "sale_lines", "expenses", "payments", "stock_adjustments"]),
  action: z.enum(["insert", "update", "delete"]),
  id: z.string().min(1),
  row: z.record(z.string(), z.any()).optional(),
});

function rowToValues(table: BackupTable, row: Record<string, any> | undefined, action: string): any[] {
  const cols = SCHEMAS[table];
  return cols.map((c) => {
    if (c === "status") return action === "delete" ? "DELETED" : "OK";
    const v = row?.[c];
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });
}

async function findRowIndex(spreadsheetId: string, table: BackupTable, id: string): Promise<number | null> {
  const data = await gwFetch(`/spreadsheets/${spreadsheetId}/values/${table}!A:A`);
  const values: string[][] = data.values ?? [];
  for (let i = 1; i < values.length; i++) {
    if (values[i]?.[0] === id) return i + 1;
  }
  return null;
}

export const mirrorToSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => mirrorInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabase } = context;
      const spreadsheetId = await getSpreadsheetIdForBusiness(supabase, data.businessId);
      if (!spreadsheetId) return { skipped: "no_spreadsheet" as const };

      const { table, action, id, row } = data;
      const cols = SCHEMAS[table];
      const lastCol = String.fromCharCode(64 + cols.length);

      if (action === "insert") {
        await gwFetch(
          `/spreadsheets/${spreadsheetId}/values/${table}!A:${lastCol}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          { method: "POST", body: JSON.stringify({ values: [rowToValues(table, row, action)] }) },
        );
      } else {
        const rowIndex = await findRowIndex(spreadsheetId, table, id);
        if (action === "update") {
          if (rowIndex) {
            await gwFetch(
              `/spreadsheets/${spreadsheetId}/values/${table}!A${rowIndex}:${lastCol}${rowIndex}?valueInputOption=RAW`,
              { method: "PUT", body: JSON.stringify({ values: [rowToValues(table, row, action)] }) },
            );
          } else {
            await gwFetch(
              `/spreadsheets/${spreadsheetId}/values/${table}!A:${lastCol}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
              { method: "POST", body: JSON.stringify({ values: [rowToValues(table, row, "insert")] }) },
            );
          }
        } else if (action === "delete") {
          if (rowIndex) {
            await gwFetch(
              `/spreadsheets/${spreadsheetId}/values/${table}!A${rowIndex}:${lastCol}${rowIndex}?valueInputOption=RAW`,
              { method: "PUT", body: JSON.stringify({ values: [rowToValues(table, { id }, "delete")] }) },
            );
          }
        }
      }
      return { ok: true as const };
    } catch (e) {
      console.error("[mirrorToSheets]", (e as Error).message);
      return { ok: false as const, error: (e as Error).message };
    }
  });
