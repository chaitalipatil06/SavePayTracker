/* SavePay Tracker — all data lives on this device (IndexedDB). */
const B = window.Budget;
const { iso, parse, today, addDays, monthKey, money, dayDiff } = B;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money2 = n => money(n, Math.abs(n) % 1 ? 2 : 0);
const fmtDate = (d, o = { month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const EMPTY = () => ({ version: 1, settings: null, cats: [], txs: [], goals: [], lastCheckin: null });

const S = { data: EMPTY(), tab: "home", wiz: null, installEvt: null };

/* ---------- Storage ---------- */
async function load() {
  try { const d = await B.idbGet("state"); if (d && typeof d === "object") S.data = Object.assign(EMPTY(), d); }
  catch (e) { toast("Couldn't open saved data on this device."); }
}
async function save() {
  try { await B.idbSet("state", S.data); return true; }
  catch (e) { toast("Couldn't save. Your phone may be out of storage."); return false; }
}
async function mutate(fn, okMsg) {
  fn(S.data);
  const ok = await save();
  render();
  if (ok && okMsg) toast(okMsg);
  return ok;
}
const cats = () => [...S.data.cats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const txs = () => [...S.data.txs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
const goals = () => [...S.data.goals].sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));

const ICONS = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="var(--surface)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  half: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg>',
  alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l7 12.5H1z" fill="currentColor"/><path d="M8 6v3.6M8 11.6v.2" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round"/></svg>',
  none: ""
};

/* ---------- Boot ---------- */
(async function boot() {
  await load();
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => registerPeriodic()).catch(() => {});
  }
  maybeCheckin();
})();
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEvt = e; render(); });
window.addEventListener("appinstalled", () => { S.installEvt = null; render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); maybeCheckin(); } });
document.addEventListener("click", e => {
  const tab = e.target.closest(".tab"); if (tab) { S.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); }
});
$("#fab").addEventListener("click", () => openTxSheet());

