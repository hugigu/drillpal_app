/* DrillPal service worker — offline shell cache.
   Bump CACHE when any precached file changes; the new worker drops the old
   cache on activate and the update is live on the next launch. */
const CACHE = "drillpal-202609102055-9389f29"; // prototype/deploy.sh stamps a unique value per deploy

const SHELL = [
  "./",
  "./index.html",
  "./core.js",   // built core bundle (slice 0); index.html imports it as a module
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first: the app is one static file with no network calls of its own,
   so the cache is authoritative. Network is only a fallback for a cold cache,
   and successful GETs are folded back in so a warm tab self-heals. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // offline and uncached — for a navigation, fall back to the shell
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});
