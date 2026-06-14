import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BusinessProvider, useBusiness } from "@/lib/business";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "BW Inventory — Shop Manager" },
      { name: "description", content: "Multi-business inventory, sales, purchases, and expenses tracker." },
      { name: "theme-color", content: "#0f766e" },
      { property: "og:title", content: "BW Inventory — Shop Manager" },
      { name: "twitter:title", content: "BW Inventory — Shop Manager" },
      { property: "og:description", content: "Multi-business inventory, sales, purchases, and expenses tracker." },
      { name: "twitter:description", content: "Multi-business inventory, sales, purchases, and expenses tracker." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BusinessProvider>
          <AuthGate />
        </BusinessProvider>
      </AuthProvider>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const { loading: bLoading, memberships, current } = useBusiness();
  const router = useRouter();
  const path = router.state.location.pathname;

  if (loading) {
    return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  const publicPaths = ["/auth", "/reset-password"];
  const isInvitePath = path.startsWith("/invite/");
  if (!session && !publicPaths.includes(path) && !isInvitePath) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return null;
  }
  if (publicPaths.includes(path)) {
    return <Outlet />;
  }
  if (session && bLoading) {
    return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  // Onboarding paths render outside AppLayout
  const onboardingPaths = ["/onboarding", "/business/new"];
  if (session && memberships.length === 0 && !onboardingPaths.includes(path) && !isInvitePath) {
    if (typeof window !== "undefined") window.location.replace("/onboarding");
    return null;
  }
  if (onboardingPaths.includes(path) || isInvitePath) {
    return <Outlet />;
  }
  if (!current) {
    return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
