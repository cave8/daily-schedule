// "Ogni giorno": routine che l'app inserisce da sola nel programma.
// Ogni routine genera, per i prossimi giorni, un'attività normale (con routineId e
// occ = giorno). Così completamento, check-in e riorganizzazione funzionano come
// per tutte le altre attività. Le occorrenze non fatte dei giorni passati spariscono:
// un'abitudine saltata ieri non si accumula oggi.
(function (G) {
  "use strict";
  const T = G.time;
  const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
  const SPAN_DAYS = 7;

  // Suggerimenti pronti da aggiungere con un tocco
  const CATALOG = [
    { key: "plan", title: "Pianificare la giornata", duration: 10, time: "08:45" },
    { key: "meditate", title: "Meditazione", duration: 10, pref: "morning" },
    { key: "workout", title: "Allenamento", duration: 45, pref: "morning" },
    { key: "mail", title: "Controllare la posta", duration: 20, pref: "morning" },
    { key: "study", title: "Studio", duration: 60, pref: "morning" },
    { key: "walk", title: "Passeggiata", duration: 30, pref: "afternoon" },
    { key: "tidy", title: "Riordinare casa", duration: 20, pref: "evening" },
    { key: "cook", title: "Cucinare la cena", duration: 45, time: "19:30" },
    { key: "read", title: "Leggere", duration: 30, pref: "evening" },
    { key: "review", title: "Ripasso della giornata", duration: 10, pref: "evening" },
  ];

  function create(data, now) {
    if (data && data.title && data.area === undefined && G.areas) data = Object.assign({ area: G.areas.guess(data.title) }, data);
    return Object.assign({
      id: G.store.uid(), title: "", duration: 30, pref: null, time: null,
      days: ALL_DAYS.slice(), active: true, priority: 2, createdAt: T.toISO(now),
    }, data);
  }

  function occursOn(r, day) {
    return !!(r && r.active !== false && (r.days || ALL_DAYS).includes(new Date(day).getDay()));
  }

  function occurrenceFields(r, key) {
    return {
      title: r.title,
      duration: r.duration,
      pref: r.time ? null : (r.pref || null),
      pinnedStart: r.time ? key + "T" + r.time : null,
      priority: r.priority || 2,
      area: r.area || null,
    };
  }

  // Allinea le attività generate alle routine. Restituisce true se qualcosa è cambiato.
  function sync(state, now) {
    const today = T.startOfDay(now);
    const routines = state.routines || [];
    const skips = state.routineSkips || {};
    const byId = {};
    for (const r of routines) byId[r.id] = r;
    let changed = false;

    // 1. togli le occorrenze non fatte dei giorni passati o di routine eliminate/disattivate;
    //    togli anche lo storico fatto più vecchio di 30 giorni
    const keep = [];
    for (const t of state.tasks) {
      if (!t.routineId) { keep.push(t); continue; }
      const day = T.fromKey(t.occ);
      if (t.done) {
        if (day < T.addDays(today, -30)) { changed = true; continue; }
        keep.push(t); continue;
      }
      if (day < today || !occursOn(byId[t.routineId], day) || skips[t.routineId + "@" + t.occ]) { changed = true; continue; }
      // 2. le modifiche alla routine valgono per le occorrenze ancora da fare
      const f = occurrenceFields(byId[t.routineId], t.occ);
      if (t.title !== f.title || t.duration !== f.duration || (t.pref || null) !== f.pref || (t.pinnedStart || null) !== f.pinnedStart || t.priority !== f.priority || (t.area || null) !== f.area) {
        const wasFull = S().taskRemaining(t) === t.duration;
        Object.assign(t, f);
        if (wasFull) t.remaining = f.duration;
        changed = true;
      }
      keep.push(t);
    }
    if (keep.length !== state.tasks.length) state.tasks = keep;

    // 3. crea quelle che mancano
    const have = new Set(state.tasks.filter((t) => t.routineId).map((t) => t.routineId + "@" + t.occ));
    for (const r of routines) {
      for (let i = 0; i < SPAN_DAYS; i++) {
        const day = T.addDays(today, i);
        const key = T.dateKey(day);
        const k = r.id + "@" + key;
        if (!occursOn(r, day) || have.has(k) || skips[k]) continue;
        state.tasks.push(Object.assign({
          id: "r-" + r.id + "-" + key, routineId: r.id, occ: key, source: "internal",
          notBefore: key, deadline: key, strictDay: true, splittable: false, done: false,
          createdAt: T.toISO(now),
        }, occurrenceFields(r, key), { remaining: r.duration }));
        have.add(k);
        changed = true;
      }
    }
    return changed;
  }

  function S() { return G.scheduler; }

  function describeDays(days) {
    const d = (days || ALL_DAYS).slice().sort();
    if (d.length === 7) return "ogni giorno";
    const set = d.join(",");
    if (set === "1,2,3,4,5") return "lun–ven";
    if (set === "0,6") return "weekend";
    return ALL_DAYS.filter((x) => d.includes(x)).map((x) => T.GIORNI_BREVI[x]).join(" ");
  }

  // Registro delle volte in cui una routine è stata fatta (serve per le serie)
  function logDone(state, t, done) {
    if (!t || !t.routineId) return;
    state.routineLog = state.routineLog || {};
    const list = new Set(state.routineLog[t.routineId] || []);
    if (done) list.add(t.occ); else list.delete(t.occ);
    state.routineLog[t.routineId] = [...list].sort().slice(-400);
  }

  G.routines = { CATALOG, ALL_DAYS, create, sync, occursOn, describeDays, logDone };
})(globalThis.G || (globalThis.G = {}));
