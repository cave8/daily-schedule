// Interfaccia di Daily Schedule: cinque schermate (Oggi, Assistente, Calendario,
// Attività, Impostazioni). Dopo ogni cambiamento il programma viene ricalcolato.
// Le modifiche che arrivano dall'assistente, e quelle agli elementi Apple, passano
// SEMPRE dal livello proposte (js/proposals.js) e richiedono una conferma.
(function (G) {
  "use strict";
  const T = G.time, S = G.scheduler, P = G.parser, ST = G.store, PR = G.proposals, A = G.assistant;
  const MIN = T.MIN;
  const $ = (sel) => document.querySelector(sel);

  // Per le prove: ?now=2026-10-15T09:00 fa finta che sia quell'ora
  const params = new URLSearchParams(location.search);
  const fakeNow = params.get("now") ? T.fromISO(params.get("now")) : null;
  const offset = fakeNow ? fakeNow - Date.now() : 0;
  const now = () => Date.now() + offset;

  let mode = ST.getMode();
  let state = ST.load(mode);
  const ui = { tab: "oggi", listTab: "tasks", filter: "all", showDone: false, cal: { view: "day", date: T.startOfDay(now()) },
    editingProposal: null, showProposalInCal: true };
  try { ui.tab = sessionStorage.getItem("ds.tab") || "oggi"; } catch (e) { /* facoltativo */ }

  const PRIO = { 1: "Alta", 2: "Media", 3: "Bassa" };
  const PREF_LBL = { "": "Quando capita", morning: "Mattina", afternoon: "Pomeriggio", evening: "Sera" };
  const REPEAT_LBL = { none: "Mai", daily: "Ogni giorno", weekdays: "Giorni feriali (lun–ven)", weekly: "Ogni settimana", monthly: "Ogni mese" };
  const SRC_LBL = { "apple-calendar": " Calendario", "apple-reminders": " Promemoria" };

  // Icone (tratto, 24x24)
  const svg = (d, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24">' + d + "</svg>";
  const I = {
    check: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    left: svg('<path d="M15 5l-7 7 7 7"/>'),
    right: svg('<path d="M9 5l7 7-7 7"/>', "sm"),
    play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
    sparkle: svg('<path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/>'),
    bolt: svg('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>', "sm"),
    alert: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>', "sm"),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>'),
    shield: svg('<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>', "sm"),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', "sm"),
    bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/>', "sm"),
    user: svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>', "sm"),
    coffee: svg('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5"/>', "sm"),
    cloud: svg('<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.5a4 4 0 0 1-.5 8z"/>', "sm"),
    down: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', "sm"),
    up: svg('<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>', "sm"),
    phone: svg('<rect x="7" y="2.8" width="10" height="18.4" rx="2.5"/><path d="M11 18h2"/>', "sm"),
    laptop: svg('<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>', "sm"),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', "sm"),
    eyeOff: svg('<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.6 3.2M6.6 7.6C4.7 8.8 3.3 10.6 2.5 12c1 1.8 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 10a3 3 0 0 0 4.2 4.2"/>', "sm"),
    eye: svg('<path d="M2.5 12c1-1.8 4.5-6 9.5-6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z"/><circle cx="12" cy="12" r="3"/>', "sm"),
    car: svg('<path d="M5 16.5V12l2-5h10l2 5v4.5M5 16.5h14M5 16.5V19M19 16.5V19M7.5 13.5h.01M16.5 13.5h.01"/>', "sm"),
    timer: svg('<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 2.8h5"/>', "sm"),
    pause: svg('<path d="M9 6v12M15 6v12"/>', "sm"),
    stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>', "sm"),
    flame: svg('<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 3-5 3.6-8.4 2 1.4 3 3.4 3 5 .8-.6 1.4-1.6 1.6-2.8 1.8 1.6 3.8 3.8 3.8 6.2C18 18.6 15.6 21 12 21z"/>', "sm"),
    moonSm: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', "sm"),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', "sm"),
    list: svg('<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>', "sm"),
    repeat: svg('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>', "sm"),
  };

  const areaColor = (id) => (G.areas.color(id) || "");
  const areaStyle = (id) => (G.areas.color(id) ? ' style="--ac:' + G.areas.color(id) + '"' : "");
  const areaTag = (id) => { const a = G.areas.get(id); return a ? '<span class="tag area"' + areaStyle(id) + '><i></i>' + a.label + "</span>" : ""; };
  function areaPicker(cur) {
    return '<div class="field"><span class="lbl">Area</span><input type="hidden" name="area" value="' + (cur || "") + '"><div class="chips areapick">' +
      '<button type="button" data-act="set-area" data-v="" class="' + (!cur ? "on" : "") + '">Nessuna</button>' +
      G.areas.AREAS.map((a) => '<button type="button" data-act="set-area" data-v="' + a.id + '" class="' + (cur === a.id ? "on" : "") + '"' + areaStyle(a.id) + "><i></i>" + a.label + "</button>").join("") + "</div></div>";
  }
  const subProgress = (t) => (t && t.subtasks && t.subtasks.length ? t.subtasks.filter((x) => x.done).length + "/" + t.subtasks.length + " passi" : "");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const taskById = (id) => state.tasks.find((t) => t.id === id);
  const eventById = (id) => state.events.find((e) => e.id === id);
  const isApple = (src) => PR.isApple(src);
  const srcTag = (src) => isApple(src) ? '<span class="tag apple">' + SRC_LBL[src] + (mode === "demo" ? " demo" : "") + "</span>" : "";

  // ---------------- ciclo principale ----------------
  function replan() {
    if (G.routines.sync(state, now())) cleanCheckins();
    state.plan = S.plan(state, now());
  }

  function save() {
    if (!ST.save(state, mode)) toast("Attenzione: non riesco a salvare (spazio pieno?)");
  }

  // Applica una modifica INTERNA, ripianifica, salva, ridisegna. Permette "Annulla".
  function commit(fn, message) {
    const snapshot = JSON.stringify(state);
    fn(state);
    cleanCheckins();
    replan();
    save();
    render();
    if (message) toast(message, snapshot);
    return snapshot;
  }

  function cleanCheckins() {
    state.checkins = state.checkins.filter((c) => { const t = taskById(c.taskId); return t && !t.done; });
  }

  function tick() {
    const t = now();
    const last = state.lastTick || t;
    const prev = (state.plan && state.plan.blocks) || [];
    // Un blocco di attività è finito senza "Fatto": NON la consideriamo completata, chiediamo
    for (const b of prev) {
      if (b.kind !== "task" || b.end > t || b.end <= last || b.end < T.startOfDay(t)) continue;
      const task = taskById(b.taskId);
      if (task && !task.done && !state.checkins.some((c) => c.taskId === task.id)) {
        state.checkins.push({ taskId: task.id, title: task.title, start: b.start, end: b.end });
      }
    }
    notifyDue(prev, last, t);
    for (const k of Object.keys(state.hidden || {})) if (state.hidden[k].at < t - 30 * 86400000) delete state.hidden[k];
    state.lastTick = t;
    cleanCheckins();
    replan();
    save();
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest("#view") && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) $("#clock").textContent = T.fmtHM(t);
    else render();
  }

  // ---------------- notifiche ----------------
  function notifyDue(blocks, last, t) {
    last = Math.max(last, t - 5 * MIN);
    const items = [];
    for (const b of blocks) {
      if (b.kind === "task" && b.start > last && b.start <= t) items.push({ key: "t:" + b.taskId + ":" + b.start, title: "È ora di: " + b.title, body: "Fino alle " + T.fmtHM(b.end) });
      if (b.kind === "travel" && b.start > last && b.start <= t) items.push({ key: "v:" + b.id, title: "È ora di partire", body: b.title + (b.location ? " · " + b.location : "") });
      if (b.kind === "event") {
        const at = b.start - 10 * MIN;
        if (at > last && at <= t) items.push({ key: "e:" + b.id, title: "Tra 10 minuti: " + b.title, body: T.fmtHM(b.start) + (b.location ? " · " + b.location : "") });
      }
    }
    const evAt = T.atMin(T.startOfDay(t), T.hmToMin(state.settings.eveningTime || "21:00"));
    if (state.settings.eveningReview !== false && evAt > last && evAt <= t && !(state.daily[T.dateKey(t)] || {}).closed) {
      items.push({ key: "sera:" + T.dateKey(t), title: "Chiudi la giornata", body: "Due minuti per vedere cosa resta e sistemare domani" });
    }
    const f = state.focus, ft = f && taskById(f.taskId);
    if (ft && f.running && focusElapsed(f, t) >= S.taskRemaining(ft) * MIN) items.push({ key: "focus:" + ft.id + ":" + f.startedAt, title: "Tempo previsto finito", body: "«" + ft.title + "»: termina il timer o continua" });
    for (const it of items) {
      if (state.notified[it.key]) continue;
      state.notified[it.key] = t;
      toast(it.title);
      showNotification(it.title, it.body);
    }
    for (const k of Object.keys(state.notified)) if (state.notified[k] < t - 3 * 86400000) delete state.notified[k];
  }

  function showNotification(title, body) {
    if (!state.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body, icon: "icons/icon-192.png", tag: title };
    const fallback = () => { try { new Notification(title, opts); } catch (e) { /* niente */ } };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(fallback);
    else fallback();
  }

  // ---------------- disegno ----------------
  function render() {
    $("#clock").textContent = T.fmtHM(now());
    const banner = $("#demo-banner");
    banner.hidden = mode !== "demo";
    if (mode === "demo") banner.innerHTML = "DATI DIMOSTRATIVI · niente di reale viene letto o modificato <button data-act=\"exit-demo\">Esci dalla demo</button>";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
    const showWelcome = !state.onboarded && mode === "real";
    const composer = !showWelcome && (ui.tab === "oggi" || ui.tab === "assistente");
    $("#quick").hidden = !composer;
    if (document.body && document.body.classList) document.body.classList.toggle("composer-on", composer);
    const view = $("#view");
    if (showWelcome) view.innerHTML = renderWelcome();
    else if (ui.tab === "oggi") view.innerHTML = renderToday();
    else if (ui.tab === "assistente") view.innerHTML = renderAssistant();
    else if (ui.tab === "calendario") {
      const key = ui.cal.view + ":" + ui.cal.date;
      const old = view.querySelector && view.querySelector(".grid-wrap");
      const keep = old && ui._calKey === key ? old.scrollTop : null;
      view.innerHTML = renderCalendar();
      const gw = view.querySelector && view.querySelector(".grid-wrap");
      if (gw) gw.scrollTop = keep != null ? keep : +gw.dataset.scroll || 0;
      ui._calKey = key;
    }
    else if (ui.tab === "attivita") view.innerHTML = renderList();
    else view.innerHTML = renderSettings();
  }

  function renderWelcome() {
    return '<div class="welcome"><div class="logo"></div><h1>Benvenuto in Daily Schedule</h1>' +
      '<p class="sub">Organizza la tua giornata, si adatta quando cambia qualcosa e ti chiede sempre conferma prima di toccare i dati importanti.</p>' +
      '<div class="field"><label for="w-name">Come ti chiami?</label><input type="text" id="w-name" placeholder="Il tuo nome (facoltativo)"></div>' +
      '<div class="choices">' +
      '<button class="choice primary" data-act="start-real"><span class="gi">' + I.play + '</span><span><b>Inizia con i miei impegni</b><span>Parti da zero. I dati restano su questo dispositivo.</span></span></button>' +
      '<button class="choice" data-act="start-demo"><span class="gi">' + I.sparkle + '</span><span><b>Prova con una giornata di esempio</b><span>Esplora tutte le funzioni con dati finti. Puoi uscirne quando vuoi.</span></span></button>' +
      "</div>" +
      '<div class="features">' +
      "<div>" + I.check + "<span>Scrivi come parli: «domani devo studiare due ore e fare la spesa»</span></div>" +
      "<div>" + I.refresh + "<span>Se qualcosa cambia, riorganizza il resto della giornata</span></div>" +
      "<div>" + I.shield + "<span>Gratis e privato: niente account, niente dati inviati</span></div>" +
      "</div></div>";
  }

  function greeting(t) {
    const h = new Date(t).getHours();
    const g = h < 5 ? "Buonanotte" : h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
    return g + (state.profile.name ? ", " + esc(state.profile.name) : "");
  }

  function fmtDeadline(dl, t) {
    const ms = T.fromISO(dl);
    return T.fmtDay(ms, t, { short: true }).toLowerCase() + (T.hasTime(dl) ? " " + T.fmtHM(ms) : "");
  }

  function blockMeta(b, t) {
    const bits = [T.fmtDur((b.end - b.start) / MIN)];
    if (b.kind === "event" && b.location) bits.push(esc(b.location));
    if (b.kind === "event" && b.repeat && b.repeat !== "none") bits.push("↻");
    if (b.part) bits.push("parte " + b.part);
    if (b.kind === "task") {
      const task = taskById(b.taskId);
      if (task && task.deadline && !task.routineId) bits.push("scade " + fmtDeadline(task.deadline, t));
      if (subProgress(task)) bits.push(subProgress(task));
    }
    return bits.join(" · ");
  }

  function blockTags(b) {
    let s = "";
    if (b.late) s += '<span class="tag late">in ritardo</span>';
    if (b.kind === "task" && b.priority === 1) s += '<span class="tag high">alta</span>';
    if (b.pinned) s += '<span class="tag pin">orario fisso</span>';
    if (b.routine) s += '<span class="tag rt">' + I.repeat + "ogni giorno</span>";
    s += srcTag(b.source);
    return s;
  }

  function rowHTML(b, t, opts) {
    const past = b.end <= t, current = b.start <= t && b.end > t;
    const open = b.kind === "task" ? "task:" + b.taskId : b.kind === "event" ? "event:" + b.eventId + ":" + T.dateKey(b.start) : "";
    if (b.kind === "travel") {
      return '<li class="tl-item k-travel' + (past ? " past" : "") + '"><div class="tl-time">' + T.fmtHM(b.start) + '</div><div class="tl-rail"><span class="tl-dot"></span></div>' +
        '<div class="tl-card"><div class="tl-body"><div class="tl-title">' + I.car + esc(b.title) + '</div><div class="tl-meta">' + T.fmtDur((b.end - b.start) / MIN) + (b.location ? " · " + esc(b.location) : "") + "</div></div></div></li>";
    }
    const cls = ["tl-item", "k-" + b.kind, past ? "past" : "", current && b.kind !== "break" ? "current" : "",
      b.suggested ? "sugg" : "", isApple(b.source) && b.kind === "event" ? "src-apple" : ""].join(" ");
    const check = b.kind === "task" && !(opts && opts.noCheck)
      ? '<button class="check" data-act="done" data-id="' + esc(b.taskId) + '" aria-label="Segna come fatta"></button>' : "";
    const hk = hideKeyFor(b);
    const hideBtn = hk && !(opts && opts.noCheck) ? '<button class="iconbtn" data-act="hide" data-key="' + esc(hk) + '" data-title="' + esc(b.title) + '" aria-label="Oscura" title="Oscura (non cancella)">' + I.eyeOff + "</button>" : "";
    const meta = b.kind === "break" ? "" : '<div class="tl-meta">' + blockTags(b) + blockMeta(b, t) + (b.suggested ? " · suggerito" : "") + "</div>";
    return '<li class="' + cls + (b.area ? " has-area" : "") + '"' + areaStyle(b.area) + (open ? ' data-open="' + esc(open) + '"' : "") + ">" +
      '<div class="tl-time">' + T.fmtHM(b.start) + (b.kind === "break" ? "" : "<small>" + T.fmtHM(b.end) + "</small>") + "</div>" +
      '<div class="tl-rail"><span class="tl-dot"></span></div>' +
      '<div class="tl-card"><div class="tl-body"><div class="tl-title">' + esc(b.title) + "</div>" + meta + "</div>" + hideBtn + check + "</div></li>";
  }

  function timelineHTML(blocks, t, opts) {
    let html = '<ul class="tl">';
    let prevEnd = null;
    for (const b of blocks) {
      if (prevEnd != null && b.start > t && !(opts && opts.noGaps)) {
        const from = Math.max(prevEnd, t);
        if (b.start - from >= 20 * MIN) html += '<li class="tl-gap"><span></span><div class="tl-rail"></div><span>Libero · ' + T.fmtDur((b.start - from) / MIN) + "</span></li>";
      }
      html += rowHTML(b, t, opts);
      prevEnd = Math.max(prevEnd || 0, b.end);
    }
    return html + "</ul>";
  }

  function warningsHTML(filterDay, max) {
    let ws = (state.plan && state.plan.warnings) || [];
    if (filterDay) ws = ws.filter((w) => w.type !== "overloaded" || w.day === filterDay);
    if (!ws.length) return "";
    max = max || 3;
    return ws.slice(0, max).map((w) => {
      const cls = w.type === "overdue" || w.type === "late" || w.type === "conflict" ? "danger" : "warn";
      const btn = w.taskId ? ' <button class="link" data-open="task:' + esc(w.taskId) + '">Sistema</button>' : "";
      return '<div class="alert ' + cls + '">' + I.alert + "<span>" + esc(w.text) + btn + "</span></div>";
    }).join("") + (ws.length > max ? '<p class="small muted" style="margin:4px 4px 0">e altri ' + (ws.length - max) + ' avvisi · <button class="link small" data-tab="attivita">Vedi attività</button></p>' : "");
  }

  function checkinsHTML() {
    return state.checkins.map((c) => {
      const id = esc(c.taskId);
      return '<div class="card checkin"><div class="q">Hai finito «' + esc(c.title) + '»?</div>' +
        '<div class="small muted" style="margin-top:2px">Era previsto ' + T.fmtHM(c.start) + "–" + T.fmtHM(c.end) + "</div>" +
        '<div class="actions">' +
        '<button class="btn ok small" data-act="done" data-id="' + id + '">' + I.check + "Sì, fatto</button>" +
        '<button class="btn small" data-act="checkin-more" data-id="' + id + '" data-min="15">+15 min</button>' +
        '<button class="btn small" data-act="checkin-more" data-id="' + id + '" data-min="30">+30 min</button>' +
        '<button class="btn small" data-act="checkin-more" data-id="' + id + '" data-min="60">+1 h</button>' +
        '<button class="btn small" data-act="checkin-tomorrow" data-id="' + id + '">Domani</button>' +
        '<button class="btn small ghost" data-act="checkin-no" data-id="' + id + '">Non l\'ho fatto</button>' +
        "</div></div>";
    }).join("");
  }

  function nowCardHTML(blocks, t) {
    const cur = blocks.find((b) => b.start <= t && b.end > t && (b.kind === "task" || b.kind === "event")) ||
      blocks.find((b) => b.start <= t && b.end > t && (b.kind === "travel" || b.kind === "break"));
    const next = blocks.find((b) => b.start > t && (b.kind === "task" || b.kind === "event"));
    const nextLine = next ? '<div class="next">Poi alle ' + T.fmtHM(next.start) + ": <b>" + esc(next.title) + "</b>" + (next.suggested ? " · suggerito" : "") + "</div>" : "";
    const f = state.focus;
    // Timer attivo: la scheda mostra il tempo che passa
    const focusTask = f && taskById(f.taskId);
    if (focusTask && !focusTask.done) return focusCardHTML(focusTask, f, t, nextLine);
    if (cur && cur.kind === "task") {
      const task = taskById(cur.taskId);
      const pct = Math.min(100, Math.max(0, ((t - cur.start) / (cur.end - cur.start)) * 100));
      const id = esc(cur.taskId);
      return '<div class="card now k-task"' + areaStyle(cur.area) + '><div class="label"><i></i>Adesso</div>' +
        '<div class="title">' + esc(cur.title) + "</div>" +
        '<div class="meta">Fino alle ' + T.fmtHM(cur.end) + " · mancano " + T.fmtDur(Math.ceil((cur.end - t) / MIN)) + "</div>" +
        '<div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' + subChecklistHTML(task) + notesHTML(task) +
        '<div class="actions"><button class="btn primary" data-act="done" data-id="' + id + '">' + I.check + "Fatto</button>" +
        '<button class="btn" data-act="focus-start" data-id="' + id + '">' + I.timer + "Timer</button>" +
        '<button class="btn" data-act="extend" data-id="' + id + '">+15 min</button>' +
        '<button class="btn" data-act="snooze-menu" data-id="' + id + '">Rimanda</button></div>' + nextLine + "</div>";
    }
    if (cur && cur.kind === "event") {
      return '<div class="card now k-event"' + areaStyle(cur.area) + '><div class="label"><i></i>Adesso</div>' +
        '<div class="title">' + esc(cur.title) + srcTag(cur.source) + "</div>" +
        '<div class="meta">Fino alle ' + T.fmtHM(cur.end) + (cur.location ? " · " + esc(cur.location) : "") + "</div>" +
        '<div class="progress"><i style="width:' + Math.min(100, ((t - cur.start) / (cur.end - cur.start)) * 100).toFixed(1) + '%"></i></div>' + nextLine + "</div>";
    }
    if (cur && cur.kind === "travel") {
      return '<div class="card now"><div class="label"><i></i>Adesso</div><div class="title">' + I.car + " In viaggio</div>" +
        '<div class="meta">' + esc(cur.title) + (cur.location ? " · " + esc(cur.location) : "") + " · arrivo alle " + T.fmtHM(cur.end) + "</div>" + nextLine + "</div>";
    }
    if (cur && cur.kind === "break") {
      return '<div class="card now"><div class="label"><i></i>Adesso</div><div class="title">' + esc(cur.title) + "</div>" +
        '<div class="meta">Fino alle ' + T.fmtHM(cur.end) + "</div>" + nextLine + "</div>";
    }
    if (next) {
      const mins = Math.round((next.start - t) / MIN);
      const startBtn = next.kind === "task"
        ? '<div class="actions"><button class="btn primary" data-act="start" data-id="' + esc(next.taskId) + '">' + I.play + "Inizia ora</button></div>" : "";
      return '<div class="card now"><div class="label"><i></i>Adesso</div><div class="title">Tempo libero</div>' +
        '<div class="meta">' + (mins > 0 ? "Tra " + T.fmtDur(mins) + ": " : "Ora: ") + "<b>" + esc(next.title) + "</b>" + (next.suggested ? " (suggerito)" : "") + "</div>" + startBtn + "</div>";
    }
    return "";
  }

  function freeMinutesToday(t) {
    const day = T.startOfDay(t);
    const h = state.settings.hours[new Date(day).getDay()];
    if (!h || !h.on) return 0;
    let free = [[Math.max(t, T.atMin(day, T.hmToMin(h.start))), T.atMin(day, T.hmToMin(h.end))]];
    if (free[0][1] <= free[0][0]) return 0;
    for (const b of state.plan.blocks) if (b.kind !== "allday") free = S.subtract(free, b.start, b.end);
    return free.reduce((a, [x, y]) => a + (y - x) / MIN, 0);
  }

  function renderToday() {
    const t = now();
    const day = T.startOfDay(t), dayEnd = T.addDays(day, 1);
    const blocks = state.plan.blocks.filter((b) => b.end > day && b.start < dayEnd);
    const doneToday = state.tasks.filter((x) => x.done && x.doneAt && T.startOfDay(T.fromISO(x.doneAt)) === day);
    const evToday = new Set(blocks.filter((b) => b.kind === "event").map((b) => b.id));
    const taskIdsToday = new Set(blocks.filter((b) => b.kind === "task").map((b) => b.taskId));
    const taskLeft = blocks.filter((b) => b.kind === "task" && b.end > t).reduce((a, b) => a + (b.end - Math.max(b.start, t)), 0) / MIN;
    const free = freeMinutesToday(t);
    let html = '<div class="page-head"><div class="eyebrow">' + esc(T.fmtLongDate(t)) + "</div><h1>" + greeting(t) + "</h1></div>";

    if (!state.tasks.length && !state.events.length) {
      return html + '<div class="card"><div style="font-weight:650;font-size:17px">Iniziamo</div>' +
        '<p class="muted" style="margin:6px 0 12px">Scrivi nella barra in basso cosa devi fare, come lo diresti a voce. Oppure tocca un esempio:</p>' +
        '<div class="suggest">' + ["Domani devo studiare due ore, andare in palestra e fare la spesa", "Dentista venerdì alle 15", "Preparare il preventivo 2h entro lunedì !"]
          .map((e) => '<button data-act="say" data-text="' + esc(e) + '">' + esc(e) + "</button>").join("") + "</div>" +
        '<p class="small muted" style="margin:14px 0 0">Prima controlla i tuoi orari in <button class="link small" data-tab="impostazioni">Impostazioni</button>.</p></div>';
    }

    // Riepilogo con anello di avanzamento
    const total = doneToday.length + taskIdsToday.size;
    const pct = total ? doneToday.length / total : 0;
    const C = 2 * Math.PI * 22;
    html += '<div class="card summary"><div class="ring"><svg viewBox="0 0 56 56"><circle class="bg" cx="28" cy="28" r="22"/><circle class="fg" cx="28" cy="28" r="22" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/></svg><span>' + doneToday.length + "/" + total + "</span></div>" +
      '<div><div class="headline">' + (total === 0 ? "Niente attività per oggi" : doneToday.length === total ? "Tutto fatto per oggi" : doneToday.length + " di " + total + " attività completate") + "</div>" +
      '<div class="st"><span><b>' + evToday.size + "</b> appuntamenti</span><span><b>" + (taskLeft ? T.fmtDurShort(taskLeft) : "0") + "</b> di attività</span><span><b>" + T.fmtDurShort(free) + "</b> liberi</span></div></div></div>";

    const allDay = blocks.filter((b) => b.kind === "allday");
    if (allDay.length) html += '<div class="allday">' + allDay.map((b) => "<span>" + esc(b.title) +
      (hideKeyFor(b) ? ' <button class="chipx" data-act="hide" data-key="' + esc(hideKeyFor(b)) + '" data-title="' + esc(b.title) + '" aria-label="Oscura">' + I.eyeOff + "</button>" : "") + "</span>").join("") + "</div>";

    const dk = T.dateKey(t);
    const daily = state.daily[dk] || {};
    const mins = T.minOfDay(t);
    if (state.settings.morningBriefing !== false && !daily.briefing && mins >= 4 * 60 && mins < 14 * 60) html = html.replace('<div class="card summary">', briefingHTML(t) + '<div class="card summary">');
    if (state.settings.eveningReview !== false && !daily.closed && mins >= T.hmToMin(state.settings.eveningTime || "21:00")) html += eveningCardHTML();
    html += checkinsHTML();
    const pending = state.proposals.filter((p) => p.status === "pending");
    if (pending.length) html += '<div class="alert info">' + I.sparkle + '<span>Hai una proposta da confermare. <button class="link" data-tab="assistente">Apri</button></span></div>';
    html += nowCardHTML(blocks, t);
    html += warningsHTML(T.dateKey(t), 2);

    html += '<div class="sec"><h2>Programma</h2><button class="link" data-act="imprevisto">' + I.bolt + "Imprevisto</button></div>";
    const visible = blocks.filter((b) => b.kind !== "allday" && (b.kind !== "break" || b.end > t));
    if (!visible.length) {
      const tomorrow = state.plan.blocks.find((b) => b.start >= dayEnd && (b.kind === "task" || b.kind === "event"));
      html += '<div class="card empty">' + I.moon + "<div>Nient'altro per oggi.</div>" +
        (tomorrow ? '<div class="small" style="margin-top:4px">Prossimo: <b>' + esc(tomorrow.title) + "</b> " + T.fmtDay(tomorrow.start, t).toLowerCase() + " alle " + T.fmtHM(tomorrow.start) + "</div>" : "") + "</div>";
    } else {
      html += timelineHTML(visible, t);
    }
    const hidToday = hiddenList(T.dateKey(t));
    if (hidToday.length) html += '<p class="hidden-line">' + I.eyeOff + hidToday.length + (hidToday.length === 1 ? " elemento oscurato" : " elementi oscurati") + ' oggi · <button class="link small" data-act="hidden-menu">Mostra</button></p>';

    const top = state.tasks.filter((x) => !x.done && !x.routineId).sort((a, b) =>
      ((a.priority || 2) - (b.priority || 2)) || (S.deadlineMs(a.deadline) - S.deadlineMs(b.deadline))).slice(0, 3);
    if (top.length) {
      html += '<div class="sec"><h2>Priorità</h2><button class="link" data-tab="attivita">Tutte</button></div><div class="card list-card"><ul class="list">' + top.map((x) => {
        const inf = state.plan.info[x.id] || {};
        return '<li class="li" data-open="task:' + esc(x.id) + '"><button class="check" data-act="done" data-id="' + esc(x.id) + '" aria-label="Segna come fatta"></button>' +
          '<div class="body"><div class="title">' + esc(x.title) + "</div>" +
          '<div class="meta">' + areaTag(x.area) + (x.priority === 1 ? '<span class="tag high">alta</span>' : "") + srcTag(x.source) + T.fmtDur(S.taskRemaining(x)) + (x.deadline ? " · scade " + fmtDeadline(x.deadline, t) : "") + (subProgress(x) ? " · " + subProgress(x) : "") +
          (inf.start ? " · " + T.fmtDay(inf.start, t, { short: true }).toLowerCase() + " " + T.fmtHM(inf.start) : inf.unscheduled ? " · senza posto" : "") + "</div></div></li>";
      }).join("") + "</ul></div>";
    }

    if (doneToday.length) {
      html += '<div class="sec"><h2>Completate oggi</h2></div><div class="card list-card"><ul class="list">' + doneToday.map((x) =>
        '<li class="li done" data-open="task:' + esc(x.id) + '">' +
        (isApple(x.source) ? '<span class="check done"></span>' : '<button class="check done" data-act="undone" data-id="' + esc(x.id) + '" aria-label="Segna come da fare"></button>') +
        '<div class="body"><div class="title">' + esc(x.title) + srcTag(x.source) + '</div><div class="meta">alle ' + T.fmtHM(T.fromISO(x.doneAt)) + (x.actual ? " · " + T.fmtDur(x.actual) + " col timer" : "") + "</div></div></li>").join("") + "</ul></div>";
    }
    html += weekCardHTML(t);
    if (state.settings.eveningReview !== false) html += '<p style="text-align:center;margin-top:22px"><button class="btn small ghost" data-act="evening-open">' + I.moonSm + (daily.closed ? "Giornata chiusa · riapri" : "Chiudi la giornata") + "</button></p>";
    return html;
  }

  // ---------------- Assistente ----------------
  function renderAssistant() {
    let html = '<div class="page-head"><div class="eyebrow">Assistente</div><h1>Come posso aiutarti?</h1></div>' +
      '<div class="privacy-note">' + I.shield + "<span>Funziona sul tuo dispositivo, gratis. Nessuna modifica senza la tua conferma.</span></div>";
    html += '<div class="chat">';
    const msgs = state.chat.slice(-60);
    if (!msgs.length) {
      html += '<div class="msg assistant">Ciao' + (state.profile.name ? " " + esc(state.profile.name) : "") + '! Dimmi cosa devi fare o chiedimi come organizzare il tempo. Ti mostro sempre le modifiche prima di applicarle.</div>';
    }
    for (const m of msgs) {
      if (m.role === "user") { html += '<div class="msg user">' + esc(m.text) + "</div>"; continue; }
      const p = m.proposalId ? state.proposals.find((x) => x.id === m.proposalId) : null;
      html += '<div class="msg assistant' + (p || m.dayPlan ? " wide" : "") + '">' + esc(m.text);
      if (m.actions && m.actions.length) {
        html += '<div class="actions">' + m.actions.map((a) => {
          if (a.act === "open-event") return '<button class="btn small" data-open="event:' + esc(a.id) + '">' + esc(a.label) + "</button>";
          const t = taskById(a.id);
          if (!t || t.done) return "";
          return '<button class="btn small" data-act="' + esc(a.act) + '" data-id="' + esc(a.id) + '">' + esc(a.label) + "</button>";
        }).join("") + "</div>";
      }
      if (m.dayPlan) html += dayPlanHTML(m.dayPlan);
      if (p) html += proposalHTML(p);
      html += "</div>";
    }
    const last = msgs[msgs.length - 1];
    const sug = (last && last.suggestions) || ["Cosa dovrei fare adesso?", "Ho solo 45 minuti liberi", "Organizzami la giornata di domani", "Cosa sai fare?"];
    if (!last || last.role === "assistant") html += '<div class="suggest">' + sug.map((s) => '<button data-act="say" data-text="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div>";
    html += "</div>";
    if (state.chat.length) html += '<p style="text-align:center;margin-top:22px"><button class="btn small ghost" data-act="clear-chat">Cancella la conversazione</button></p>';
    return html;
  }

  function dayPlanHTML(dk) {
    const t = now();
    const d = T.fromKey(dk), de = T.addDays(d, 1);
    const bl = state.plan.blocks.filter((b) => b.start < de && b.end > Math.max(d, t) && (b.kind === "task" || b.kind === "event"));
    if (!bl.length) return "";
    return '<div style="margin-top:12px;white-space:normal">' + timelineHTML(bl, t, { noCheck: true }) + "</div>";
  }

  function fmtRange(r, t) {
    if (!r) return "—";
    const sameDay = T.dateKey(r.start) === T.dateKey(t);
    return (sameDay ? "" : T.fmtDay(r.start, t, { short: true }).toLowerCase() + " ") + T.fmtHM(r.start) + "–" + T.fmtHM(r.end);
  }

  const TYPE_LBL = { moved: "spostato", added: "nuovo", removed: "tolto dal programma", completed: "completato", edited: "modificato" };

  function proposalHTML(p) {
    const t = now();
    const statusLbl = { pending: "Da confermare", applied: "Applicata", cancelled: "Annullata", superseded: "Sostituita da una versione nuova", expired: "Non più attuale", failed: "Non eseguita" }[p.status] || p.status;
    const cls = p.status === "applied" ? "done" : p.status === "pending" ? "" : "closed";
    const icon = p.status === "applied" ? I.check : p.status === "pending" ? I.sparkle : I.x;
    let html = '<div class="proposal ' + cls + '"><div class="p-head"><span class="p-icon">' + icon + '</span><div><div class="p-title">' + esc(p.summary || "Proposta") +
      '</div><div class="p-status">' + statusLbl + "</div></div></div><div class=\"p-body\">";
    if (p.status === "pending") {
      if (p.reason) html += '<div class="p-why">' + esc(p.reason) + "</div>";
      const stale = PR.concurrencyCheck(p, state);
      const errs = PR.validate(p, state);
      let pv = null;
      try { pv = PR.preview(p, state, t); } catch (e) { errs.push("anteprima non disponibile"); }
      if (pv) {
        html += '<div class="p-label">Cosa cambia</div>';
        html += pv.changes.length ? '<ul class="changes">' + pv.changes.map((c) =>
          '<li class="' + (c.direct ? "direct" : "") + '"><div class="ct"><b>' + esc(c.title) + (c.source && isApple(c.source) && c.kind === "event" ? srcTag(c.source) : "") + "</b>" +
          "<span>" + (TYPE_LBL[c.type] || "") + (c.direct ? "" : " · di conseguenza") + "</span></div>" +
          '<div class="cw">' + (c.type === "moved" ? '<span class="old">' + fmtRange(c.before, t) + '</span><span class="new">' + fmtRange(c.after, t) + "</span>"
            : c.type === "added" ? '<span class="new">' + fmtRange(c.after, t) + "</span>"
            : c.type === "removed" || c.type === "completed" ? '<span class="old">' + fmtRange(c.before, t) + "</span>"
            : c.unplaced ? '<span class="old">senza posto</span>' : "") + "</div></li>").join("") + "</ul>" : '<p class="small muted">Nessun orario cambia.</p>';
        if (pv.newWarnings.length) html += pv.newWarnings.map((w) => '<div class="alert danger">' + I.alert + "<span>" + esc(w.text) + "</span></div>").join("");
        if (pv.resolvedWarnings.length) html += pv.resolvedWarnings.map((w) => '<div class="alert good">' + I.check + "<span>Risolto: " + esc(w.text) + "</span></div>").join("");
        if (pv.appleOps.length) html += '<div class="p-note">' + (mode === "demo"
          ? "Demo: la conferma modifica solo gli elementi Apple finti di questa demo."
          : "Modifica dati Apple: verrà eseguita dall'app per Mac solo dopo la tua conferma.") + "</div>";
        html += "<details><summary>Dettagli" + (pv.unchanged.length ? " · restano invariati " + pv.unchanged.length + " impegni" : "") + "</summary>" +
          '<div class="p-label">Operazioni</div><ul class="ops">' + p.ops.map((o, i) => "<li>" + esc(PR.describe(o)) +
            (PR.touchesApple(o) ? (mode === "demo" ? ' <span class="tag demo">demo</span>' : ' <span class="tag apple">dato Apple</span>') : "") +
            (ui.editingProposal === p.id && o.type !== "complete_task" ? ' <button class="link small" data-act="edit-op" data-pid="' + esc(p.id) + '" data-i="' + i + '">Modifica</button>' : "") + "</li>").join("") + "</ul>" +
          (pv.unchanged.length ? '<div class="p-label">Restano invariati</div><ul class="ops">' + pv.unchanged.map((u) => "<li>" + fmtRange(u.before, t) + " · " + esc(u.title) + "</li>").join("") + "</ul>" : "") +
          '<p class="small muted">Gli orari delle attività sono suggerimenti di Daily Schedule.</p></details>';
      }
      if (stale.length) html += '<div class="p-err">Qualcosa è cambiato nel frattempo: ' + esc(stale.join("; ")) + ". Chiedimi una nuova proposta.</div>";
      else if (errs.length) html += '<div class="p-err">' + esc(errs.join("; ")) + "</div>";
      if (ui.editingProposal === p.id) html += '<div class="note info" style="margin-top:10px">Apri «Dettagli» e tocca «Modifica» accanto all\'operazione da cambiare.</div>';
      const blocked = stale.length || errs.length;
      html += '<div class="p-actions">' +
        '<button class="btn primary block" data-act="confirm-proposal" data-pid="' + esc(p.id) + '"' + (blocked ? " disabled" : "") + ">" + I.check + "Conferma modifiche</button>" +
        '<button class="btn" data-act="edit-proposal" data-pid="' + esc(p.id) + '">Modifica proposta</button>' +
        '<button class="btn" data-act="cancel-proposal" data-pid="' + esc(p.id) + '">Annulla</button></div>';
    } else if (p.status === "applied") {
      html += '<p class="small" style="margin:0;color:var(--ok)">Eseguita e verificata alle ' + T.fmtHM(p.appliedAt) + (p.simulatedApple ? " (demo: nessun dato Apple reale toccato)" : "") + ".</p>";
    } else if (p.error) {
      html += '<div class="p-err" style="margin-top:0">' + esc(p.error) + "</div>";
    } else {
      html += '<p class="small muted" style="margin:0">Nessuna modifica eseguita.</p>';
    }
    return html + "</div></div>";
  }

  function addMsg(m) {
    state.chat.push(Object.assign({ at: now() }, m));
    if (state.chat.length > 200) state.chat = state.chat.slice(-200);
  }

  function ask(text) {
    text = String(text || "").trim();
    if (!text) return;
    if (ui.tab !== "assistente") { ui.tab = "assistente"; rememberTab(); }
    addMsg({ role: "user", text });
    let r;
    try { r = A.respond(text, state, now()); } catch (e) {
      console.error(e);
      r = { text: "Scusa, qualcosa è andato storto mentre leggevo la richiesta. Prova a riformularla." };
    }
    const msg = { role: "assistant", text: r.text, actions: r.actions, dayPlan: r.dayPlan, suggestions: r.suggestions };
    if (r.ops && r.ops.length) {
      const p = newProposal(r.ops, { summary: r.summary, reason: r.reason });
      msg.proposalId = p.id;
    }
    addMsg(msg);
    save();
    render();
    scrollChatEnd();
  }

  // Crea una proposta; quelle ancora in attesa diventano "non più attuali"
  function newProposal(ops, meta) {
    for (const p of state.proposals) if (p.status === "pending") p.status = "expired";
    const p = PR.create(state, ops, meta, now());
    state.proposals.push(p);
    if (state.proposals.length > 100) state.proposals = state.proposals.slice(-100);
    ui.editingProposal = null;
    return p;
  }

  function scrollChatEnd() {
    try { setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 30); } catch (e) { /* niente */ }
  }

  function confirmProposal(pid) {
    const p = state.proposals.find((x) => x.id === pid);
    if (!p) return;
    // La conferma nasce SOLO qui, dal pulsante, ed è legata all'impronta di questa proposta
    const confirmation = { proposalId: p.id, fingerprint: p.fingerprint };
    const res = PR.apply(p, state, confirmation, now(), { mode, appleBridge: null });
    if (!res.ok) {
      p.status = "failed";
      p.error = res.error;
      addMsg({ role: "assistant", text: "Non ho applicato nessuna modifica. " + res.error });
      save(); render(); scrollChatEnd();
      return;
    }
    const snapshot = JSON.stringify(state);
    for (const o of p.ops) if (o.type === "complete_task") G.routines.logDone(res.state, res.state.tasks.find((x) => x.id === o.targetId), true);
    const np = res.state.proposals.find((x) => x.id === pid);
    np.status = "applied";
    np.appliedAt = now();
    np.simulatedApple = !!res.simulatedApple;
    state = res.state;
    state.chat.push({ role: "assistant", at: now(), text: "Fatto ✓ Ho applicato " + (p.ops.length === 1 ? "la modifica" : "le " + p.ops.length + " modifiche") + " e ho verificato il risultato." +
      (res.simulatedApple ? "\n(Demo: gli elementi «Apple» sono finti, nessun dato reale è stato toccato.)" : "") + "\nIl programma è stato ricalcolato." });
    cleanCheckins();
    replan(); save(); render(); scrollChatEnd();
    toast("Modifiche applicate", snapshot);
  }

  function cancelProposal(pid) {
    const p = state.proposals.find((x) => x.id === pid);
    if (!p || p.status !== "pending") return;
    p.status = "cancelled";
    ui.editingProposal = null;
    addMsg({ role: "assistant", text: "Ok, ho annullato la proposta. Non ho modificato nulla." });
    save(); render();
  }

  // "Modifica proposta": si modifica un'operazione nel modulo; il risultato è una NUOVA proposta
  function editProposal(pid) {
    const p = state.proposals.find((x) => x.id === pid);
    if (!p || p.status !== "pending") return;
    const editable = p.ops.map((o, i) => i).filter((i) => p.ops[i].type !== "complete_task");
    if (!editable.length) { toast("Questa proposta si può solo confermare o annullare"); return; }
    if (editable.length === 1) { editOp(pid, editable[0]); return; }
    ui.editingProposal = pid;
    render();
  }

  function editOp(pid, i) {
    const p = state.proposals.find((x) => x.id === pid);
    const o = p && p.ops[i];
    if (!o) return;
    const ctx = { pid, i };
    if (o.type === "create_task") taskForm(Object.assign({}, o.after), "proposal", ctx);
    else if (o.type === "update_task") taskForm(Object.assign({}, o.before, o.after), "proposal", ctx);
    else if (o.type === "create_event") eventForm(Object.assign({}, o.after), "proposal", null, ctx);
    else if (o.type === "update_event") eventForm(Object.assign({}, o.before, o.after), "proposal", null, ctx);
  }

  function replaceOp(ctx, data) {
    const old = state.proposals.find((x) => x.id === ctx.pid);
    if (!old || old.status !== "pending") return;
    const o = old.ops[ctx.i];
    let nop;
    if (o.type.startsWith("create")) nop = Object.assign({}, o, { after: Object.assign({}, o.after, data) });
    else {
      const after = {};
      for (const k of Object.keys(data)) if (JSON.stringify(data[k] == null ? null : data[k]) !== JSON.stringify(o.before[k] == null ? null : o.before[k])) after[k] = data[k];
      nop = Object.assign({}, o, { after });
    }
    const ops = old.ops.slice();
    ops[ctx.i] = nop;
    old.status = "superseded";
    const p = PR.create(state, ops, { summary: old.summary, reason: old.reason }, now());
    state.proposals.push(p);
    addMsg({ role: "assistant", text: "Ho aggiornato la proposta con le tue modifiche. Siccome è cambiata, serve una nuova conferma.", proposalId: p.id });
    ui.editingProposal = null;
    if (ui.tab !== "assistente") { ui.tab = "assistente"; rememberTab(); }
    save(); render(); scrollChatEnd();
  }


  // ---------------- Oscurare (nascondere senza cancellare) ----------------
  // Chiave: "e:idOccorrenza" per gli appuntamenti, "t:idAttività@giorno" per i promemoria Apple.
  function hideKeyFor(b) {
    if (b.kind === "event" || b.kind === "allday") {
      if (isApple(b.source) || (b.repeat && b.repeat !== "none")) return "e:" + b.id;
      return null;
    }
    if (b.kind === "task" && b.source === "apple-reminders") return "t:" + b.taskId + "@" + T.dateKey(b.start);
    return null;
  }

  function hiddenDay(key) {
    const at = key.lastIndexOf("@");
    if (at > 0) return key.slice(at + 1);
    const ev = eventById(key.slice(2));
    return ev ? T.dateKey(T.fromISO(ev.start)) : "";
  }

  function hideItem(key, title) {
    closeModal();
    commit((s) => { s.hidden[key] = { at: now(), title: title || "" }; },
      "«" + title + "» oscurato. Non è cancellato" + (key.startsWith("t:") ? " da Promemoria" : " dal calendario"));
  }

  function hiddenList(onlyDay) {
    return Object.keys(state.hidden || {}).filter((k) => !onlyDay || hiddenDay(k) === onlyDay)
      .filter((k) => hiddenDay(k) >= T.dateKey(now()))
      .sort((a, b) => hiddenDay(a).localeCompare(hiddenDay(b)));
  }

  function hiddenMenu() {
    const t = now();
    const list = hiddenList();
    openModal("<h2>Elementi oscurati</h2>" +
      '<p class="sub" style="margin:-6px 0 14px">Sono nascosti da Daily Schedule e ignorati nel programma, ma non sono stati cancellati da Apple.</p>' +
      (list.length ? '<div class="group">' + list.map((k) =>
        '<div class="g-row"><span class="gi grey">' + I.eyeOff + '</span><div class="gt"><b>' + esc(state.hidden[k].title || "Elemento") + "</b><span>" +
        T.fmtDay(T.fromKey(hiddenDay(k)), t) + (k.startsWith("t:") ? " · promemoria" : " · appuntamento") + "</span></div>" +
        '<button class="btn small" data-act="unhide" data-key="' + esc(k) + '">' + I.eye + "Ripristina</button></div>").join("") + "</div>"
        : '<div class="card empty">' + I.eye + "<div>Nessun elemento oscurato.</div></div>") +
      '<div class="sheet-actions"><span class="spacer"></span><button class="btn ghost" data-act="close">Chiudi</button></div>');
  }

  // ---------------- Ogni giorno (routine) ----------------
  function routineToday(r) {
    const key = T.dateKey(now());
    const occ = state.tasks.find((x) => x.routineId === r.id && x.occ === key);
    if (!G.routines.occursOn(r, now())) return "non oggi";
    if (state.routineSkips[r.id + "@" + key]) return "saltata oggi";
    if (!occ) return "";
    if (occ.done) return "fatta oggi ✓";
    const inf = state.plan.info[occ.id] || {};
    return inf.start ? "oggi alle " + T.fmtHM(inf.start) : inf.unscheduled ? "oggi non c'è spazio" : "";
  }

  function routineWhen(r) {
    return r.time ? "alle " + r.time : r.pref ? { morning: "mattina", afternoon: "pomeriggio", evening: "sera" }[r.pref] : "quando c'è tempo";
  }

  function renderRoutines() {
    const routines = state.routines || [];
    let html = '<p class="g-foot" style="margin:0 4px 14px">Le cose che fai ogni giorno. Le inserisco io nel programma, nel momento giusto; se un giorno non c\'è posto, le salto.</p>';
    if (routines.length) {
      html += '<div class="group">' + routines.map((r) => {
        const st = routineToday(r);
        return '<div class="g-row" data-open="routine:' + esc(r.id) + '" style="cursor:pointer">' +
          '<input type="checkbox" class="switch" data-set="routine-active" data-id="' + esc(r.id) + '"' + (r.active !== false ? " checked" : "") + ' aria-label="Attiva">' +
          '<div class="gt"><b>' + esc(r.title) + (G.stats.streak(state, r, now()) > 1 ? ' <span class="streak sm">' + I.flame + G.stats.streak(state, r, now()) + "</span>" : "") + "</b><span>" + T.fmtDur(r.duration) + " · " + routineWhen(r) + " · " + G.routines.describeDays(r.days) + (st ? " · " + st : "") + "</span></div>" +
          '<span class="chev">' + I.right + "</span></div>";
      }).join("") + "</div>";
    } else {
      html += '<div class="card empty">' + I.repeat + "<div>Nessuna routine. Aggiungine una qui sotto.</div></div>";
    }
    const have = new Set(routines.map((r) => r.title.toLowerCase()));
    const sugg = G.routines.CATALOG.filter((c) => !have.has(c.title.toLowerCase()));
    if (sugg.length) {
      html += '<div class="sec"><h2>Suggerimenti</h2></div><div class="tiles">' + sugg.map((c) =>
        '<button class="tile" data-act="add-routine" data-key="' + c.key + '"><span class="tt">' + esc(c.title) + '</span><span class="ts">' + T.fmtDur(c.duration) + " · " + routineWhen(c) + '</span><span class="tp">' + I.plus + "Aggiungi</span></button>").join("") + "</div>";
    }
    return html;
  }

  function routineForm(r, isNew) {
    const days = r.days || G.routines.ALL_DAYS;
    const durChips = [10, 15, 20, 30, 45, 60, 90].map((d) =>
      '<button type="button" data-act="set-dur" data-min="' + d + '" class="' + (d === r.duration ? "on" : "") + '">' + T.fmtDur(d) + "</button>").join("");
    openModal('<form id="routine-form" data-id="' + esc(isNew ? "" : r.id) + '"><h2>' + (isNew ? "Nuova routine" : "Routine") + "</h2>" +
      '<div class="field"><label for="rf-title">Cosa fai ogni giorno</label><input type="text" id="rf-title" name="title" required maxlength="120" value="' + esc(r.title || "") + '"></div>' +
      '<div class="field"><label>Durata (minuti)</label><input type="number" inputmode="numeric" name="duration" min="5" max="480" step="5" value="' + (r.duration || 30) + '"><div class="chips">' + durChips + "</div></div>" +
      areaPicker(r.area) +
      '<div class="row2"><div class="field"><label>Momento</label><select name="pref">' + Object.keys(PREF_LBL).map((k) => '<option value="' + k + '"' + ((r.pref || "") === k ? " selected" : "") + ">" + PREF_LBL[k] + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Orario fisso (facoltativo)</label><input type="time" name="time" value="' + esc(r.time || "") + '"></div></div>' +
      '<div class="field"><span class="lbl">Giorni</span><input type="hidden" name="days" value="' + days.join(",") + '"><div class="chips daypick">' +
      G.routines.ALL_DAYS.map((d) => '<button type="button" data-act="toggle-day" data-d="' + d + '" class="' + (days.includes(d) ? "on" : "") + '">' + T.GIORNI_BREVI[d] + "</button>").join("") + "</div></div>" +
      '<div class="sheet-actions"><button class="btn primary" type="submit">Salva</button><span class="spacer"></span>' +
      (isNew ? "" : '<button class="btn danger" type="button" data-act="delete-routine" data-id="' + esc(r.id) + '">Elimina</button>') +
      '<button class="btn ghost" type="button" data-act="close">Chiudi</button></div></form>');
  }

  function saveRoutineForm(form) {
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    if (!title) return;
    const days = String(f.get("days") || "").split(",").filter((x) => x !== "").map(Number);
    const data = { title, duration: Math.max(5, Math.min(480, parseInt(f.get("duration"), 10) || 30)),
      pref: f.get("pref") || null, time: f.get("time") || null, days: days.length ? days : G.routines.ALL_DAYS.slice(), area: f.get("area") || null };
    const id = form.dataset.id;
    closeModal();
    if (id) commit((s) => Object.assign(s.routines.find((x) => x.id === id), data), "Routine aggiornata");
    else commit((s) => s.routines.push(G.routines.create(data, now())), "«" + title + "» aggiunta: la trovi ogni giorno nel programma");
  }

  // Scheda di un'occorrenza di routine (si modifica la routine, non la singola occorrenza)
  function routineOccSheet(t) {
    const r = state.routines.find((x) => x.id === t.routineId);
    const inf = state.plan.info[t.id] || {};
    openModal("<h2>" + esc(t.title) + '<span class="tag rt">' + I.repeat + "ogni giorno</span></h2>" +
      '<p class="sub" style="margin:-6px 0 16px">' + T.fmtDur(t.duration) + (inf.start ? " · suggerita " + T.fmtDay(inf.start, now()).toLowerCase() + " alle " + T.fmtHM(inf.start) : inf.unscheduled ? " · oggi non c'è spazio" : "") + "</p>" +
      '<div class="menu">' +
      (t.done ? '<button class="btn" data-act="undone" data-id="' + esc(t.id) + '">Segna come da fare</button>' : '<button class="btn" data-act="done" data-id="' + esc(t.id) + '">' + I.check + "Fatto</button>") +
      (t.done ? "" : '<button class="btn" data-act="skip-routine" data-id="' + esc(t.id) + '">Salta per ' + (t.occ === T.dateKey(now()) ? "oggi" : T.fmtDay(T.fromKey(t.occ), now()).toLowerCase()) + "</button>") +
      (r ? '<button class="btn" data-open="routine:' + esc(r.id) + '">' + I.edit + "Modifica la routine</button>" : "") +
      '<button class="btn ghost" data-act="close">Chiudi</button></div>');
  }

  // ---------------- Timer, briefing, chiusura, settimana ----------------
  function focusStopSheet() {
    const f = state.focus;
    const tk = f && taskById(f.taskId);
    if (!tk) return;
    const worked = Math.max(1, Math.round(focusElapsed(f, now()) / MIN));
    openModal("<h2>" + I.timer + " " + T.fmtDur(worked) + " su «" + esc(tk.title) + "»</h2>" +
      '<p class="sub" style="margin:-6px 0 14px">Hai finito? Il tempo reale aggiorna le stime.</p><div class="menu">' +
      '<button class="btn" data-act="focus-finish" data-more="done">' + I.check + "Sì, è fatta</button>" +
      '<button class="btn" data-act="focus-finish" data-more="">Non ancora: tolgo ' + T.fmtDur(worked) + " dal tempo che manca</button>" +
      [15, 30, 60].map((m) => '<button class="btn" data-act="focus-finish" data-more="' + m + '">Mi servono ancora ' + T.fmtDur(m) + "</button>").join("") +
      '<button class="btn ghost" data-act="close">Continua il timer</button></div>');
  }


  function focusCardHTML(task, f, t, nextLine) {
    const elapsed = focusElapsed(f, t);
    const goal = S.taskRemaining(task) * MIN;
    const pct = Math.min(100, (elapsed / Math.max(goal, MIN)) * 100);
    const id = esc(task.id);
    return '<div class="card now k-task focus"' + areaStyle(task.area) + '><div class="label"><i></i>' + (f.running ? "Concentrazione" : "In pausa") + "</div>" +
      '<div class="title">' + esc(task.title) + "</div>" +
      '<div class="timer" id="focus-timer" data-start="' + (f.running ? f.startedAt : "") + '" data-acc="' + (f.accMs || 0) + '">' + fmtClock(elapsed) + "</div>" +
      '<div class="meta">Obiettivo ' + T.fmtDur(S.taskRemaining(task)) + "</div>" +
      '<div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' + subChecklistHTML(task) + notesHTML(task) +
      '<div class="actions">' + (f.running
        ? '<button class="btn" data-act="focus-pause">' + I.pause + "Pausa</button>"
        : '<button class="btn primary" data-act="focus-resume">' + I.play + "Riprendi</button>") +
      '<button class="btn primary" data-act="focus-stop">' + I.stop + "Termina</button></div>" + (nextLine || "") + "</div>";
  }

  function focusElapsed(f, t) {
    return (f.accMs || 0) + (f.running && f.startedAt ? Math.max(0, t - f.startedAt) : 0);
  }

  function fmtClock(ms) {
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return (h ? h + ":" + T.pad(m) : String(m).padStart(2, "0")) + ":" + T.pad(ss);
  }

  function subChecklistHTML(task) {
    if (!task || !task.subtasks || !task.subtasks.length) return "";
    return '<ul class="steps">' + task.subtasks.map((x) =>
      '<li class="' + (x.done ? "done" : "") + '"><button class="check sm' + (x.done ? " done" : "") + '" data-act="toggle-sub" data-id="' + esc(task.id) + '" data-sid="' + esc(x.id) + '" aria-label="Passo fatto"></button><span>' + esc(x.text) + "</span></li>").join("") + "</ul>";
  }

  function notesHTML(task) {
    return task && task.notes ? '<div class="quicknote">' + esc(task.notes) + "</div>" : "";
  }

  function briefingHTML(t) {
    const day = T.startOfDay(t), dayEnd = T.addDays(day, 1);
    const bl = state.plan.blocks.filter((b) => b.start < dayEnd && b.end > t);
    const evs = bl.filter((b) => b.kind === "event");
    const first = evs[0];
    const tops = state.tasks.filter((x) => !x.done && !x.routineId && state.plan.info[x.id] && state.plan.info[x.id].start < dayEnd)
      .sort((a, b) => ((a.priority || 2) - (b.priority || 2)) || (S.deadlineMs(a.deadline) - S.deadlineMs(b.deadline))).slice(0, 3);
    const routinesToday = state.tasks.filter((x) => x.routineId && x.occ === T.dateKey(t) && !x.done).length;
    const warns = (state.plan.warnings || []).filter((w) => w.type !== "overloaded" || w.day === T.dateKey(t)).length;
    return '<div class="card briefing"><div class="b-head"><span class="b-ic">' + I.sun + '</span><div><div class="b-title">La tua giornata</div><div class="b-sub">Briefing del mattino</div></div></div>' +
      '<div class="b-stats"><div><b>' + evs.length + "</b><span>appuntamenti</span></div><div><b>" + T.fmtDurShort(freeMinutesToday(t)) + "</b><span>liberi</span></div><div><b>" + routinesToday + "</b><span>routine</span></div></div>" +
      (first ? '<p class="b-line">Primo appuntamento: <b>' + esc(first.title) + "</b> alle " + T.fmtHM(first.start) + "</p>" : '<p class="b-line">Nessun appuntamento oggi.</p>') +
      (tops.length ? '<div class="b-label">Le 3 cose più importanti</div><ol class="b-list">' + tops.map((x) => {
        const inf = state.plan.info[x.id] || {};
        return "<li><b>" + esc(x.title) + "</b><span>" + T.fmtHM(inf.start) + " · " + T.fmtDur(S.taskRemaining(x)) + (inf.reasons && inf.reasons[0] ? " · " + esc(inf.reasons[0]) : "") + "</span></li>";
      }).join("") + "</ol>" : "") +
      (warns ? '<p class="b-line warn">' + I.alert + warns + (warns === 1 ? " avviso da guardare" : " avvisi da guardare") + "</p>" : "") +
      '<div class="actions"><button class="btn primary" data-act="briefing-ok">Iniziamo</button></div></div>';
  }

  function eveningCardHTML() {
    return '<div class="card evening"><div class="b-head"><span class="b-ic">' + I.moonSm + '</span><div><div class="b-title">Chiudi la giornata</div><div class="b-sub">Due minuti per sistemare domani</div></div></div>' +
      '<div class="actions"><button class="btn primary" data-act="evening-open">Inizia</button><button class="btn ghost" data-act="evening-skip">Non stasera</button></div></div>';
  }

  function weekCardHTML(t) {
    const w = G.stats.week(state, t);
    if (!w.total && !w.routines.length) return "";
    let html = '<div class="sec"><h2>La tua settimana</h2><span class="small muted">dal ' + new Date(w.weekStart).getDate() + " " + T.MESI[new Date(w.weekStart).getMonth()] + "</span></div><div class=\"card\">";
    if (w.total) {
      html += '<div class="areabar">' + w.areas.map((a) => '<i style="width:' + (a.minutes / w.total * 100).toFixed(1) + "%;background:" + a.color + '" title="' + esc(a.label) + '"></i>').join("") + "</div>" +
        '<ul class="arealist">' + w.areas.map((a) => '<li><span class="dot" style="background:' + a.color + '"></span>' + esc(a.label) + "<b>" + T.fmtDurShort(a.minutes) + "</b></li>").join("") + "</ul>" +
        '<p class="small muted" style="margin:10px 0 0">' + w.doneCount + (w.doneCount === 1 ? " attività completata" : " attività completate") + (w.focusMin ? " · " + T.fmtDurShort(w.focusMin) + " col timer" : "") + "</p>";
    }
    const rs = w.routines.filter((x) => x.streak > 0).slice(0, 4);
    if (rs.length) html += '<div class="streaks">' + rs.map((x) => '<span class="streak">' + I.flame + esc(x.r.title) + " <b>" + x.streak + "</b></span>").join("") + "</div>";
    return html + "</div>";
  }

  function eveningSheet() {
    const t = now();
    const day = T.startOfDay(t), dayEnd = T.addDays(day, 1), tomorrow = dayEnd;
    const done = state.tasks.filter((x) => x.done && x.doneAt && T.startOfDay(T.fromISO(x.doneAt)) === day);
    const left = state.tasks.filter((x) => !x.done && !x.routineId && (
      (state.plan.info[x.id] && state.plan.info[x.id].start < dayEnd) || (x.deadline && S.deadlineMs(x.deadline) <= dayEnd) ||
      state.checkins.some((c) => c.taskId === x.id)));
    if (!ui.eveningSel) ui.eveningSel = new Set(left.map((x) => x.id));
    const tb = state.plan.blocks.filter((b) => b.start >= tomorrow && b.start < T.addDays(tomorrow, 1) && (b.kind === "task" || b.kind === "event"));
    let html = "<h2>" + I.moonSm + " Chiudi la giornata</h2>";
    html += '<div class="p-label">Fatte oggi · ' + done.length + "</div>" + (done.length
      ? '<ul class="ops">' + done.map((x) => "<li>✓ " + esc(x.title) + "</li>").join("") + "</ul>"
      : '<p class="small muted">Nessuna attività segnata come fatta oggi. Capita!</p>');
    html += '<div class="p-label">Rimaste · ' + left.length + "</div>";
    if (left.length) {
      html += '<p class="small muted" style="margin:0 0 6px">Quelle selezionate passano a domani. Puoi anche segnarle fatte.</p><div class="group">' + left.map((x) => {
        const on = ui.eveningSel.has(x.id);
        return '<div class="g-row"><input type="checkbox" class="switch" data-set="evening-sel" data-id="' + esc(x.id) + '"' + (on ? " checked" : "") + ' aria-label="Sposta a domani">' +
          '<div class="gt"><b>' + esc(x.title) + "</b><span>" + T.fmtDur(S.taskRemaining(x)) + (x.deadline ? " · scade " + fmtDeadline(x.deadline, t) : "") + "</span></div>" +
          '<button class="btn small" data-act="evening-done" data-id="' + esc(x.id) + '">' + I.check + "Fatta</button></div>";
      }).join("") + "</div>";
    } else html += '<p class="small muted">Niente in sospeso. Ottimo lavoro.</p>';
    html += '<div class="p-label">Domani</div>' + (tb.length
      ? '<ul class="ops">' + tb.slice(0, 6).map((b) => "<li>" + T.fmtHM(b.start) + " · " + esc(b.title) + (b.suggested ? " (suggerito)" : "") + "</li>").join("") + (tb.length > 6 ? "<li>…e altri " + (tb.length - 6) + "</li>" : "") + "</ul>"
      : '<p class="small muted">Per ora domani è libero.</p>');
    html += '<div class="sheet-actions"><button class="btn primary" data-act="evening-close">' + (left.length ? "Sposta a domani e chiudi" : "Chiudi la giornata") + '</button><span class="spacer"></span><button class="btn ghost" data-act="close">Più tardi</button></div>';
    openModal(html);
  }

  // ---------------- Calendario ----------------
  function pendingPreviewPlan() {
    const p = [...state.proposals].reverse().find((x) => x.status === "pending");
    if (!p || !ui.showProposalInCal) return null;
    try {
      const pv = PR.preview(p, state, now());
      const changed = new Set(pv.changes.filter((c) => c.type !== "removed" && c.type !== "completed").map((c) => c.key));
      return { plan: pv.afterPlan, changed, proposal: p };
    } catch (e) { return null; }
  }

  // Blocchi da mostrare in un intervallo: appuntamenti (anche passati/oltre l'orizzonte) + programma
  function blocksForRange(from, to, planObj) {
    const plan = planObj || state.plan;
    const t = now();
    const out = [];
    const planStart = T.startOfDay(t), planEnd = plan.horizonEnd || T.addDays(planStart, 14);
    // appuntamenti fuori dal programma calcolato (passato e oltre l'orizzonte)
    for (const o of S.visibleEvents(state, from, to)) {
      if (o.start >= planStart && o.start < planEnd) continue;
      out.push({ kind: o.allDay ? "allday" : "event", id: o.id, eventId: o.eventId, title: o.title, start: o.start, end: o.end, source: o.source, location: o.location });
    }
    for (const b of plan.blocks) if (b.end > from && b.start < to) out.push(b);
    return out.sort((a, b) => a.start - b.start);
  }

  function renderCalendar() {
    const c = ui.cal;
    const t = now();
    const pp = pendingPreviewPlan();
    let title;
    const rel = T.fmtDay(c.date, t);
    let eyebrow = "Calendario";
    if (c.view === "day") { title = /^(Oggi|Domani|Ieri)$/.test(rel) ? rel : T.GIORNI_BREVI[new Date(c.date).getDay()] + " " + new Date(c.date).getDate() + " " + T.MESI[new Date(c.date).getMonth()]; eyebrow = "Calendario · " + T.fmtLongDate(c.date); }
    else if (c.view === "week") { const ws = weekStart(c.date), we = T.addDays(ws, 6); title = new Date(ws).getDate() + " – " + new Date(we).getDate() + " " + T.MESI[new Date(we).getMonth()]; }
    else { const d = new Date(c.date); title = T.MESI[d.getMonth()].charAt(0).toUpperCase() + T.MESI[d.getMonth()].slice(1) + " " + d.getFullYear(); }
    let html = '<div class="page-head"><div class="eyebrow">' + esc(eyebrow) + "</div><h1>" + esc(title) + "</h1></div>" +
      '<div class="toolbar"><div class="seg">' + [["day", "Giorno"], ["week", "Settimana"], ["month", "Mese"]].map(([v, l]) =>
        '<button data-act="cal-view" data-v="' + v + '" class="' + (c.view === v ? "on" : "") + '">' + l + "</button>").join("") + "</div>" +
      '<span class="spacer"></span><div class="navs"><button class="navbtn" data-act="cal-nav" data-d="-1" aria-label="Precedente">' + I.left + "</button>" +
      '<button class="btn small" data-act="cal-today">Oggi</button>' +
      '<button class="navbtn" data-act="cal-nav" data-d="1" aria-label="Successivo">' + I.right + "</button>" +
      '<button class="navbtn dark" data-act="add-menu" aria-label="Aggiungi">' + I.plus + "</button></div></div>" +
      (c.view !== "month" ? '<p class="g-foot" style="margin:-4px 4px 10px">Tocca un\'ora libera per aggiungere un appuntamento.</p>' : "");
    if (pp) {
      html += '<div class="alert info">' + I.sparkle + '<span>Stai vedendo l\'<b>anteprima</b> di «' + esc(pp.proposal.summary || "") + '», non ancora applicata. ' +
        '<button class="link" data-act="cal-hide-proposal">Mostra il programma attuale</button></span></div>';
    } else if (state.proposals.some((x) => x.status === "pending")) {
      html += '<div class="alert info">' + I.sparkle + '<span>C\'è una proposta in attesa. <button class="link" data-act="cal-show-proposal">Mostra anteprima della proposta</button></span></div>';
    }
    if (c.view === "day") html += gridHTML([c.date], pp, 56);
    else if (c.view === "week") { const ws = weekStart(c.date); html += gridHTML([0, 1, 2, 3, 4, 5, 6].map((i) => T.addDays(ws, i)), pp, 42); }
    else html += monthHTML(pp);
    html += '<div class="legend"><span><i class="lg-event"></i>Appuntamento</span><span><i class="lg-apple"></i>Apple Calendar' + (mode === "demo" ? " (demo)" : "") + '</span>' +
      '<span><i class="lg-task"></i>Attività (orario suggerito)</span><span><i class="lg-free"></i>Libero</span>' + (pp ? '<span><i class="lg-prop"></i>Proposta</span>' : "") + "</div>";
    return html;
  }

  function weekStart(d) {
    const wd = (new Date(d).getDay() + 6) % 7; // lunedì = 0
    return T.addDays(T.startOfDay(d), -wd);
  }

  function layoutColumns(items) {
    // assegna colonne agli elementi sovrapposti
    const cols = [];
    for (const it of items) {
      let c = 0;
      while (cols[c] && cols[c] > it.start) c++;
      cols[c] = it.end;
      it._col = c;
    }
    for (const it of items) {
      it._cols = Math.max(1, ...items.filter((o) => o.start < it.end && o.end > it.start).map((o) => o._col + 1));
    }
  }

  function gridHTML(days, pp, pxPerHour) {
    const t = now();
    const planObj = pp ? pp.plan : null;
    // Tutte le 24 ore: si scorre, e si parte vicino all'ora attuale o al primo impegno
    const minH = 0, maxH = 24;
    let firstH = 24;
    const perDay = days.map((d) => {
      const de = T.addDays(d, 1);
      const bl = blocksForRange(d, de, planObj).filter((b) => b.end > d && b.start < de);
      for (const b of bl) if (b.kind !== "allday") firstH = Math.min(firstH, Math.floor((Math.max(b.start, d) - d) / 3600000));
      const h = state.settings.hours[new Date(d).getDay()];
      if (h && h.on) firstH = Math.min(firstH, Math.floor(T.hmToMin(h.start) / 60));
      return { d, bl };
    });
    const showsToday = days.some((d) => T.dateKey(d) === T.dateKey(t));
    const startH = Math.max(0, (showsToday ? new Date(t).getHours() : firstH === 24 ? 8 : firstH) - 1);
    const height = (maxH - minH) * pxPerHour;
    const y = (d, ms) => ((ms - T.atMin(d, minH * 60)) / 3600000) * pxPerHour;
    const multi = days.length > 1;
    let html = '<div class="grid-wrap" data-scroll="' + Math.round(startH * pxPerHour) + '"><div class="grid" style="grid-template-columns:44px repeat(' + days.length + ', minmax(' + (multi ? 84 : 200) + 'px, 1fr))' + (multi ? ";min-width:640px" : "") + '">';
    // intestazioni
    const anyAllDay = perDay.some((x) => x.bl.some((b) => b.kind === "allday"));
    if (multi || anyAllDay) html += '<div class="colh" style="border-left:0"></div>';
    for (const { d, bl } of perDay) {
      if (!multi && !anyAllDay) break;
      const ad = bl.filter((b) => b.kind === "allday");
      html += '<div class="colh' + (T.dateKey(d) === T.dateKey(t) ? " today" : "") + '" data-act="cal-goto" data-day="' + d + '">' +
        (multi ? T.GIORNI_BREVI[new Date(d).getDay()] + " " + new Date(d).getDate() : "") +
        (ad.length ? '<div class="small" style="font-weight:500;color:var(--event);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">' + ad.map((b) => esc(b.title)).join(", ") + "</div>" : (multi ? "" : "&nbsp;")) + "</div>";
    }
    // ore
    html += '<div class="hours" style="height:' + height + 'px">';
    for (let h = minH; h < maxH; h++) html += '<div class="hl" style="top:' + (h - minH) * pxPerHour + 'px">' + String(h).padStart(2, "0") + "</div>";
    html += "</div>";
    for (const { d, bl } of perDay) {
      html += '<div class="col" style="height:' + height + 'px">';
      for (let h = minH; h < maxH; h++) html += '<div class="hl" style="top:' + (h - minH) * pxPerHour + 'px"></div>';
      // toccando un'ora vuota si crea un appuntamento a quell'ora
      for (let m = minH * 60; m < maxH * 60; m += 30) {
        html += '<div class="slot" data-act="new-at" data-ts="' + T.atMin(d, m) + '" style="top:' + (m / 60 - minH) * pxPerHour + "px;height:" + pxPerHour / 2 + 'px" title="Nuovo appuntamento alle ' + T.fmtHM(T.atMin(d, m)) + '"></div>';
      }
      // spazi liberi (solo da adesso in poi, negli orari disponibili)
      const hrs = state.settings.hours[new Date(d).getDay()];
      if (hrs && hrs.on) {
        let free = [[Math.max(T.atMin(d, T.hmToMin(hrs.start)), t), T.atMin(d, T.hmToMin(hrs.end))]];
        if (free[0][1] > free[0][0]) {
          for (const b of bl) if (b.kind !== "allday") free = S.subtract(free, b.start, b.end);
          for (const [a, b] of free) if ((b - a) / MIN >= 30) {
            html += '<div class="ev free' + (multi ? " faint" : "") + '" style="top:' + y(d, a) + "px;height:" + Math.max(14, y(d, b) - y(d, a) - 2) + 'px;left:3px;right:3px">' + (multi ? "" : "Libero · " + T.fmtDur((b - a) / MIN)) + "</div>";
          }
        }
      }
      const items = bl.filter((b) => b.kind !== "allday").map((b) => Object.assign({}, b, { start: Math.max(b.start, d), end: Math.min(b.end, T.addDays(d, 1)) }));
      const evs = items.filter((b) => b.kind === "event");
      layoutColumns(items);
      for (const b of items) {
        const top = y(d, b.start), hgt = Math.max(16, y(d, b.end) - top - 2);
        const w = 100 / b._cols;
        const key = b.kind === "task" ? "t:" + b.taskId : "e:" + b.id;
        const overlap = b.kind === "event" && evs.some((o) => o !== b && o.start < b.end && o.end > b.start);
        const cls = ["ev", b.kind === "task" ? "task" : b.kind === "break" ? "brk" : b.kind === "travel" ? "trv" : "", b.area && b.kind !== "travel" ? "has-area" : "", isApple(b.source) && b.kind === "event" ? "apple" : "",
          b.locked ? "locked" : "", b.pinned ? "pinned" : "", pp && pp.changed.has(key) ? "prop" : "", overlap ? "overlap" : "", hgt < 30 ? "short" : ""].join(" ");
        const open = b.kind === "task" ? "task:" + b.taskId : b.kind === "event" ? "event:" + b.eventId + ":" + T.dateKey(b.start) : "";
        html += '<div class="' + cls + '"' + (open ? ' data-open="' + esc(open) + '"' : "") + ' style="top:' + top + "px;height:" + hgt + "px;left:calc(" + (b._col * w) + "% + 3px);width:calc(" + w + '% - 6px)' + (b.area && b.kind !== "travel" ? ";--ac:" + areaColor(b.area) : "") + '" title="' + esc(b.title) + '">' +
          "<b>" + esc(b.title) + "</b>" + (hgt > 30 ? T.fmtHM(b.start) + "–" + T.fmtHM(b.end) + (b.kind === "task" && !multi ? (b.suggested ? " · suggerito" : b.pinned ? " · orario fisso" : " · in corso") : "") + (overlap && !multi ? " · sovrapposto!" : "") : "") + "</div>";
      }
      if (T.dateKey(d) === T.dateKey(t) && t > T.atMin(d, minH * 60) && t < T.atMin(d, maxH * 60)) html += '<div class="nowline" style="top:' + y(d, t) + 'px"></div>';
      html += "</div>";
    }
    return html + "</div></div>";
  }

  function monthHTML(pp) {
    const t = now();
    const d0 = new Date(ui.cal.date);
    const first = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime();
    const start = weekStart(first);
    const planObj = pp ? pp.plan : null;
    const over = new Set(((planObj || state.plan).warnings || []).filter((w) => w.type === "overloaded").map((w) => w.day));
    let html = '<div class="month">' + ["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((w) => '<div class="wd">' + w + "</div>").join("");
    for (let i = 0; i < 42; i++) {
      const d = T.addDays(start, i);
      const de = T.addDays(d, 1);
      const bl = blocksForRange(d, de, planObj).filter((b) => b.start < de && b.end > d);
      const evs = bl.filter((b) => b.kind === "event" || b.kind === "allday");
      const taskMin = bl.filter((b) => b.kind === "task").reduce((a, b) => a + (b.end - b.start) / MIN, 0);
      const h = state.settings.hours[new Date(d).getDay()];
      const avail = h && h.on ? T.hmToMin(h.end) - T.hmToMin(h.start) : 0;
      const pct = avail ? Math.min(100, ((taskMin + evs.filter((b) => b.kind === "event").reduce((a, b) => a + (b.end - b.start) / MIN, 0)) / avail) * 100) : 0;
      const dots = evs.slice(0, 5).map((b) => '<i class="' + (isApple(b.source) ? "a" : "") + '"></i>').join("") + (taskMin ? '<i class="t"></i>' : "");
      html += '<button class="mday' + (new Date(d).getMonth() !== d0.getMonth() ? " other" : "") + (T.dateKey(d) === T.dateKey(t) ? " today" : "") + (over.has(T.dateKey(d)) ? " over" : "") +
        '" data-act="cal-goto" data-day="' + d + '"><span class="n">' + new Date(d).getDate() + '</span><span class="dots">' + dots + "</span>" +
        (pct ? '<span class="load"><i style="width:' + pct.toFixed(0) + '%"></i></span>' : "") + "</button>";
    }
    return html + "</div>" + '<p class="small muted" style="margin-top:10px">La barra sotto ogni giorno indica quanto è pieno (rossa se troppo). Tocca un giorno per aprirlo.</p>';
  }

  // ---------------- Attività ----------------
  function renderList() {
    const t = now();
    const titles = { tasks: "Attività", events: "Appuntamenti", routines: "Ogni giorno" };
    let html = '<div class="page-head"><div class="eyebrow">Elenco</div><h1>' + titles[ui.listTab] + "</h1></div>" +
      '<div class="toolbar"><div class="seg">' + [["tasks", "Attività"], ["routines", "Ogni giorno"], ["events", "Appuntamenti"]].map(([v, l]) =>
        '<button data-act="list-tab" data-v="' + v + '" class="' + (ui.listTab === v ? "on" : "") + '">' + l + "</button>").join("") + '</div><span class="spacer"></span>' +
      '<button class="btn small primary" data-act="' + ({ tasks: "new-task", events: "new-event", routines: "new-routine" }[ui.listTab]) + '">' + I.plus + "Nuova</button></div>";
    if (ui.listTab === "routines") {
      html += renderRoutines();
    } else if (ui.listTab === "tasks") {
      const info = state.plan.info || {};
      const endToday = T.addDays(T.startOfDay(t), 1);
      const filters = [["all", "Tutte"], ["today", "Oggi"], ["late", "In ritardo"], ["high", "Priorità alta"], ["nodate", "Senza scadenza"], ["apple", "Promemoria Apple"]];
      html += '<div class="chips">' + filters.map(([v, l]) => '<button data-act="filter" data-v="' + v + '" class="' + (ui.filter === v ? "on" : "") + '">' + l + "</button>").join("") +
        G.areas.AREAS.map((a) => '<button data-act="filter" data-v="' + a.id + '" class="areachip ' + (ui.filter === a.id ? "on" : "") + '"' + areaStyle(a.id) + "><i></i>" + a.label + "</button>").join("") + "</div>";
      let open = state.tasks.filter((x) => !x.done && !x.routineId);
      const f = ui.filter;
      if (f === "today") open = open.filter((x) => info[x.id] && info[x.id].start < endToday);
      if (f === "late") open = open.filter((x) => (info[x.id] && (info[x.id].late || info[x.id].unscheduled)) || (x.deadline && S.deadlineMs(x.deadline) <= t));
      if (f === "high") open = open.filter((x) => x.priority === 1);
      if (f === "nodate") open = open.filter((x) => !x.deadline);
      if (f === "apple") open = open.filter((x) => x.source === "apple-reminders");
      if (G.areas.get(f)) open = open.filter((x) => x.area === f);
      open.sort((a, b) => ((info[a.id] && info[a.id].start) || Infinity) - ((info[b.id] && info[b.id].start) || Infinity) || a.title.localeCompare(b.title));
      if (!open.length) html += '<div class="card empty">' + I.check + "<div>" + (f === "all" ? "Nessuna attività da fare." : "Nessuna attività con questo filtro.") + "</div></div>";
      else {
        html += '<div class="card list-card"><ul class="list">' + open.map((x) => {
          const inf = info[x.id] || {};
          const overdue = x.deadline && S.deadlineMs(x.deadline) <= t;
          const bits = [T.fmtDur(S.taskRemaining(x))];
          if (x.deadline) bits.push("scade " + fmtDeadline(x.deadline, t));
          if (inf.start) bits.push(T.fmtDay(inf.start, t, { short: true }).toLowerCase() + " " + T.fmtHM(inf.start) + (inf.chunks > 1 ? " (" + inf.chunks + " parti)" : ""));
          if (subProgress(x)) bits.push(subProgress(x));
          let tags = x.priority === 1 ? '<span class="tag high">alta</span>' : "";
          if (inf.unscheduled) tags += '<span class="tag late">senza posto</span>';
          else if (overdue) tags += '<span class="tag late">scaduta</span>';
          else if (inf.late) tags += '<span class="tag late">in ritardo</span>';
          return '<li class="li" data-open="task:' + esc(x.id) + '"><button class="check" data-act="done" data-id="' + esc(x.id) + '" aria-label="Segna come fatta"></button>' +
            '<div class="body"><div class="title">' + esc(x.title) + '</div><div class="meta">' + areaTag(x.area) + tags + srcTag(x.source) + bits.join(" · ") + "</div></div>" +
            '<span class="chev">' + I.right + "</span></li>";
        }).join("") + "</ul></div>";
      }
      const done = state.tasks.filter((x) => x.done && !x.routineId).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
      if (done.length) {
        html += '<div class="sec"><h2>Completate</h2><button class="link" data-act="toggle-done">' + (ui.showDone ? "Nascondi" : "Mostra (" + done.length + ")") + "</button></div>";
        if (ui.showDone) {
          html += '<div class="card list-card"><ul class="list">' + done.slice(0, 50).map((x) =>
            '<li class="li done" data-open="task:' + esc(x.id) + '">' + (isApple(x.source) ? '<span class="check done"></span>' : '<button class="check done" data-act="undone" data-id="' + esc(x.id) + '" aria-label="Segna come da fare"></button>') +
            '<div class="body"><div class="title">' + esc(x.title) + srcTag(x.source) + '</div><div class="meta">fatta ' + (x.doneAt ? T.fmtDay(T.fromISO(x.doneAt), t).toLowerCase() : "") + "</div></div></li>").join("") + "</ul></div>";
          if (done.some((x) => !isApple(x.source))) html += '<p style="text-align:center"><button class="btn small danger" data-act="clear-done">Elimina le completate</button></p>';
        }
      }
    } else {
      const single = state.events.filter((e) => (!e.repeat || e.repeat === "none") && T.fromISO(e.end) > t)
        .sort((a, b) => T.fromISO(a.start) - T.fromISO(b.start));
      const rep = state.events.filter((e) => e.repeat && e.repeat !== "none");
      html += '<div class="sec"><h2>In arrivo</h2></div>';
      html += single.length ? '<div class="card list-card"><ul class="list">' + single.map((e) => {
        const s = T.fromISO(e.start), en = T.fromISO(e.end);
        return '<li class="li' + (isApple(e.source) ? " src-apple" : "") + '" data-open="event:' + esc(e.id) + '"><span class="bar"></span><div class="body"><div class="title">' + esc(e.title) + srcTag(e.source) + "</div>" +
          '<div class="meta">' + T.fmtDay(s, t) + (e.allDay ? " · tutto il giorno" : " · " + T.fmtHM(s) + "–" + T.fmtHM(en)) + (e.location ? " · " + esc(e.location) : "") + '</div></div><span class="chev">' + I.right + "</span></li>";
      }).join("") + "</ul></div>" : '<div class="card empty">' + I.calendar + "<div>Nessun appuntamento in arrivo</div></div>";
      if (rep.length) {
        html += '<div class="sec"><h2>Si ripetono</h2></div><div class="card list-card"><ul class="list">' + rep.map((e) => {
          const s = T.fromISO(e.start), en = T.fromISO(e.end);
          let rl = REPEAT_LBL[e.repeat];
          if (e.repeat === "weekly") rl = "Ogni " + T.GIORNI[new Date(s).getDay()];
          return '<li class="li' + (isApple(e.source) ? " src-apple" : "") + '" data-open="event:' + esc(e.id) + '"><span class="bar"></span><div class="body"><div class="title">' + esc(e.title) + srcTag(e.source) + "</div>" +
            '<div class="meta">' + rl + " · " + T.fmtHM(s) + "–" + T.fmtHM(en) + (e.until ? " · fino al " + T.fmtDay(T.fromKey(e.until), t, { short: true }) : "") + '</div></div><span class="chev">' + I.right + "</span></li>";
        }).join("") + "</ul></div>";
      }
    }
    return html;
  }

  // ---------------- Impostazioni ----------------
  function renderSettings() {
    const s = state.settings;
    const order = [1, 2, 3, 4, 5, 6, 0];
    const integ = state.integrations || {};
    const stLbl = (v) => v === "demo" ? '<span class="status demo">Demo</span>' : v === "connected" ? '<span class="status on">Collegato</span>' : '<span class="status">Non collegato</span>';
    const row = (icon, color, title, sub, right) => '<div class="g-row"><span class="gi ' + (color || "") + '">' + icon + '</span><div class="gt"><b>' + title + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>" + (right || "") + "</div>";
    let html = '<div class="page-head"><div class="eyebrow">Impostazioni</div><h1>Preferenze</h1></div>';

    html += '<div class="sec"><h2>Profilo</h2></div><div class="group">' +
      row(I.user, "", "Il tuo nome", "", '<input type="text" data-set="name" value="' + esc(state.profile.name) + '" placeholder="Facoltativo">') + "</div>";

    html += '<div class="sec"><h2>Collegamenti Apple</h2></div><div class="group">' +
      row(I.calendar, "orange", "Apple Calendar", "Leggere gli appuntamenti; modificarli solo con la tua conferma", stLbl(integ.calendar)) +
      row(I.bell, "orange", "Apple Promemoria", "Leggere i promemoria e le scadenze; modificarli solo con la tua conferma", stLbl(integ.reminders)) + "</div>" +
      '<p class="g-foot">Per collegarli serve la piccola app gratuita «Daily Schedule per Mac» (prossimo passo). I permessi vengono chiesti solo quando attivi tu il collegamento.</p>';

    html += '<div class="sec"><h2>Orari disponibili</h2></div><div class="group">' +
      order.map((d) => {
        const h = s.hours[d];
        return '<div class="g-row"><input type="checkbox" class="switch" data-set="hours-on" data-day="' + d + '"' + (h.on ? " checked" : "") + ' aria-label="' + T.GIORNI[d] + ' disponibile">' +
          '<span class="day">' + T.GIORNI[d].slice(0, 3) + '</span><div class="times">' +
          '<input type="time" data-set="hours-start" data-day="' + d + '" value="' + h.start + '"' + (h.on ? "" : " disabled") + ' aria-label="Inizio ' + T.GIORNI[d] + '"><span class="muted">–</span>' +
          '<input type="time" data-set="hours-end" data-day="' + d + '" value="' + h.end + '"' + (h.on ? "" : " disabled") + ' aria-label="Fine ' + T.GIORNI[d] + '"></div></div>';
      }).join("") + '</div><p class="g-foot">Le attività vengono suggerite solo in questi orari. Gli appuntamenti valgono sempre.</p>';

    html += '<div class="sec"><h2>Pause</h2><button class="link" data-act="add-break">' + I.plus + "Aggiungi</button></div>" +
      (s.breaks.length ? '<div class="group">' + s.breaks.map((b, i) =>
        '<div class="g-row"><span class="gi grey">' + I.coffee + '</span><input type="text" data-set="break-label" data-i="' + i + '" value="' + esc(b.label) + '" aria-label="Nome pausa" style="width:auto;flex:1;min-width:0;text-align:left">' +
        '<div class="times"><input type="time" data-set="break-start" data-i="' + i + '" value="' + b.start + '"><span class="muted">–</span><input type="time" data-set="break-end" data-i="' + i + '" value="' + b.end + '"></div>' +
        '<button class="navbtn" data-act="del-break" data-i="' + i + '" aria-label="Rimuovi pausa">' + I.x + "</button></div>").join("") + "</div>" : '<p class="g-foot">Nessuna pausa fissa.</p>');

    html += '<div class="sec"><h2>Pianificazione</h2></div><div class="group">' +
      setNum("dailyLoad", "Quanto riempire la giornata", "% del tempo libero; il resto è margine", s.dailyLoad, 30, 100) +
      setNum("buffer", "Margine tra gli impegni", "minuti", s.buffer, 0, 60) +
      setNum("maxFocus", "Concentrazione massima", "minuti di fila sulla stessa attività", s.maxFocus, 15, 480) +
      setNum("minChunk", "Blocco minimo", "minuti, quando divido un'attività", s.minChunk, 5, 120) +
      setNum("defaultDuration", "Durata predefinita", "minuti per una nuova attività", s.defaultDuration || 30, 5, 480) +
      setNum("horizonDays", "Giorni pianificati in avanti", "", s.horizonDays, 3, 60) +
      setNum("defaultTravel", "Tempo per arrivare", "minuti prima degli appuntamenti con un luogo (0 = mai)", s.defaultTravel != null ? s.defaultTravel : 15, 0, 120) + "</div>";

    html += '<div class="sec"><h2>La tua giornata</h2></div><div class="group">' +
      row(I.sun, "", "Briefing del mattino", "Le cose più importanti alla prima apertura", '<input type="checkbox" class="switch" data-set="morningBriefing"' + (s.morningBriefing !== false ? " checked" : "") + ' aria-label="Briefing del mattino">') +
      row(I.moonSm, "", "Chiusura della sera", "Cosa resta, e spostarlo a domani", '<input type="checkbox" class="switch" data-set="eveningReview"' + (s.eveningReview !== false ? " checked" : "") + ' aria-label="Chiusura della sera">') +
      '<div class="g-row"><span class="gi grey">' + I.timer + '</span><div class="gt"><b>Orario della chiusura</b></div><input type="time" data-set="evening-time" value="' + esc(s.eveningTime || "21:00") + '" aria-label="Orario della chiusura"></div></div>' +
      '<div class="sec"><h2>Aree della vita</h2></div><div class="areas-row">' + G.areas.AREAS.map((a) => '<span class="tag area"' + areaStyle(a.id) + "><i></i>" + a.label + "</span>").join("") + "</div>" +
      '<p class="g-foot">Le aree colorano il programma e il resoconto della settimana. Le assegno da sola in base al titolo; puoi cambiarle in ogni attività.</p>';

    const notifSupported = "Notification" in window;
    html += '<div class="sec"><h2>Notifiche</h2></div><div class="group">' +
      row(I.bell, "", "Avvisi", notifSupported ? "Quando inizia un'attività e 10 minuti prima degli appuntamenti, ad app aperta" : "Su iPhone aggiungi prima l'app alla schermata Home",
        '<input type="checkbox" class="switch" data-set="notifications"' + (state.notifications ? " checked" : "") + (notifSupported ? "" : " disabled") + ' aria-label="Notifiche">') + "</div>";

    html += '<div class="sec"><h2>Privacy e dati</h2></div><div class="group">' +
      row(I.shield, "green", "Tutto sul tuo dispositivo", "Nessun account, nessun servizio a pagamento, nessun dato inviato", "") +
      '<div class="g-row" data-act="hidden-menu" style="cursor:pointer"><span class="gi grey">' + I.eyeOff + '</span><div class="gt"><b>Elementi oscurati</b><span>Nascosti dal programma, non cancellati</span></div><span class="status">' + hiddenList().length + '</span><span class="chev">' + I.right + "</span></div>" +
      row(I.cloud, "grey", "Sincronizzazione Mac ↔ iPhone", "Non ancora attiva. Per ora usa il backup per spostare i dati", '<span class="status">In arrivo</span>') + "</div>" +
      '<div class="actions"><button class="btn small" data-act="export">' + I.down + "Scarica backup</button>" +
      '<label class="btn small" style="cursor:pointer">' + I.up + 'Ripristina<input type="file" accept="application/json,.json" data-set="import" hidden></label>' +
      (mode === "real" ? '<button class="btn small" data-act="restore-menu">Copie automatiche</button>' : "") +
      '<button class="btn small danger" data-act="reset">Cancella tutto</button></div>' +
      (mode === "demo" ? '<p class="g-foot" style="color:var(--demo)">Sei nella demo: questi pulsanti agiscono sui dati dimostrativi.</p>' : '<p class="g-foot">Ogni giorno viene salvata una copia automatica (ultimi 7 giorni).</p>');

    html += '<div class="sec"><h2>Dati dimostrativi</h2></div>' + (mode === "demo"
      ? '<div class="actions" style="margin-top:0"><button class="btn small primary" data-act="exit-demo">Torna ai miei dati</button><button class="btn small" data-act="reset-demo">Ricrea la demo</button></div>'
      : '<div class="actions" style="margin-top:0"><button class="btn small" data-act="start-demo">' + I.sparkle + "Apri la demo</button></div>") +
      '<p class="g-foot">La demo usa dati finti, separati dai tuoi.</p>';

    html += '<div class="sec"><h2>Installa</h2></div><div class="group">' +
      row(I.phone, "", "iPhone", "In Safari: Condividi, poi «Aggiungi alla schermata Home»", "") +
      row(I.laptop, "", "Mac", "In Safari: menu File, poi «Aggiungi al Dock»", "") + "</div>" +
      '<p class="small muted" style="text-align:center;margin-top:28px">Daily Schedule · versione 0.6</p>';
    return html;
  }

  function setNum(key, label, sub, val, min, max) {
    return '<div class="g-row"><div class="gt"><b>' + label + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + '</div><input type="number" inputmode="numeric" min="' + min + '" max="' + max + '" data-set="num" data-key="' + key + '" value="' + esc(val) + '" aria-label="' + esc(label) + '"></div>';
  }

  // ---------------- moduli ----------------
  function openModal(html) {
    const m = $("#modal");
    m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
    m.hidden = false;
    const first = m.querySelector("input[type=text]");
    if (first && !first.value && window.matchMedia && window.matchMedia("(pointer: fine)").matches) first.focus();
  }
  function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }

  // formMode: "new" | "edit" | "proposal"
  function taskForm(x, formMode, ctx) {
    const isNew = formMode === "new";
    const apple = isApple(x.source);
    const dlDate = x.deadline ? x.deadline.split("T")[0] : "";
    const dlTime = x.deadline && T.hasTime(x.deadline) ? x.deadline.split("T")[1] : "";
    const rem = S.taskRemaining(x) || state.settings.defaultDuration || 30;
    const durChips = [15, 30, 45, 60, 90, 120, 180].map((d) =>
      '<button type="button" data-act="set-dur" data-min="' + d + '" class="' + (d === rem ? "on" : "") + '">' + T.fmtDur(d) + "</button>").join("");
    const prio = [1, 2, 3].map((p) => '<button type="button" data-act="set-prio" data-p="' + p + '" class="' + ((x.priority || 2) === p ? "on" : "") + '">' + PRIO[p] + "</button>").join("");
    const info = (formMode === "edit" && state.plan.info[x.id]) || null;
    let planned = "";
    if (info && info.start) planned = '<div class="plan-hint">Suggerita ' + T.fmtDay(info.start, now()).toLowerCase() + " alle " + T.fmtHM(info.start) + (info.chunks > 1 ? " (" + info.chunks + " parti)" : "") +
      (info.reasons && info.reasons.length ? ". Perché: " + esc(info.reasons.join(", ")) : "") + "</div>";
    else if (info && info.unscheduled) planned = '<div class="note">Non trova posto: prova a togliere la scadenza, renderla divisibile o liberare tempo.</div>';
    const heading = formMode === "proposal" ? "Modifica la proposta" : isNew ? "Nuova attività" : apple ? "Promemoria Apple" : "Attività";
    openModal('<form id="task-form" data-id="' + esc(x.id || "") + '" data-mode="' + formMode + '"' + (ctx ? ' data-pid="' + esc(ctx.pid) + '" data-i="' + ctx.i + '"' : "") + "><h2>" + heading + srcTag(x.source) + "</h2>" + planned +
      (apple && formMode === "edit" ? '<div class="note">Elemento di Apple Promemoria' + (mode === "demo" ? " (demo)" : "") + ': salvando creo una <b>proposta</b> da confermare. Durata e momento preferito restano solo in Daily Schedule.</div>' : "") +
      (formMode === "proposal" ? '<div class="note">Stai modificando una proposta: dopo il salvataggio servirà una nuova conferma.</div>' : "") +
      '<div class="field"><label for="f-title">Cosa devi fare</label><input type="text" id="f-title" name="title" required maxlength="200" value="' + esc(x.title || "") + '"></div>' +
      '<div class="field"><label for="f-dur">' + (isNew ? "Quanto tempo serve (minuti, stima)" : "Quanto tempo serve ancora (minuti, stima)") + '</label><input type="number" inputmode="numeric" id="f-dur" name="duration" min="5" max="1440" step="5" value="' + rem + '"><div class="chips">' + durChips + "</div></div>" +
      '<div class="field"><span class="lbl">Priorità</span><input type="hidden" name="priority" value="' + (x.priority || 2) + '"><div class="chips">' + prio + "</div></div>" +
      '<div class="field"><span class="lbl">Scadenza (facoltativa)</span><div class="row2"><input type="date" name="dlDate" value="' + dlDate + '" aria-label="Giorno di scadenza"><input type="time" name="dlTime" value="' + dlTime + '" aria-label="Ora di scadenza"></div><p class="hint">Senza ora vale fino a fine giornata. È diversa dall\'orario in cui la farai.</p></div>' +
      areaPicker(x.area) + subtasksEditor(x.subtasks) +
      '<details class="more"' + (x.notBefore || x.pref || x.pinnedStart || x.splittable === false || x.notes ? " open" : "") + "><summary>Altre opzioni ›</summary>" +
      '<div class="field"><label>Momento preferito</label><select name="pref">' + Object.keys(PREF_LBL).map((k) => '<option value="' + k + '"' + ((x.pref || "") === k ? " selected" : "") + ">" + PREF_LBL[k] + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Non prima del</label><input type="date" name="notBefore" value="' + esc(x.notBefore ? x.notBefore.split("T")[0] : "") + '"></div>' +
      '<div class="field"><label>Orario fisso (se deve essere proprio a quell\'ora)</label><input type="datetime-local" name="pinnedStart" value="' + esc(x.pinnedStart || "") + '"></div>' +
      '<div class="field"><label class="toggle" style="justify-content:space-between"><span>Si può dividere in più momenti</span><input type="checkbox" class="switch" name="splittable"' + (x.splittable === false ? "" : " checked") + "></label></div>" +
      '<div class="field"><label>Note</label><textarea name="notes">' + esc(x.notes || "") + "</textarea></div></details>" +
      '<div class="sheet-actions"><button class="btn primary" type="submit">' + (formMode === "proposal" ? "Aggiorna proposta" : apple && formMode === "edit" ? "Proponi modifica" : "Salva") + "</button>" +
      (formMode === "edit" ? '<button class="btn ok" type="button" data-act="done" data-id="' + esc(x.id) + '">' + I.check + "Fatta</button>" : "") +
      (formMode === "edit" && x.source === "apple-reminders" ? '<button class="btn" type="button" data-act="hide" data-key="t:' + esc(x.id) + "@" + T.dateKey(now()) + '" data-title="' + esc(x.title) + '">' + I.eyeOff + "Oscura per oggi</button>" : "") +
      '<span class="spacer"></span>' +
      (formMode === "edit" && !apple ? '<button class="btn danger" type="button" data-act="delete-task" data-id="' + esc(x.id) + '">Elimina</button>' : "") +
      '<button class="btn ghost" type="button" data-act="close">Chiudi</button></div></form>');
  }

  function eventForm(ev, formMode, occDate, ctx) {
    const isNew = formMode === "new";
    const apple = isApple(ev.source);
    const s = T.fromISO(ev.start), e = T.fromISO(ev.end);
    const recurring = ev.repeat && ev.repeat !== "none";
    const heading = formMode === "proposal" ? "Modifica la proposta" : isNew ? "Nuovo appuntamento" : apple ? "Evento Apple Calendar" : "Appuntamento";
    openModal('<form id="event-form" data-id="' + esc(ev.id || "") + '" data-occ="' + esc(occDate || "") + '" data-mode="' + formMode + '"' + (ctx ? ' data-pid="' + esc(ctx.pid) + '" data-i="' + ctx.i + '"' : "") + "><h2>" + heading + srcTag(ev.source) + "</h2>" +
      (apple && formMode === "edit" ? '<div class="note">Evento di Apple Calendar' + (mode === "demo" ? " (demo)" : "") + (ev.calendar ? " · calendario «" + esc(ev.calendar) + "»" : "") + ': salvando creo una <b>proposta</b> da confermare. Gli eventi Apple non si eliminano da qui.</div>' : "") +
      (formMode === "proposal" ? '<div class="note">Stai modificando una proposta: dopo il salvataggio servirà una nuova conferma.</div>' : "") +
      (recurring && formMode === "edit" ? '<p class="hint">Si ripete: le modifiche valgono per tutta la serie.</p>' : "") +
      '<div class="field"><label for="e-title">Titolo</label><input type="text" id="e-title" name="title" required maxlength="200" value="' + esc(ev.title || "") + '"></div>' +
      (ev.allDay ? '<p class="hint">Evento di tutta la giornata: ' + T.fmtDay(s, now()) + "</p>" :
        '<div class="row3"><div class="field"><label>Giorno</label><input type="date" name="date" required value="' + T.dateKey(s) + '"></div>' +
        '<div class="field"><label>Dalle</label><input type="time" name="start" required value="' + T.fmtHM(s) + '"></div>' +
        '<div class="field"><label>Alle</label><input type="time" name="end" required value="' + T.fmtHM(e) + '"></div></div>') +
      (apple ? "" : '<div class="row2"><div class="field"><label>Si ripete</label><select name="repeat">' + Object.keys(REPEAT_LBL).map((k) => '<option value="' + k + '"' + ((ev.repeat || "none") === k ? " selected" : "") + ">" + REPEAT_LBL[k] + "</option>").join("") + "</select></div>" +
        '<div class="field"><label>Fino al (facoltativo)</label><input type="date" name="until" value="' + esc(ev.until || "") + '"></div></div>') +
      '<div class="row2"><div class="field"><label>Luogo</label><input type="text" name="location" value="' + esc(ev.location || "") + '"></div>' +
      '<div class="field"><label>Minuti per arrivarci</label><input type="number" inputmode="numeric" name="travel" min="0" max="240" step="5" value="' + (ev.travel != null && ev.travel !== "" ? esc(ev.travel) : "") + '" placeholder="auto (' + (state.settings.defaultTravel || 0) + ' se c\'è un luogo)"></div></div>' +
      areaPicker(ev.area) +
      '<div class="field"><label>Note</label><textarea name="notes">' + esc(ev.notes || "") + "</textarea></div>" +
      '<div class="sheet-actions"><button class="btn primary" type="submit">' + (formMode === "proposal" ? "Aggiorna proposta" : apple && formMode === "edit" ? "Proponi modifica" : "Salva") + "</button>" +
      (formMode === "edit" && (apple || recurring) && (occDate || !recurring) ? '<button class="btn" type="button" data-act="hide" data-key="e:' + esc(recurring ? ev.id + "@" + occDate : ev.id) + '" data-title="' + esc(ev.title) + '">' + I.eyeOff + "Oscura" + (recurring ? " questo giorno" : "") + "</button>" : "") +
      '<span class="spacer"></span>' +
      (formMode === "edit" && !apple && recurring && occDate ? '<button class="btn danger" type="button" data-act="delete-occ" data-id="' + esc(ev.id) + '" data-occ="' + esc(occDate) + '">Elimina solo questa volta</button>' : "") +
      (formMode === "edit" && !apple ? '<button class="btn danger" type="button" data-act="delete-event" data-id="' + esc(ev.id) + '">' + (recurring ? "Elimina la serie" : "Elimina") + "</button>" : "") +
      '<button class="btn ghost" type="button" data-act="close">Chiudi</button></div></form>');
  }

  function newTaskDraft(over) {
    const d = state.settings.defaultDuration || 30;
    return Object.assign({ title: "", duration: d, remaining: d, priority: 2, splittable: true, source: "internal" }, over || {});
  }
  function newEventDraft(over) {
    const s = T.ceilTo(now() + 30 * MIN, 30);
    return Object.assign({ title: "", start: T.toISO(s), end: T.toISO(s + 60 * MIN), repeat: "none", source: "internal" }, over || {});
  }

  function readTaskForm(form) {
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    if (!title) return null;
    const dur = Math.max(5, Math.min(1440, parseInt(f.get("duration"), 10) || 30));
    const dlDate = f.get("dlDate"), dlTime = f.get("dlTime");
    return {
      title, duration: dur, remaining: dur,
      priority: +f.get("priority") || 2,
      deadline: dlDate ? (dlTime ? dlDate + "T" + dlTime : dlDate) : null,
      pref: f.get("pref") || null,
      notBefore: f.get("notBefore") || null,
      pinnedStart: f.get("pinnedStart") || null,
      splittable: !!f.get("splittable"),
      notes: String(f.get("notes") || "").trim(),
      area: f.get("area") || null,
      subtasks: parseSubtasks(f.get("subtasks")),
    };
  }

  function parseSubtasks(v) {
    try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter((x) => x && x.text).map((x) => ({ id: String(x.id || ST.uid()), text: String(x.text).slice(0, 200), done: !!x.done })) : []; }
    catch (e) { return []; }
  }

  // Elenco dei passi nel modulo (il valore vero sta nel campo nascosto "subtasks")
  function subtasksEditor(list) {
    list = list || [];
    return '<div class="field"><span class="lbl">Passi</span><input type="hidden" name="subtasks" value="' + esc(JSON.stringify(list)) + '">' +
      '<div class="st-list">' + list.map(stRowHTML).join("") + "</div>" +
      '<div class="st-add"><input type="text" class="st-new" placeholder="Aggiungi un passo" aria-label="Nuovo passo"><button type="button" class="navbtn dark" data-act="st-add" aria-label="Aggiungi passo">' + I.plus + "</button></div></div>";
  }
  function stRowHTML(x) {
    return '<div class="st-row" data-sid="' + esc(x.id) + '"><button type="button" class="check sm' + (x.done ? " done" : "") + '" data-act="st-toggle" aria-label="Fatto"></button>' +
      '<input type="text" class="st-text" data-set="st-text" value="' + esc(x.text) + '" aria-label="Passo"><button type="button" class="iconbtn" data-act="st-del" aria-label="Togli passo">' + I.x + "</button></div>";
  }
  function syncSubtasks(form) {
    if (!form || !form.querySelectorAll) return;
    const rows = [...form.querySelectorAll(".st-row")].map((r) => ({ id: r.dataset.sid, text: r.querySelector(".st-text").value.trim(), done: r.querySelector(".check").classList.contains("done") }))
      .filter((x) => x.text);
    form.elements.subtasks.value = JSON.stringify(rows);
  }
  function addSubtaskFromInput(form) {
    const inp = form.querySelector(".st-new");
    const v = inp.value.trim();
    if (!v) return;
    form.querySelector(".st-list").insertAdjacentHTML("beforeend", stRowHTML({ id: ST.uid(), text: v, done: false }));
    inp.value = "";
    inp.focus();
    syncSubtasks(form);
  }

  function saveTaskForm(form) {
    const data = readTaskForm(form);
    if (!data) return;
    const id = form.dataset.id, fm = form.dataset.mode;
    closeModal();
    if (fm === "proposal") return replaceOp({ pid: form.dataset.pid, i: +form.dataset.i }, data);
    if (fm === "edit") {
      const t = taskById(id);
      if (!t) return;
      if (isApple(t.source)) return proposeEdit("update_task", t, data, "Modificare il promemoria «" + t.title + "»");
      commit((s) => Object.assign(s.tasks.find((x) => x.id === id), data), "Attività aggiornata: ho riorganizzato il programma");
      return;
    }
    const t = Object.assign({ id: ST.uid(), createdAt: T.toISO(now()), done: false, source: "internal" }, data);
    if (!t.area) t.area = G.areas.guess(t.title);
    commit((s) => s.tasks.push(t), null);
    const inf = state.plan.info[t.id];
    toast(inf && inf.start ? "Aggiunta: suggerita " + T.fmtDay(inf.start, now()).toLowerCase() + " alle " + T.fmtHM(inf.start) + (inf.late ? " (oltre la scadenza!)" : "")
      : "Aggiunta, ma non trova posto: controlla gli avvisi");
  }

  function readEventForm(form, base) {
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    if (!title) return null;
    const data = { title, location: String(f.get("location") || "").trim(), notes: String(f.get("notes") || "").trim(), area: f.get("area") || null };
    const tr = f.get("travel");
    data.travel = tr === "" || tr == null ? null : Math.max(0, Math.min(240, parseInt(tr, 10) || 0));
    if (!(base && base.allDay)) {
      const date = f.get("date"), st = f.get("start"), en = f.get("end");
      const startMs = T.fromISO(date + "T" + st);
      let endMs = T.fromISO(date + "T" + en);
      if (endMs <= startMs) endMs = T.addDays(endMs, 1);
      data.start = T.toISO(startMs); data.end = T.toISO(endMs);
    }
    if (f.get("repeat") != null) { data.repeat = f.get("repeat") || "none"; data.until = f.get("until") || null; }
    return data;
  }

  function saveEventForm(form) {
    const id = form.dataset.id, fm = form.dataset.mode;
    const base = fm === "edit" ? eventById(id) : null;
    const data = readEventForm(form, base);
    if (!data) return;
    closeModal();
    if (fm === "proposal") return replaceOp({ pid: form.dataset.pid, i: +form.dataset.i }, data);
    if (fm === "edit") {
      if (!base) return;
      if (isApple(base.source)) return proposeEdit("update_event", base, data, "Modificare «" + base.title + "» in Apple Calendar");
      commit((s) => Object.assign(s.events.find((x) => x.id === id), data), "Appuntamento aggiornato: ho riorganizzato il programma");
      return;
    }
    const e = Object.assign({ id: ST.uid(), exceptions: [], createdAt: T.toISO(now()), source: "internal" }, data);
    if (!e.area) e.area = G.areas.guess(e.title);
    commit((s) => s.events.push(e), null);
    const clash = state.plan.warnings.find((w) => w.type === "conflict" && w.ids && w.ids.some((x) => x.split("@")[0] === e.id));
    toast(clash ? "Aggiunto, ma si sovrappone a un altro appuntamento" : "Appuntamento aggiunto: ho riorganizzato il resto");
  }

  // Modifica di un elemento Apple dal modulo: diventa una proposta da confermare
  function proposeEdit(type, item, data, summary) {
    const after = {};
    for (const k of Object.keys(data)) {
      const a = data[k] == null || data[k] === "" ? null : data[k];
      const b = item[k] == null || item[k] === "" ? null : item[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) after[k] = data[k];
    }
    if (!Object.keys(after).length) { toast("Nessuna modifica"); return; }
    const op = PR.op(state, type, { targetId: item.id, after });
    const p = newProposal([op], { summary, reason: "Modifica fatta da te nel modulo." });
    addMsg({ role: "assistant", text: "Hai modificato un elemento " + (type === "update_event" ? "di Apple Calendar" : "di Apple Promemoria") + ". Ecco l'anteprima: lo cambio solo se confermi.", proposalId: p.id });
    ui.tab = "assistente"; rememberTab();
    save(); render(); scrollChatEnd();
  }

  // ---------------- azioni rapide (attività interne) ----------------
  function markDone(id) {
    const t = taskById(id);
    if (!t) return;
    closeModal();
    if (isApple(t.source)) {
      // completare un promemoria Apple modifica un dato Apple: serve conferma
      const p = newProposal([PR.op(state, "complete_task", { targetId: id })], { summary: "Completare «" + t.title + "» in Apple Promemoria", reason: "L'hai segnato come fatto." });
      addMsg({ role: "assistant", text: "«" + t.title + "» è un promemoria Apple: lo segno come completato solo se confermi.", proposalId: p.id });
      ui.tab = "assistente"; rememberTab();
      save(); render(); scrollChatEnd();
      return;
    }
    const snap = commit((s) => {
      const x = s.tasks.find((y) => y.id === id);
      if (s.focus && s.focus.taskId === id) {
        x.spent = (x.spent || 0) + Math.round(focusElapsed(s.focus, now()) / MIN);
        s.focus = null;
      }
      if (x.spent) x.actual = x.spent;
      x.done = true; x.doneAt = T.toISO(now()); x.pinnedStart = null;
      G.routines.logDone(s, x, true);
    }, null);
    let msg = "«" + t.title + "» fatta ✓";
    if (t.routineId) {
      const r = state.routines.find((y) => y.id === t.routineId);
      const n = r ? G.stats.streak(state, r, now()) : 0;
      if (n > 1) msg += " · serie di " + n + " giorni";
    }
    toast(msg, snap);
  }

  function unlock(s, id) { if (s.plan) s.plan.blocks = s.plan.blocks.filter((b) => b.taskId !== id); }

  function snooze(id, untilMs, label) {
    commit((s) => {
      const x = s.tasks.find((y) => y.id === id);
      x.snoozeUntil = T.toISO(untilMs); x.pinnedStart = null;
      unlock(s, id);
    }, "Rimandata " + label);
  }

  function snoozeMenu(id) {
    const t = taskById(id);
    const n = now();
    const tomorrow = T.addDays(T.startOfDay(n), 1);
    openModal("<h2>Rimanda «" + esc(t.title) + "»</h2><div class=\"menu\">" +
      '<button class="btn" data-act="snooze" data-id="' + esc(id) + '" data-until="' + (n + 30 * MIN) + '" data-label="di mezz\'ora">Tra mezz\'ora</button>' +
      '<button class="btn" data-act="snooze" data-id="' + esc(id) + '" data-until="' + (n + 60 * MIN) + '" data-label="di un\'ora">Tra un\'ora</button>' +
      (T.minOfDay(n) < 14 * 60 ? '<button class="btn" data-act="snooze" data-id="' + esc(id) + '" data-until="' + T.atMin(T.startOfDay(n), 14 * 60) + '" data-label="al pomeriggio">Oggi pomeriggio</button>' : "") +
      (t.routineId ? '<button class="btn" data-act="skip-routine" data-id="' + esc(id) + '">Salta per oggi</button>' :
        '<button class="btn" data-act="snooze" data-id="' + esc(id) + '" data-until="' + tomorrow + '" data-label="a domani">Domani</button>' +
        '<button class="btn" data-act="snooze" data-id="' + esc(id) + '" data-until="' + T.addDays(T.startOfDay(n), ((8 - new Date(n).getDay()) % 7) || 7) + '" data-label="a lunedì">Lunedì prossimo</button>') +
      '<button class="btn ghost" data-act="close">Annulla</button></div>');
  }

  function imprevistoMenu() {
    openModal("<h2>⚡ Imprevisto</h2><p class=\"sub\">Blocco il tempo da adesso e sposto le attività più avanti. Gli appuntamenti non vengono toccati.</p>" +
      '<div class="field"><label for="imp-what">Cosa succede (facoltativo)</label><input type="text" id="imp-what" placeholder="Es. traffico, telefonata urgente"></div>' +
      '<div class="menu">' + [15, 30, 60, 120, 240].map((m) => '<button class="btn" data-act="imprevisto-go" data-min="' + m + '">Mi serve ' + T.fmtDur(m) + "</button>").join("") +
      '<button class="btn" data-act="imprevisto-day">Il resto della giornata</button>' +
      '<button class="btn ghost" data-act="close">Annulla</button></div>');
  }

  function addImprevisto(mins) {
    const what = ($("#imp-what") && $("#imp-what").value.trim()) || "Imprevisto";
    const n = now();
    const start = n - (n % MIN);
    const end = mins === "day" ? T.addDays(T.startOfDay(n), 1) - MIN : start + mins * MIN;
    closeModal();
    commit((s) => s.events.push({ id: ST.uid(), title: what, start: T.toISO(start), end: T.toISO(end), repeat: "none", exceptions: [], imprevisto: true, source: "internal", createdAt: T.toISO(n) }),
      "Ok, ho spostato le attività dopo le " + T.fmtHM(end));
  }

  function startNow(id) {
    const t = taskById(id);
    if (!t) return;
    const n = now();
    const start = n - (n % MIN);
    const len = Math.min(S.taskRemaining(t), Math.max(state.settings.maxFocus, 15));
    commit((s) => {
      unlock(s, id);
      const x = s.tasks.find((y) => y.id === id);
      x.snoozeUntil = null; x.pinnedStart = null;
      s.plan.blocks.push({ kind: "task", id: id + "#start", taskId: id, title: x.title, start, end: start + len * MIN });
    }, "Iniziata «" + t.title + "»");
    if (ui.tab === "assistente") { ui.tab = "oggi"; rememberTab(); render(); }
  }

  function extend(id) {
    commit((s) => {
      const x = s.tasks.find((y) => y.id === id);
      const b = s.plan.blocks.find((y) => y.taskId === id && y.start <= now() && y.end > now());
      x.remaining = S.taskRemaining(x) + 15;
      if (b) b.end += 15 * MIN;
    }, "+15 minuti: ho spostato le attività che vengono dopo");
  }

  function exportBackup() {
    const blob = new Blob([ST.exportData(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "daily-schedule-" + (mode === "demo" ? "demo-" : "") + T.dateKey(now()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function restoreMenu() {
    const list = ST.backups();
    openModal("<h2>Copie automatiche</h2>" + (list.length ? '<p class="sub">Ripristina i dati com\'erano all\'inizio di quel giorno.</p><div class="menu">' +
      list.map((b, i) => '<button class="btn" data-act="restore" data-i="' + i + '">' + T.fmtDay(T.fromKey(b.day), now()) + "</button>").join("") + "</div>"
      : '<p class="sub">Ancora nessuna copia.</p>') + '<div class="sheet-actions"><button class="btn ghost" data-act="close">Chiudi</button></div>');
  }

  function replaceData(ns, msg) {
    commit((s) => {
      s.settings = ns.settings; s.tasks = ns.tasks; s.events = ns.events; s.profile = ns.profile || s.profile;
      s.plan = null; s.checkins = []; s.onboarded = true;
    }, msg);
  }

  function switchMode(m) {
    save();
    mode = m;
    ST.setMode(m);
    state = ST.load(m);
    if (m === "demo" && !state.tasks.length && !state.events.length) state = G.demo.build(now());
    closeModal();
    tick();
  }

  function rememberTab() { try { sessionStorage.setItem("ds.tab", ui.tab); } catch (e) { /* facoltativo */ } }

  // ---------------- messaggi ----------------
  let toastTimer = null;
  function toast(msg, undoSnapshot) {
    const el = $("#toast");
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (undoSnapshot ? '<button data-act="undo">Annulla</button>' : "");
    el.hidden = false;
    el._undo = undoSnapshot;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, undoSnapshot ? 6000 : 3500);
  }

  // ---------------- tocchi ----------------
  document.addEventListener("click", (e) => {
    // i controlli dei moduli (interruttori, campi) non aprono la riga che li contiene
    if (e.target.matches && e.target.matches("input, select, textarea")) return;
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      ui.tab = tabBtn.dataset.tab;
      rememberTab();
      render();
      if (ui.tab === "assistente") scrollChatEnd(); else window.scrollTo(0, 0);
      return;
    }
    const a = e.target.closest("[data-act]");
    if (a) {
      if (a.disabled) return;
      const id = a.dataset.id;
      switch (a.dataset.act) {
        case "start-real": {
          const n = $("#w-name") ? $("#w-name").value.trim() : "";
          commit((s) => { s.onboarded = true; s.profile.name = n; });
          break;
        }
        case "start-demo": switchMode("demo"); break;
        case "exit-demo": switchMode("real"); break;
        case "reset-demo": if (confirm("Ricreare i dati dimostrativi da capo?")) { ST.clearDemo(); state = G.demo.build(now()); replan(); save(); render(); } break;
        case "say": ask(a.dataset.text); break;
        case "done": markDone(id); break;
        case "undone": commit((s) => { const x = s.tasks.find((y) => y.id === id); x.done = false; x.doneAt = null; G.routines.logDone(s, x, false); }, "Di nuovo da fare"); break;
        case "focus-start": {
          const tk = taskById(id);
          if (!tk) break;
          commit((s) => { s.focus = { taskId: id, startedAt: now(), accMs: 0, running: true }; }, "Timer avviato: concentrati su «" + tk.title + "»");
          break;
        }
        case "focus-pause": commit((s) => { if (s.focus) { s.focus.accMs = focusElapsed(s.focus, now()); s.focus.running = false; s.focus.startedAt = null; } }); break;
        case "focus-resume": commit((s) => { if (s.focus) { s.focus.running = true; s.focus.startedAt = now(); } }); break;
        case "focus-stop": focusStopSheet(); break;
        case "focus-finish": {
          const f = state.focus;
          const tk = f && taskById(f.taskId);
          if (!tk) { closeModal(); break; }
          const worked = Math.max(1, Math.round(focusElapsed(f, now()) / MIN));
          const more = a.dataset.more;
          closeModal();
          if (more === "done") { markDone(tk.id); break; }
          commit((s) => {
            const x = s.tasks.find((y) => y.id === tk.id);
            x.spent = (x.spent || 0) + worked;
            x.remaining = more ? +more : Math.max(5, S.taskRemaining(x) - worked);
            s.focus = null;
            unlock(s, x.id);
          }, "Registrati " + T.fmtDur(worked) + " su «" + tk.title + "»");
          break;
        }
        case "toggle-sub": commit((s) => {
          const x = s.tasks.find((y) => y.id === id);
          const st = x && (x.subtasks || []).find((y) => y.id === a.dataset.sid);
          if (st) st.done = !st.done;
        }); break;
        case "st-add": addSubtaskFromInput(a.closest("form")); break;
        case "st-toggle": a.classList.toggle("done"); syncSubtasks(a.closest("form")); break;
        case "st-del": { const f = a.closest("form"); a.closest(".st-row").remove(); syncSubtasks(f); break; }
        case "set-area": {
          const f = a.closest("form");
          f.elements.area.value = a.dataset.v;
          a.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === a));
          break;
        }
        case "briefing-ok": commit((s) => { const k = T.dateKey(now()); s.daily[k] = Object.assign({}, s.daily[k], { briefing: now() }); }); break;
        case "evening-open": ui.eveningSel = null; eveningSheet(); break;
        case "evening-skip": commit((s) => { const k = T.dateKey(now()); s.daily[k] = Object.assign({}, s.daily[k], { closed: now(), skipped: true }); }); break;
        case "evening-done": {
          if (ui.eveningSel) ui.eveningSel.delete(id);
          const tk = taskById(id);
          if (tk && !isApple(tk.source)) { commit((s) => { const x = s.tasks.find((y) => y.id === id); x.done = true; x.doneAt = T.toISO(now()); }); eveningSheet(); }
          else markDone(id);
          break;
        }
        case "evening-close": {
          const sel = ui.eveningSel ? [...ui.eveningSel] : [];
          const tomorrow = T.dateKey(T.addDays(T.startOfDay(now()), 1));
          closeModal();
          commit((s) => {
            for (const tid of sel) {
              const x = s.tasks.find((y) => y.id === tid);
              if (!x || x.done) continue;
              x.notBefore = tomorrow; x.snoozeUntil = null;
              if (x.pinnedStart && T.fromISO(x.pinnedStart) < T.fromKey(tomorrow)) x.pinnedStart = null;
              unlock(s, tid);
            }
            s.checkins = [];
            const k = T.dateKey(now());
            s.daily[k] = Object.assign({}, s.daily[k], { closed: now() });
          }, sel.length ? "Giornata chiusa: " + sel.length + (sel.length === 1 ? " attività spostata" : " attività spostate") + " a domani" : "Giornata chiusa. Buona serata!");
          ui.eveningSel = null;
          break;
        }
        case "extend": extend(id); break;
        case "start": startNow(id); break;
        case "snooze-menu": snoozeMenu(id); break;
        case "snooze": closeModal(); snooze(id, +a.dataset.until, a.dataset.label); break;
        case "checkin-more": commit((s) => {
          const x = s.tasks.find((y) => y.id === id);
          x.remaining = +a.dataset.min;
          s.checkins = s.checkins.filter((c) => c.taskId !== id);
        }, "Ok, ho trovato altri " + T.fmtDur(+a.dataset.min)); break;
        case "checkin-tomorrow": commit((s) => {
          const x = s.tasks.find((y) => y.id === id);
          x.snoozeUntil = T.dateKey(T.addDays(T.startOfDay(now()), 1));
          s.checkins = s.checkins.filter((c) => c.taskId !== id);
        }, "Spostata a domani"); break;
        case "checkin-no": commit((s) => { s.checkins = s.checkins.filter((c) => c.taskId !== id); }, "Nessun problema: l'ho ripianificata"); break;
        case "imprevisto": imprevistoMenu(); break;
        case "imprevisto-go": addImprevisto(+a.dataset.min); break;
        case "imprevisto-day": addImprevisto("day"); break;
        case "add-menu": openModal("<h2>Cosa vuoi aggiungere?</h2><div class=\"menu\">" +
          '<button class="btn" data-act="new-task">' + I.check + "<span><b>Un'attività</b><br><span class=\"small muted\">La sistemo io dove c'è tempo</span></span></button>" +
          '<button class="btn" data-act="new-event">' + I.calendar + "<span><b>Un appuntamento</b><br><span class=\"small muted\">A un orario preciso</span></span></button>" +
          '<button class="btn ghost" data-act="close">Annulla</button></div>'); break;
        case "new-task": closeModal(); taskForm(newTaskDraft(), "new"); break;
        case "new-event": closeModal(); eventForm(newEventDraft(), "new"); break;
        case "new-at": {
          const ts = +a.dataset.ts;
          eventForm(newEventDraft({ start: T.toISO(ts), end: T.toISO(ts + 60 * MIN) }), "new");
          break;
        }
        case "close": closeModal(); break;
        case "set-dur": {
          const f = a.closest("form");
          f.elements.duration.value = a.dataset.min;
          a.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === a));
          break;
        }
        case "set-prio": {
          const f = a.closest("form");
          f.elements.priority.value = a.dataset.p;
          a.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === a));
          break;
        }
        case "delete-task": {
          const t = taskById(id);
          if (!t || isApple(t.source)) break;
          closeModal();
          commit((s) => {
            if (t.routineId) s.routineSkips[t.routineId + "@" + t.occ] = true;
            s.tasks = s.tasks.filter((x) => x.id !== id);
          }, "«" + t.title + "» eliminata");
          break;
        }
        case "delete-event": {
          const ev = eventById(id);
          if (!ev || isApple(ev.source)) break;
          closeModal();
          commit((s) => { s.events = s.events.filter((x) => x.id !== id); }, "«" + ev.title + "» eliminato");
          break;
        }
        case "delete-occ": {
          const ev = eventById(id);
          if (!ev || isApple(ev.source)) break;
          const occ = a.dataset.occ;
          closeModal();
          commit((s) => { const x = s.events.find((y) => y.id === id); x.exceptions = (x.exceptions || []).concat(occ); }, "Eliminato per " + T.fmtDay(T.fromKey(occ), now()).toLowerCase());
          break;
        }
        case "hide": hideItem(a.dataset.key, a.dataset.title); break;
        case "unhide": {
          const k = a.dataset.key;
          const title = state.hidden[k] && state.hidden[k].title;
          commit((s) => { delete s.hidden[k]; }, "«" + (title || "Elemento") + "» di nuovo visibile");
          if (!$("#modal").hidden) hiddenMenu();
          break;
        }
        case "hidden-menu": hiddenMenu(); break;
        case "new-routine": routineForm(G.routines.create({}, now()), true); break;
        case "add-routine": {
          const c = G.routines.CATALOG.find((x) => x.key === a.dataset.key);
          if (c) commit((s) => s.routines.push(G.routines.create({ title: c.title, duration: c.duration, pref: c.pref || null, time: c.time || null }, now())),
            "«" + c.title + "» aggiunta: la trovi ogni giorno nel programma");
          break;
        }
        case "toggle-day": {
          a.classList.toggle("on");
          const f = a.closest("form");
          const on = [];
          a.parentElement.querySelectorAll("button").forEach((b) => { if (b.classList.contains("on")) on.push(b.dataset.d); });
          f.elements.days.value = on.join(",");
          break;
        }
        case "delete-routine": {
          const r = state.routines.find((x) => x.id === id);
          if (!r || !confirm("Eliminare la routine «" + r.title + "»? Lo storico di ciò che hai già fatto resta.")) break;
          closeModal();
          commit((s) => { s.routines = s.routines.filter((x) => x.id !== id); }, "Routine eliminata");
          break;
        }
        case "skip-routine": {
          const tk = taskById(id);
          if (!tk) break;
          closeModal();
          commit((s) => { s.routineSkips[tk.routineId + "@" + tk.occ] = true; }, "«" + tk.title + "» saltata");
          break;
        }
        case "confirm-proposal": confirmProposal(a.dataset.pid); break;
        case "cancel-proposal": cancelProposal(a.dataset.pid); break;
        case "edit-proposal": editProposal(a.dataset.pid); break;
        case "edit-op": editOp(a.dataset.pid, +a.dataset.i); break;
        case "clear-chat": if (confirm("Cancellare la conversazione? Le proposte in attesa verranno annullate.")) {
          for (const p of state.proposals) if (p.status === "pending") p.status = "cancelled";
          state.chat = []; save(); render();
        } break;
        case "cal-view": ui.cal.view = a.dataset.v; render(); break;
        case "cal-nav": {
          const d = +a.dataset.d;
          if (ui.cal.view === "day") ui.cal.date = T.addDays(ui.cal.date, d);
          else if (ui.cal.view === "week") ui.cal.date = T.addDays(ui.cal.date, 7 * d);
          else { const x = new Date(ui.cal.date); ui.cal.date = new Date(x.getFullYear(), x.getMonth() + d, 1).getTime(); }
          render(); break;
        }
        case "cal-today": ui.cal.date = T.startOfDay(now()); render(); break;
        case "cal-goto": ui.cal.date = +a.dataset.day; ui.cal.view = "day"; render(); break;
        case "cal-hide-proposal": ui.showProposalInCal = false; render(); break;
        case "cal-show-proposal": ui.showProposalInCal = true; render(); break;
        case "list-tab": ui.listTab = a.dataset.v; render(); break;
        case "filter": ui.filter = a.dataset.v; render(); break;
        case "toggle-done": ui.showDone = !ui.showDone; render(); break;
        case "clear-done": if (confirm("Eliminare tutte le attività interne completate?")) commit((s) => { s.tasks = s.tasks.filter((x) => !x.done || isApple(x.source)); }, "Completate eliminate"); break;
        case "add-break": commit((s) => s.settings.breaks.push({ label: "Pausa", start: "16:00", end: "16:15", on: true })); break;
        case "del-break": commit((s) => s.settings.breaks.splice(+a.dataset.i, 1)); break;
        case "export": exportBackup(); break;
        case "restore-menu": restoreMenu(); break;
        case "restore": { const b = ST.backups()[+a.dataset.i]; closeModal(); if (b) replaceData(ST.importData(b.data), "Dati ripristinati"); break; }
        case "reset":
          if (confirm(mode === "demo" ? "Cancellare i dati dimostrativi?" : "Cancellare TUTTE le tue attività, appuntamenti e impostazioni? Conviene scaricare prima un backup.")) {
            const fresh = ST.empty();
            fresh.onboarded = true;
            state = fresh; replan(); save(); render(); toast("Tutto cancellato");
          }
          break;
        case "undo": {
          const el = $("#toast");
          if (el._undo) { state = ST.normalize(JSON.parse(el._undo)); replan(); save(); render(); }
          el.hidden = true;
          break;
        }
      }
      return;
    }
    const o = e.target.closest("[data-open]");
    if (o) {
      const [kind, id, occ] = o.dataset.open.split(":");
      if (kind === "task" && taskById(id)) { const tk = taskById(id); if (tk.routineId) routineOccSheet(tk); else taskForm(tk, "edit"); }
      if (kind === "routine") { const r = state.routines.find((x) => x.id === id); if (r) { closeModal(); routineForm(r, false); } }
      if (kind === "event" && eventById(id)) eventForm(eventById(id), "edit", occ);
      return;
    }
    if (e.target.id === "modal") closeModal();
  });

  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "quick-form") {
      const input = $("#quick-input");
      const v = input.value;
      input.value = "";
      ask(v);
    }
    if (e.target.id === "task-form") saveTaskForm(e.target);
    if (e.target.id === "event-form") saveEventForm(e.target);
    if (e.target.id === "routine-form") saveRoutineForm(e.target);
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    const set = el.dataset && el.dataset.set;
    if (!set) return;
    if (set === "import") {
      const file = el.files && el.files[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const ns = ST.importData(txt);
          if (confirm("Sostituire i dati attuali con quelli del file (" + ns.tasks.length + " attività, " + ns.events.length + " appuntamenti)?")) replaceData(ns, "Backup ripristinato");
        } catch (err) { alert("Questo file non sembra un backup di Daily Schedule."); }
      });
      return;
    }
    if (set === "notifications") {
      if (el.checked && "Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then((p) => {
          commit((s) => { s.notifications = p === "granted"; }, p === "granted" ? "Notifiche attivate" : "Permesso negato: puoi attivarlo dalle impostazioni del browser");
        });
      } else commit((s) => { s.notifications = el.checked; });
      return;
    }
    if (set === "evening-sel") { if (!ui.eveningSel) ui.eveningSel = new Set(); if (el.checked) ui.eveningSel.add(el.dataset.id); else ui.eveningSel.delete(el.dataset.id); return; }
    if (set === "st-text") { syncSubtasks(el.closest("form")); return; }
    if (set === "evening-time") { if (el.value) commit((s) => { s.settings.eveningTime = el.value; }, "Orario salvato"); return; }
    if (set === "morningBriefing" || set === "eveningReview") { commit((s) => { s.settings[set] = el.checked; }, "Impostazioni salvate"); return; }
    if (set === "routine-active") { commit((s) => { s.routines.find((x) => x.id === el.dataset.id).active = el.checked; }, el.checked ? "Routine attiva" : "Routine in pausa"); return; }
    if (set === "name") { commit((s) => { s.profile.name = el.value.trim().slice(0, 40); }, "Nome salvato"); return; }
    commit((s) => {
      const st = s.settings;
      if (set === "hours-on") st.hours[+el.dataset.day].on = el.checked;
      if (set === "hours-start" && el.value) st.hours[+el.dataset.day].start = el.value;
      if (set === "hours-end" && el.value) st.hours[+el.dataset.day].end = el.value;
      if (set === "break-label") st.breaks[+el.dataset.i].label = el.value || "Pausa";
      if (set === "break-start" && el.value) st.breaks[+el.dataset.i].start = el.value;
      if (set === "break-end" && el.value) st.breaks[+el.dataset.i].end = el.value;
      if (set === "num") {
        const v = parseInt(el.value, 10);
        if (!isNaN(v)) st[el.dataset.key] = Math.max(+el.min, Math.min(+el.max, v));
      }
    }, "Impostazioni salvate");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    // Invio nel campo "Aggiungi un passo" aggiunge il passo invece di salvare il modulo
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("st-new")) { e.preventDefault(); addSubtaskFromInput(e.target.closest("form")); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  window.addEventListener("focus", tick);

  // ---------------- avvio ----------------
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker non registrato", err));
  }
  tick();
  setInterval(tick, 30000);
  setInterval(() => {
    const el = document.getElementById && document.getElementById("focus-timer");
    if (!el || !el.dataset.start) return;
    el.textContent = fmtClock((+el.dataset.acc || 0) + (now() - +el.dataset.start));
  }, 1000);

  // per i test e il debug
  G.app = { get state() { return state; }, get mode() { return mode; }, tick, now, ask, ui };
})(globalThis.G || (globalThis.G = {}));
