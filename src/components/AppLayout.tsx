import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home, Package, ShoppingCart, TrendingDown, Wallet, Users, BarChart3,
  ShieldCheck, Settings, Menu, ChevronDown, ChevronRight, Plus, Building2, LogOut,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth, signOut } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import { useDB, schemaUpgradePending, schemaFlags } from "@/lib/store";
import { pendingUpgradeSql, SQL_EDITOR_URL } from "@/lib/upgrade-sql";
import { toast } from "sonner";
import { TweaksPanel } from "@/components/TweaksPanel";
import { AppearanceMenu } from "@/lib/theme";

const NAV = [
  { to: "/",                  label: "Home",      icon: Home,         exact: true },
  { to: "/sales",             label: "Sales",     icon: ShoppingCart },
  { to: "/items",             label: "Items",     icon: Package },
  { to: "/purchases",         label: "Purchases", icon: TrendingDown },
  { to: "/expenses",          label: "Expenses",  icon: Wallet },
  { to: "/directory",         label: "Directory", icon: Users },
  { to: "/reports",           label: "Reports",   icon: BarChart3 },
  { to: "/members",           label: "Members",   icon: ShieldCheck, adminOnly: true },
  { to: "/business/settings", label: "Settings",  icon: Settings,    adminOnly: true },
] as const;

