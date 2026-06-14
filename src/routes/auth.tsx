import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — BW Inventory" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = React.useState<"login" | "signup">("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");

  const sendReset = async () => {
    if (!forgotEmail) return toast.error("Enter your email");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Reset link sent. Check your email.");
      setForgotOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!loading && session) {
      const pending = typeof window !== "undefined" ? sessionStorage.getItem("postLoginInvite") : null;
      if (pending) {
        sessionStorage.removeItem("postLoginInvite");
        nav({ to: "/invite/$token", params: { token: pending } });
      } else {
        nav({ to: "/" });
      }
    }
  }, [loading, session, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setTab("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">BW Inventory</CardTitle>
          <p className="text-center text-sm text-muted-foreground">Run your shop. Switch between multiple businesses.</p>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value={tab}>
              <form onSubmit={submit} className="grid gap-3 mt-3">
                {tab === "signup" && (
                  <div className="grid gap-1.5">
                    <Label>Your name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Father" className="h-11" />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Password</Label>
                    {tab === "login" && (
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input type="password" required minLength={1} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
                </div>
                <Button type="submit" disabled={busy} className="h-11 mt-2">
                  {busy ? "Please wait…" : tab === "signup" ? "Create account" : "Sign in"}
                </Button>
              </form>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or</span></div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: `${window.location.origin}/` },
                    });
                    if (error) throw error;
                    // On success the browser redirects to Google, so we leave `busy` set.
                  } catch (err: any) {
                    toast.error(err.message ?? "Google sign-in failed");
                    setBusy(false);
                  }
                }}
                className="h-11 w-full"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Label>Email</Label>
            <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="h-11" />
            <Button onClick={sendReset} disabled={busy} className="h-11">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
