import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { toast } from "sonner";
import { ensureBackupSpreadsheet } from "@/lib/sheets.functions";
import { waStatus, waConnect, waQr, waDisconnect } from "@/lib/whatsapp.functions";
import { PeStatusPill } from "@/components/ui/pe";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";
import { isValidGstin } from "@/lib/store";

export const Route = createFileRoute("/business/settings")({
  head: () => ({ meta: [{ title: "Business settings — BW Inventory" }] }),
  component: BusinessSettingsPage,
});

function BusinessSettingsPage() {
  const { current, role, refresh } = useBusiness();
  const nav = useNavigate();
  const [name, setName] = React.useState(current?.name ?? "");
  const [phone, setPhone] = React.useState(current?.phone ?? "");
  const [address, setAddress] = React.useState(current?.address ?? "");
  const [gstin, setGstin] = React.useState(current?.gstin ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setName(current?.name ?? "");
    setPhone(current?.phone ?? "");
    setAddress(current?.address ?? "");
    setGstin(current?.gstin ?? "");
  }, [current?.id]);

  if (role !== "admin") {
    return (
      <div>
        <PageHeader title="Business settings" subtitle="Admin only." />
        <p className="text-sm text-muted-foreground">Only admins of this business can change these settings.</p>
      </div>
    );
  }
  if (!current) return null;

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (name.trim().length > 80) return toast.error("Name too long");
    if (!isValidPhone(phone.trim())) return toast.error("Enter a valid phone (7–15 digits)");
    const g = gstin.trim().toUpperCase();
    if (g && !isValidGstin(g)) return toast.error("GSTIN must be 15 characters starting with a 2-digit state code");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("businesses")
        .update({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, gstin: g || null })
        .eq("id", current.id);
      if (error) throw error;
      await refresh();
      toast.success("Saved");
    } catch (e: any) {
      toast.error(
        e?.code === "PGRST204" || e?.code === "42703"
          ? "Database upgrade pending — apply the latest Supabase migrations to save GSTIN."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${current.name}"? This permanently removes all its items, sales, purchases, and expenses. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("businesses").delete().eq("id", current.id);
      if (error) throw error;
      toast.success("Business deleted");
      if (typeof window !== "undefined") window.localStorage.removeItem("activeBusinessId");
      await refresh();
      nav({ to: "/" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Business settings" subtitle="Name, contact, and backup." />
      <Card className="p-4 grid gap-3">
        <div className="grid gap-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
        <div className="grid gap-1.5"><Label>Phone</Label><PhoneInput value={phone} onValueChange={setPhone} /></div>
        <div className="grid gap-1.5"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></div>
        <div className="grid gap-1.5">
          <Label>GSTIN</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="e.g. 27ABCDE1234F1Z5" />
          <p className="text-xs text-muted-foreground">Printed on invoices. The first 2 digits (state code) decide CGST/SGST vs IGST on bills.</p>
        </div>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </Card>

      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Google Sheets backup</h2>
        <Button
          variant="outline"
          onClick={async () => {
            const t = toast.loading("Setting up Google Sheets backup…");
            try {
              const r = await ensureBackupSpreadsheet({ data: { businessId: current.id } });
              toast.success(r.created ? "Backup sheet created" : "Backup sheet already set up", {
                id: t, description: r.url,
                action: { label: "Open", onClick: () => window.open(r.url, "_blank") },
              });
              await refresh();
            } catch (e) {
              toast.error((e as Error).message, { id: t });
            }
          }}
        >
          {current.sheets_spreadsheet_id ? "Open / re-link backup sheet" : "Initialize Sheets backup"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Creates a Google Sheet that mirrors every record as a safety backup. One sheet per business.
        </p>
      </div>

      <WhatsAppSection businessId={current.id} />

      <div className="mt-8 border-t pt-4">
        <h2 className="text-sm font-semibold text-destructive mb-2">Danger zone</h2>
        <Button variant="destructive" onClick={remove} disabled={busy}>Delete this business</Button>
      </div>
    </div>
  );
}

// Connect the owner's WhatsApp through the OpenWA gateway: QR login, live
// status, disconnect. Sale bills can then be auto-sent to customers.
function WhatsAppSection({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [qrOpen, setQrOpen] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  const statusQ = useQuery({
    queryKey: ["wa-status", businessId],
    queryFn: () => waStatus({ data: { businessId } }),
    staleTime: 30_000,
  });

  const qrQ = useQuery({
    queryKey: ["wa-qr", businessId],
    queryFn: () => waQr({ data: { businessId } }),
    enabled: qrOpen,
    refetchInterval: 4000,
  });

  React.useEffect(() => {
    if (qrOpen && qrQ.data?.status === "ready") {
      setQrOpen(false);
      toast.success("WhatsApp connected");
      qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
    }
  }, [qrOpen, qrQ.data?.status, qc, businessId]);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await waConnect({ data: { businessId } });
      if (r.status === "ready") {
        toast.success("WhatsApp already connected");
        qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
      } else {
        setQrOpen(true);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect WhatsApp? Bills will no longer be auto-sent to customers.")) return;
    try {
      await waDisconnect({ data: { businessId } });
      toast.success("WhatsApp disconnected");
      qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const s = statusQ.data;
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold mb-2">WhatsApp</h2>
      {statusQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Checking connection…</p>
      ) : statusQ.isError ? (
        <p className="text-xs text-destructive">{(statusQ.error as Error).message}</p>
      ) : s?.connected ? (
        <div className="flex items-center gap-3 flex-wrap">
          <PeStatusPill tone="good" label="Connected" />
          <span className="text-sm">{s.pushName ?? "WhatsApp"}{s.phone ? ` · +${s.phone}` : ""}</span>
          <Button variant="outline" size="sm" onClick={disconnect}>Disconnect</Button>
        </div>
      ) : (
        <div className="grid gap-2 justify-items-start">
          <Button variant="outline" onClick={connect} disabled={connecting}>
            {connecting ? "Starting…" : "Connect WhatsApp"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Link your WhatsApp by scanning a QR code. Once connected, new bills can be sent to
            customers automatically.
          </p>
        </div>
      )}

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Scan with WhatsApp</DialogTitle></DialogHeader>
          <div className="grid gap-3 justify-items-center py-2">
            {qrQ.data?.status === "failed" ? (
              <>
                <p className="text-sm text-destructive">Connection failed. Try again.</p>
                <Button onClick={connect} disabled={connecting}>{connecting ? "Starting…" : "Try again"}</Button>
              </>
            ) : qrQ.data?.qrCode ? (
              <>
                <img src={qrQ.data.qrCode} alt="WhatsApp QR code" className="w-56 h-56 rounded-lg border" />
                <p className="text-xs text-muted-foreground text-center">
                  On your phone: WhatsApp → Settings → Linked devices → Link a device, then scan this code.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8">
                {qrQ.data?.status === "authenticating" ? "Linking your WhatsApp…" : "Preparing QR code…"}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
