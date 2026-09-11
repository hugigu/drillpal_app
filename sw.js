/* DrillPal service worker — offline shell cache.
   Bump CACHE when any precached file changes; the new worker drops the old
   cache on activate and the update is live on the next launch. */
const CACHE = "drillpal-202609111819-c3230ee"; // deploy.sh stamps a unique value per deploy

// Regenerated at build time by scripts/gen-precache.mjs, from the actual
// files `vite build` produced (dist/.vite/manifest.json) — slice 3.5,
// replacing this hand-maintained list. This copy (checked into public/) is
// only the SOURCE Vite copies verbatim; dist/sw.js's SHELL is the real one.
// The markers below are what the script replaces between.
const SHELL = [
  /* SHELL:START */
  "./apple-touch-icon.png",
  "./assets/index-CDtlZKnQ.js",
  "./icon-192.png",
  "./icon-512.png",
  "./index.html",
  "./manifest.webmanifest",
  /* SHELL:END */
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
