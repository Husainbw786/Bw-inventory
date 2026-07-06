// The pending database migrations, bundled as text so an admin can copy-paste
// them into the Supabase SQL editor straight from the in-app upgrade banner.
// Order matters: khata/bill-no/stock first, then GST fields, then the
// payment↔purchase link (needs the payments table).
import khataSql from "../../supabase/migrations/20260705120000_payments_billno_stock_adjustments.sql?raw";
import gstSql from "../../supabase/migrations/20260705130000_gst_invoicing.sql?raw";
import purchaseLinkSql from "../../supabase/migrations/20260706120000_payment_purchase_link.sql?raw";
import waSessionSql from "../../supabase/migrations/20260707100000_whatsapp_session.sql?raw";

// Only the segments the connected DB is missing (per store.ts schemaFlags) —
// re-running an already-applied segment fails on its CREATE TABLE, so the
// banner must never hand out the full history to a partially-upgraded DB.
export function pendingUpgradeSql(flags: { khata: boolean; gst: boolean; purchaseLink: boolean; waSession: boolean }) {
  const parts: string[] = [];
  if (!flags.khata) parts.push(khataSql);
  if (!flags.gst) parts.push(gstSql);
  if (!flags.purchaseLink) parts.push(purchaseLinkSql);
  if (!flags.waSession) parts.push(waSessionSql);
  return parts.join("\n\n");
}

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
export const SQL_EDITOR_URL = projectId
  ? `https://supabase.com/dashboard/project/${projectId}/sql/new`
  : "https://supabase.com/dashboard";
