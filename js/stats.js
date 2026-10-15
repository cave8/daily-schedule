// Resoconti: tempo per area nella settimana, attività fatte, serie delle routine.
(function (G) {
  "use strict";
  const T = G.time, MIN = T.MIN;

  function weekStart(t) {
    const d = T.startOfDay(t);
    return T.addDays(d, -((new Date(d).getDay() + 6) % 7)); // lunedì
  }

  // Giorni consecutivi in cui la routine è stata fatta (i giorni in cui non è prevista
  // o che hai saltato apposta non interrompono la serie; oggi non ancora fatta non la interrompe)
  function streak(state, r, now) {
    const log = new Set(((state.routineLog || {})[r.id]) || []);
    const skips = state.routineSkips || {};
    const days = r.days || [0, 1, 2, 3, 4, 5, 6];
    const created = r.createdAt ? T.startOfDay(T.fromISO(r.createdAt)) : 0;
    let d = T.startOfDay(now);
    if (!log.has(T.dateKey(d))) d = T.addDays(d, -1);
    let count = 0;
    for (let i = 0; i < 400; i++) {
      const k = T.dateKey(d);
      if (log.has(k)) count++;
      else if (days.includes(new Date(d).getDay()) && !skips[r.id + "@" + k]) break;
      d = T.addDays(d, -1);
      if (d < created && !log.has(T.dateKey(d))) break;
    }
    return count;
  }

  function week(state, now) {
    const ws = weekStart(now), we = T.addDays(ws, 7);
    const byArea = {};
    const add = (area, min) => { const k = area || "altro"; byArea[k] = (byArea[k] || 0) + min; };
    let doneCount = 0, focusMin = 0;
    for (const t of state.tasks) {
      if (!t.done || !t.doneAt) continue;
      const at = T.fromISO(t.doneAt);
      if (at < ws || at >= we) continue;
      doneCount++;
      add(t.area, t.actual || t.duration || 0);
      if (t.actual) focusMin += t.actual;
    }
    for (const o of G.scheduler.visibleEvents(state, ws, Math.min(we, now))) {
      if (o.allDay) continue;
      const ev = state.events.find((e) => e.id === o.eventId);
      add(ev && ev.area, (Math.min(o.end, now) - o.start) / MIN);
    }
    const areas = G.areas.AREAS.map((a) => ({ id: a.id, label: a.label, color: a.color, minutes: Math.round(byArea[a.id] || 0) }))
      .concat([{ id: "altro", label: "Altro", color: "#b8b8b2", minutes: Math.round(byArea.altro || 0) }])
      .filter((a) => a.minutes > 0);
    const total = areas.reduce((s, a) => s + a.minutes, 0);
    const routines = (state.routines || []).map((r) => ({ r, streak: streak(state, r, now) })).sort((a, b) => b.streak - a.streak);
    return { weekStart: ws, areas, total, doneCount, focusMin, routines };
  }

  G.stats = { week, streak, weekStart };
})(globalThis.G || (globalThis.G = {}));
