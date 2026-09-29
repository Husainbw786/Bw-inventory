import * as React from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Package,
  Receipt,
  TrendingDown,
  Wallet,
  BookOpen,
  ChartColumn,
  ShieldCheck,
  Settings,
  Menu,
  ChevronsUpDown,
  ChevronRight,
  Plus,
  Building2,
  LogOut,
  Search,
  Bell,
  AlertTriangle,
  IndianRupee,
  Check,
  User as UserIcon,
  ArrowDownLeft,
  ArrowUpRight,
  UserPlus,
  X,
  Download,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAuth, signOut } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import { usePwaInstall } from "@/lib/pwa";
import {
  useDB,
  schemaUpgradePending,
  schemaFlags,
  stockOf,
  itemLabel,
  billNoLabel,
  billPayable,
  fmtINR,
  totalReceivable,
} from "@/lib/store";
import { pendingUpgradeSql, SQL_EDITOR_URL } from "@/lib/upgrade-sql";
import { toast } from "sonner";
import { TweaksPanel } from "@/components/TweaksPanel";
import { ACCENTS, useTheme, type Accent } from "@/lib/theme";
import { ini } from "@/components/ui/pe";

type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  adminOnly?: boolean;
  badge?: "low";
};
type NavGroup = { title: string; items: NavItem[] };

