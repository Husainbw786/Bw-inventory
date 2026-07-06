import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, findCustomer, findItem, itemLabel, billTotal, taxableBase, gstAmount, gstSplit, gstRateSummary, billNoLabel, type Sale } from "./store";

type DB = {
  shop: { name: string; address: string; phone: string; gstin?: string };
  customers: any[];
  items: any[];
};

type RGB = [number, number, number];
const BLUE: RGB = [79, 111, 219];
const BLUE_HEAD: RGB = [108, 140, 222];
const BLUE_LT: RGB = [219, 227, 248];
const GREY: RGB = [238, 238, 238];
const INK: RGB = [20, 20, 20];
const LINE: RGB = [120, 120, 120];
const FAINT: RGB = [90, 90, 90];

// jsPDF's built-in fonts don't contain the ₹ glyph — "Rs." renders cleanly.
const money = (n: number) =>
  "Rs. " +
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ---- number to words (Indian system) ----
function intToWords(numIn: number): string {
  let num = Math.floor(Math.abs(numIn));
  if (num === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""));
  const three = (n: number) => {
    const h = Math.floor(n / 100), r = n % 100;
    return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
  };
  let res = "";
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) res += two(crore) + " Crore ";
  if (lakh) res += two(lakh) + " Lakh ";
  if (thousand) res += two(thousand) + " Thousand ";
  if (num) res += three(num);
  return res.trim();
}
function rupeesInWords(amount: number): string {
  const r = Math.floor(amount);
  const p = Math.round((amount - r) * 100);
  let s = intToWords(r) + " Rupees";
  if (p > 0) s += " and " + intToWords(p) + " Paise";
  return (s + " Only").toUpperCase();
}

