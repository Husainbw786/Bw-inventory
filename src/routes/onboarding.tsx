import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/lib/business";
import { signOut } from "@/lib/auth";
import { Plus, Mail } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — BW Inventory" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { memberships, loading, refresh } = useBusiness();
  const nav = useNavigate();

  React.useEffect(() => {
    if (!loading && memberships.length > 0) nav({ to: "/" });
  }, [loading, memberships, nav]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Welcome to BW Inventory</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            How would you like to get started?
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Link to="/business/new" className="rounded-lg border p-4 hover:bg-accent flex gap-3 items-start">
            <div className="rounded-md bg-primary/10 p-2 text-primary"><Plus className="h-5 w-5" /></div>
            <div>
              <div className="font-medium">Create a new business</div>
              <div className="text-xs text-muted-foreground">Start with an empty workspace for your own shop.</div>
            </div>
          </Link>
          <div className="rounded-lg border p-4 flex gap-3 items-start">
            <div className="rounded-md bg-primary/10 p-2 text-primary"><Mail className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-medium">I'm waiting for an invite</div>
              <div className="text-xs text-muted-foreground">
                Ask the business admin to invite you by email. Once they share the invite link, open it while signed in to join.
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refresh()}>
                Check again
              </Button>
            </div>
          </div>
          <Button variant="ghost" onClick={() => signOut().then(() => (window.location.href = "/auth"))}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
