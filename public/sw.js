/* BW Inventory service worker.
 *
 * Deliberately minimal: the app is server-rendered and every screen needs
 * Supabase, so the worker only (1) keeps an offline fallback page, (2) caches
 * Vite's content-hashed /assets/ files, and (3) keeps Google Fonts warm.
 * HTML, server functions (/_serverFn/) and Supabase calls are never cached,
 * so auth redirects and data stay live. Bump CACHE_VERSION to drop old caches.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `bw-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `bw-assets-${CACHE_VERSION}`;
const FONT_CACHE = `bw-fonts-${CACHE_VERSION}`;
// Extension-less: Cloudflare static assets 307 "/offline.html" -> "/offline",
// and Chrome rejects a redirected cached response for a navigation.
const OFFLINE_URL = "/offline";
const MAX_ASSET_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(OFFLINE_URL, { cache: "reload", redirect: "follow" });
      if (!res.ok) throw new Error(`offline page fetch failed: ${res.status}`);
      // Re-wrap the body so the stored response carries no `redirected` flag.
      const clean = new Response(await res.text(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(OFFLINE_URL, clean);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

  if (!sameOrigin && !isFont) return; // Supabase, wa.me, blob: … straight to the network.

  if (isFont) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Never intercept the app's own dynamic or meta endpoints.
  const p = url.pathname;
  if (
    p.startsWith("/_serverFn/") ||
    p.startsWith("/api/") ||
    p.startsWith("/.well-known/") ||
    p === "/sw.js"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (p.startsWith("/assets/") || p.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("You are offline.", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache, MAX_ASSET_ENTRIES);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit ?? (await refresh) ?? Response.error();
}

// Drop the oldest entries once a cache grows past `max` (Cache API keeps insertion order).
async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