function buildDoc(db: DB, sale: Sale) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 28;
  const right = pageW - M;
  const fullW = right - M;

  const customer = findCustomer(db as any, sale.customerId);
  const base = taxableBase(sale);
  const gst = gstAmount(sale);
  const split = gstSplit(sale, db.shop.gstin, customer?.gstin);
  const total = billTotal(sale);
  const roundedTotal = Math.round(total);
  const roundOff = roundedTotal - total;
  const totalQty = sale.lines.reduce((a, l) => a + l.qty, 0);
  const invNo = billNoLabel(sale);

  doc.setLineWidth(0.6);

  // ===== Header: Tax Invoice | LOGO =====
  const hY = M;
  const hH = 64;
  const midX = M + fullW * 0.56;
  doc.setFillColor(...GREY);
  doc.rect(midX, hY, right - midX, hH, "F");
  doc.setDrawColor(...LINE);
  doc.rect(M, hY, fullW, hH);
  doc.line(midX, hY, midX, hY + hH);
  doc.setTextColor(...BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Tax Invoice", M + (midX - M) / 2, hY + hH / 2 + 9, { align: "center" });
  doc.setTextColor(...INK);
  doc.setFontSize(20);
  doc.text("LOGO", midX + (right - midX) / 2, hY + hH / 2 + 7, { align: "center" });

  const lbl = (text: string, value: string, x: number, yy: number, opts: { bold?: boolean; size?: number; valueBold?: boolean } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 8.5);
    doc.setTextColor(...INK);
    if (value) {
      doc.text(text, x, yy);
      const w = doc.getTextWidth(text);
      doc.setFont("helvetica", opts.valueBold ? "bold" : "normal");
      doc.text(value, x + w + 3, yy);
    } else {
      doc.text(text, x, yy);
    }
  };

  // ===== Seller + invoice meta =====
  let y = hY + hH;
  const sH = 96;
  const sellerR = M + fullW * 0.42;
  const metaMid = sellerR + (right - sellerR) / 2;
  doc.rect(M, y, fullW, sH);
  doc.line(sellerR, y, sellerR, y + sH);
  doc.line(metaMid, y, metaMid, y + sH);

  // seller (left)
  let sy = y + 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(db.shop.name || "COMPANY NAME", M + 6, sy); sy += 13;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  if (db.shop.address) {
    const wrapped = doc.splitTextToSize(String(db.shop.address), sellerR - M - 12);
    doc.text(wrapped, M + 6, sy); sy += wrapped.length * 11;
  } else { lbl("STREET ADDRESS:", "", M + 6, sy); sy += 12; }
  lbl("GSTIN NO:", db.shop.gstin || "", M + 6, sy); sy += 12;
  lbl("EMAIL ADDRESS:", "", M + 6, sy); sy += 12;
  lbl("PHONE NO:", db.shop.phone || "", M + 6, sy);

  // meta (two sub-columns)
  const metaLeft: [string, string][] = [
    ["Invoice No:", invNo],
    ["Due Date:", ""],
    ["Suppliers Ref:", ""],
    ["Reference No:", ""],
    ["E-way Bill No:", ""],
    ["Transporter:", ""],
    ["Mode of payment:", ""],
  ];
  const metaRight: [string, string][] = [
    ["Date:", fmtDate(sale.date)],
    ["Destination:", ""],
    ["Order No:", ""],
    ["Vehicle No:", ""],
    ["Driver M.No:", ""],
  ];
  let my = y + 13;
  for (const [k, v] of metaLeft) { lbl(k, v, sellerR + 5, my); my += 12.5; }
  my = y + 13;
  for (const [k, v] of metaRight) { lbl(k, v, metaMid + 5, my); my += 12.5; }

  // ===== Buyer + terms =====
  y += sH;
  const bH = 86;
  const buyerR = M + fullW * 0.52;
  doc.setFillColor(...BLUE_LT);
  doc.rect(buyerR, y, right - buyerR, bH, "F");
  doc.rect(M, y, fullW, bH);
  doc.line(buyerR, y, buyerR, y + bH);

  let by = y + 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text("BUYER DETAILS", M + 6, by); by += 14;
  doc.setFontSize(9.5);
  doc.text(customer?.name ?? "PARTY / COMPANY NAME", M + 6, by); by += 13;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  if (customer?.address) {
    const wrapped = doc.splitTextToSize(String(customer.address), buyerR - M - 12);
    doc.text(wrapped, M + 6, by); by += wrapped.length * 11;
  } else { lbl("STREET ADDRESS:", "", M + 6, by); by += 12; }
  lbl("GSTIN NO:", customer?.gstin || "", M + 6, by); by += 12;
  lbl("PHONE NO:", customer?.phone || "", M + 6, by);
  // terms
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK);
  doc.text("TERMS AND CONDITIONS:", buyerR + 6, y + 14);

  // ===== Items table =====
  y += bH;
  const rows = sale.lines.map((l, i) => {
    const it = findItem(db as any, l.itemId);
    return [
      String(i + 1),
      it ? itemLabel(it) : "—",
      it?.hsn ?? "",
      String(l.qty),
      it?.unit ?? "",
      money(l.rate),
      money(l.qty * l.rate),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["SL NO", "ITEM / DESCRIPTION", "HSN", "QUANTITY", "UNIT", "PRICE/UNIT", "AMOUNT"]],
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: BLUE_HEAD, textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 8.5 },
    alternateRowStyles: { fillColor: BLUE_LT },
    columnStyles: {
      0: { cellWidth: 38, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 46, halign: "center" },
      3: { cellWidth: 58, halign: "center" },
      4: { cellWidth: 48, halign: "center" },
      5: { cellWidth: 70, halign: "right" },
      6: { cellWidth: 82, halign: "right" },
    },
  });

  let endY = (doc as any).lastAutoTable.finalY;

  // ===== Totals: words (left) + amounts (right) =====
  const colSplit = M + fullW * 0.52;
  const totalsTop = endY;

  // right amount stack
  let ry = totalsTop;
  const rowH = 18;
  const totRow = (label: string, value: string, opt: { blue?: boolean; fill?: boolean; bold?: boolean } = {}) => {
    const x = colSplit;
    const w = right - colSplit;
    const labelW = w * 0.52;
    if (opt.blue) { doc.setFillColor(...BLUE); doc.rect(x, ry, w, rowH, "F"); }
    else if (opt.fill) { doc.setFillColor(...BLUE_LT); doc.rect(x, ry, labelW, rowH, "F"); }
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4);
    doc.rect(x, ry, labelW, rowH);
    doc.rect(x + labelW, ry, w - labelW, rowH);
    doc.setTextColor(...(opt.blue ? ([255, 255, 255] as RGB) : INK));
    doc.setFont("helvetica", opt.blue || opt.bold ? "bold" : "normal");
    doc.setFontSize(opt.blue ? 11 : 9);
    doc.text(label, x + 6, ry + rowH / 2 + 3);
    doc.text(value, right - 6, ry + rowH / 2 + 3, { align: "right" });
    doc.setTextColor(...INK);
    ry += rowH;
  };

  totRow("Total Qty", String(totalQty), { fill: true });
  totRow("Sub Total", money(base), { fill: true, bold: true });
  if (gst > 0) {
    const uniform = gstRateSummary(sale);
    const pct = (n: number) => (uniform != null && uniform > 0 ? ` (${n}%)` : "");
    if (split.inter) {
      totRow(`Output IGST${pct(uniform ?? 0)}`, money(split.igst), { fill: true });
    } else {
      totRow(`Output CGST${pct((uniform ?? 0) / 2)}`, money(split.cgst), { fill: true });
      totRow(`Output SGST${pct((uniform ?? 0) / 2)}`, money(split.sgst), { fill: true });
    }
    totRow("Total Amount", money(total), { fill: true });
    totRow("Round Off", money(roundOff), { fill: true });
  } else {
    totRow("Round Off", money(roundOff), { fill: true });
  }
  totRow("TOTAL", money(roundedTotal), { blue: true });

  // left words
  let wy = totalsTop + 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
  if (gst > 0) {
    doc.setFont("helvetica", "bold"); doc.text("TAX AMOUNT IN WORDS:", M, wy); wy += 11;
    doc.setFont("helvetica", "normal");
    const tw = doc.splitTextToSize(rupeesInWords(gst), colSplit - M - 8);
    doc.text(tw, M, wy); wy += tw.length * 11 + 8;
  }
  doc.setFont("helvetica", "bold"); doc.text("TOTAL AMOUNT IN WORDS:", M, wy); wy += 11;
  doc.setFont("helvetica", "normal");
  const aw = doc.splitTextToSize(rupeesInWords(roundedTotal), colSplit - M - 8);
  doc.text(aw, M, wy); wy += aw.length * 11;

  // ===== Declaration + footer =====
  let decY = Math.max(ry, wy) + 22;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text("DECLARATION:", M, decY); decY += 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const dec = doc.splitTextToSize(
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    fullW,
  );
  doc.text(dec, M, decY); decY += dec.length * 10 + 12;

  doc.setDrawColor(...LINE); doc.setLineWidth(0.5);
  doc.line(M, decY, right, decY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...FAINT);
  doc.text("This is a Computer Generated Invoice", pageW / 2, decY + 14, { align: "center" });

  // outer border around the whole invoice
  doc.setDrawColor(...LINE); doc.setLineWidth(1.1);
  doc.rect(M, hY, fullW, (decY + 22) - hY);

  return doc;
}

// Raw base64 (no data-URI prefix) for sending the invoice through APIs.
export function billPdfBase64(db: DB, sale: Sale): string {
  const uri = buildDoc(db, sale).output("datauristring");
  return uri.slice(uri.indexOf("base64,") + "base64,".length);
}

export function downloadBillPdf(db: DB, sale: Sale) {
  const doc = buildDoc(db, sale);
  const customer = findCustomer(db as any, sale.customerId);
  const name = (customer?.name ?? "bill").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`invoice-${name}-${billNoLabel(sale).replace("#", "")}.pdf`);
}

export function printBillPdf(db: DB, sale: Sale) {
  const doc = buildDoc(db, sale);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  const w = window.open(blobUrl, "_blank");
  if (!w) {
    downloadBillPdf(db, sale);
  }
}
