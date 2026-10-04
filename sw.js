/* SavePay service worker: offline app shell, cached receipt reader, payday check-in notifications. */
importScripts("budget.js");

const VERSION = "savepay-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "budget.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png"];
const RUNTIME = "savepay-runtime-v1";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App files: network first so updates arrive, cache as offline fallback.
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
    return;
  }
  // Fonts and the receipt reader (scripts + language data): cache first, so scanning works offline after the first use.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|tessdata/.test(url.host + url.pathname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res;
    }));
  }
});

async function checkin() {
  const state = await Budget.idbGet("state");
  if (!state || !state.settings || !state.settings.setupDone) return;
  const t = Budget.today();
  if (state.lastCheckin && Budget.dayDiff(Budget.parse(state.lastCheckin), t) < 5) return;
  const msg = Budget.checkinMessage(state, t); if (!msg) return;
  state.lastCheckin = Budget.iso(t);
  await Budget.idbSet("state", state);
  await self.registration.showNotification(msg.title, { body: msg.body, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "checkin" });
}
self.addEventListener("periodicsync", e => { if (e.tag === "checkin") e.waitUntil(checkin()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
