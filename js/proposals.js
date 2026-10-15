// Livello applicativo delle PROPOSTE.
// Nessuna modifica proposta dall'assistente tocca i dati
// finché l'utente non conferma QUELLA proposta. Il percorso è sempre:
//   crea -> valida -> anteprima -> conferma (legata all'impronta) -> ricontrollo
//   concorrenza -> esecuzione -> verifica del risultato.
// Non esistono operazioni di eliminazione.
(function (G) {
  "use strict";
  const T = G.time, S = G.scheduler;
  const MIN = T.MIN;

  const TASK_FIELDS = ["title", "duration", "remaining", "priority", "deadline", "notBefore", "pref", "splittable",
    "pinnedStart", "notes", "snoozeUntil", "done", "doneAt", "area", "subtasks", "spent", "actual", "recurrence", "list", "onDay", "noAuto", "appleDue"];
  const EVENT_FIELDS = ["title", "start", "end", "location", "notes", "repeat", "until", "allDay", "area", "travel"];
  const OP_TYPES = ["create_task", "update_task", "complete_task", "create_event", "update_event"];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isApple = (src) => src === "apple-calendar" || src === "apple-reminders";
  // Campi che esistono davvero in Apple. Gli altri (orario suggerito, momento preferito,
  // durata stimata...) sono dati interni di Daily Schedule anche per gli elementi Apple.
  const APPLE_FIELDS = {
    "apple-calendar": ["title", "start", "end", "location", "notes", "allDay"],
    "apple-reminders": ["title", "deadline", "notes", "priority", "done"],
  };
  const same = (a, b) => (a == null || a === "" ? null : JSON.stringify(a)) === (b == null || b === "" ? null : JSON.stringify(b));
  function changedKeys(o) {
    const a = o.after || {}, b = o.before || {};
    return Object.keys(a).filter((k) => !same(a[k], b[k]));
  }
  // Questa operazione scrive davvero su Apple Calendar / Promemoria?
  function touchesApple(o) {
    if (!isApple(o.source)) return false;
    if (o.type.startsWith("create") || o.type === "complete_task") return true;
    return changedKeys(o).some((k) => APPLE_FIELDS[o.source].includes(k));
  }

  // Impronta stabile delle operazioni (FNV-1a): se la proposta cambia, cambia l'impronta
  function fingerprint(ops) {
    const str = JSON.stringify(ops);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0") + "-" + str.length.toString(36);
  }

  function findTarget(state, op) {
    if (op.type === "update_task" || op.type === "complete_task") return state.tasks.find((t) => t.id === op.targetId);
    if (op.type === "update_event") return state.events.find((e) => e.id === op.targetId);
    return null;
  }

  // Prepara un'operazione: per le modifiche salva lo stato "prima" dell'elemento
  function op(state, type, data) {
    const o = Object.assign({ type }, data);
    if (type === "create_task") o.after = Object.assign({ id: G.store.uid(), source: "internal", priority: 2, splittable: true }, o.after);
    if (type === "create_event") o.after = Object.assign({ id: G.store.uid(), source: "internal", repeat: "none", exceptions: [] }, o.after);
    const target = findTarget(state, o);
    if (target) { o.before = clone(target); o.source = target.source || "internal"; }
    else o.source = (o.after && o.after.source) || "internal";
    return o;
  }

  function create(state, ops, meta, now) {
    const p = Object.assign({
      id: G.store.uid(), createdAt: now, status: "pending",
      summary: "", reason: "", ops: ops,
    }, meta || {});
    p.fingerprint = fingerprint(p.ops);
    return p;
  }

  function validIso(s, needTime) {
    if (s == null || s === "") return !needTime;
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s)) return false;
    if (needTime && !T.hasTime(s)) return false;
    return !isNaN(T.fromISO(s));
  }

  function validateFields(f, kind) {
    const errs = [];
    const allowed = kind === "task" ? TASK_FIELDS.concat(["id", "source", "createdAt", "externalId", "externalModified"])
      : EVENT_FIELDS.concat(["id", "source", "createdAt", "exceptions", "externalId", "externalModified", "calendar"]);
    for (const k of Object.keys(f)) if (!allowed.includes(k)) errs.push("campo non permesso: " + k);
    if ("title" in f && (!f.title || String(f.title).trim().length === 0 || String(f.title).length > 200)) errs.push("titolo non valido");
    if (kind === "task") {
      for (const k of ["duration", "remaining"]) if (k in f && !(f[k] >= 5 && f[k] <= 1440)) errs.push("durata non valida");
      if ("priority" in f && ![1, 2, 3].includes(f.priority)) errs.push("priorità non valida");
      for (const k of ["deadline", "notBefore", "snoozeUntil", "pinnedStart"]) if (k in f && !validIso(f[k], k === "pinnedStart" && f[k])) errs.push(k + " non valida");
    } else {
      for (const k of ["start", "end"]) if (k in f && !validIso(f[k], !f.allDay)) errs.push("orario non valido");
    }
    return errs;
  }

  function validate(p, state) {
    const errs = [];
    if (!p || !Array.isArray(p.ops) || !p.ops.length) return ["proposta vuota"];
    for (const o of p.ops) {
      if (!OP_TYPES.includes(o.type)) { errs.push("operazione non permessa: " + o.type); continue; }
      const kind = o.type.endsWith("task") ? "task" : "event";
      if (o.type.startsWith("create")) {
        if (!o.after || !o.after.title) errs.push("manca il titolo");
        else errs.push(...validateFields(o.after, kind));
        if (kind === "task" && !(o.after.duration >= 5)) errs.push("manca la durata");
        if (kind === "event" && !(T.fromISO(o.after.end) > T.fromISO(o.after.start))) errs.push("l'appuntamento finisce prima di iniziare");
      } else {
        const target = findTarget(state, o);
        if (!target) { errs.push("elemento non trovato (forse è stato eliminato)"); continue; }
        if (o.after) errs.push(...validateFields(o.after, kind));
        if (kind === "event") {
          const merged = Object.assign({}, target, o.after);
          if (!(T.fromISO(merged.end) > T.fromISO(merged.start))) errs.push("l'appuntamento finisce prima di iniziare");
        }
      }
    }
    return errs;
  }

  // Ricontrollo: gli elementi da modificare sono ancora come quando è stata fatta la proposta?
  function concurrencyCheck(p, state) {
    const problems = [];
    for (const o of p.ops) {
      if (!o.before) continue;
      const cur = findTarget(state, o);
      if (!cur) { problems.push("«" + o.before.title + "» non esiste più"); continue; }
      if (JSON.stringify(cur) !== JSON.stringify(o.before)) problems.push("«" + o.before.title + "» è stato modificato nel frattempo");
    }
    return problems;
  }

  function applyOps(state, ops, now) {
    for (const o of ops) {
      if (o.type === "create_task") {
        const t = Object.assign({ createdAt: T.toISO(now), done: false }, clone(o.after));
        if (t.remaining == null) t.remaining = t.duration;
        state.tasks.push(t);
      } else if (o.type === "create_event") {
        state.events.push(Object.assign({ createdAt: T.toISO(now) }, clone(o.after)));
      } else if (o.type === "complete_task") {
        const t = findTarget(state, o);
        Object.assign(t, { done: true, doneAt: T.toISO(now), pinnedStart: null });
      } else {
        const target = findTarget(state, o);
        Object.assign(target, clone(o.after));
        if (o.type === "update_task" && o.after.duration != null && o.after.remaining == null) target.remaining = o.after.duration;
      }
    }
  }

  // Dopo l'esecuzione: ogni operazione ha davvero prodotto il risultato atteso?
  function verify(state, ops) {
    const failed = [];
    for (const o of ops) {
      let item;
      if (o.type.startsWith("create")) item = (o.type === "create_task" ? state.tasks : state.events).find((x) => x.id === o.after.id);
      else item = findTarget(state, o);
      if (!item) { failed.push(o); continue; }
      if (o.type === "complete_task" && !item.done) failed.push(o);
      const expected = o.after || {};
      for (const k of Object.keys(expected)) {
        if (k === "exceptions" || k === "createdAt") continue;
        if (JSON.stringify(item[k]) !== JSON.stringify(expected[k])) { failed.push(o); break; }
      }
    }
    return failed;
  }

  // ---------- anteprima: cosa cambia nel programma ----------
  function blockGroups(plan) {
    const g = {};
    for (const b of plan.blocks) {
      if (b.kind !== "task" && b.kind !== "event") continue;
      const key = b.kind === "task" ? "t:" + b.taskId : "e:" + b.id;
      if (!g[key]) g[key] = { key, kind: b.kind, title: b.title, source: b.source || "internal", start: b.start, end: b.end, minutes: 0, suggested: !!b.suggested };
      g[key].start = Math.min(g[key].start, b.start);
      g[key].end = Math.max(g[key].end, b.end);
      g[key].minutes += (b.end - b.start) / MIN;
    }
    return g;
  }

  function preview(p, state, now) {
    const before = S.plan(state, now);
    const st2 = clone(state);
    st2.plan = state.plan;
    applyOps(st2, p.ops, now);
    const after = S.plan(st2, now);
    const gb = blockGroups(before), ga = blockGroups(after);
    const direct = new Set();
    for (const o of p.ops) {
      const id = o.targetId || (o.after && o.after.id);
      if (o.type.endsWith("task")) direct.add("t:" + id);
      else for (const k of Object.keys(Object.assign({}, gb, ga))) if (k === "e:" + id || k.startsWith("e:" + id + "@")) direct.add(k);
    }
    const changes = [], unchanged = [];
    const days = new Set();
    for (const key of new Set([...Object.keys(gb), ...Object.keys(ga)])) {
      const b = gb[key], a = ga[key];
      const item = { key, title: (a || b).title, kind: (a || b).kind, source: (a || b).source, direct: direct.has(key),
        before: b ? { start: b.start, end: b.end } : null, after: a ? { start: a.start, end: a.end } : null };
      if (b && a && b.start === a.start && b.end === a.end && b.title === a.title) { unchanged.push(item); continue; }
      item.type = !b ? "added" : !a ? "removed" : "moved";
      if (item.type === "removed" && key.startsWith("t:")) {
        const t = st2.tasks.find((x) => "t:" + x.id === key);
        if (t && t.done) item.type = "completed";
      }
      changes.push(item);
      if (b) days.add(T.dateKey(b.start));
      if (a) days.add(T.dateKey(a.start));
    }
    // Operazioni che non cambiano gli orari (es. note, priorità) vanno comunque mostrate
    for (const o of p.ops) {
      const id = o.targetId || (o.after && o.after.id);
      const key = (o.type.endsWith("task") ? "t:" : "e:") + id;
      if (!changes.some((c) => c.key === key || c.key.startsWith(key + "@"))) {
        const title = (o.after && o.after.title) || (o.before && o.before.title);
        changes.push({ key, title, kind: o.type.endsWith("task") ? "task" : "event", source: o.source, direct: true, type: "edited",
          before: null, after: null, unplaced: o.type === "create_task" && !(after.info[id] && after.info[id].start) });
      }
    }
    changes.sort((x, y) => (Number(y.direct) - Number(x.direct)) || ((x.after || x.before || { start: 0 }).start - (y.after || y.before || { start: 0 }).start));
    const relevantUnchanged = unchanged.filter((u) => days.has(T.dateKey(u.before.start)))
      .sort((x, y) => x.before.start - y.before.start);
    const wb = new Set(before.warnings.map((w) => w.text));
    const wa = new Set(after.warnings.map((w) => w.text));
    return {
      changes,
      unchanged: relevantUnchanged,
      newWarnings: after.warnings.filter((w) => !wb.has(w.text)),
      resolvedWarnings: before.warnings.filter((w) => !wa.has(w.text)),
      appleOps: p.ops.filter(touchesApple),
      afterPlan: after,
    };
  }

  // ---------- esecuzione ----------
  // confirmation = { proposalId, fingerprint } creata SOLO dal pulsante "Conferma"
  // ctx = { mode: "demo" | "real", appleBridge: oggetto o null }
  function apply(p, state, confirmation, now, ctx) {
    ctx = ctx || {};
    const fail = (error) => ({ ok: false, error });
    if (!p || p.status !== "pending") return fail("Questa proposta non è più valida.");
    if (!confirmation || confirmation.proposalId !== p.id) return fail("Manca la conferma per questa proposta.");
    const fp = fingerprint(p.ops);
    if (fp !== p.fingerprint || confirmation.fingerprint !== fp) return fail("La proposta è cambiata dopo la conferma: serve una nuova conferma.");
    const errs = validate(p, state);
    if (errs.length) return fail("Proposta non valida: " + errs.join("; "));
    const conflicts = concurrencyCheck(p, state);
    if (conflicts.length) return fail("Mi fermo: " + conflicts.join("; ") + ". Controlla e chiedimi una nuova proposta.");
    const apple = p.ops.filter(touchesApple);
    if (apple.length && ctx.mode !== "demo" && !ctx.appleBridge) {
      return fail("Per ora Daily Schedule legge soltanto Calendario e Promemoria: questa modifica va fatta dall'app Apple. Nessuna modifica eseguita.");
    }
    const next = clone(state);
    applyOps(next, p.ops, now);
    const failed = verify(next, p.ops);
    if (failed.length) return fail("Verifica non riuscita su " + failed.length + " operazioni: nessuna modifica salvata.");
    return { ok: true, state: next, simulatedApple: apple.length > 0 && ctx.mode === "demo" };
  }

  // Descrizione leggibile di un'operazione
  function describe(o) {
    const a = o.after || {}, b = o.before || {};
    const where = !touchesApple(o) ? "" : o.source === "apple-calendar" ? " in Apple Calendar" : o.source === "apple-reminders" ? " in Apple Promemoria" : "";
    switch (o.type) {
      case "create_task": return (o.source === "apple-reminders" ? "Nuovo promemoria" : "Nuova attività") + where + ": «" + a.title + "» (" + T.fmtDur(a.duration) + ")";
      case "create_event": return "Nuovo appuntamento" + where + ": «" + a.title + "» " + T.fmtDay(T.fromISO(a.start), Date.now()).toLowerCase() + " " + T.fmtHM(T.fromISO(a.start)) + "–" + T.fmtHM(T.fromISO(a.end));
      case "complete_task": return "Segna come fatta: «" + b.title + "»" + where;
      case "update_task":
      case "update_event": {
        const parts = [...new Set(changedKeys(o).map((k) => FIELD_LBL[k] || k))];
        return "Modifica" + where + " «" + b.title + "»: " + (parts.length ? parts.join(", ") : "nessun cambiamento");
      }
    }
    return o.type;
  }
  const FIELD_LBL = { title: "titolo", duration: "durata", remaining: "durata", priority: "priorità", deadline: "scadenza",
    notBefore: "giorno", pref: "momento della giornata", splittable: "divisibile", pinnedStart: "orario fisso", notes: "note",
    snoozeUntil: "rimandata", area: "area", subtasks: "passi", travel: "tempo di spostamento", start: "orario", end: "orario", location: "luogo", repeat: "ripetizione", until: "fine ripetizione" };

  G.proposals = { op, create, fingerprint, validate, preview, apply, concurrencyCheck, describe, isApple, touchesApple, changedKeys, OP_TYPES };
})(globalThis.G || (globalThis.G = {}));
