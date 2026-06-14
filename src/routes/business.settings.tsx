import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { toast } from "sonner";
import { ensureBackupSpreadsheet } from "@/lib/sheets.functions";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";

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
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setName(current?.name ?? "");
    setPhone(current?.phone ?? "");
    setAddress(current?.address ?? "");
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
    setBusy(true);
    try {
      const { error } = await supabase
        .from("businesses")
        .update({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null })
        .eq("id", current.id);
      if (error) throw error;
      await refresh();
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message);
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

      <div className="mt-8 border-t pt-4">
        <h2 className="text-sm font-semibold text-destructive mb-2">Danger zone</h2>
        <Button variant="destructive" onClick={remove} disabled={busy}>Delete this business</Button>
      </div>
    </div>
  );
}
