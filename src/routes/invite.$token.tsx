import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import { acceptInvite } from "@/lib/invites.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite — BW Inventory" }] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const { session, loading } = useAuth();
  const { refresh, switchTo } = useBusiness();
  const nav = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const { businessId } = await acceptInvite({ data: { token } });
      await refresh();
      switchTo(businessId);
      toast.success("Joined business");
      nav({ to: "/" });
    } catch (e: any) {
      setError(e.message ?? "Failed to accept invite");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Business invite</CardTitle>
          <p className="text-center text-sm text-muted-foreground">You've been invited to join a business on BW Inventory.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!session ? (
            <>
              <p className="text-sm">Sign in first to accept this invite.</p>
              <Button onClick={() => { sessionStorage.setItem("postLoginInvite", token); nav({ to: "/auth" }); }}>
                Sign in to accept
              </Button>
            </>
          ) : (
            <>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={accept} disabled={busy}>{busy ? "Accepting…" : "Accept invite"}</Button>
              <Button variant="outline" onClick={() => nav({ to: "/" })}>Cancel</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
