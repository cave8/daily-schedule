// Il pianificatore: prende impostazioni, appuntamenti e attività e calcola
// il programma da "adesso" in avanti. Viene rieseguito a ogni cambiamento,
// quindi la giornata si riorganizza da sola.
//
// Regole principali:
// - gli appuntamenti sono fissi; attorno a loro si lascia un margine (buffer)
// - le attività si mettono solo negli orari disponibili, fuori dalle pause
// - l'ordine dipende da scadenza e priorità; se un'attività finirebbe oltre la
//   scadenza, il pianificatore riprova dandole la precedenza
// - l'attività in corso (iniziata e non ancora finita) non viene spostata
// - le attività con "orario fisso" restano dove l'utente le ha messe
(function (G) {
  "use strict";
  const T = G.time;
  const MIN = T.MIN;

  // Dopo quanti giorni un'attività senza scadenza diventa "da fare subito"
  const SOFT_DAYS = { 1: 0, 2: 2, 3: 6 };
  // Fasce del momento preferito (minuti dalla mezzanotte)
  const PREF = { morning: [0, 13 * 60], afternoon: [13 * 60, 18 * 60], evening: [18 * 60, 24 * 60] };

  function defaultSettings() {
    const work = { on: true, start: "09:00", end: "19:00" };
    const weekend = { on: true, start: "10:00", end: "18:00" };
    return {
      // indice = giorno della settimana (0 = domenica)
      hours: [weekend, work, work, work, work, work, weekend].map((h) => Object.assign({}, h)),
      breaks: [{ label: "Pranzo", start: "13:00", end: "14:00", on: true }],
      buffer: 10,      // minuti di margine tra un impegno e l'altro
      maxFocus: 90,    // massimo blocco continuo su una stessa attività
      minChunk: 25,    // pezzo minimo quando un'attività viene divisa
      horizonDays: 14, // quanti giorni avanti pianificare
      defaultDuration: 30, // durata di una nuova attività se non indicata
      defaultTravel: 15,     // minuti per arrivare a un appuntamento con un luogo (0 = mai)
      morningBriefing: true, // riepilogo del mattino
      eveningReview: true,   // chiusura della sera
      eveningTime: "21:00",
      dailyLoad: 80,   // % massima del tempo libero da riempire (il resto è margine per imprevisti)
    };
  }

  function mergeSettings(s) {
    const d = defaultSettings();
    if (!s) return d;
    const out = Object.assign(d, s);
    if (!Array.isArray(out.hours) || out.hours.length !== 7) out.hours = defaultSettings().hours;
    if (!Array.isArray(out.breaks)) out.breaks = [];
    return out;
  }

  // ---------- intervalli [inizio, fine] ordinati e non sovrapposti ----------
  function subtract(list, s, e) {
    if (!(e > s)) return list;
    const out = [];
    for (const [a, b] of list) {
      if (b <= s || a >= e) { out.push([a, b]); continue; }
      if (a < s) out.push([a, s]);
      if (b > e) out.push([e, b]);
    }
    return out;
  }

  // ---------- scadenze ----------
  // "2026-10-17" = entro la fine di quel giorno; "2026-10-17T12:00" = entro quell'ora
  function deadlineMs(dl) {
    if (!dl) return Infinity;
    return T.hasTime(dl) ? T.fromISO(dl) : T.addDays(T.fromKey(dl), 1);
  }

  function taskRemaining(t) {
    const r = t.remaining != null ? t.remaining : t.duration;
    return Math.max(0, Math.round(Number(r) || 0));
  }

  // ---------- appuntamenti (anche ripetuti) ----------
  function eventDuration(ev) {
    const s = T.fromISO(ev.start), e = T.fromISO(ev.end);
    return e > s ? e - s : 30 * MIN;
  }

  function repeatsOn(ev, day, firstDay) {
    const wd = new Date(day).getDay();
    switch (ev.repeat) {
      case "daily": return true;
      case "weekdays": return wd >= 1 && wd <= 5;
      case "weekly": return wd === new Date(firstDay).getDay();
      case "monthly": return new Date(day).getDate() === new Date(firstDay).getDate();
      default: return false;
    }
  }

  function expandEvents(events, fromMs, toMs) {
    const out = [];
    for (const ev of events || []) {
      if (!ev || !ev.start) continue;
      const start = T.fromISO(ev.start);
      const dur = eventDuration(ev);
      const base = { eventId: ev.id, title: ev.title, location: ev.location || "", repeat: ev.repeat || "none",
        source: ev.source || "internal", allDay: !!ev.allDay, area: ev.area || null,
        travel: ev.travel != null && ev.travel !== "" ? Number(ev.travel) : null };
      if (!ev.repeat || ev.repeat === "none") {
        if (start + dur > fromMs && start < toMs) {
          out.push(Object.assign({ id: ev.id, start, end: start + dur, dateKey: T.dateKey(start) }, base));
        }
        continue;
      }
      const firstDay = T.startOfDay(start);
      const tod = T.minOfDay(start);
      const until = ev.until ? T.addDays(T.fromKey(ev.until), 1) : Infinity;
      const exceptions = ev.exceptions || [];
      for (let day = T.addDays(T.startOfDay(fromMs), -1); day < toMs; day = T.addDays(day, 1)) {
        if (day < firstDay || day >= until) continue;
        if (!repeatsOn(ev, day, firstDay)) continue;
        const key = T.dateKey(day);
        if (exceptions.includes(key)) continue;
        const s = T.atMin(day, tod), e = s + dur;
        if (e > fromMs && s < toMs) out.push(Object.assign({ id: ev.id + "@" + key, start: s, end: e, dateKey: key }, base));
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  // Appuntamenti senza quelli che l'utente ha "oscurato" (nascosti, non cancellati)
  function visibleEvents(state, fromMs, toMs) {
    const hid = state.hidden || {};
    return expandEvents(state.events, fromMs, toMs).filter((o) => !hid["e:" + o.id]);
  }

  // ---------- il calcolo del programma ----------
  function plan(state, now) {
    const S = mergeSettings(state.settings);
    const buf = Math.max(0, Number(S.buffer) || 0) * MIN;
    const maxFocus = Math.max(15, Number(S.maxFocus) || 90);
    const minChunk = Math.max(5, Number(S.minChunk) || 25);
    const today = T.startOfDay(now);
    const horizonEnd = T.addDays(today, Math.max(1, Number(S.horizonDays) || 14));
    const nowC = T.ceilTo(now, 5);
    const load = Math.min(100, Math.max(30, Number(S.dailyLoad) || 80)) / 100;

    const blocks = [];
    const warnings = [];
    const info = {};

    // Appuntamenti
    const allEvents = visibleEvents(state, today, horizonEnd);
    const hid = state.hidden || {};
    const todayKey = T.dateKey(today);
    const tomorrow = T.addDays(today, 1);
    // attività oscurate per oggi: si possono mettere solo da domani
    const hiddenToday = (t) => !!hid["t:" + t.id + "@" + todayKey];
    for (const o of allEvents) {
      blocks.push({ kind: o.allDay ? "allday" : "event", id: o.id, eventId: o.eventId, title: o.title, location: o.location,
        repeat: o.repeat, start: o.start, end: o.end, source: o.source, area: o.area });
    }
    // Tempo per arrivare agli appuntamenti con un luogo
    const defTravel = Math.max(0, Number(S.defaultTravel) || 0);
    const travelOf = (o) => (o.allDay ? 0 : o.travel != null ? Math.max(0, o.travel) : o.location ? defTravel : 0);
    // Gli eventi "tutto il giorno" (compleanni, ferie...) non occupano ore precise
    const events = allEvents.filter((o) => !o.allDay);
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length && events[j].start < events[i].end; j++) {
        if (events[j].end > now) {
          warnings.push({ type: "conflict", ids: [events[i].id, events[j].id],
            text: "«" + events[i].title + "» e «" + events[j].title + "» si sovrappongono (" +
              T.fmtDay(events[j].start, now) + " " + T.fmtHM(events[j].start) + ")" });
        }
      }
    }

    // Orari disponibili, meno pause
    let free = [];
    for (let d = today; d < horizonEnd; d = T.addDays(d, 1)) {
      const h = S.hours[new Date(d).getDay()];
      if (!h || !h.on) continue;
      const ws = T.atMin(d, T.hmToMin(h.start)), we = T.atMin(d, T.hmToMin(h.end));
      if (!(we > ws)) continue;
      let win = [[ws, we]];
      for (const br of S.breaks) {
        if (!br || br.on === false || !br.start || !br.end) continue;
        const bs = T.atMin(d, T.hmToMin(br.start)), be = T.atMin(d, T.hmToMin(br.end));
        if (be > ws && bs < we && be > bs) {
          win = subtract(win, bs, be);
          blocks.push({ kind: "break", id: "break@" + T.dateKey(d) + "@" + br.start, title: br.label || "Pausa",
            start: Math.max(bs, ws), end: Math.min(be, we) });
        }
      }
      free.push(...win);
    }
    free = free.map(([a, b]) => [Math.max(a, nowC), b]).filter(([a, b]) => b > a);
    for (const o of events) {
      const tr = travelOf(o) * MIN;
      free = subtract(free, o.start - tr - buf, o.end + buf);
      if (tr > 0 && o.end > now) {
        blocks.push({ kind: "travel", id: "travel@" + o.id, eventId: o.eventId, title: "Spostamento verso «" + o.title + "»",
          start: o.start - tr, end: o.start, location: o.location });
        const clash = events.find((x) => x !== o && x.start < o.start && x.end > o.start - tr);
        if (clash) warnings.push({ type: "travel", ids: [o.id], text: "Dopo «" + clash.title + "» non hai " + T.fmtDur(tr / MIN) + " per arrivare a «" + o.title + "»" });
      }
    }

    const open = (state.tasks || []).filter((t) => t && !t.done);
    const byId = {};
    const remaining = {};
    for (const t of open) { byId[t.id] = t; remaining[t.id] = taskRemaining(t); }

    // Scadute
    for (const t of open) {
      if (t.deadline && deadlineMs(t.deadline) <= now) {
        warnings.push({ type: "overdue", taskId: t.id, text: "«" + t.title + "» è scaduta" });
      }
    }

    function overlapsEvent(s, e) {
      return events.find((o) => o.start < e && o.end > s);
    }

    // Attività con orario fisso
    for (const t of open) {
      if (!t.pinnedStart || remaining[t.id] <= 0) continue;
      const s = T.fromISO(t.pinnedStart), e = s + remaining[t.id] * MIN;
      if (hiddenToday(t) && s < tomorrow) continue;
      if (e <= now) continue; // l'orario fisso è passato senza "Fatto": si ripianifica
      blocks.push({ kind: "task", id: t.id + "#pin", taskId: t.id, title: t.title, start: s, end: e, pinned: true,
        priority: t.priority || 2, late: e > deadlineMs(t.deadline), source: t.source || "internal", area: t.area || null, routine: !!t.routineId });
      info[t.id] = { start: s, end: e, chunks: 1, late: e > deadlineMs(t.deadline) };
      const clash = overlapsEvent(s, e);
      if (clash) warnings.push({ type: "conflict", taskId: t.id,
        text: "«" + t.title + "» ha un orario fisso che si sovrappone a «" + clash.title + "»" });
      remaining[t.id] = 0;
      free = subtract(free, s - buf, e + buf);
    }

    // Attività in corso: resta dov'è (fino al primo appuntamento che la interrompe)
    const prev = (state.plan && state.plan.blocks) || [];
    for (const b of prev) {
      if (b.kind !== "task" || b.pinned || !byId[b.taskId] || hiddenToday(byId[b.taskId])) continue;
      if (!(b.start <= now && b.end > now)) continue;
      const R = remaining[b.taskId];
      if (R <= 0) continue;
      let end = Math.min(b.end, b.start + R * MIN);
      let interrupted = false;
      for (const o of events) {
        if (o.start < end && o.end > b.start) {
          if (o.start <= now) { interrupted = true; break; }
          end = Math.min(end, o.start);
        }
      }
      if (interrupted || end <= now) continue;
      const t = byId[b.taskId];
      blocks.push({ kind: "task", id: t.id + "#now", taskId: t.id, title: t.title, start: b.start, end, locked: true,
        priority: t.priority || 2, late: end > deadlineMs(t.deadline), source: t.source || "internal", area: t.area || null, routine: !!t.routineId });
      info[t.id] = { start: b.start, end, chunks: 1, late: end > deadlineMs(t.deadline) };
      remaining[t.id] = Math.max(0, R - Math.round((end - b.start) / MIN));
      free = subtract(free, b.start, end + buf);
    }

    // Capacità: quanti minuti di attività mettere al massimo in ogni giorno
    const capacity = {};
    for (const [a, b] of free) {
      const k = T.dateKey(a);
      capacity[k] = (capacity[k] || 0) + (b - a) / MIN;
    }
    for (const k of Object.keys(capacity)) capacity[k] = Math.floor(capacity[k] * load);

    // Ordine di lavoro
    function sortKey(t) {
      // le routine (brevi, legate al loro giorno) prendono posto per prime nel loro momento preferito
      if (t.strictDay && t.notBefore) return T.startOfDay(T.fromISO(t.notBefore));
      const created = t.createdAt ? T.startOfDay(t.createdAt) : today;
      const soft = Math.max(today, T.addDays(created, SOFT_DAYS[t.priority] != null ? SOFT_DAYS[t.priority] : 2));
      let k = Math.min(deadlineMs(t.deadline), soft);
      if (t.notBefore) k = Math.max(k, T.startOfDay(T.fromISO(t.notBefore)));
      return k;
    }
    const toPlace = open.filter((t) => remaining[t.id] > 0);
    function ordered(boosted) {
      return toPlace.slice().sort((a, b) => {
        const ba = boosted.has(a.id), bb = boosted.has(b.id);
        if (ba !== bb) return ba ? -1 : 1;
        if (ba && bb) return deadlineMs(a.deadline) - deadlineMs(b.deadline);
        return (sortKey(a) - sortKey(b)) ||
          ((a.priority || 2) - (b.priority || 2)) ||
          (deadlineMs(a.deadline) - deadlineMs(b.deadline)) ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
          String(a.id).localeCompare(String(b.id));
      });
    }

    function prefSegments(a, b, pref) {
      if (!pref || !PREF[pref]) return [[a, b]];
      const out = [];
      for (let d = T.startOfDay(a); d < b; d = T.addDays(d, 1)) {
        const s = Math.max(a, T.atMin(d, PREF[pref][0])), e = Math.min(b, T.atMin(d, PREF[pref][1]));
        if (e > s) out.push([s, e]);
      }
      return out;
    }

    // cap: minuti ancora disponibili per giorno (null = ignora il margine)
    function tryPlace(fr, R, notBefore, limit, pref, split, cap) {
      const chunks = [];
      const used = {};
      let left = R;
      for (const [a0, b0] of fr) {
        const a1 = Math.max(a0, notBefore), b1 = Math.min(b0, limit);
        if (b1 <= a1) continue;
        for (const seg of prefSegments(a1, b1, pref)) {
          let a = seg[0];
          const b = seg[1];
          const dk = T.dateKey(a);
          while (left > 0 && b > a) {
            const room = cap ? (cap[dk] || 0) - (used[dk] || 0) : Infinity;
            const avail = Math.min(Math.floor((b - a) / MIN), room);
            if (!split) {
              if (avail >= left) return [[a, a + left * MIN]];
              break;
            }
            let len = Math.min(left, maxFocus, avail);
            const rest = left - len;
            if (rest > 0 && rest < minChunk) {
              len = (avail >= left && left <= maxFocus + minChunk) ? left : left - minChunk;
            }
            if (len < Math.min(minChunk, left) || len <= 0) break;
            chunks.push([a, a + len * MIN]);
            used[dk] = (used[dk] || 0) + len;
            left -= len;
            a += len * MIN + buf;
          }
          if (left <= 0) return chunks;
        }
      }
      return null;
    }

    function reasonsFor(t, chunks, pass) {
      const r = [];
      const dl = deadlineMs(t.deadline);
      if (dl !== Infinity) r.push("scade " + T.fmtDay(dl - 1, now).toLowerCase() + (T.hasTime(t.deadline) ? " alle " + T.fmtHM(dl) : ""));
      if (t.priority === 1) r.push("priorità alta");
      if (t.pref && pass.pref) r.push("preferisci " + { morning: "la mattina", afternoon: "il pomeriggio", evening: "la sera" }[t.pref]);
      else if (t.pref) r.push("al " + { morning: "mattino", afternoon: "pomeriggio", evening: "sera" }[t.pref] + " non c'era posto");
      if (t.notBefore) r.push("non prima del " + T.fmtDay(T.fromISO(t.notBefore), now, { short: true }));
      if (chunks.length > 1) r.push("divisa in " + chunks.length + " parti per lasciare pause");
      if (pass.tight) r.push("ho usato il margine per imprevisti per rispettare la scadenza");
      return r;
    }

    function placeAll(order) {
      let fr = free.map((x) => x.slice());
      const cap = Object.assign({}, capacity);
      const out = [], inf = {}, late = [], unscheduled = [], tightDays = new Set();
      for (const t of order) {
        const R = remaining[t.id];
        const notBefore = Math.max(nowC, t.notBefore ? T.fromISO(t.notBefore) : 0, t.snoozeUntil ? T.fromISO(t.snoozeUntil) : 0,
          hiddenToday(t) ? tomorrow : 0);
        const dl = deadlineMs(t.deadline);
        const split = t.splittable !== false;
        const passes = [];
        if (t.pref && PREF[t.pref]) passes.push({ pref: t.pref, limit: dl, cap: true });
        passes.push({ pref: null, limit: dl, cap: true });
        passes.push({ pref: null, limit: dl, cap: false, tight: true });
        // le routine restano nel loro giorno: se non c'è posto si saltano
        if (dl !== Infinity && !t.strictDay) {
          passes.push({ pref: null, limit: Infinity, cap: true, late: true });
          passes.push({ pref: null, limit: Infinity, cap: false, late: true, tight: true });
        }
        let chunks = null, pass = null;
        for (const p of passes) {
          chunks = tryPlace(fr, R, notBefore, p.limit, p.pref, split, p.cap ? cap : null);
          if (chunks) { pass = p; break; }
        }
        if (!chunks) { unscheduled.push(t.id); continue; }
        if (pass.late) late.push(t.id);
        chunks.forEach(([s, e], i) => {
          const dk = T.dateKey(s);
          cap[dk] = (cap[dk] || 0) - (e - s) / MIN;
          if (pass.tight) tightDays.add(dk);
          out.push({ kind: "task", id: t.id + "#" + i, taskId: t.id, title: t.title, start: s, end: e,
            part: chunks.length > 1 ? (i + 1) + "/" + chunks.length : null, priority: t.priority || 2,
            late: e > dl, suggested: true, source: t.source || "internal", routine: !!t.routineId, area: t.area || null });
          fr = subtract(fr, s, e + buf);
        });
        inf[t.id] = { start: chunks[0][0], end: chunks[chunks.length - 1][1], chunks: chunks.length, late: !!pass.late,
          reasons: reasonsFor(t, chunks, pass) };
      }
      return { out, inf, late, unscheduled, tightDays, score: late.length * 2 + unscheduled.length * 3 };
    }

    let boosted = new Set();
    let best = placeAll(ordered(boosted));
    for (let i = 0; i < 8; i++) {
      const tryIds = best.late.concat(best.unscheduled.filter((id) => byId[id].deadline && !byId[id].strictDay)).filter((id) => !boosted.has(id));
      if (!tryIds.length) break;
      const nb = new Set([...boosted, ...tryIds]);
      const r = placeAll(ordered(nb));
      if (r.score < best.score) { best = r; boosted = nb; } else break;
    }

    blocks.push(...best.out);
    Object.assign(info, best.inf);
    for (const dk of [...best.tightDays].sort()) {
      warnings.push({ type: "overloaded", day: dk,
        text: T.fmtDay(T.fromKey(dk), now) + " è molto piena: non resta margine per gli imprevisti" });
    }
    for (const id of best.late) {
      const t = byId[id];
      if (t.deadline && deadlineMs(t.deadline) <= now) continue; // già segnalata come scaduta
      warnings.push({ type: "late", taskId: id, text: "«" + t.title + "» non ci sta prima della scadenza" });
    }
    for (const id of best.unscheduled) {
      const t = byId[id];
      info[id] = { unscheduled: true };
      if (t.strictDay) {
        if (t.occ === todayKey) warnings.push({ type: "routine", taskId: id, text: "Oggi non c'è spazio per «" + t.title + "»" });
        continue;
      }
      warnings.push({ type: "unscheduled", taskId: id,
        text: "«" + t.title + "» non trova posto nei prossimi " + S.horizonDays + " giorni" +
          (t.splittable === false ? " (prova a renderla divisibile)" : "") });
    }

    blocks.sort((a, b) => a.start - b.start || (a.kind === "event" ? -1 : 1));
    return { generatedAt: now, horizonEnd, blocks, warnings, info };
  }

  G.scheduler = { plan, defaultSettings, mergeSettings, expandEvents, visibleEvents, deadlineMs, taskRemaining, subtract, PREF };
})(globalThis.G || (globalThis.G = {}));
