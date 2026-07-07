// Client-side glue for the OpenWA integration: build the invoice PDF and hand
// it to the server function. Callers treat this like the Sheets mirror — it
// must never block or fail the sale save; surface the outcome via toasts only.
import { supabase } from "@/integrations/supabase/client";
import { billPdfBase64 } from "./billPdf";
import { billNoLabel, billPayable, findCustomer, fmtINR, type DB, type Sale } from "./store";
import { waSendBillPdf } from "./whatsapp.functions";

// Bill numbers are assigned by a DB trigger after insert, so a just-created
// bill doesn't have one in memory yet — read it back before printing the PDF.
async function resolveBillNo(sale: Sale): Promise<number | null> {
  if (!sale.isBill || sale.billNo != null) return sale.billNo ?? null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await supabase.from("sales").select("bill_no").eq("id", sale.id).maybeSingle();
    if (data?.bill_no != null) return Number(data.bill_no);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

export async function sendBillOnWhatsApp(db: DB, sale: Sale, businessId: string): Promise<void> {
  const customer = findCustomer(db, sale.customerId);
  const phone = customer?.phone?.trim();
  if (!phone) throw new Error("Customer has no phone number");

  const withNo: Sale = { ...sale, billNo: await resolveBillNo(sale) };
  const label = billNoLabel(withNo);
  const name = (customer?.name ?? "bill").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  await waSendBillPdf({
    data: {
      businessId,
      phone,
      base64: billPdfBase64(db, withNo),
      filename: `invoice-${name}-${label.replace("#", "")}.pdf`,
      caption: `Hi ${customer?.name ?? ""}, your bill ${label} for ${fmtINR(billPayable(withNo))}. Thank you!`,
    },
  });
}
