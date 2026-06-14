import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBusiness, type Role } from "@/lib/business";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createInvite } from "@/lib/invites.functions";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Members — BW Inventory" }] }),
  component: MembersPage,
});

type Row = { user_id: string; display_name: string; role: Role };
type Invite = { id: string; email: string; role: Role; token: string; expires_at: string; accepted_at: string | null };

function MembersPage() {
  const { role, current, refresh: refreshBusiness } = useBusiness();
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("editor");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (role && role !== "admin") nav({ to: "/" });
  }, [role, nav]);

  const load = React.useCallback(async () => {
    if (!current) return;
    setLoading(true);
    const [{ data: members }, { data: inv }] = await Promise.all([
      supabase.from("business_members").select("user_id, role").eq("business_id", current.id),
      supabase.from("business_invites").select("id, email, role, token, expires_at, accepted_at").eq("business_id", current.id).order("created_at", { ascending: false }),
    ]);
    const ids = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    setRows((members ?? []).map((m: any) => ({
      user_id: m.user_id,
      display_name: nameOf.get(m.user_id) ?? "Unknown",
      role: m.role,
    })));
    setInvites((inv ?? []) as Invite[]);
    setLoading(false);
  }, [current?.id]);

  React.useEffect(() => { void load(); }, [load]);

  const setMemberRole = async (uid: string, newRole: Role) => {
    if (!current) return;
    const { error } = await supabase
      .from("business_members")
      .update({ role: newRole })
      .eq("business_id", current.id)
      .eq("user_id", uid);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    void load();
  };

  const removeMember = async (uid: string, name: string) => {
    if (!current) return;
    if (!confirm(`Remove ${name} from this business?`)) return;
    const { error } = await supabase
      .from("business_members").delete()
      .eq("business_id", current.id).eq("user_id", uid);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    void load();
  };

  const sendInvite = async () => {
    if (!current) return;
    if (!inviteEmail.trim()) return toast.error("Enter an email");
    setBusy(true);
    try {
      const { token } = await createInvite({ data: { businessId: current.id, email: inviteEmail.trim(), role: inviteRole } });
      const url = `${window.location.origin}/invite/${token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Invite link copied", { description: url });
      setInviteEmail("");
      void load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Copied", { description: url }));
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from("business_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  if (role !== "admin") return null;

  return (
    <div>
      <PageHeader title="Members" subtitle={current ? `Manage who can access "${current.name}"` : ""} />

      <Card className="p-4 grid gap-3 mb-6">
        <Label className="text-sm font-medium">Invite by email</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input type="email" placeholder="person@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="h-10" />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
            <SelectTrigger className="h-10 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={sendInvite} disabled={busy} className="h-10">{busy ? "…" : "Create invite"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">A link is copied to your clipboard — share it with the person. They must sign in with the same email to accept.</p>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => {
            const isMe = r.user_id === user?.id;
            return (
              <Card key={r.user_id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.display_name} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.role}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={r.role} onValueChange={(v) => setMemberRole(r.user_id, v as Role)} disabled={isMe}>
                    <SelectTrigger className="w-24 sm:w-28 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isMe && (
                    <Button variant="destructive" size="sm" onClick={() => removeMember(r.user_id, r.display_name)}>Remove</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {invites.filter((i) => !i.accepted_at).length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Pending invites</h2>
          <div className="grid gap-2">
            {invites.filter((i) => !i.accepted_at).map((i) => (
              <Card key={i.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{i.email}</div>
                  <div className="text-xs text-muted-foreground capitalize">{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyInvite(i.token)}><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => revokeInvite(i.id)}>Revoke</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
