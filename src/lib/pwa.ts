// PWA glue: service-worker registration and the "Install app" prompt.
// The worker itself lives in public/sw.js; the manifest in public/manifest.webmanifest.
import * as React from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext)
    return;
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((err) => console.warn("Service worker registration failed", err));
}

// True when running as an installed app (home-screen PWA or the Android TWA).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    document.referrer.startsWith("android-app://") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Chrome fires `beforeinstallprompt` once, often before React mounts, so the
// event is captured at module scope and handed to whichever hook asks for it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

export function usePwaInstall() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const canInstall = deferredPrompt !== null && !isStandalone();

  const install = React.useCallback(async () => {
    const ev = deferredPrompt;
    if (!ev) return false;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") deferredPrompt = null;
    listeners.forEach((fn) => fn());
    return outcome === "accepted";
  }, []);

  return { canInstall, install };
}