// Grouped top navigation (design B). `short` is the label used in the mobile bottom bar.
const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { to: "/", label: "Home", icon: Home, exact: true },
      { to: "/reports", label: "Reports", icon: ChartColumn },
    ],
  },
  {
    title: "Trade",
    items: [
      { to: "/sales", label: "Sales & bills", short: "Sales", icon: Receipt },
      { to: "/purchases", label: "Purchases", icon: TrendingDown },
      { to: "/expenses", label: "Expenses", icon: Wallet },
    ],
  },
  {
    title: "Stock & people",
    items: [
      { to: "/items", label: "Items", icon: Package, badge: "low" },
      { to: "/directory", label: "Directory & khata", short: "Khata", icon: BookOpen },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/members", label: "Members", icon: ShieldCheck, adminOnly: true },
      { to: "/business/settings", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];
const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

// 2 tabs left + center FAB + 2 tabs right (Items, More) keeps the "+" perfectly
// centered and all tab slots equal width. Everything else lives in the "More" sheet.
const MOBILE_PRIMARY = ["/", "/sales", "/items"] as const;

// Pages can replace the mobile top bar with their own dark header (title,
// back button, hero figures — see the Mobile Emerald screens) and hide the
// bottom nav while a full-screen flow (bill composer, quick entry) is open.
type MobileHeaderCtx = {
  el: HTMLDivElement | null;
  setCustom: (on: boolean) => void;
  setHideNav: (on: boolean) => void;
};
const MobileCtx = React.createContext<MobileHeaderCtx>({
  el: null,
  setCustom: () => {},
  setHideNav: () => {},
});
export function MobileHeader({
  children,
  hideNav,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  const { el, setCustom, setHideNav } = React.useContext(MobileCtx);
  React.useLayoutEffect(() => {
    setCustom(true);
    setHideNav(!!hideNav);
    return () => {
      setCustom(false);
      setHideNav(false);
    };
  }, [hideNav, setCustom, setHideNav]);
  if (!el) return null;
  return createPortal(<div className="md:hidden text-white">{children}</div>, el);
}

// Add-menu items behind the mobile "+" (New bill is the primary row above them).
const ADD_MENU: {
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  fg: string;
  go: (nav: ReturnType<typeof useNavigate>) => void;
}[] = [
  {
    label: "New purchase",
    sub: "Stock from a dealer",
    icon: TrendingDown,
    bg: "var(--pe-info-bg)",
    fg: "var(--pe-info)",
    go: (n) => n({ to: "/entry", search: { type: "purchase" } }),
  },
  {
    label: "Add expense",
    sub: "Rent, transport, salary",
    icon: Wallet,
    bg: "var(--pe-warn-bg)",
    fg: "var(--pe-warn)",
    go: (n) => n({ to: "/entry", search: { type: "expense" } }),
  },
  {
    label: "Get payment",
    sub: "Money from a customer",
    icon: ArrowDownLeft,
    bg: "var(--pe-good-bg)",
    fg: "var(--pe-good)",
    go: (n) => n({ to: "/entry", search: { type: "in" } }),
  },
  {
    label: "Pay dealer",
    sub: "Money you paid out",
    icon: ArrowUpRight,
    bg: "var(--pe-bad-bg)",
    fg: "var(--pe-bad)",
    go: (n) => n({ to: "/entry", search: { type: "out" } }),
  },
  {
    label: "Add item",
    sub: "New product to sell",
    icon: Package,
    bg: "var(--pe-green-soft)",
    fg: "var(--pe-green)",
    go: (n) => n({ to: "/items", search: { new: true } }),
  },
  {
    label: "Add party",
    sub: "Customer or dealer",
    icon: UserPlus,
    bg: "#F0EEE5",
    fg: "var(--pe-ink-2)",
    go: (n) => n({ to: "/directory", search: { new: true } }),
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { displayName } = useAuth();
  const { current, memberships, role, switchTo } = useBusiness();
  const [db] = useDB();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const { canInstall, install } = usePwaInstall();
  const [addOpen, setAddOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const navigate = useNavigate();
  const [slotEl, setSlotEl] = React.useState<HTMLDivElement | null>(null);
  const [customHeader, setCustomHeader] = React.useState(false);
  const [hideNav, setHideNav] = React.useState(false);
  const mobileCtx = React.useMemo(
    () => ({ el: slotEl, setCustom: setCustomHeader, setHideNav }),
    [slotEl],
  );

  const canWrite = role === "admin" || role === "editor";
  const visible = ALL_NAV.filter((n) => !n.adminOnly || role === "admin");
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
  const lowCount = db.items.filter((i) => stockOf(db, i.id) <= (i.lowStock ?? 5)).length;
  const city = (current?.address ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();

  // Ctrl/Cmd + K opens the global search from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const BusinessSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 hover:opacity-90 min-w-0 text-left shrink-0">
        <span
          className="inline-flex items-center justify-center font-bold shrink-0"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "var(--pe-gold)",
            color: "var(--pe-gold-ink)",
            fontSize: 14,
          }}
        >
          {ini(current?.name ?? "BW")}
        </span>
        <span className="min-w-0 hidden sm:block">
          <span className="block text-[14.5px] font-bold text-white truncate">
            {current?.name ?? "BW Inventory"}
          </span>
          <span
            className="block text-[11.5px] truncate capitalize"
            style={{ color: "rgba(255,255,255,.62)" }}
          >
            {[city, role ?? "Owner"].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronsUpDown
          className="h-[15px] w-[15px] shrink-0"
          style={{ color: "rgba(255,255,255,.6)" }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Your businesses
        </DropdownMenuLabel>
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

  const iconBtn: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: 8,
    border: "1px solid var(--pe-header-line)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
    background: "transparent",
    cursor: "pointer",
  };

  return (
    <MobileCtx.Provider value={mobileCtx}>
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <header
          className="sticky top-0 z-30 print:hidden text-white"
          style={{ background: "var(--pe-header)" }}
        >
          {/* Page-provided mobile header (see MobileHeader) */}
          <div ref={setSlotEl} className="md:hidden" />
          {/* Top bar */}
          <div
            className={
              "items-center gap-2.5 md:gap-3.5 mx-auto w-full max-w-[1320px] px-4 md:px-8 py-3 " +
              (customHeader ? "hidden md:flex" : "flex")
            }
          >
            {BusinessSwitcher}

            {/* Desktop search box */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex flex-1 items-center gap-2.5 min-w-0 mx-auto text-left"
              style={{
                maxWidth: 560,
                height: 38,
                padding: "0 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,.08)",
                border: "1px solid var(--pe-header-line)",
                cursor: "text",
              }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,.6)" }} />
              <span
                className="flex-1 min-w-0 truncate text-[14px]"
                style={{ color: "rgba(255,255,255,.6)" }}
              >
                Search items, bills, customers…
              </span>
              <span
                className="text-[11.5px] font-semibold"
                style={{
                  color: "rgba(255,255,255,.6)",
                  padding: "2px 7px",
                  borderRadius: 5,
                  border: "1px solid rgba(255,255,255,.18)",
                }}
              >
                Ctrl K
              </span>
            </button>
            <div className="flex-1 md:hidden" />

            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="md:hidden"
              style={iconBtn}
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            <AlertsMenu lowCount={lowCount} style={iconBtn} />

            {canWrite && (
              <Link
                to="/sales/new"
                className="pe-btn-gold hidden sm:flex items-center gap-2 shrink-0 font-bold text-[14px]"
                style={{
                  height: 38,
                  padding: "0 16px",
                  borderRadius: 8,
                  background: "var(--pe-gold)",
                  color: "var(--pe-gold-ink)",
                }}
              >
                <Plus className="h-[17px] w-[17px]" strokeWidth={2.5} /> New bill
              </Link>
            )}

            <UserMenu displayName={displayName} role={role} />
          </div>

          {/* Desktop grouped nav */}
          <nav
            className="hidden md:flex flex-wrap mx-auto w-full max-w-[1320px] px-[26px]"
            style={{ gap: "0 4px" }}
          >
            {NAV_GROUPS.map((g) => {
              const items = g.items.filter((n) => !n.adminOnly || role === "admin");
              if (!items.length) return null;
              return (
                <div
                  key={g.title}
                  className="flex shrink-0"
                  style={{
                    paddingRight: 6,
                    marginRight: 4,
                    borderRight: "1px solid rgba(255,255,255,.12)",
                  }}
                >
                  {items.map((n) => {
                    const Icon = n.icon;
                    const on = isActive(n.to, n.exact);
                    const badge = n.badge === "low" && lowCount > 0 ? lowCount : null;
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        className="pe-tab flex items-center gap-[7px] whitespace-nowrap text-[14px]"
                        style={{
                          padding: "11px 10px",
                          fontWeight: on ? 700 : 500,
                          color: on ? "#fff" : "var(--pe-header-fg)",
                          boxShadow: on ? "inset 0 -3px 0 var(--pe-gold)" : "none",
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={on ? 2.2 : 1.9} />
                        <span>{n.label}</span>
                        {badge != null && (
                          <span
                            className="text-[11px] font-bold"
                            style={{
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "var(--pe-warn-bg)",
                              color: "var(--pe-warn)",
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 mx-auto w-full max-w-[1320px] px-4 md:px-8 pt-5 md:pt-7 pb-28 md:pb-16 pe-scroll">
          <UpgradeBanner />
          {children}
        </main>

        {/* Mobile bottom nav with center FAB */}
        <nav
          className={
            "md:hidden fixed bottom-0 left-0 right-0 z-30 print:hidden items-center " +
            (hideNav ? "hidden" : "flex")
          }
          style={{
            background: "color-mix(in srgb, var(--pe-surface) 94%, transparent)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid var(--pe-line)",
            padding: "8px 6px calc(8px + env(safe-area-inset-bottom))",
          }}
        >
          {MOBILE_PRIMARY.slice(0, 2).map((to) => (
            <MobileTab
              key={to}
              item={visible.find((x) => x.to === to)!}
              active={isActive(to, to === "/")}
            />
          ))}
          <button
            type="button"
            onClick={() => (canWrite ? setAddOpen(true) : navigate({ to: "/sales" }))}
            aria-label="Add"
            className="shrink-0 mx-1.5 flex items-center justify-center text-white"
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: "var(--pe-green)",
              boxShadow: "0 6px 18px rgba(14,107,87,.3)",
            }}
          >
            <Plus className="h-[26px] w-[26px]" strokeWidth={2.6} />
          </button>
          {MOBILE_PRIMARY.slice(2).map((to) => (
            <MobileTab key={to} item={visible.find((x) => x.to === to)!} active={isActive(to)} />
          ))}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
                style={{ color: "var(--pe-ink-3)" }}
              >
                <Menu className="h-[22px] w-[22px]" />
                <span className="text-[11px] font-semibold">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
              <SheetHeader className="text-left">
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="mt-2 grid gap-2">
                {visible
                  .filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.to))
                  .map((n) => {
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
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 11,
                            background: "var(--pe-green-soft)",
                            color: "var(--pe-green)",
                          }}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="flex-1 font-semibold text-[color:var(--pe-ink)]">
                          {n.label}
                        </span>
                        <ChevronRight className="h-5 w-5 text-[color:var(--pe-ink-3)]" />
                      </Link>
                    );
                  })}
                {canInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      void install();
                    }}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--pe-line)] bg-card p-3 text-left pe-card-hover"
                  >
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 11,
                        background: "var(--pe-green-soft)",
                        color: "var(--pe-green)",
                      }}
                    >
                      <Download className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-[color:var(--pe-ink)]">Install app</span>
                      <span className="block text-xs text-[color:var(--pe-ink-3)]">Add BW Inventory to your home screen</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-[color:var(--pe-ink-3)]" />
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </nav>

        {/* Mobile "+" → what do you want to add? */}
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl p-0 [&>button]:hidden max-h-[90dvh] overflow-y-auto"
          >
            <div style={{ padding: "10px 16px calc(20px + env(safe-area-inset-bottom))" }}>
              <div
                className="mx-auto mb-3.5"
                style={{ width: 40, height: 5, borderRadius: 999, background: "var(--pe-line)" }}
              />
              <div className="flex items-center justify-between" style={{ padding: "0 4px 12px" }}>
                <SheetTitle className="text-[18px] font-bold text-[color:var(--pe-ink)]">
                  What do you want to add?
                </SheetTitle>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setAddOpen(false)}
                  className="inline-flex items-center justify-center text-[color:var(--pe-ink-2)]"
                  style={{ width: 34, height: 34, borderRadius: 999, background: "var(--pe-bg)" }}
                >
                  <X className="h-[17px] w-[17px]" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  navigate({ to: "/sales/new" });
                }}
                className="w-full flex items-center gap-3 text-left text-white"
                style={{ padding: 14, borderRadius: 14, background: "var(--pe-green)" }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "rgba(255,255,255,.18)",
                  }}
                >
                  <Receipt className="h-[22px] w-[22px]" />
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] font-bold">New bill</span>
                  <span className="block text-[12.5px]" style={{ color: "rgba(255,255,255,.78)" }}>
                    Sell items to a customer
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] opacity-70" />
              </button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ADD_MENU.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        a.go(navigate);
                      }}
                      className="flex flex-col gap-2 text-left bg-white"
                      style={{ padding: 13, borderRadius: 14, border: "1px solid var(--pe-line)" }}
                    >
                      <span
                        className="inline-flex items-center justify-center"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: a.bg,
                          color: a.fg,
                        }}
                      >
                        <Icon className="h-[19px] w-[19px]" />
                      </span>
                      <span>
                        <span className="block text-[14px] font-bold text-[color:var(--pe-ink)]">
                          {a.label}
                        </span>
                        <span className="block text-[12px] text-[color:var(--pe-ink-3)] mt-px">
                          {a.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} canWrite={canWrite} />
        <TweaksPanel />
      </div>
    </MobileCtx.Provider>
  );
}

function MobileTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
      style={{ color: active ? "var(--pe-green)" : "var(--pe-ink-3)" }}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
      <span className="text-[11px]" style={{ fontWeight: active ? 750 : 600 }}>
        {item.short ?? item.label}
      </span>
    </Link>
  );
}

// Bell: what needs attention right now — low stock, unpaid bills, money to collect.
function AlertsMenu({ lowCount, style }: { lowCount: number; style: React.CSSProperties }) {
  const [db] = useDB();
  const unpaid = db.sales.filter(
    (s) => !s.archived && !s.paymentReceived && (s.amountPaid ?? 0) < billPayable(s),
  ).length;
  const receivable = totalReceivable(db);
  const outCount = db.items.filter((i) => stockOf(db, i.id) <= 0).length;
  const any = lowCount > 0 || unpaid > 0;
  const row = "flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Alerts" style={style}>
        <Bell className="h-[18px] w-[18px]" />
        {any && (
          <span
            className="absolute"
            style={{
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#F08A80",
              border: "2px solid var(--pe-header)",
              boxSizing: "content-box",
            }}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Needs attention
        </DropdownMenuLabel>
        {!any && (
          <div className="px-2 py-3 text-[13px] text-[color:var(--pe-ink-3)]">
            All clear — nothing pending.
          </div>
        )}
        {lowCount > 0 && (
          <DropdownMenuItem asChild>
            <Link to="/items" search={{ filter: outCount > 0 ? "out" : "low" }} className={row}>
              <span
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "var(--pe-warn-bg)",
                  color: "var(--pe-warn)",
                }}
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold">
                  {lowCount} item{lowCount > 1 ? "s" : ""} running low
                </span>
                <span className="block text-[12px] text-[color:var(--pe-ink-3)]">
                  {outCount > 0 ? `${outCount} out of stock` : "Reorder soon"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-[color:var(--pe-ink-3)]" />
            </Link>
          </DropdownMenuItem>
        )}
        {unpaid > 0 && (
          <DropdownMenuItem asChild>
            <Link to="/sales" className={row}>
              <span
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "var(--pe-bad-bg)",
                  color: "var(--pe-bad)",
                }}
              >
                <IndianRupee className="h-4 w-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold">
                  {unpaid} bill{unpaid > 1 ? "s" : ""} awaiting payment
                </span>
                <span className="block text-[12px] text-[color:var(--pe-ink-3)]">
                  {fmtINR(receivable)} to collect in total
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-[color:var(--pe-ink-3)]" />
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Avatar circle: who's signed in, accent colour, sign out.
function UserMenu({ displayName, role }: { displayName: string; role: string | null }) {
  const { accent, setAccent } = useTheme();
  const { canInstall, install } = usePwaInstall();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="inline-flex items-center justify-center font-bold text-[13px] text-white shrink-0"
        style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,.14)" }}
      >
        {(displayName || "U").slice(0, 2).toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "var(--pe-green-soft)",
              color: "var(--pe-green)",
            }}
          >
            <UserIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[color:var(--pe-ink)] truncate">
              {displayName || "User"}
            </div>
            <div className="text-[11px] text-[color:var(--pe-ink-3)] capitalize">
              {role ?? "Owner"}
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Accent colour
        </DropdownMenuLabel>
        <div className="flex gap-2.5 px-2 pb-2">
          {(Object.keys(ACCENTS) as Accent[]).map((a) => {
            const on = accent === a;
            return (
              <button
                key={a}
                onClick={() => setAccent(a)}
                aria-label={a}
                title={a}
                className={
                  "h-8 w-8 rounded-full flex items-center justify-center transition " +
                  (on
                    ? "ring-2 ring-offset-2 ring-foreground ring-offset-background"
                    : "hover:scale-105")
                }
                style={{ background: ACCENTS[a].swatch }}
              >
                {on && <Check className="h-4 w-4 text-white" />}
              </button>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        {canInstall && (
          <DropdownMenuItem onClick={() => void install()}>
            <Download className="h-4 w-4 mr-2" /> Install app
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => signOut().then(() => (window.location.href = "/auth"))}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Ctrl+K palette: jump to an item, bill, customer or dealer, or start an action.
function GlobalSearch({
  open,
  onOpenChange,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  canWrite: boolean;
}) {
  const [db] = useDB();
  const navigate = useNavigate();
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const bills = db.sales
    .filter((s) => !s.archived)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search items, bills, customers…" />
      <CommandList className="max-h-[60dvh]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {canWrite && (
          <CommandGroup heading="Actions">
            <CommandItem
              value="new bill sale"
              onSelect={() => go(() => navigate({ to: "/sales/new" }))}
            >
              <Receipt /> New bill
            </CommandItem>
            <CommandItem
              value="new purchase stock in"
              onSelect={() => go(() => navigate({ to: "/purchases", search: { new: true } }))}
            >
              <TrendingDown /> New purchase
            </CommandItem>
            <CommandItem
              value="add expense"
              onSelect={() => go(() => navigate({ to: "/expenses", search: { new: true } }))}
            >
              <Wallet /> Add expense
            </CommandItem>
            <CommandItem
              value="record payment khata"
              onSelect={() =>
                go(() => navigate({ to: "/directory", search: { tab: "customers" } }))
              }
            >
              <IndianRupee /> Record payment
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Items">
          {db.items.map((i) => (
            <CommandItem
              key={i.id}
              value={`item ${itemLabel(i)} ${i.hsn ?? ""}`}
              onSelect={() => go(() => navigate({ to: "/items/$id", params: { id: i.id } }))}
            >
              <Package />
              <span className="flex-1 truncate">
                {i.name} <span className="text-muted-foreground">· {i.company}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {stockOf(db, i.id)} {i.unit ?? "pc"}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Customers">
          {db.customers.map((c) => (
            <CommandItem
              key={c.id}
              value={`customer ${c.name} ${c.phone ?? ""}`}
              onSelect={() =>
                go(() => navigate({ to: "/directory", search: { tab: "customers", party: c.id } }))
              }
            >
              <UserIcon />
              <span className="flex-1 truncate">{c.name}</span>
              {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Dealers">
          {db.dealers.map((d) => (
            <CommandItem
              key={d.id}
              value={`dealer ${d.name} ${d.phone ?? ""}`}
              onSelect={() =>
                go(() => navigate({ to: "/directory", search: { tab: "dealers", party: d.id } }))
              }
            >
              <Building2 />
              <span className="flex-1 truncate">{d.name}</span>
              {d.phone && <span className="text-xs text-muted-foreground">{d.phone}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Bills">
          {bills.map((s) => {
            const cust = db.customers.find((c) => c.id === s.customerId);
            return (
              <CommandItem
                key={s.id}
                value={`bill ${billNoLabel(s)} ${cust?.name ?? ""}`}
                onSelect={() => go(() => navigate({ to: "/bills/$id", params: { id: s.id } }))}
              >
                <Receipt />
                <span className="flex-1 truncate">
                  {billNoLabel(s)}{" "}
                  <span className="text-muted-foreground">· {cust?.name ?? "—"}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtINR(billPayable(s))}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// Backward-compat: routes import { PageHeader } from this file.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px] flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[24px] md:text-[26px] font-bold text-[color:var(--pe-ink)] tracking-[-0.02em] m-0">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] text-[color:var(--pe-ink-3)] mt-1.5 font-medium">{subtitle}</p>
        )}
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
        database is upgraded. Copy the SQL, paste it in the Supabase SQL editor, and press Run — the
        app picks it up automatically.
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
