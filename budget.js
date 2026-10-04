/* Shared money math and on-device storage.
   Loaded by the page (<script src="budget.js">) and by the service worker (importScripts). */
(function (g) {
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dayDiff = (a, b) => Math.round((b - a) / 86400000);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const money = (n, d = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

  function payInfo(state, t = today()) {
    const st = state.settings || {};
    if (!st.lastPayday) return null;
    const diff = dayDiff(parse(st.lastPayday), t);
    const r = ((diff % 14) + 14) % 14;
    const daysTo = r === 0 ? 0 : 14 - r;
    return { daysTo, next: addDays(t, daysTo === 0 ? 14 : daysTo), isToday: daysTo === 0 };
  }

  function monthSpend(state, key) {
    const by = {}; let spent = 0, earned = 0;
    for (const t of state.txs || []) {
      if (!t.date || !t.date.startsWith(key)) continue;
      const a = +t.amount || 0;
      if (t.type === "income") earned += a;
      else { spent += a; by[t.categoryId] = (by[t.categoryId] || 0) + a; }
    }
    return { by, spent, earned };
  }

  // Green under 50%, orange from 50%, red from 85% (and over the limit).
  function status(spent, limit) {
    if (!limit) return { cls: "s-none", label: "No limit", icon: "none", pct: 0 };
    const pct = spent / limit;
    if (pct > 1) return { cls: "s-bad", label: "Over limit", icon: "x", pct };
    if (pct >= 0.999) return { cls: "s-bad", label: "Limit reached", icon: "x", pct };
    if (pct >= 0.85) return { cls: "s-bad", label: "Almost maxed", icon: "alert", pct };
    if (pct >= 0.5) return { cls: "s-warn", label: "Halfway", icon: "half", pct };
    return { cls: "s-ok", label: "On track", icon: "check", pct };
  }

  // What's safe to spend in a category until the next paycheck.
  // Fixed bills keep their whole remaining amount; flexible categories get the
  // share of this month's remaining budget that covers the days until payday.
  function allowance(state, cat, spentCat, t = today()) {
    const pi = payInfo(state, t);
    const remaining = Math.max(0, (+cat.limit || 0) - spentCat);
    if (!pi || cat.fixed) return remaining;
    const endOfMonth = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    const daysLeftMonth = dayDiff(t, endOfMonth) + 1;
    const daysToPay = pi.isToday ? 14 : pi.daysTo;
    if (daysToPay >= daysLeftMonth) return remaining;
    return Math.floor(remaining * daysToPay / daysLeftMonth);
  }

  function goalPlan(state, goal, t = today()) {
    const left = Math.max(0, (+goal.target || 0) - (+goal.saved || 0));
    if (!goal.deadline) return { left };
    const dl = parse(goal.deadline);
    const days = dayDiff(t, dl);
    const months = Math.max(1, days / 30.44);
    let checks = 0; const pi = payInfo(state, t);
    if (pi) { let d = pi.isToday ? t : pi.next; while (d <= dl) { checks++; d = addDays(d, 14); } }
    return { left, days, perMonth: left / months, perCheck: checks ? left / checks : left, checks };
  }

  // The text of the payday check-in notification.
  function checkinMessage(state, t = today()) {
    const pi = payInfo(state, t);
    if (!pi) return null;
    const m = monthSpend(state, monthKey(t));
    const flex = (state.cats || []).filter(c => +c.limit > 0 && !c.fixed).map(c => ({ c, a: allowance(state, c, m.by[c.id] || 0, t) }));
    const total = flex.reduce((s, x) => s + x.a, 0);
    const days = pi.isToday ? 14 : pi.daysTo;
    const when = pi.next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const title = pi.isToday ? "It's payday! Log your paycheck" : `${pi.daysTo} day${pi.daysTo === 1 ? "" : "s"} until payday (${when})`;
    const top = flex.sort((a, b) => b.a - a.a).slice(0, 4).map(x => `${x.c.name} ${money(x.a)}`).join(" · ");
    const body = `You can spend about ${money(total)} (${money(total / days)}/day). ${top}`;
    return { title, body };
  }

  // Tiny IndexedDB key-value store, readable by the service worker.
  const DB = "savepay", STORE = "kv";
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(key) {
    const db = await open();
    return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbSet(key, val) {
    const db = await open();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }

  g.Budget = { pad, iso, parse, today, dayDiff, addDays, monthKey, money, payInfo, monthSpend, status, allowance, goalPlan, checkinMessage, idbGet, idbSet };
})(typeof self !== "undefined" ? self : window);
