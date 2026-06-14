import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import { toast } from "sonner";
import { PhoneInput, isValidPhone } from "@/components/ui/phone-input";

export const Route = createFileRoute("/business/new")({
  head: () => ({ meta: [{ title: "New business — BW Inventory" }] }),
  component: NewBusinessPage,
});

function NewBusinessPage() {
  const { user } = useAuth();
  const { refresh, switchTo } = useBusiness();
  const nav = useNavigate();
  const [name, setName] = React.useState(() => {
    if (typeof window === "undefined") return "";
    const pending = sessionStorage.getItem("pendingBusinessName") ?? "";
    if (pending) sessionStorage.removeItem("pendingBusinessName");
    return pending;
  });
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) return toast.error("Business name is required");
    if (name.trim().length > 80) return toast.error("Business name too long");
    if (!isValidPhone(phone.trim())) return toast.error("Enter a valid phone (7–15 digits)");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_business", {
        _name: name.trim(),
        _phone: phone.trim() || undefined,
        _address: address.trim() || undefined,
      });
      if (error) throw error;
      const newId = (data as any)?.id;
      await refresh();
      if (newId) switchTo(newId);
      toast.success("Business created");
      nav({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create business");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a business</CardTitle>
          <p className="text-sm text-muted-foreground">You'll be the admin. You can invite others later.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Business name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Motors" maxLength={80} className="h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <PhoneInput value={phone} onValueChange={setPhone} className="h-11" placeholder="e.g. +91 98765 43210" />
            </div>
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="h-11" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => nav({ to: "/" })}>Cancel</Button>
              <Button type="submit" disabled={busy} className="flex-1">{busy ? "Creating…" : "Create"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
