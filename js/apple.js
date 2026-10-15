// Collegamento con Apple Calendar e Apple Promemoria tramite l'app «Daily Schedule per Mac».
// In questa versione è in SOLA LETTURA: l'app Mac passa eventi e promemoria, qui vengono
// copiati nel programma come elementi "Apple" (source apple-calendar / apple-reminders).
// Le informazioni aggiunte in Daily Schedule (area, durata stimata, passi, momento preferito,
// tempo di spostamento) restano anche quando i dati Apple si aggiornano.
(function (G) {
  "use strict";
  const T = G.time;

  function handler() {
    const w = typeof window !== "undefined" ? window : null;
    return w && w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.apple ? w.webkit.messageHandlers.apple : null;
  }
  function available() { return !!handler(); }

  function call(method, params) {
    const h = handler();
    if (!h) return Promise.reject(new Error("App per Mac non presente"));
    return Promise.resolve(h.postMessage({ method, params: params || {} }));
  }

  // Campi che decide Apple (vengono aggiornati); tutti gli altri sono di Daily Schedule
  const EVENT_APPLE = ["title", "start", "end", "allDay", "location", "notes", "calendar", "calendarColor", "externalId", "externalModified", "recurring", "free"];
  const TASK_APPLE = ["title", "deadline", "notes", "list", "externalId", "externalModified"];

  function mapPriority(p) {
    if (p >= 1 && p <= 4) return 1;
    if (p >= 6) return 3;
    return 2;
  }

  // Fonde i dati arrivati dal Mac con lo stato. Funzione pura (modifica solo "state").
  // opts = { calendar: bool, reminders: bool } indica cosa è collegato.
  function merge(state, data, now, opts) {
    opts = opts || { calendar: true, reminders: true };
    const summary = { events: 0, reminders: 0, removed: 0, completed: 0 };
    if (opts.calendar && Array.isArray(data.events)) {
      const old = {};
      for (const e of state.events) if (e.source === "apple-calendar") old[e.id] = e;
      const fresh = [];
      for (const a of data.events) {
        if (!a || !a.id || !a.start) continue;
        if (a.free && !a.allDay) continue; // eventi segnati "libero" non occupano tempo
        const id = "ac:" + a.id;
        const prev = old[id];
        const ev = Object.assign({ id, source: "apple-calendar", repeat: "none", exceptions: [], createdAt: T.toISO(now) },
          prev || {}, pick(a, EVENT_APPLE), { externalId: a.externalId || a.id });
        if (!prev && ev.area == null) ev.area = G.areas ? G.areas.guess(ev.title) : null;
        fresh.push(ev);
      }
      const removed = Object.keys(old).filter((id) => !fresh.some((e) => e.id === id)).length;
      state.events = state.events.filter((e) => e.source !== "apple-calendar").concat(fresh);
      summary.events = fresh.length;
      summary.removed += removed;
    }
    if (opts.reminders && Array.isArray(data.reminders)) {
      const seen = new Set();
      for (const r of data.reminders) {
        if (!r || !r.id) continue;
        const id = "ar:" + r.id;
        seen.add(id);
        let t = state.tasks.find((x) => x.id === id);
        const appleFields = { title: r.title, deadline: r.due || null, notes: r.notes || "", list: r.list || "",
          externalId: r.id, externalModified: r.externalModified || null };
        if (r.completed) {
          if (t && !t.done) { t.done = true; t.doneAt = r.completedAt || T.toISO(now); summary.completed++; }
          if (t) Object.assign(t, appleFields);
          continue;
        }
        if (!t) {
          const dur = G.assistant ? G.assistant.estimate(r.title) : 30;
          t = { id, source: "apple-reminders", createdAt: T.toISO(now), done: false, duration: dur, remaining: dur,
            priority: mapPriority(r.priority), splittable: dur > 30, area: G.areas ? G.areas.guess(r.title) : null };
          state.tasks.push(t);
        } else if (t.done) {
          t.done = false; t.doneAt = null; // riaperto in Promemoria
        }
        Object.assign(t, appleFields);
        summary.reminders++;
      }
      // Promemoria che non arrivano più (eliminati in Apple): tolti dalla copia locale
      const before = state.tasks.length;
      state.tasks = state.tasks.filter((x) => x.source !== "apple-reminders" || x.done || seen.has(x.id));
      summary.removed += before - state.tasks.length;
    }
    return summary;
  }

  function pick(o, keys) {
    const out = {};
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
    return out;
  }

  // Scollegare: toglie le COPIE locali (Apple non viene toccato)
  function forget(state, kind) {
    if (kind === "calendar") state.events = state.events.filter((e) => e.source !== "apple-calendar");
    if (kind === "reminders") state.tasks = state.tasks.filter((t) => t.source !== "apple-reminders");
  }

  G.apple = { available, call, merge, forget, mapPriority };
})(globalThis.G || (globalThis.G = {}));
