// Khata statement PDF: one party's ledger with running balance, for sharing
// or printing. Same jsPDF stack as bill PDFs (no ₹ glyph in built-in fonts).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, type LedgerEntry, type Person } from "./store";

type Shop = { name: string; address: string; phone: string; gstin?: string };
type RGB = [number, number, number];
const GREEN: RGB = [14, 107, 87];
const INK: RGB = [22, 32, 29];
const FAINT: RGB = [124, 133, 127];
const LINE: RGB = [231, 228, 218];

const money = (n: number) =>
  "Rs. " +
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function downloadStatementPdf(
  shop: Shop,
  kind: "customer" | "dealer",
  party: Person,
  ledger: LedgerEntry[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(shop.name || "Statement", M, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  const shopMeta = [shop.address, shop.phone, shop.gstin ? "GSTIN " + shop.gstin : ""]
    .filter(Boolean)
    .join(" · ");
  if (shopMeta) doc.text(shopMeta, M, 64);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(kind === "dealer" ? "Dealer statement" : "Customer statement", W - M, 50, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text("As of " + fmtDate(new Date().toISOString().slice(0, 10)), W - M, 64, {
    align: "right",
  });

  doc.setDrawColor(...LINE);
  doc.line(M, 76, W - M, 76);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(party.name, M, 96);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  const meta = [party.address, party.phone, party.gstin ? "GSTIN " + party.gstin : ""]
    .filter(Boolean)
    .join(" · ");
  if (meta) doc.text(meta, M, 110);

  let running = 0;
  const body = ledger.map((e) => {
    running += e.debit - e.credit;
    const label =
      e.label +
      (e.payment?.mode ? ` (${e.payment.mode.toUpperCase()})` : "") +
      (e.payment?.notes ? ` — ${e.payment.notes}` : "");
    return [
      fmtDate(e.date),
      label,
      e.debit ? money(e.debit) : "",
      e.credit ? money(e.credit) : "",
      money(running),
    ];
  });
  const balance = running;

  autoTable(doc, {
    startY: 124,
    margin: { left: M, right: M },
    head: [["Date", "Entry", kind === "dealer" ? "Purchase" : "Bill", "Paid", "Balance"]],
    body: body.length ? body : [["", "No entries yet", "", "", ""]],
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: INK,
      cellPadding: 6,
      lineColor: LINE,
      lineWidth: 0.5,
    },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 70 },
      2: { halign: "right", cellWidth: 85 },
      3: { halign: "right", cellWidth: 85 },
      4: { halign: "right", cellWidth: 90 },
    },
    alternateRowStyles: { fillColor: [250, 249, 245] },
  });

  const y =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140) + 22;
  const label =
    balance > 0
      ? kind === "dealer"
        ? "You owe them"
        : "They owe you"
      : balance < 0
        ? "Advance held"
        : "All settled";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(label, W - M - 110, y, { align: "right" });
  doc.setFontSize(13);
  doc.setTextColor(...(balance > 0 ? ([194, 54, 43] as RGB) : GREEN));
  doc.text(money(Math.abs(balance)), W - M, y, { align: "right" });

  const safe =
    party.name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "party";
  doc.save(`statement-${safe}.pdf`);
}