// 2 tabs left + center FAB + 2 tabs right (Items, More) keeps the "+" perfectly
// centered and all tab slots equal width. Reports lives in the "More" sheet.
const MOBILE_PRIMARY = ["/", "/sales", "/items"] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { displayName } = useAuth();
  const { current, memberships, role, switchTo } = useBusiness();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const items = NAV.filter((n) => !("adminOnly" in n && n.adminOnly) || role === "admin");
  const isActive = (to: string, exact?: boolean) => (exact ? path === to : path === to || path.startsWith(to + "/"));
  const initials = (current?.name ?? "PE").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const BusinessSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 hover:opacity-80 min-w-0 text-left">
        <span
          className="inline-flex items-center justify-center font-extrabold text-white tracking-[-0.04em] shrink-0"
          style={{ width: 38, height: 38, borderRadius: 11, background: "var(--pe-green)", fontSize: 16 }}
        >{initials}</span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold tracking-[-0.02em] text-[color:var(--pe-ink)] truncate">{current?.name ?? "BW Inventory"}</span>
          <span className="block text-[11px] text-[color:var(--pe-ink-3)] truncate">{role ?? "Owner"}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-[color:var(--pe-ink-3)] shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Your businesses</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.business.id}
            onClick={() => switchTo(m.business.id)}
            className={cn(current?.id === m.business.id && "bg-accent")}
          >
            <Building2 className="h-4 w-4 mr-2" />
            <div className="flex-1 truncate">
              <div className="truncate">{m.business.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/business/new" className="flex items-center">
            <Plus className="h-4 w-4 mr-2" /> New business
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-dvh print:hidden"
        style={{ background: "var(--pe-surface)", borderRight: "1px solid var(--pe-line)", padding: "18px 14px" }}
      >
        <div className="px-1 pb-4">{BusinessSwitcher}</div>
        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {items.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.to, "exact" in n ? !!n.exact : false);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-[11px] text-[15px] tracking-[-0.01em] transition-colors",
                  active
                    ? "text-white font-bold"
                    : "text-[color:var(--pe-ink-2)] font-semibold pe-nav-idle",
                )}
                style={active ? { background: "var(--pe-green)" } : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.9} />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div
          className="mt-3 pt-3 flex items-center gap-2 px-1"
          style={{ borderTop: "1px solid var(--pe-line-2)" }}
        >
          <span
            className="inline-flex items-center justify-center font-bold text-sm tracking-[-0.02em] shrink-0"
            style={{ width: 36, height: 36, borderRadius: 12, background: "var(--pe-green-soft)", color: "var(--pe-green)" }}
          >{(displayName || "U").slice(0, 2).toUpperCase()}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[color:var(--pe-ink)] truncate">{displayName || "User"}</div>
            <div className="text-[11px] text-[color:var(--pe-ink-3)] capitalize">{role ?? "Owner"}</div>
          </div>
          <AppearanceMenu />
          <button
            onClick={() => signOut().then(() => (window.location.href = "/auth"))}
            className="text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)] p-1.5"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pe-scroll">
        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-30 print:hidden"
          style={{
            background: "color-mix(in srgb, var(--pe-surface) 92%, transparent)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid var(--pe-line)",
            padding: "12px 16px",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1">{BusinessSwitcher}</div>
            <AppearanceMenu />
            <button
              onClick={() => signOut().then(() => (window.location.href = "/auth"))}
              className="text-[color:var(--pe-ink-3)] hover:text-[color:var(--pe-ink)] p-1.5"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-[1080px] px-4 md:px-11 pt-5 md:pt-10 pb-28 md:pb-16">
          <UpgradeBanner />
          {children}
        </main>
      </div>

      {/* Mobile bottom nav with center FAB */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 print:hidden flex items-center"
        style={{
          background: "color-mix(in srgb, var(--pe-surface) 94%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--pe-line)",
          padding: "8px 6px calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        {MOBILE_PRIMARY.slice(0, 2).map((to) => {
          const n = items.find((x) => x.to === to)!;
          const Icon = n.icon;
          const active = isActive(n.to, "exact" in n ? !!n.exact : false);
          return (
            <Link key={n.to} to={n.to} className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
              style={{ color: active ? "var(--pe-green)" : "var(--pe-ink-3)" }}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
              <span className="text-[11px]" style={{ fontWeight: active ? 750 : 600 }}>{n.label}</span>
            </Link>
          );
        })}
        <Link
          to="/sales"
          search={{ new: true }}
          aria-label="New bill"
          className="shrink-0 mx-1.5 flex items-center justify-center text-white shadow-lg"
          style={{
            width: 52, height: 52, borderRadius: 16, background: "var(--pe-green)",
            boxShadow: "0 6px 18px var(--pe-green-soft-2)",
          }}
        >
          <Plus className="h-[26px] w-[26px]" strokeWidth={2.4} />
        </Link>
        {MOBILE_PRIMARY.slice(2).map((to) => {
          const n = items.find((x) => x.to === to)!;
          const Icon = n.icon;
          const active = isActive(n.to, "exact" in n ? !!n.exact : false);
          return (
            <Link key={n.to} to={n.to} className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
              style={{ color: active ? "var(--pe-green)" : "var(--pe-ink-3)" }}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
              <span className="text-[11px]" style={{ fontWeight: active ? 750 : 600 }}>{n.label}</span>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
              style={{ color: "var(--pe-ink-3)" }}>
              <Menu className="h-[22px] w-[22px]" />
              <span className="text-[11px] font-semibold">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="mt-2 grid gap-2">
              {items.filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.to)).map((n) => {
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--pe-line)] bg-card p-3 pe-card-hover"
                  >
                    <span
                      className="inline-flex items-center justify-center"
                      style={{ width: 40, height: 40, borderRadius: 11, background: "var(--pe-green-soft)", color: "var(--pe-green)" }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 font-semibold text-[color:var(--pe-ink)]">{n.label}</span>
                    <ChevronRight className="h-5 w-5 text-[color:var(--pe-ink-3)]" />
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <TweaksPanel />
    </div>
  );
}

// Backward-compat: routes import { PageHeader } from this file.
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[26px] md:text-[30px] font-extrabold text-[color:var(--pe-ink)] tracking-[-0.035em] leading-[1.05] m-0">{title}</h1>
        {subtitle && <p className="text-sm md:text-[15px] text-[color:var(--pe-ink-3)] mt-1.5 font-medium">{subtitle}</p>}
      </div>
      {action && <div className="flex gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

// Shown to admins while the database is missing the latest migrations: the new
// features (khata, GST, stock adjust) silently no-op until the SQL below runs.
function UpgradeBanner() {
  useDB(); // subscribe so the pending flag re-evaluates after each data fetch
  const { role } = useBusiness();
  const [dismissed, setDismissed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (dismissed || role !== "admin" || !schemaUpgradePending()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pendingUpgradeSql(schemaFlags()));
      setCopied(true);
      toast.success("Upgrade SQL copied — paste it in the Supabase SQL editor and press Run");
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      toast.error("Couldn't copy — open supabase/migrations in the project instead");
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="text-[15px] font-bold text-amber-900">Database upgrade needed</div>
      <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
        Khata, payments, stock adjustment, bill numbers and GST fields are switched off until the
        database is upgraded. Copy the SQL, paste it in the Supabase SQL editor, and press Run —
        the app picks it up automatically.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={copy}
          className="rounded-lg bg-amber-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-amber-700"
        >
          {copied ? "Copied ✓" : "1. Copy upgrade SQL"}
        </button>
        <a
          href={SQL_EDITOR_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-amber-400 px-3.5 py-2 text-[13px] font-semibold text-amber-900 hover:bg-amber-100"
        >
          2. Open SQL editor
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg px-3 py-2 text-[13px] font-medium text-amber-700 hover:bg-amber-100"
        >
          Later
        </button>
      </div>
    </div>
  );
}