const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/* ---------- 5-day check-in ---------- */
async function maybeCheckin() {
  if (!S.data.settings?.setupDone) return;
  const last = S.data.lastCheckin ? parse(S.data.lastCheckin) : null;
  if (last && dayDiff(last, today()) < 5) return;
  const msg = B.checkinMessage(S.data); if (!msg) return;
  S.data.lastCheckin = iso(today()); await save();
  if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(msg.title, { body: msg.body, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "checkin" }); } catch (e) {}
  }
}
async function registerPeriodic() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!("periodicSync" in reg)) return false;
    const p = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (p.state !== "granted") return false;
    await reg.periodicSync.register("checkin", { minInterval: 24 * 60 * 60 * 1000 });
    return true;
  } catch (e) { return false; }
}
async function enableReminders() {
  if (!("Notification" in window)) { toast("This browser can't show notifications. Use the calendar reminder instead."); return; }
  const r = await Notification.requestPermission();
  if (r !== "granted") { toast("Notifications are off. You can turn them on in your phone's settings."); render(); return; }
  const bg = await registerPeriodic();
  render();
  toast(bg ? "Reminders on. You'll get a check-in every 5 days." : "Reminders on. They arrive when you open the app; add the calendar reminder for days you don't.");
}
function downloadCalendar() {
  const start = addDays(today(), 1);
  const d = `${start.getFullYear()}${B.pad(start.getMonth() + 1)}${B.pad(start.getDate())}`;
  const url = location.href.split("#")[0];
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SavePay Tracker//EN", "BEGIN:VEVENT", `UID:savepay-checkin-${d}@savepay`, `DTSTAMP:${d}T090000`,
    `DTSTART:${d}T090000`, `DTEND:${d}T091500`, "RRULE:FREQ=DAILY;INTERVAL=5", "SUMMARY:SavePay payday check-in",
    `DESCRIPTION:Open SavePay Tracker to see how much you can spend until payday: ${url}`, `URL:${url}`,
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:SavePay payday check-in", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  downloadFile("savepay-checkin.ics", ics, "text/calendar");
}
function downloadFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- Render ---------- */
function render() {
  const tabs = $("#tabs");
  if (!S.data.settings?.setupDone) { tabs.hidden = true; renderSetup(); return; }
  tabs.hidden = false;
  tabs.querySelectorAll(".tab").forEach(b => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const head = `<header class="top"><div class="brand"><div class="brand-mark" aria-hidden="true">$</div><h1>${{ home: "Today", budgets: "Budgets", activity: "Activity", goals: "Goals" }[S.tab]}</h1></div><button class="icon-btn" id="gear" aria-label="Settings"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>`;
  let banner = "";
  if (S.tab === "home" && !isStandalone()) {
    if (S.installEvt) banner = `<div class="banner"><p><b>Install SavePay</b> to get it on your home screen and turn on payday reminders.</p><button class="btn-primary" id="installBtn">Install</button></div>`;
    else if (isIOS()) banner = `<div class="banner"><p><b>Add to your home screen:</b> tap the Share button in Safari, then "Add to Home Screen".</p></div>`;
  }
  const body = { home: viewHome, budgets: viewBudgets, activity: viewActivity, goals: viewGoals }[S.tab]();
  $("#app").innerHTML = head + banner + body;
  $("#gear").onclick = openSettingsSheet;
  $("#installBtn")?.addEventListener("click", async () => { const e = S.installEvt; if (!e) return; e.prompt(); await e.userChoice.catch(() => {}); S.installEvt = null; render(); });
  bindView();
}

function catMeter(c, spent, compact) {
  const st = B.status(spent, +c.limit);
  const w = Math.min(100, st.pct * 100);
  const left = (+c.limit || 0) - spent;
  return `<div class="cat ${st.cls}" ${compact ? "" : `data-edit-cat="${c.id}" role="button" tabindex="0" aria-label="Edit ${esc(c.name)}"`}>
    <div class="head"><span class="name">${esc(c.name)}${c.fixed ? ' <span class="muted small">· bill</span>' : ""}</span><span class="pill">${ICONS[st.icon]}${st.label}</span></div>
    <div class="meter st" role="meter" aria-valuemin="0" aria-valuemax="${+c.limit || 0}" aria-valuenow="${spent}" aria-label="${esc(c.name)} spending"><i style="width:${w}%"></i></div>
    <div class="row between small"><span class="num"><b>${money2(spent)}</b> <span class="muted">of ${money(+c.limit)}</span></span><span class="num ${left < 0 ? "" : "muted"}" style="${left < 0 ? "color:var(--bad);font-weight:700" : ""}">${left < 0 ? money2(-left) + " over" : money2(left) + " left"}</span></div>
  </div>`;
}
function viewHome() {
  const t = today(); const m = B.monthSpend(S.data, monthKey(t)); const pi = B.payInfo(S.data);
  const C = cats();
  const budgetTotal = C.reduce((a, c) => a + (+c.limit || 0), 0);
  const flex = C.filter(c => +c.limit > 0 && !c.fixed).map(c => ({ c, a: B.allowance(S.data, c, m.by[c.id] || 0) }));
  const flexTotal = flex.reduce((s, x) => s + x.a, 0);
  const days = pi ? (pi.isToday ? 14 : pi.daysTo) : 0;
  const hot = C.map(c => ({ c, s: m.by[c.id] || 0 })).filter(x => +x.c.limit && x.s / x.c.limit >= 0.5).sort((a, b) => b.s / b.c.limit - a.s / a.c.limit);
  const checkin = pi ? `<div class="checkin" style="margin-top:8px">
      <div class="row between" style="align-items:flex-start"><div><p class="label" style="color:inherit;opacity:.85">Payday check-in</p><p class="big num">${pi.isToday ? "Payday!" : pi.daysTo + (pi.daysTo === 1 ? " day" : " days")}</p><p class="sub">${pi.isToday ? "Your next one is " + fmtDate(pi.next, { weekday: "short", month: "short", day: "numeric" }) : "until your paycheck on " + fmtDate(pi.next, { weekday: "long", month: "short", day: "numeric" })}</p></div>
      ${pi.isToday ? `<button class="btn" id="logPay" style="background:var(--accent-ink);color:var(--accent)">Log paycheck</button>` : ""}</div>
      <p>Until then you can spend about <b class="num">${money(flexTotal)}</b>${days ? ` — roughly <b class="num">${money(flexTotal / days)}</b> a day` : ""}.</p>
      ${flex.length ? `<div class="allow-list">${flex.map(x => `<div class="allow"><b>${money(x.a)}</b><span>${esc(x.c.name)}</span></div>`).join("")}</div>` : ""}
    </div>` : "";
  const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); months.push({ d, ...B.monthSpend(S.data, monthKey(d)) }); }
  const maxV = Math.max(1, ...months.map(x => Math.max(x.spent, x.earned)));
  return `${checkin}
  <section>
    <div class="row between"><h2>${fmtDate(t, { month: "long" })} so far</h2><span class="muted small">${budgetTotal ? "Budget " + money(budgetTotal) : ""}</span></div>
    <div class="card summary">
      <div class="stat"><p class="label">Earned</p><p class="v" style="color:var(--lagoon)">${money(m.earned)}</p></div>
      <div class="stat"><p class="label">Spent</p><p class="v">${money(m.spent)}</p></div>
      <div class="stat"><p class="label">Left over</p><p class="v" style="color:${m.earned - m.spent < 0 ? "var(--bad)" : "var(--ok)"}">${money(m.earned - m.spent)}</p></div>
    </div>
    ${!m.earned ? `<p class="muted small">Log your paychecks as income to see what you earn each month.</p>` : ""}
  </section>
  <section>
    <h2>Watch these</h2>
    ${hot.length ? `<div class="stack">${hot.slice(0, 4).map(x => catMeter(x.c, x.s, true)).join("")}</div>` : `<div class="card"><p><b>Every category is under half its limit.</b> <span class="muted">Nice work.</span></p></div>`}
  </section>
  <section>
    <div class="row between"><h2>Last 6 months</h2><div class="row"><span class="key"><i class="bar-in"></i>Earned</span><span class="key"><i class="bar-out"></i>Spent</span></div></div>
    <div class="card">
      <div class="bars" role="img" aria-label="Earned versus spent for the last six months">${months.map(x => `<div class="bar-grp"><i class="bar-in" style="height:${x.earned / maxV * 100}%" title="Earned ${money(x.earned)}"></i><i class="bar-out" style="height:${x.spent / maxV * 100}%" title="Spent ${money(x.spent)}"></i></div>`).join("")}</div>
      <div class="bar-labels">${months.map(x => `<span>${fmtDate(x.d, { month: "short" })}</span>`).join("")}</div>
      <p class="muted small" style="margin-top:8px">Tallest bar: ${money(maxV)}</p>
    </div>
  </section>`;
}
function viewBudgets() {
  const m = B.monthSpend(S.data, monthKey(today()));
  const C = cats(); const total = C.reduce((a, c) => a + (+c.limit || 0), 0);
  return `<div class="stack" style="margin-top:8px">
    <p class="muted">${fmtDate(today(), { month: "long", year: "numeric" })} · <span class="num">${money(m.spent)} of ${money(total)}</span> spent. Tap a category to change its limit.</p>
    <div class="legend"><span class="pill s-ok">${ICONS.check}Under half</span><span class="pill s-warn">${ICONS.half}Halfway</span><span class="pill s-bad">${ICONS.alert}85% or more</span></div>
    ${C.map(c => catMeter(c, m.by[c.id] || 0)).join("") || `<div class="empty">No categories yet.</div>`}
    <button id="addCat">Add a category</button>
  </div>`;
}
function viewActivity() {
  const T = txs();
  if (!T.length) return `<div class="card empty" style="margin-top:12px"><h3>No transactions yet</h3><p>Tap the + button to scan a receipt or add one by hand.</p></div>`;
  const cn = id => S.data.cats.find(c => c.id === id)?.name || "Uncategorized";
  const groups = {}; T.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  return Object.keys(groups).sort().reverse().map(d => `<section style="margin-top:18px"><p class="label">${fmtDate(parse(d), { weekday: "short", month: "short", day: "numeric", year: parse(d).getFullYear() !== today().getFullYear() ? "numeric" : undefined })}</p><div class="card" style="padding-block:4px">${groups[d].map(t => {
    const inc = t.type === "income"; const label = inc ? "Income" : cn(t.categoryId);
    return `<div class="tx"><div class="dot ${inc ? "inc" : ""}" aria-hidden="true">${esc(label[0])}</div><div class="grow"><p style="font-weight:700;overflow-wrap:anywhere">${esc(t.merchant || label)}</p><p class="muted small">${esc(label)}${t.fromReceipt ? " · from receipt" : ""}</p></div><span class="amt ${inc ? "inc" : ""}">${inc ? "+" : "−"}${money2(+t.amount)}</span><button class="btn-ghost" data-edit-tx="${t.id}" aria-label="Edit ${esc(t.merchant || label)}">Edit</button></div>`;
  }).join("")}</div></section>`).join("");
}
function viewGoals() {
  const G = goals(); const total = G.reduce((a, g) => a + (+g.saved || 0), 0);
  return `<div class="stack" style="margin-top:8px">
    <p class="muted">You've put away <b class="num" style="color:var(--ink)">${money(total)}</b> across ${G.length} goal${G.length === 1 ? "" : "s"}.</p>
    ${G.map(g => {
      const p = B.goalPlan(S.data, g); const pct = g.target ? Math.min(100, (+g.saved || 0) / g.target * 100) : 0; const done = p.left <= 0;
      return `<div class="card goal">
        <div class="row between" style="align-items:flex-start"><div class="grow"><h3 style="overflow-wrap:anywhere">${esc(g.name)}</h3><p class="muted small">${g.deadline ? "By " + fmtDate(parse(g.deadline), { month: "long", day: "numeric", year: "numeric" }) : "No deadline"}</p></div><button class="btn-ghost" data-edit-goal="${g.id}">Edit</button></div>
        <p class="amt">${money(+g.saved)} <span class="muted small" style="font-family:var(--f-body);font-weight:400">of ${money(+g.target)} · ${Math.round(pct)}%</span></p>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${+g.target}" aria-valuenow="${+g.saved || 0}" aria-label="${esc(g.name)} progress"><i style="width:${pct}%"></i></div>
        ${done ? `<p style="color:var(--ok);font-weight:700">Goal reached. Well done!</p>` : p.days != null ? (p.days < 0 ? `<p style="color:var(--bad);font-weight:700">Deadline passed with ${money(p.left)} to go.</p>` : `<div class="tagline"><span>Save <b class="num">${money(p.perMonth)}</b>/month</span><span><b class="num">${money(p.perCheck)}</b> per paycheck (${p.checks} left)</span></div>`) : ""}
        <button class="btn-primary" data-add-goal="${g.id}">Add money</button>
      </div>`;
    }).join("") || `<div class="card empty"><h3>No goals yet</h3><p>Add one for a trip, a cushion, or anything you're saving toward.</p></div>`}
    <button id="newGoal">Add a goal</button>
  </div>`;
}
function bindView() {
  $("#logPay")?.addEventListener("click", logPaycheck);
  $("#addCat")?.addEventListener("click", () => openCatSheet());
  $("#newGoal")?.addEventListener("click", () => openGoalSheet());
  document.querySelectorAll("[data-edit-cat]").forEach(el => { const go = () => openCatSheet(S.data.cats.find(c => c.id === el.dataset.editCat)); el.onclick = go; el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  document.querySelectorAll("[data-edit-tx]").forEach(el => el.onclick = () => openTxSheet(S.data.txs.find(t => t.id === el.dataset.editTx)));
  document.querySelectorAll("[data-edit-goal]").forEach(el => el.onclick = () => openGoalSheet(S.data.goals.find(g => g.id === el.dataset.editGoal)));
  document.querySelectorAll("[data-add-goal]").forEach(el => el.onclick = () => openAddToGoal(S.data.goals.find(g => g.id === el.dataset.addGoal)));
}
function logPaycheck() {
  const t = iso(today());
  mutate(d => { d.txs.push({ id: uid(), type: "income", amount: +d.settings.paycheck || 0, merchant: "Paycheck", date: t, categoryId: null, createdAt: Date.now() }); d.settings.lastPayday = t; }, "Paycheck logged");
}

/* ---------- Sheets ---------- */
const sheet = $("#sheet");
function openSheet(title, html, mount) {
  sheet.innerHTML = `<form class="sheet" method="dialog" novalidate><div class="sheet-h"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>${html}</form>`;
  sheet.querySelector("[data-close]").onclick = () => sheet.close();
  if (!sheet.open) sheet.showModal();
  mount?.(sheet.querySelector("form"));
}
sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
function twoTap(btn, fn) { btn.addEventListener("click", e => { if (btn.dataset.sure) fn(); else { btn.dataset.sure = "1"; btn.textContent = "Tap again to confirm"; } }); }

function catOptions(sel) { return cats().map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join(""); }
function openTxSheet(tx) {
  const editing = !!tx; let type = tx?.type || "expense"; let fromReceipt = !!tx?.fromReceipt;
  openSheet(editing ? "Edit transaction" : "Add transaction", `
    ${!editing ? `<div class="scan" id="scanBox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12h8M8 15h5"/></svg><div class="grow stack" style="gap:10px"><span><b>Scan a receipt</b><br><span class="muted small">The total, store and category fill in for you to check.</span></span><div class="grid2 scan-btns"><label class="btn btn-primary file-btn" for="rcptCam"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:6px"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Take photo<input type="file" id="rcptCam" accept="image/*" capture="environment"></label><label class="btn file-btn" for="rcpt">Gallery<input type="file" id="rcpt" accept="image/*"></label></div></div></div>
    <div id="scanMsg" hidden></div><div class="progress" id="scanProg" hidden><i></i></div>` : ""}
    <div class="seg" role="group" aria-label="Type"><button type="button" data-type="expense" aria-pressed="${type === "expense"}">Expense</button><button type="button" data-type="income" aria-pressed="${type === "income"}">Income</button></div>
    <div class="grid2">
      <div class="field"><label for="txAmt">Amount</label><div class="money-in"><input id="txAmt" type="number" inputmode="decimal" step="0.01" min="0" value="${tx ? tx.amount : ""}" required></div></div>
      <div class="field"><label for="txDate">Date</label><input id="txDate" type="date" value="${tx?.date || iso(today())}"></div>
    </div>
    <div class="field" id="catField"><label for="txCat">Category</label><select id="txCat">${catOptions(tx?.categoryId)}</select></div>
    <div class="field"><label for="txMer">Store or note</label><input id="txMer" type="text" maxlength="80" value="${esc(tx?.merchant || "")}" placeholder="e.g. Trader Joe's"></div>
    <div id="txErr" class="msg err" hidden></div>
    <div class="row">${editing ? `<button type="button" class="btn-danger" id="txDel">Delete</button>` : ""}<span class="grow"></span><button type="submit" class="btn-primary">${editing ? "Save" : "Add"}</button></div>`,
  f => {
    const setType = v => { type = v; f.querySelectorAll("[data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === v)); $("#catField", f).hidden = v === "income"; };
    setType(type);
    f.querySelectorAll("[data-type]").forEach(b => b.onclick = () => setType(b.dataset.type));
    ["#rcpt", "#rcptCam"].forEach(id => $(id, f)?.addEventListener("change", e => { scanReceipt(e.target.files[0], f, () => { fromReceipt = true; setType("expense"); }); e.target.value = ""; }));
    const del = $("#txDel", f); if (del) twoTap(del, () => mutate(d => { d.txs = d.txs.filter(x => x.id !== tx.id); }, "Deleted").then(() => sheet.close()));
    $("#txMer", f).addEventListener("change", e => { if (!editing) { const g = guessCategory(e.target.value); if (g) $("#txCat", f).value = g; } });
    f.onsubmit = async e => {
      e.preventDefault(); const amt = parseFloat($("#txAmt", f).value); const err = $("#txErr", f);
      if (!(amt > 0)) { err.hidden = false; err.textContent = "Enter an amount greater than $0."; return; }
      if (type === "expense" && !$("#txCat", f).value) { err.hidden = false; err.textContent = "Add a category first on the Budgets tab."; return; }
      const data = { id: tx?.id || uid(), type, amount: Math.round(amt * 100) / 100, date: $("#txDate", f).value || iso(today()), merchant: $("#txMer", f).value.trim(), categoryId: type === "income" ? null : $("#txCat", f).value, fromReceipt, createdAt: tx?.createdAt || Date.now() };
      const ok = await mutate(d => { d.txs = d.txs.filter(x => x.id !== data.id); d.txs.push(data); }, editing ? "Saved" : "Added");
      if (ok) { sheet.close(); if (type === "expense") warnIfClose(data.categoryId); }
    };
  });
}
function warnIfClose(catId) {
  const c = S.data.cats.find(x => x.id === catId); if (!c || !+c.limit) return;
  const s = B.monthSpend(S.data, monthKey(today())).by[catId] || 0; const st = B.status(s, +c.limit);
  setTimeout(() => {
    if (st.cls === "s-bad") toast(`${c.name}: ${st.label.toLowerCase()} — ${money2(Math.max(0, c.limit - s))} left this month`);
    else if (st.cls === "s-warn") toast(`${c.name} is past halfway — ${money2(c.limit - s)} left`);
  }, 700);
}

/* ---------- Receipt reading (on device, free) ---------- */
const KEYWORDS = [
  { hints: ["grocer"], words: ["safeway", "trader joe", "whole foods", "costco", "walmart", "kroger", "aldi", "sprouts", "grocery", "market", "save mart", "foodmaxx", "winco", "lucky", "smart & final", "food 4 less", "vons", "raley", "h mart", "99 ranch", "patel", "produce"] },
  { hints: ["food", "dining", "eat", "restaurant"], words: ["restaurant", "cafe", "coffee", "starbucks", "pizza", "taco", "burger", "mcdonald", "chipotle", "doordash", "uber eats", "grubhub", "grill", "kitchen", "bakery", "boba", "panda express", "subway", "in-n-out", "wendy", "chick-fil-a", "dunkin", "diner", "bistro", "bar "] },
  { hints: ["subscri"], words: ["netflix", "spotify", "hulu", "disney", "apple.com", "youtube", "prime video", "icloud", "subscription", "membership", "max.com"] },
  { hints: ["shop"], words: ["target", "amazon", "ross", "tj maxx", "marshalls", "macy", "nordstrom", "old navy", "h&m", "zara", "best buy", "home depot", "ikea", "kohl", "walgreens", "dollar tree", "michaels", "sephora", "ulta"] },
  { hints: ["gas", "transport", "car", "travel"], words: ["chevron", "shell", "arco", "valero", "exxon", "mobil", "fuel", "gasoline", "uber", "lyft", "parking", "toll", "76 "] },
  { hints: ["pg", "electric", "util", "bill"], words: ["pg&e", "pge", "pacific gas", "electric", "utility", "water district"] },
  { hints: ["health", "medic", "pharm"], words: ["cvs", "pharmacy", "rite aid", "clinic", "dental", "hospital", "medical"] },
  { hints: ["rent", "home", "housing"], words: ["rent", "apartment", "property management", "leasing"] },
  { hints: ["fun", "entertain", "outing"], words: ["cinema", "theater", "theatre", "amc", "regal", "bowling", "ticket"] }
];
function guessCategory(text) {
  const t = String(text || "").toLowerCase(); if (!t.trim()) return null;
  const merchant = t.split("\n")[0].trim();
  const prev = txs().find(x => x.type === "expense" && x.merchant && merchant.includes(x.merchant.toLowerCase().slice(0, 8)));
  if (prev && S.data.cats.some(c => c.id === prev.categoryId)) return prev.categoryId;
  let best = null, bestScore = 0;
  for (const group of KEYWORDS) {
    const score = group.words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
    if (!score) continue;
    const cat = cats().find(c => group.hints.some(h => c.name.toLowerCase().includes(h)));
    if (cat && score > bestScore) { best = cat.id; bestScore = score; }
  }
  return best;
}
function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const amountsIn = l => (l.replace(/(\d)\s*[.,]\s*(\d{2})\b/g, "$1.$2").match(/\d{1,3}(?:,\d{3})*\.\d{2}\b|\d+\.\d{2}\b/g) || []).map(a => parseFloat(a.replace(/,/g, "")));
  let total = null;
  for (const l of lines) {
    const low = l.toLowerCase();
    if (/(^|[^b])total|amount due|balance due|grand total|amount paid/.test(low) && !/sub\s*-?\s*total|total savings|you saved|items?/.test(low)) {
      const a = amountsIn(l); if (a.length) total = Math.max(total ?? 0, ...a);
    }
  }
  if (total == null) { const all = lines.flatMap(amountsIn).filter(n => n < 100000); if (all.length) total = Math.max(...all); }
  let date = null;
  for (const l of lines) {
    let m = l.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) { date = `${m[1]}-${B.pad(+m[2])}-${B.pad(+m[3])}`; break; }
    m = l.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (m && +m[1] <= 12 && +m[2] <= 31) { let y = +m[3]; if (y < 100) y += 2000; date = `${y}-${B.pad(+m[1])}-${B.pad(+m[2])}`; break; }
  }
  if (date && (parse(date) > today() || isNaN(parse(date)))) date = null;
  const skip = /total|tax|visa|mastercard|debit|credit|date|time|receipt|welcome|thank|phone|tel|www|http|cashier|store\s*#|^\d/i;
  const cand = lines.slice(0, 8).find(l => /[a-z]{3,}/i.test(l) && !skip.test(l) && (l.replace(/[^a-z]/gi, "").length / l.length) > 0.4) || "";
  const merchant = cand.replace(/#\s*\d+/g, "").replace(/[^\w&'.\- ]/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 40);
  return { total, date, merchant };
}
let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tesseractLoading) tesseractLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = res; s.onerror = () => { tesseractLoading = null; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}
async function scanReceipt(file, f, onFilled) {
  const msg = $("#scanMsg", f), prog = $("#scanProg", f), bar = prog.querySelector("i");
  if (!file) return;
  msg.hidden = false; msg.className = "msg info"; msg.textContent = "Reading your receipt on this phone…"; prog.hidden = false; bar.style.width = "5%";
  try {
    await loadTesseract();
    const { data } = await Tesseract.recognize(file, "eng", { logger: m => { if (m.status === "recognizing text") bar.style.width = Math.max(10, Math.round(m.progress * 100)) + "%"; } });
    const r = parseReceipt(data.text || "");
    prog.hidden = true;
    if (!(r.total > 0)) { msg.className = "msg err"; msg.textContent = "Couldn't find a total on that photo. Try a flatter, well-lit photo, or type the amount below."; return; }
    onFilled();
    $("#txAmt", f).value = r.total.toFixed(2);
    if (r.date) $("#txDate", f).value = r.date;
    if (r.merchant) $("#txMer", f).value = r.merchant;
    const cat = guessCategory(r.merchant + "\n" + data.text); if (cat) $("#txCat", f).value = cat;
    msg.className = "msg info"; msg.textContent = "Filled in from your receipt. Check the amount and category, then tap Add.";
  } catch (e) {
    prog.hidden = true; msg.className = "msg err";
    msg.textContent = navigator.onLine ? "Couldn't read that receipt. Try again, or type the amount below." : "The first scan needs internet to download the reader. After that it works offline.";
  }
}

function openCatSheet(c) {
  const editing = !!c;
  openSheet(editing ? "Edit category" : "New category", `
    <div class="field"><label for="cName">Name</label><input id="cName" type="text" maxlength="40" value="${esc(c?.name || "")}" placeholder="e.g. Gym"></div>
    <div class="field"><label for="cLim">Monthly max</label><div class="money-in"><input id="cLim" type="number" inputmode="decimal" min="0" step="1" value="${c?.limit ?? ""}"></div></div>
    <label class="check"><input type="checkbox" id="cFix" ${c?.fixed ? "checked" : ""}> Fixed bill (rent, utilities, subscriptions). Not split into daily amounts.</label>
    <div id="cErr" class="msg err" hidden></div>
    <div class="row">${editing ? `<button type="button" class="btn-danger" id="cDel">Delete</button>` : ""}<span class="grow"></span><button type="submit" class="btn-primary">Save</button></div>`,
  f => {
    const del = $("#cDel", f); if (del) twoTap(del, () => mutate(d => { d.cats = d.cats.filter(x => x.id !== c.id); }, "Category deleted").then(() => sheet.close()));
    f.onsubmit = async e => {
      e.preventDefault(); const name = $("#cName", f).value.trim();
      if (!name) { const er = $("#cErr", f); er.hidden = false; er.textContent = "Give the category a name."; return; }
      const data = { id: c?.id || uid(), name, limit: Math.max(0, +$("#cLim", f).value || 0), fixed: $("#cFix", f).checked, order: c?.order ?? S.data.cats.length };
      if (await mutate(d => { d.cats = d.cats.filter(x => x.id !== data.id); d.cats.push(data); }, "Saved")) sheet.close();
    };
  });
}
function openGoalSheet(g) {
  const editing = !!g;
  openSheet(editing ? "Edit goal" : "New goal", `
    <div class="field"><label for="gName">Goal</label><input id="gName" type="text" maxlength="50" value="${esc(g?.name || "")}" placeholder="e.g. Bali family trip"></div>
    <div class="grid2">
      <div class="field"><label for="gT">Target</label><div class="money-in"><input id="gT" type="number" min="0" step="1" inputmode="decimal" value="${g?.target ?? ""}"></div></div>
      <div class="field"><label for="gD">By</label><input id="gD" type="date" value="${g?.deadline || ""}"></div>
    </div>
    <div class="field"><label for="gS">Already saved</label><div class="money-in"><input id="gS" type="number" min="0" step="1" inputmode="decimal" value="${g?.saved ?? 0}"></div></div>
    <div id="gErr" class="msg err" hidden></div>
    <div class="row">${editing ? `<button type="button" class="btn-danger" id="gDel">Delete</button>` : ""}<span class="grow"></span><button type="submit" class="btn-primary">Save</button></div>`,
  f => {
    const del = $("#gDel", f); if (del) twoTap(del, () => mutate(d => { d.goals = d.goals.filter(x => x.id !== g.id); }, "Goal deleted").then(() => sheet.close()));
    f.onsubmit = async e => {
      e.preventDefault(); const name = $("#gName", f).value.trim(); const target = +$("#gT", f).value;
      if (!name || !(target > 0)) { const er = $("#gErr", f); er.hidden = false; er.textContent = "Add a name and a target above $0."; return; }
      const data = { id: g?.id || uid(), name, target, deadline: $("#gD", f).value || null, saved: Math.max(0, +$("#gS", f).value || 0) };
      if (await mutate(d => { d.goals = d.goals.filter(x => x.id !== data.id); d.goals.push(data); }, "Goal saved")) sheet.close();
    };
  });
}
function openAddToGoal(g) {
  const p = B.goalPlan(S.data, g);
  openSheet(`Add to ${esc(g.name)}`, `
    <p class="muted">${money(+g.saved)} saved of ${money(+g.target)}.${p.perCheck ? ` Suggested this paycheck: <b class="num" style="color:var(--ink)">${money(p.perCheck)}</b>.` : ""}</p>
    <div class="field"><label for="aAmt">Amount</label><div class="money-in"><input id="aAmt" type="number" step="0.01" inputmode="decimal" value="${p.perCheck ? Math.ceil(p.perCheck) : ""}"></div></div>
    <p class="muted small">Use a negative amount to take money out.</p>
    <div class="row"><span class="grow"></span><button type="submit" class="btn-primary">Add to goal</button></div>`,
  f => {
    f.onsubmit = async e => { e.preventDefault(); const a = parseFloat($("#aAmt", f).value); if (!a) return;
      if (await mutate(d => { const x = d.goals.find(y => y.id === g.id); x.saved = Math.max(0, Math.round(((+x.saved || 0) + a) * 100) / 100); }, a > 0 ? `Added ${money2(a)}` : "Updated")) sheet.close(); };
  });
}
function openSettingsSheet() {
  const st = S.data.settings || {};
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  openSheet("Settings", `
    <div class="grid2">
      <div class="field"><label for="sPay">Take-home per paycheck</label><div class="money-in"><input id="sPay" type="number" min="0" step="1" inputmode="decimal" value="${st.paycheck ?? ""}"></div></div>
      <div class="field"><label for="sLast">Most recent payday</label><input id="sLast" type="date" value="${st.lastPayday || ""}"></div>
    </div>
    <p class="muted small">You're paid every two weeks. Paydays are counted forward from this date.</p>
    <div class="row"><span class="grow"></span><button type="submit" class="btn-primary">Save paycheck</button></div>
    <div class="settings-group">
      <h3>Payday check-in every 5 days</h3>
      ${perm === "granted" ? `<p class="small" style="color:var(--ok);font-weight:700">Notifications are on.</p>` : perm === "unsupported" ? `<p class="muted small">${isIOS() && !isStandalone() ? "Add SavePay to your home screen first, then come back here to turn on notifications." : "This browser can't show notifications."}</p>` : `<button type="button" id="notifBtn">Turn on notifications</button>`}
      <p class="muted small">Want a reminder that never misses? Add a repeating event to your phone's calendar.</p>
      <button type="button" id="calBtn">Add calendar reminder</button>
    </div>
    <div class="settings-group">
      <h3>Backup</h3>
      <p class="muted small">Your data is stored only on this phone. Save a backup file now and then, especially before switching phones.</p>
      <div class="grid2"><button type="button" id="expBtn">Save backup</button><label class="btn file-btn" for="impFile">Restore backup<input type="file" id="impFile" accept="application/json,.json"></label></div>
      <div id="impMsg" hidden></div>
    </div>
    <div class="settings-group">
      <button type="button" class="btn-danger" id="resetBtn">Erase all data on this phone</button>
    </div>`,
  f => {
    $("#notifBtn", f)?.addEventListener("click", async () => { await enableReminders(); openSettingsSheet(); });
    $("#calBtn", f).onclick = downloadCalendar;
    $("#expBtn", f).onclick = () => downloadFile(`savepay-backup-${iso(today())}.json`, JSON.stringify(S.data, null, 2), "application/json");
    $("#impFile", f).addEventListener("change", async e => {
      const m = $("#impMsg", f); m.hidden = false;
      try {
        const d = JSON.parse(await e.target.files[0].text());
        if (!d || !Array.isArray(d.cats) || !Array.isArray(d.txs) || !Array.isArray(d.goals)) throw 0;
        m.className = "msg info"; m.innerHTML = `This replaces everything on this phone with the backup (${d.txs.length} transactions, ${d.goals.length} goals). <button type="button" class="btn-primary" id="impGo" style="margin-top:8px">Restore</button>`;
        $("#impGo", f).onclick = async () => { S.data = Object.assign(EMPTY(), d); await save(); sheet.close(); S.tab = "home"; render(); toast("Backup restored"); };
      } catch (_) { m.className = "msg err"; m.textContent = "That file isn't a SavePay backup."; }
    });
    twoTap($("#resetBtn", f), async () => { S.data = EMPTY(); S.wiz = null; await save(); sheet.close(); render(); toast("All data erased"); });
    f.onsubmit = async e => { e.preventDefault();
      if (await mutate(d => { d.settings.paycheck = +$("#sPay", f).value || 0; d.settings.lastPayday = $("#sLast", f).value || d.settings.lastPayday; }, "Saved")) sheet.close(); };
  });
}

/* ---------- First-time setup ---------- */
const PRESETS = [["Rent", true, true], ["Groceries", false, true], ["Food & dining", false, true], ["Subscriptions", true, true], ["Shopping", false, true], ["PG&E bill", true, true], ["Gas & transport", false, false], ["Savings", true, true], ["Health", false, false], ["Fun & outings", false, false]];
function renderSetup() {
  if (!S.wiz) {
    const t = today(); const lp = addDays(t, -((t.getDay() + 2) % 7)); // most recent Friday as a starting guess
    const jan = t.getMonth() === 0 ? t.getFullYear() : t.getFullYear() + 1;
    const jun = t.getMonth() < 5 ? t.getFullYear() : t.getFullYear() + 1;
    S.wiz = { step: 0, cats: PRESETS.map(([name, fixed, on]) => ({ name, limit: "", fixed, on })), paycheck: "", lastPayday: iso(lp),
      goals: [{ name: "Savings by January", target: 5000, deadline: `${jan}-01-31` }, { name: "Savings by June", target: 10000, deadline: `${jun}-06-30` }, { name: "Bali family trip", target: "", deadline: "" }] };
  }
  const W = S.wiz; const steps = `<div class="steps" aria-label="Step ${W.step + 1} of 3">${[0, 1, 2].map(i => `<i class="${i <= W.step ? "on" : ""}"></i>`).join("")}</div>`;
  let body = "";
  if (W.step === 0) body = `
    <div class="stack"><p class="label">Step 1 of 3</p><h1>Where does your money go each month?</h1><p class="muted">Pick your categories and set a monthly max for each. Each one turns orange at halfway and red when you're close to the max.</p></div>
    <div class="stack">${W.cats.map((c, i) => `<div class="cat-edit ${c.on ? "" : "off"}">
      <input type="checkbox" id="wc${i}" data-i="${i}" class="wOn" ${c.on ? "checked" : ""} aria-label="Use ${esc(c.name)}">
      <input type="text" id="wn${i}" class="nm wName" data-i="${i}" value="${esc(c.name)}" aria-label="Category name" placeholder="Category name">
      <div class="money-in"><input type="number" id="wl${i}" class="wLim" data-i="${i}" min="0" step="1" inputmode="decimal" placeholder="Max" value="${c.limit}" aria-label="Monthly max for ${esc(c.name)}"></div>
      <label class="check fx small"><input type="checkbox" class="wFix" id="wf${i}" data-i="${i}" ${c.fixed ? "checked" : ""}> Fixed bill</label>
    </div>`).join("")}</div>
    <button type="button" id="wAdd">Add another category</button>`;
  if (W.step === 1) body = `
    <div class="stack"><p class="label">Step 2 of 3</p><h1>Tell us about your paycheck</h1><p class="muted">You're paid every two weeks. This powers your payday countdown and how much you can spend until then.</p></div>
    <div class="card stack">
      <div class="field"><label for="wPay">Take-home pay per paycheck</label><div class="money-in"><input id="wPay" type="number" min="0" step="1" inputmode="decimal" value="${W.paycheck}" placeholder="e.g. 2800"></div></div>
      <div class="field"><label for="wLast">Your most recent payday</label><input id="wLast" type="date" value="${W.lastPayday}"></div>
    </div>`;
  if (W.step === 2) body = `
    <div class="stack"><p class="label">Step 3 of 3</p><h1>What are you saving for?</h1><p class="muted">Change anything, add a target for each goal, or leave a target empty to skip it.</p></div>
    <div class="stack">${W.goals.map((g, i) => `<div class="goal-edit">
      <div class="field full"><label for="gn${i}">Goal</label><input id="gn${i}" type="text" class="wgN" data-i="${i}" value="${esc(g.name)}"></div>
      <div class="field"><label for="gt${i}">Target</label><div class="money-in"><input id="gt${i}" type="number" min="0" step="1" inputmode="decimal" class="wgT" data-i="${i}" value="${g.target}"></div></div>
      <div class="field"><label for="gd${i}">By</label><input id="gd${i}" type="date" class="wgD" data-i="${i}" value="${g.deadline}"></div>
    </div>`).join("")}</div>
    <button type="button" id="wAddG">Add another goal</button>`;
  $("#app").innerHTML = `<div class="setup"><div class="brand"><div class="brand-mark" aria-hidden="true">$</div><b style="font-family:var(--f-display)">SavePay Tracker</b></div>${steps}${body}
    <div id="wErr" class="msg err" hidden></div>
    <div class="row">${W.step ? `<button type="button" id="wBack">Back</button>` : `<label class="btn file-btn" for="wImp">Restore backup<input type="file" id="wImp" accept="application/json,.json"></label>`}<span class="grow"></span><button type="button" class="btn-primary" id="wNext">${W.step === 2 ? "Finish setup" : "Continue"}</button></div></div>`;
  const app = $("#app");
  app.querySelectorAll(".wOn").forEach(el => el.onchange = () => { W.cats[el.dataset.i].on = el.checked; el.closest(".cat-edit").classList.toggle("off", !el.checked); });
  app.querySelectorAll(".wName").forEach(el => el.oninput = () => W.cats[el.dataset.i].name = el.value);
  app.querySelectorAll(".wLim").forEach(el => el.oninput = () => { W.cats[el.dataset.i].limit = el.value; if (el.value) { W.cats[el.dataset.i].on = true; $("#wc" + el.dataset.i).checked = true; el.closest(".cat-edit").classList.remove("off"); } });
  app.querySelectorAll(".wFix").forEach(el => el.onchange = () => W.cats[el.dataset.i].fixed = el.checked);
  app.querySelectorAll(".wgN").forEach(el => el.oninput = () => W.goals[el.dataset.i].name = el.value);
  app.querySelectorAll(".wgT").forEach(el => el.oninput = () => W.goals[el.dataset.i].target = el.value);
  app.querySelectorAll(".wgD").forEach(el => el.oninput = () => W.goals[el.dataset.i].deadline = el.value);
  $("#wPay")?.addEventListener("input", e => W.paycheck = e.target.value);
  $("#wLast")?.addEventListener("input", e => W.lastPayday = e.target.value);
  $("#wAdd")?.addEventListener("click", () => { W.cats.push({ name: "", limit: "", fixed: false, on: true }); renderSetup(); $("#wn" + (W.cats.length - 1))?.focus(); });
  $("#wAddG")?.addEventListener("click", () => { W.goals.push({ name: "", target: "", deadline: "" }); renderSetup(); $("#gn" + (W.goals.length - 1))?.focus(); });
  $("#wBack")?.addEventListener("click", () => { W.step--; renderSetup(); window.scrollTo(0, 0); });
  $("#wImp")?.addEventListener("change", async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (!d || !Array.isArray(d.cats) || !Array.isArray(d.txs)) throw 0;
      S.data = Object.assign(EMPTY(), d); await save(); render(); toast("Backup restored"); }
    catch (_) { const err = $("#wErr"); err.hidden = false; err.textContent = "That file isn't a SavePay backup."; }
  });
  $("#wNext").onclick = async () => {
    const err = $("#wErr"); err.hidden = true;
    const bad = t => { err.hidden = false; err.textContent = t; };
    if (W.step === 0) { const on = W.cats.filter(c => c.on && c.name.trim()); if (!on.length) return bad("Pick at least one category."); if (on.some(c => !(+c.limit > 0))) return bad("Set a monthly max for every checked category, or uncheck the ones you don't need."); }
    if (W.step === 1) { if (!(+W.paycheck > 0)) return bad("Enter your take-home pay per paycheck."); if (!W.lastPayday) return bad("Pick your most recent payday."); }
    if (W.step < 2) { W.step++; renderSetup(); window.scrollTo(0, 0); return; }
    let i = 0;
    const ok = await mutate(d => {
      d.cats = W.cats.filter(c => c.on && c.name.trim()).map(c => ({ id: uid(), name: c.name.trim(), limit: +c.limit, fixed: !!c.fixed, order: i++ }));
      d.goals = W.goals.filter(g => g.name.trim() && +g.target > 0).map(g => ({ id: uid(), name: g.name.trim(), target: +g.target, deadline: g.deadline || null, saved: 0 }));
      d.settings = { setupDone: true, paycheck: +W.paycheck, lastPayday: W.lastPayday, payFrequency: "biweekly", createdAt: Date.now() };
      d.lastCheckin = iso(today());
    }, "You're all set");
    if (ok) { S.tab = "home"; S.wiz = null; render(); }
  };
}

let toastT;
function toast(t) { let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3400); }
