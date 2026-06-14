import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, Receipt, Package, TrendingUp } from "lucide-react";

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
  const [shopName, setShopName] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");

  const isLogin = tab === "login";

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
        // Carry the shop name into onboarding so the user doesn't retype it.
        if (shopName.trim() && typeof window !== "undefined") {
          sessionStorage.setItem("pendingBusinessName", shopName.trim());
        }
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

  const googleSignIn = async () => {
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
  };

  const GoogleIcon = (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 14.1 6 6 14.1 6 24s8.1 18 18 18c10 0 17.5-7.3 17.5-18 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m7.3 14.7 6.6 4.8C15.7 16 19.5 13.6 24 13.6c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 16.3 6 9.7 10.3 7.3 14.7z" />
      <path fill="#4CAF50" d="M24 42c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C8.7 37.6 15.7 42 24 42z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.5 35.9 43.5 30.6 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );

  const features = [
    { icon: Receipt, t: "Bills & payments", s: "Know who has paid and who still owes" },
    { icon: Package, t: "Stock alerts", s: "Get warned before items run out" },
    { icon: TrendingUp, t: "Reports in plain words", s: "See your profit at a glance" },
  ];

  return (
    <div className="min-h-dvh flex items-stretch md:items-center justify-center md:p-7" style={{ background: "var(--pe-bg)" }}>
      <div
        className="w-full md:max-w-[980px] grid grid-cols-1 md:grid-cols-[1.02fr_1fr] overflow-hidden bg-card md:rounded-[28px] md:border md:min-h-[600px]"
        style={{ borderColor: "var(--pe-line)", boxShadow: "0 24px 70px rgba(20,32,29,.14)" }}
      >
        {/* ---------- BRAND PANE (desktop) ---------- */}
        <section
          className="relative hidden md:flex flex-col justify-between text-white overflow-hidden"
          style={{ padding: "44px 42px", background: "linear-gradient(160deg,#0E6B57 0%,#0A4E40 100%)" }}
        >
          <span className="absolute rounded-full pointer-events-none" style={{ width: 320, height: 320, right: -120, top: -120, background: "rgba(255,255,255,.06)" }} />
          <span className="absolute rounded-full pointer-events-none" style={{ width: 240, height: 240, left: -100, bottom: -90, background: "rgba(255,255,255,.05)" }} />

          <div className="relative flex items-center gap-3">
            <span className="flex items-center justify-center font-extrabold" style={{ width: 46, height: 46, borderRadius: 13, background: "#fff", color: "var(--pe-green)", fontSize: 19, letterSpacing: "-0.04em" }}>BW</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 780, letterSpacing: "-0.02em" }}>BW Inventory</div>
              <div style={{ fontSize: 12.5, opacity: 0.72 }}>Run your shop, simply</div>
            </div>
          </div>

          <div className="relative">
            <h1 style={{ fontSize: 31, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12, margin: "0 0 12px", maxWidth: 340 }}>
              Everything your shop needs, in one place.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.82, margin: "0 0 26px", maxWidth: 330 }}>
              Bills, payments, stock and reports — clear enough for anyone on your team to use.
            </p>

            {features.map((f) => {
              const Ic = f.icon;
              return (
                <div key={f.t} className="flex items-center gap-3" style={{ marginBottom: 15 }}>
                  <span className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,.13)" }}>
                    <Ic className="h-5 w-5" />
                  </span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 650 }}>{f.t}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 1 }}>{f.s}</div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between" style={{ marginTop: 24, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 16, padding: "15px 17px", backdropFilter: "blur(4px)" }}>
              <div>
                <div style={{ fontSize: 12.5, opacity: 0.78, fontWeight: 600 }}>Money to collect</div>
                <div style={{ fontSize: 23, fontWeight: 820, letterSpacing: "-0.03em", marginTop: 2 }}>₹12,180</div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, background: "rgba(255,255,255,.16)", padding: "5px 10px", borderRadius: 999 }}>3 customers</span>
            </div>
          </div>

          <div className="relative" style={{ fontSize: 12.5, opacity: 0.6 }}>Switch between multiple businesses anytime.</div>
        </section>

        {/* ---------- FORM PANE ---------- */}
        <section className="flex flex-col justify-center" style={{ padding: "clamp(34px, 5vw, 46px) clamp(24px, 5vw, 48px)" }}>
          {/* mobile logo */}
          <div className="flex md:hidden items-center gap-3" style={{ marginBottom: 30 }}>
            <span className="flex items-center justify-center font-extrabold" style={{ width: 46, height: 46, borderRadius: 13, background: "var(--pe-green)", color: "#fff", fontSize: 19, letterSpacing: "-0.04em" }}>BW</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 780, letterSpacing: "-0.02em", color: "var(--pe-ink)" }}>BW Inventory</div>
              <div style={{ fontSize: 12.5, color: "var(--pe-ink-3)" }}>Run your shop, simply</div>
            </div>
          </div>

          <h2 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 5px", color: "var(--pe-ink)" }}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--pe-ink-3)", margin: "0 0 24px" }}>
            {isLogin ? "Sign in to manage your shop." : "Set up your shop in under a minute."}
          </p>

          {/* tabs */}
          <div className="flex gap-1" style={{ background: "#EFEDE3", borderRadius: 13, padding: 4, marginBottom: 24 }}>
            {(["login", "signup"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className="flex-1 transition-all"
                  style={{
                    padding: "11px 0", border: "none", borderRadius: 9, cursor: "pointer",
                    fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.01em",
                    color: active ? "var(--pe-ink)" : "var(--pe-ink-3)",
                    background: active ? "#fff" : "transparent",
                    boxShadow: active ? "0 1px 5px rgba(0,0,0,.08)" : "none",
                  }}
                >
                  {t === "login" ? "Sign in" : "Create account"}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="grid gap-[17px]">
            {!isLogin && (
              <>
                <div className="grid gap-1.5">
                  <Label>Shop name</Label>
                  <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Pioneer Enterprises" className="h-12 rounded-xl" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Husain" className="h-12 rounded-xl" />
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" className="h-12 rounded-xl" />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                {isLogin && (
                  <button type="button" onClick={() => { setForgotEmail(email); setForgotOpen(true); }} className="text-[13px] font-semibold" style={{ color: "var(--pe-green)" }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  required
                  minLength={1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="h-12 rounded-xl pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-muted"
                  style={{ color: "var(--pe-ink-3)" }}
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 transition disabled:opacity-60"
              style={{ width: "100%", padding: 15, border: "none", borderRadius: 13, cursor: "pointer", fontSize: 16, fontWeight: 750, letterSpacing: "-0.01em", color: "#fff", background: "var(--pe-green)", marginTop: 6 }}
            >
              {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
              {!busy && <ArrowRight className="h-[19px] w-[19px]" strokeWidth={2.2} />}
            </button>
          </form>

          <div className="flex items-center gap-3.5" style={{ margin: "22px 0", color: "var(--pe-ink-3)", fontSize: 13, fontWeight: 600 }}>
            <span className="flex-1 h-px" style={{ background: "var(--pe-line)" }} />
            or
            <span className="flex-1 h-px" style={{ background: "var(--pe-line)" }} />
          </div>

          <button
            type="button"
            onClick={googleSignIn}
            disabled={busy}
            className="flex items-center justify-center gap-3 transition disabled:opacity-60 hover:bg-[color:var(--pe-bg)]"
            style={{ width: "100%", padding: 14, border: "1.5px solid var(--pe-line)", borderRadius: 13, cursor: "pointer", fontSize: 15, fontWeight: 700, color: "var(--pe-ink)", background: "#fff" }}
          >
            {GoogleIcon}
            Continue with Google
          </button>

          <p style={{ fontSize: 12.5, color: "var(--pe-ink-3)", textAlign: "center", marginTop: 26, lineHeight: 1.6 }}>
            By continuing you agree to our Terms &amp; Privacy Policy.
          </p>
        </section>
      </div>

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
