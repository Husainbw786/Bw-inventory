// Bill share chooser — clear, labelled options instead of mystery icons.
// Shared by the sales list and the bill composer's "saved" banner.
import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDB, fmtINR, findCustomer, billPayable, billNoLabel, type Sale } from "@/lib/store";
import { downloadBillPdf, printBillPdf } from "@/lib/billPdf";
import { waStatus } from "@/lib/whatsapp.functions";
import { sendBillOnWhatsApp } from "@/lib/whatsapp";
import { useBusiness } from "@/lib/business";
import { toneStyle, type PeTone } from "@/components/ui/pe";
import { MessageCircle, Download, Printer, Send, Eye, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Is this business's WhatsApp connected? Drives the auto-send toggle and the
// "send via connected WhatsApp" share option.
export function useWaConnected() {
  const { current } = useBusiness();
  const bid = current?.id ?? null;
  const q = useQuery({
    queryKey: ["wa-status", bid],
    queryFn: () => waStatus({ data: { businessId: bid! } }),
    enabled: !!bid,
    staleTime: 120_000,
    retry: false,
  });
  return { connected: !!q.data?.connected, businessId: bid };
}

export function ShareSheet({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [db] = useDB();
  const navigate = useNavigate();
  const { connected: waConnected, businessId } = useWaConnected();
  if (!sale) return null;

  const cust = findCustomer(db, sale.customerId);
  const total = billPayable(sale);
  const phone = (cust?.phone ?? "").replace(/\D/g, "");
  const waNumber = phone.length === 10 ? `91${phone}` : phone;
  const shareMsg = `Hi ${cust?.name ?? ""}, your bill ${billNoLabel(sale)} for ${fmtINR(total)}. Thank you!`;

  const options = [
    ...(waConnected && businessId
      ? [
          {
            icon: Send,
            tone: "good" as PeTone,
            primary: true,
            title: "Send PDF automatically",
            body: cust?.phone
              ? `Sends the invoice PDF to ${cust.name} from your connected WhatsApp.`
              : "Add a phone number to this customer first.",
            onClick: () => {
              if (!cust?.phone) {
                toast.error("Add a phone number to this customer first");
                return;
              }
              const t = toast.loading("Sending bill on WhatsApp…");
              sendBillOnWhatsApp(db, sale, businessId).then(
                () => toast.success("Bill sent on WhatsApp", { id: t }),
                (e) => toast.error(`WhatsApp send failed — ${(e as Error).message}`, { id: t }),
              );
              onClose();
            },
          },
        ]
      : []),
    {
      icon: MessageCircle,
      tone: "good" as PeTone,
      primary: !(waConnected && businessId),
      title: "Send on WhatsApp",
      body: cust?.name
        ? `Opens WhatsApp with the bill ready to send to ${cust.name}.`
        : "Opens WhatsApp with the bill ready to send.",
      onClick: () => {
        if (!waNumber) {
          toast.error("Add a phone number to this customer first");
          return;
        }
        window.open(
          `https://wa.me/${waNumber}?text=${encodeURIComponent(shareMsg)}`,
          "_blank",
          "noopener,noreferrer",
        );
        onClose();
      },
    },
    {
      icon: Download,
      tone: "info" as PeTone,
      primary: false,
      title: "Download as PDF",
      body: "Save the bill to your phone or computer.",
      onClick: () => {
        downloadBillPdf(db, sale);
        onClose();
      },
    },
    {
      icon: Printer,
      tone: "neutral" as PeTone,
      primary: false,
      title: "Print a paper copy",
      body: "Send the bill to a connected printer.",
      onClick: () => {
        printBillPdf(db, sale);
        onClose();
      },
    },
  ];

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send this bill</DialogTitle>
          <p className="text-sm text-[color:var(--pe-ink-3)]">
            Bill {fmtINR(total)} · {cust?.name ?? "—"}
          </p>
        </DialogHeader>
        <div className="grid gap-3">
          {options.map((o) => {
            const c = toneStyle(o.tone);
            const Icon = o.icon;
            return (
              <button
                key={o.title}
                onClick={o.onClick}
                className="pe-card-hover flex items-center gap-4 text-left w-full rounded-2xl p-4"
                style={{
                  border: o.primary
                    ? "1px solid var(--pe-green-soft-2)"
                    : "1px solid var(--pe-line)",
                  background: o.primary ? "var(--pe-green-soft)" : "var(--pe-surface)",
                }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    background: o.primary ? "#fff" : c.bg,
                    color: c.fg,
                  }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16.5px] font-bold text-[color:var(--pe-ink)] tracking-[-0.02em]">
                    {o.title}
                  </span>
                  <span className="block text-[13.5px] text-[color:var(--pe-ink-3)] mt-0.5 leading-snug">
                    {o.body}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-[color:var(--pe-ink-3)] shrink-0" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate({ to: "/bills/$id", params: { id: sale.id } });
          }}
          className="mt-1 w-full inline-flex items-center justify-center gap-2 text-[color:var(--pe-green)] font-semibold text-sm py-1"
        >
          <Eye className="h-[18px] w-[18px]" /> Preview the bill first
        </button>
      </DialogContent>
    </Dialog>
  );
}
