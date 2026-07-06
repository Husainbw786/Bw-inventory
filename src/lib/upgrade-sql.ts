// The pending database migrations, bundled as text so an admin can copy-paste
// them into the Supabase SQL editor straight from the in-app upgrade banner.
// Order matters: khata/bill-no/stock first, then GST fields.
import khataSql from "../../supabase/migrations/20260705120000_payments_billno_stock_adjustments.sql?raw";
import gstSql from "../../supabase/migrations/20260705130000_gst_invoicing.sql?raw";

export const UPGRADE_SQL = `${khataSql}\n\n${gstSql}`;

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
export const SQL_EDITOR_URL = projectId
  ? `https://supabase.com/dashboard/project/${projectId}/sql/new`
  : "https://supabase.com/dashboard";
