// Caches the large assets (compiler, std, examples) so they download once.
// The cache name changes whenever version.json changes (new compiler).
const PREFIX = "sultanc-playground-";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function currentCacheName() {
  try {
    const r = await fetch(new URL("assets/version.json", self.registration.scope), { cache: "no-cache" });
    const v = await r.json();
    return PREFIX + (v.compiler_sha256 || v.compiler || "dev");
  } catch {
    return PREFIX + "offline";
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.pathname.includes("/assets/") || url.pathname.endsWith("version.json")) return;
  event.respondWith((async () => {
    const name = await currentCacheName();
    const cache = await caches.open(name);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone());
    // Drop caches from older compilers.
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== name) caches.delete(key);
    return response;
  })());
});
