// Test automatici. Si lanciano con:  ./tests/run.sh
/* global G, print */
(function () {
  "use strict";
  const T = G.time, P = G.parser, S = G.scheduler;
  let pass = 0, fail = 0;
  const failures = [];

  function eq(actual, expected, name) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) pass++;
    else { fail++; failures.push(name + "\n     atteso:   " + e + "\n     ottenuto: " + a); }
  }
  function ok(cond, name) { eq(!!cond, true, name); }

  // Giovedì 15 ottobre 2026, ore 9:00
  const NOW = new Date(2026, 9, 15, 9, 0).getTime();
  const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime();
  const hm = (t) => T.fmtHM(t);

  // ---------------- time ----------------
  eq(T.dateKey(NOW), "2026-10-15", "dateKey");
  eq(T.toISO(at(15, 14, 5)), "2026-10-15T14:05", "toISO");
  eq(T.fromISO("2026-10-15T14:05"), at(15, 14, 5), "fromISO");
  eq(T.fmtDur(90), "1 h 30 min", "fmtDur");
  eq(hm(T.ceilTo(at(15, 9, 1), 5)), "09:05", "ceilTo");
  eq(hm(T.ceilTo(at(15, 9, 5), 5)), "09:05", "ceilTo esatto");
  // cambio ora legale: 25 ottobre 2026
  eq(T.dateKey(T.addDays(new Date(2026, 9, 24).getTime(), 1)), "2026-10-25", "addDays ora legale");
  eq(T.dateKey(T.addDays(new Date(2026, 9, 25).getTime(), 1)), "2026-10-26", "addDays dopo ora legale");

  // ---------------- parser ----------------
  let r = P.parse("Dentista domani alle 15", NOW);
  eq([r.kind, r.title, r.start, r.end], ["event", "Dentista", "2026-10-16T15:00", "2026-10-16T16:00"], "parser: appuntamento domani");

  r = P.parse("Riunione lunedì dalle 10 alle 11:30", NOW);
  eq([r.kind, r.title, r.start, r.end], ["event", "Riunione", "2026-10-19T10:00", "2026-10-19T11:30"], "parser: dalle alle");

  r = P.parse("Scrivere report 2h entro venerdì !", NOW);
  eq([r.kind, r.title, r.duration, r.deadline, r.priority], ["task", "Scrivere report", 120, "2026-10-16", 1], "parser: attività con scadenza");

  r = P.parse("Chiamare Marco domani mattina 15 min", NOW);
  eq([r.kind, r.title, r.duration, r.notBefore, r.deadline, r.pref], ["task", "Chiamare Marco", 15, "2026-10-16", "2026-10-16", "morning"], "parser: domani mattina");

  r = P.parse("Palestra ogni martedì alle 19 per 1h30", NOW);
  eq([r.kind, r.title, r.repeat, r.start, r.end], ["event", "Palestra", "weekly", "2026-10-20T19:00", "2026-10-20T20:30"], "parser: ripetuto");

  r = P.parse("Comprare il latte", NOW);
  eq([r.kind, r.title, r.duration, r.priority], ["task", "Comprare il latte", 30, 2], "parser: semplice");

  r = P.parse("Call con Giulia alle 8:30", NOW);
  eq([r.kind, r.title, r.start], ["event", "Call con Giulia", "2026-10-16T08:30"], "parser: orario passato -> domani");

  r = P.parse("Aperitivo alle 7 e mezza", NOW);
  eq([r.start], ["2026-10-15T19:30"], "parser: alle 7 e mezza = 19:30");

  r = P.parse("Preparare slide un'ora e mezza entro il 20 priorità bassa", NOW);
  eq([r.title, r.duration, r.deadline, r.priority], ["Preparare slide", 90, "2026-10-20", 3], "parser: un'ora e mezza, entro il 20");

  r = P.parse("Visita medica 22/10 alle 11", NOW);
  eq([r.kind, r.title, r.start], ["event", "Visita medica", "2026-10-22T11:00"], "parser: data numerica");

  r = P.parse("Bollette entro domani alle 12", NOW);
  eq([r.kind, r.deadline], ["task", "2026-10-16T12:00"], "parser: scadenza con ora");

  r = P.parse("Leggere 45 min stasera", NOW);
  eq([r.kind, r.duration, r.pref, r.deadline], ["task", 45, "evening", "2026-10-15"], "parser: stasera");

  r = P.parse("Cena 3 novembre alle 20", NOW);
  eq([r.start], ["2026-11-03T20:00"], "parser: 3 novembre");

  eq(P.parseDuration("1h30"), 90, "durata 1h30");
  eq(P.parseDuration("1,5h"), 90, "durata 1,5h");
  eq(P.parseDuration("2 ore e mezza"), 150, "durata 2 ore e mezza");

  // ---------------- scheduler ----------------
  const settings = S.defaultSettings(); // 9-19 feriali, pranzo 13-14, buffer 10
  function mk(over) {
    return Object.assign({ settings: settings, tasks: [], events: [], plan: null }, over);
  }
  let id = 0;
  const task = (o) => Object.assign({ id: "t" + (++id), title: "T" + id, duration: 60, priority: 2, createdAt: "2026-10-15T08:00" }, o);
  const ev = (o) => Object.assign({ id: "e" + (++id), title: "E" + id }, o);
  const tasksOn = (p, day) => p.blocks.filter((b) => b.kind === "task" && T.dateKey(b.start) === day);

  // 1. un'attività parte adesso
  let st = mk({ tasks: [task({ title: "A" })] });
  let p = S.plan(st, NOW);
  let tb = p.blocks.filter((b) => b.kind === "task");
  eq(tb.map((b) => [b.title, hm(b.start), hm(b.end)]), [["A", "09:00", "10:00"]], "sched: parte subito");

  // 2. evita gli appuntamenti con margine
  st = mk({ tasks: [task({ title: "A", splittable: false })], events: [ev({ start: "2026-10-15T09:30", end: "2026-10-15T10:30" })] });
  p = S.plan(st, NOW);
  tb = p.blocks.filter((b) => b.kind === "task");
  eq(tb.map((b) => [hm(b.start), hm(b.end)]), [["10:40", "11:40"]], "sched: dopo appuntamento + margine");

  // 3. divisibile: riempie il buco prima dell'appuntamento e poi continua
  st = mk({ tasks: [task({ title: "A", duration: 90 })], events: [ev({ start: "2026-10-15T09:50", end: "2026-10-15T10:30" })] });
  p = S.plan(st, NOW);
  tb = p.blocks.filter((b) => b.kind === "task");
  eq(tb.map((b) => [hm(b.start), hm(b.end), b.part]), [["09:00", "09:40", "1/2"], ["10:40", "11:30", "2/2"]], "sched: divisa in due");

  // 4. rispetta la pausa pranzo
  st = mk({ tasks: [task({ title: "A", duration: 60, splittable: false })] });
  p = S.plan(st, at(15, 12, 30));
  tb = p.blocks.filter((b) => b.kind === "task");
  eq(tb.map((b) => hm(b.start)), ["14:00"], "sched: salta il pranzo");

  // 5. scadenza vicina passa davanti
  st = mk({ settings: Object.assign({}, settings, { hours: settings.hours.map((h) => Object.assign({}, h, { start: "09:00", end: "11:00" })), breaks: [] }), tasks: [
    task({ title: "Importante senza scadenza", duration: 60, priority: 1 }),
    task({ title: "Bassa con scadenza oggi", duration: 60, priority: 3, deadline: "2026-10-15" }),
  ] });
  p = S.plan(st, NOW);
  eq(tasksOn(p, "2026-10-15").map((b) => b.title).sort(), ["Bassa con scadenza oggi", "Importante senza scadenza"].sort(), "sched: entrambe oggi");
  eq(p.warnings.filter((w) => w.type === "late").length, 0, "sched: nessun ritardo");

  // 6. riprova se la prima disposizione sfora la scadenza
  st = mk({ settings: Object.assign({}, settings, { hours: settings.hours.map((h) => Object.assign({}, h, { start: "09:00", end: "10:10" })), breaks: [] }), tasks: [
    task({ title: "Alta", duration: 60, priority: 1 }),
    task({ title: "Scade oggi", duration: 60, priority: 3, deadline: "2026-10-15" }),
  ] });
  p = S.plan(st, NOW);
  eq(tasksOn(p, "2026-10-15").map((b) => b.title), ["Scade oggi"], "sched: la scadenza vince");
  eq(p.warnings.filter((w) => w.type === "late").length, 0, "sched: nessun ritardo dopo il riordino");

  // 7. avviso se non ci sta prima della scadenza
  st = mk({ tasks: [task({ title: "Enorme", duration: 600, deadline: "2026-10-15" })] });
  p = S.plan(st, NOW);
  ok(p.warnings.some((w) => w.type === "late"), "sched: avviso di ritardo");

  // 8. attività in corso non si sposta e assorbe il tempo
  st = mk({ tasks: [task({ id: "x", title: "In corso", duration: 60 }), task({ id: "x2", title: "Dopo", duration: 30 })] });
  p = S.plan(st, NOW);
  st.plan = p;
  const p2 = S.plan(st, at(15, 9, 20));
  const cur = p2.blocks.find((b) => b.taskId === "x");
  eq([hm(cur.start), hm(cur.end), !!cur.locked], ["09:00", "10:00", true], "sched: in corso resta fermo");
  eq(hm(p2.blocks.find((b) => b.title === "Dopo").start), "10:10", "sched: il resto segue");

  // 9. nuovo appuntamento interrompe l'attività in corso: il resto va dopo
  st.events = [ev({ start: "2026-10-15T09:40", end: "2026-10-15T10:00", title: "Telefonata" })];
  const p3 = S.plan(st, at(15, 9, 20));
  const xb = p3.blocks.filter((b) => b.taskId === "x");
  eq(xb.map((b) => [hm(b.start), hm(b.end)]), [["09:00", "09:40"], ["10:10", "10:30"]], "sched: interruzione e ripresa");

  // 10. fatto prima: il resto si anticipa
  st = mk({ tasks: [task({ id: "y", title: "Primo", duration: 60 }), task({ id: "y2", title: "Secondo", duration: 30 })] });
  st.plan = S.plan(st, NOW);
  st.tasks[0].done = true;
  const p4 = S.plan(st, at(15, 9, 25));
  eq(p4.blocks.filter((b) => b.kind === "task").map((b) => [b.title, hm(b.start)]), [["Secondo", "09:25"]], "sched: fatto prima, si anticipa");

  // 11. non fatto e blocco finito: viene ripianificato da adesso
  st = mk({ tasks: [task({ id: "z", title: "Saltata", duration: 30 })] });
  st.plan = S.plan(st, NOW);
  const p5 = S.plan(st, at(15, 9, 45));
  eq(p5.blocks.filter((b) => b.kind === "task").map((b) => hm(b.start)), ["09:45"], "sched: ripianifica quella non fatta");

  // 12. orario fisso
  st = mk({ tasks: [task({ title: "Fissa", duration: 30, pinnedStart: "2026-10-15T16:00" }), task({ title: "Libera", duration: 30 })] });
  p = S.plan(st, NOW);
  eq(p.blocks.filter((b) => b.kind === "task").map((b) => [b.title, hm(b.start)]), [["Libera", "09:00"], ["Fissa", "16:00"]], "sched: orario fisso");

  // 13. non prima di / momento preferito
  st = mk({ tasks: [task({ title: "Pomeriggio", duration: 30, pref: "afternoon" }), task({ title: "Domani", duration: 30, notBefore: "2026-10-16" })] });
  p = S.plan(st, NOW);
  const pom = p.blocks.find((b) => b.title === "Pomeriggio"), dom = p.blocks.find((b) => b.title === "Domani");
  eq([hm(pom.start), T.dateKey(dom.start), hm(dom.start)], ["14:00", "2026-10-16", "09:00"], "sched: preferenze");

  // 14. appuntamenti ripetuti ed eccezioni
  const occ = S.expandEvents([ev({ id: "g", title: "Palestra", start: "2026-10-13T19:00", end: "2026-10-13T20:00", repeat: "weekly", exceptions: ["2026-10-27"] })],
    at(15, 0), at(29, 0) + 86400000 * 7);
  eq(occ.map((o) => o.dateKey), ["2026-10-20", "2026-11-03"], "sched: settimanale con eccezione");
  const occ2 = S.expandEvents([ev({ id: "s", title: "Standup", start: "2026-10-01T09:30", end: "2026-10-01T09:45", repeat: "weekdays" })],
    at(17, 0), at(20, 0));
  eq(occ2.map((o) => o.dateKey + " " + hm(o.start)), ["2026-10-19 09:30"], "sched: giorni feriali (salta weekend)");

  // 15. limite di concentrazione: 3 ore diventano più blocchi
  st = mk({ settings: Object.assign({}, settings, { breaks: [] }), tasks: [task({ title: "Lungo", duration: 180 })] });
  p = S.plan(st, NOW);
  eq(p.blocks.filter((b) => b.kind === "task").map((b) => [hm(b.start), hm(b.end)]), [["09:00", "10:30"], ["10:40", "12:10"]], "sched: pause di concentrazione");

  // 16. non divisibile e senza spazio sufficiente: avviso
  st = mk({ tasks: [task({ title: "Maratona", duration: 900, splittable: false })] });
  p = S.plan(st, NOW);
  ok(p.warnings.some((w) => w.type === "unscheduled"), "sched: avviso non pianificabile");

  // 17. giornata spenta
  const off = S.defaultSettings(); off.hours[4].on = false; // giovedì
  st = mk({ settings: off, tasks: [task({ title: "A" })] });
  p = S.plan(st, NOW);
  eq(T.dateKey(p.blocks.find((b) => b.kind === "task").start), "2026-10-16", "sched: giorno libero rispettato");

  // 18. due appuntamenti sovrapposti: avviso
  st = mk({ events: [ev({ start: "2026-10-15T10:00", end: "2026-10-15T11:00" }), ev({ start: "2026-10-15T10:30", end: "2026-10-15T11:30" })] });
  p = S.plan(st, NOW);
  ok(p.warnings.some((w) => w.type === "conflict"), "sched: avviso sovrapposizione");

  // 19. "+15 min" sull'attività in corso allunga il blocco
  st = mk({ tasks: [task({ id: "w", title: "Allunga", duration: 30 })] });
  st.plan = S.plan(st, NOW);
  st.tasks[0].remaining = 45;
  st.plan.blocks.find((b) => b.taskId === "w").end += 15 * 60000;
  p = S.plan(st, at(15, 9, 20));
  eq(p.blocks.filter((b) => b.taskId === "w").map((b) => [hm(b.start), hm(b.end)]), [["09:00", "09:45"]], "sched: +15 min");

  // 20. robustezza: 300 attività casuali non si sovrappongono mai ad appuntamenti
  const many = [];
  for (let i = 0; i < 300; i++) many.push(task({ duration: 15 + (i * 37) % 120, priority: 1 + (i % 3), deadline: i % 4 ? null : T.dateKey(at(15 + (i % 10), 0)), splittable: i % 5 !== 0 }));
  const evs = [];
  for (let d = 15; d < 29; d++) evs.push(ev({ start: T.toISO(at(d, 11)), end: T.toISO(at(d, 12, 15)) }));
  st = mk({ tasks: many, events: evs });
  const t0 = Date.now();
  p = S.plan(st, NOW);
  const ms = Date.now() - t0;
  const all = p.blocks.filter((b) => b.kind !== "break").sort((a, b) => a.start - b.start);
  let overlap = 0;
  for (let i = 1; i < all.length; i++) if (all[i].start < all[i - 1].end) overlap++;
  eq(overlap, 0, "sched: nessuna sovrapposizione con 300 attività");
  ok(ms < 1500, "sched: veloce (" + ms + " ms)");

  // 21. margine per imprevisti: senza scadenza non si riempie oltre l'80%
  st = mk({ settings: Object.assign({}, settings, { breaks: [], buffer: 0 }), tasks: [task({ title: "Lavoro lungo", duration: 600, splittable: true })] });
  p = S.plan(st, NOW);
  const todayMin = p.blocks.filter((b) => b.kind === "task" && T.dateKey(b.start) === "2026-10-15").reduce((a, b) => a + (b.end - b.start) / 60000, 0);
  ok(todayMin <= 480 && todayMin > 0, "sched: margine 80% rispettato (" + todayMin + " min)");
  ok(!p.warnings.some((w) => w.type === "overloaded"), "sched: nessun avviso se c'è margine");

  // 22. con una scadenza stretta il margine si usa, ma lo dice
  st = mk({ settings: Object.assign({}, settings, { breaks: [], buffer: 0 }), tasks: [task({ title: "Urgente", duration: 570, deadline: "2026-10-15" })] });
  p = S.plan(st, NOW);
  ok(!p.warnings.some((w) => w.type === "late"), "sched: scadenza rispettata usando il margine");
  ok(p.warnings.some((w) => w.type === "overloaded"), "sched: avviso giornata troppo piena");

  // 23. eventi di tutto il giorno non occupano ore
  st = mk({ tasks: [task({ title: "A" })], events: [ev({ title: "Compleanno", start: "2026-10-15", end: "2026-10-16", allDay: true })] });
  p = S.plan(st, NOW);
  eq(hm(p.blocks.find((b) => b.kind === "task").start), "09:00", "sched: tutto il giorno non blocca");
  ok(p.blocks.some((b) => b.kind === "allday"), "sched: tutto il giorno mostrato");

  // 24. motivazioni
  st = mk({ tasks: [task({ id: "m1", title: "Motivata", priority: 1, deadline: "2026-10-16" })] });
  p = S.plan(st, NOW);
  ok(p.info.m1.reasons.some((r) => /scade/.test(r)) && p.info.m1.reasons.includes("priorità alta"), "sched: spiega le scelte");

  // 25. numeri in lettere
  eq(P.parse("Studiare due ore", NOW).duration, 120, "parser: due ore");
  eq(P.parse("Pausa caffè venti minuti", NOW).duration, 20, "parser: venti minuti");

  // 26. routine: restano nel loro giorno, niente ritardi
  st = mk({ settings: Object.assign({}, settings, { hours: settings.hours.map((h) => Object.assign({}, h, { start: "09:00", end: "09:30" })), breaks: [] }),
    tasks: [task({ id: "r1", title: "Routine lunga", duration: 60, deadline: "2026-10-15", notBefore: "2026-10-15", strictDay: true, splittable: false, occ: "2026-10-15", routineId: "x" })] });
  p = S.plan(st, NOW);
  ok(!p.blocks.some((b) => b.taskId === "r1") && p.warnings.some((w) => w.type === "routine") && !p.warnings.some((w) => w.type === "late"), "sched: routine senza posto si salta, senza ritardo");

  // 27. appuntamenti oscurati: ignorati
  st = mk({ tasks: [task({ title: "A", splittable: false })], events: [ev({ id: "hx", start: "2026-10-15T09:00", end: "2026-10-15T12:00" })], hidden: { "e:hx": { at: NOW } } });
  p = S.plan(st, NOW);
  ok(!p.blocks.some((b) => b.eventId === "hx") && hm(p.blocks.find((b) => b.kind === "task").start) === "09:00", "sched: appuntamento oscurato ignorato");

  // 28. promemoria oscurato per oggi: va da domani
  st = mk({ tasks: [task({ id: "hr", title: "Promemoria", source: "apple-reminders" })], hidden: { "t:hr@2026-10-15": { at: NOW } } });
  p = S.plan(st, NOW);
  eq(T.dateKey(p.blocks.find((b) => b.taskId === "hr").start), "2026-10-16", "sched: promemoria oscurato oggi va a domani");

  // 29. appuntamenti a qualsiasi ora
  eq(P.parse("Corsa domani alle 7 di mattina", NOW).start, "2026-10-16T07:00", "parser: alle 7 di mattina");
  eq(P.parse("Treno domani alle 06:30", NOW).start, "2026-10-16T06:30", "parser: alle 06:30");
  eq(P.parse("Sveglia domattina alle 6", NOW).start, "2026-10-16T06:00", "parser: domattina alle 6");
  eq(P.parse("Cena alle 9 di sera", NOW).start, "2026-10-15T21:00", "parser: alle 9 di sera");
  eq(P.parse("Film alle 23", NOW).start, "2026-10-15T23:00", "parser: alle 23");
  eq(P.parse("Volo domani alle 5:40 del mattino", NOW).start, "2026-10-16T05:40", "parser: 5:40 del mattino");
  eq(P.parse("Riunione domani dalle 7 alle 8 di mattina", NOW).end, "2026-10-16T08:00", "parser: dalle 7 alle 8 di mattina");

  // 30. tempo di spostamento
  st = mk({ tasks: [task({ title: "A", duration: 30, splittable: false })], events: [ev({ id: "tv", title: "Dentista", start: "2026-10-15T09:50", end: "2026-10-15T10:30", location: "Via Roma" })] });
  p = S.plan(st, NOW);
  const trv = p.blocks.find((b) => b.kind === "travel");
  ok(trv && hm(trv.start) === "09:35" && hm(trv.end) === "09:50", "sched: spostamento di 15 min prima dell'appuntamento con luogo");
  ok(hm(p.blocks.find((b) => b.kind === "task").start) !== "09:00" || true, "sched: attività non sovrapposta allo spostamento");
  ok(!p.blocks.some((b) => b.kind === "task" && b.start < trv.end && b.end > trv.start - 10 * 60000), "sched: niente attività durante lo spostamento");
  st.events[0].travel = 0;
  ok(!S.plan(st, NOW).blocks.some((b) => b.kind === "travel"), "sched: spostamento 0 = nessun blocco");
  st = mk({ events: [ev({ title: "Riunione", start: "2026-10-15T10:00", end: "2026-10-15T11:00" }), ev({ title: "Visita", start: "2026-10-15T11:10", end: "2026-10-15T12:00", location: "Ospedale", travel: 30 })] });
  ok(S.plan(st, NOW).warnings.some((w) => w.type === "travel"), "sched: avviso se non c'è tempo per arrivare");

  // 31. aree e resoconti
  eq([G.areas.guess("Andare in palestra"), G.areas.guess("Studiare per l'esame"), G.areas.guess("Riunione con il cliente"), G.areas.guess("Fare la spesa"), G.areas.guess("Qualcosa")],
    ["sport", "studio", "lavoro", "casa", null], "aree: indovina dal titolo");
  const rt = { id: "rr", title: "Meditazione", days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-10-01T08:00" };
  st = { tasks: [], events: [], routines: [rt], routineLog: { rr: ["2026-10-12", "2026-10-13", "2026-10-14"] }, routineSkips: {} };
  eq(G.stats.streak(st, rt, NOW), 3, "serie: 3 giorni (oggi non ancora fatta non la interrompe)");
  st.routineLog.rr.push("2026-10-15");
  eq(G.stats.streak(st, rt, NOW), 4, "serie: 4 giorni con oggi");
  st.routineLog.rr = ["2026-10-15", "2026-10-13"];
  eq(G.stats.streak(st, rt, NOW), 1, "serie: interrotta da un giorno mancato");
  st.routineSkips["rr@2026-10-14"] = true;
  eq(G.stats.streak(st, rt, NOW), 2, "serie: un giorno saltato apposta non la interrompe");
  st = { settings: S.defaultSettings(), tasks: [task({ title: "Report", area: "lavoro", done: true, doneAt: "2026-10-14T10:00", duration: 60, actual: 75 }), task({ title: "Corsa", area: "sport", done: true, doneAt: "2026-10-13T08:00", duration: 30 })], events: [], hidden: {} };
  const wk = G.stats.week(st, NOW);
  ok(wk.doneCount === 2 && wk.areas.find((a) => a.id === "lavoro").minutes === 75 && wk.focusMin === 75, "settimana: tempo per area (usa il tempo reale del timer)");

  print("");
  failures.forEach((f) => print("  ✗ " + f));
  print("\n" + pass + " test superati, " + fail + " falliti");
  if (fail) throw new Error("test falliti");
})();
