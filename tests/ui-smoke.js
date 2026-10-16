// Prova dell'interfaccia senza browser: simula la pagina, i tocchi e i moduli.
/* global G, print, load, drainMicrotasks */
(function () {
  "use strict";
  let pass = 0, fail = 0;
  const failures = [];
  function ok(cond, name, extra) { if (cond) pass++; else { fail++; failures.push(name + (extra ? "\n     " + extra : "")); } }

  // --- finto browser ---
  const els = {};
  function mkEl(id) {
    return { id, innerHTML: "", textContent: "", hidden: false, value: "", style: {}, dataset: {},
      classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, focus() {},
      querySelector: () => null, querySelectorAll: () => [], closest: () => null, appendChild() {}, remove() {}, click() {} };
  }
  const handlers = {};
  const store = {};
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.document = {
    querySelector: (sel) => els[sel] || (els[sel] = mkEl(sel)),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { handlers[type] = fn; },
    createElement: () => mkEl("a"), body: { appendChild() {}, scrollHeight: 0 }, activeElement: null, hidden: false,
  };
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  globalThis.location = { search: "?now=2026-10-15T09:20", protocol: "file:" };
  globalThis.URLSearchParams = function (s) {
    const m = {};
    s.replace(/^\?/, "").split("&").forEach((p) => { const [k, v] = p.split("="); if (k) m[k] = decodeURIComponent(v || ""); });
    this.get = (k) => (k in m ? m[k] : null);
  };
  globalThis.navigator = {};
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.confirm = () => true;
  globalThis.alert = () => {};
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
  globalThis.scrollTo = () => {};
  globalThis.FormData = function (form) { this.get = (k) => (k in form._data ? form._data[k] : null); };

  function click(data) {
    const target = { dataset: data, id: "", disabled: !!data.__disabled, parentElement: { querySelectorAll: () => [] },
      closest(sel) {
        if (sel === "[data-tab]") return data.tab ? this : null;
        if (sel === "[data-act]") return data.act ? this : null;
        if (sel === "[data-open]") return data.open ? this : null;
        return null;
      } };
    handlers.click({ target, stopPropagation() {} });
  }
  function say(text) { document.querySelector("#quick-input").value = text; handlers.submit({ preventDefault() {}, target: { id: "quick-form" } }); }
  function submit(id, dataset, data) { handlers.submit({ preventDefault() {}, target: { id, dataset, _data: data } }); }
  const view = () => els["#view"].innerHTML;
  const modal = () => els["#modal"].innerHTML;
  function safe(name, fn) { try { fn(); } catch (e) { print("ERRORE in " + name + ": " + e.message + "\n" + e.stack); ok(false, name + ": errore " + e.message, e.stack); } }
  function clean(name) {
    const v = view();
    const bad = v.match(/.{0,50}(undefined|NaN|\[object Object\]).{0,50}/);
    ok(v.length > 80 && !bad, name + " senza errori", bad && bad[0]);
  }
  const lastPending = () => [...app.state.proposals].reverse().find((p) => p.status === "pending");

  load("js/app.js");
  const app = G.app;

  // 1. Primo avvio
  ok(/Benvenuto in Daily Schedule/.test(view()), "schermata di benvenuto");
  ok(els["#quick"].hidden === true, "barra nascosta al benvenuto");

  // 2. Demo: dati separati ed etichettati
  safe("apri demo", () => click({ act: "start-demo" }));
  ok(app.mode === "demo" && els["#demo-banner"].hidden === false && /DATI DIMOSTRATIVI/.test(els["#demo-banner"].innerHTML), "demo etichettata");
  ok(!store["dailyschedule.real"] || JSON.parse(store["dailyschedule.real"]).tasks.length === 0, "dati demo separati da quelli reali");
  click({ tab: "oggi" });
  ok(/Buongiorno, Elia/.test(view()) && /appuntamenti/.test(view()) && /suggerito/.test(view()) && /Calendario demo/.test(view()), "dashboard: saluto, riepilogo, suggeriti, Apple");
  ok(/Priorità/.test(view()) && /Completate oggi/.test(view()) && /liberi/.test(view()), "dashboard: priorità, completate, tempo libero");
  clean("Oggi");

  // 3. Tutte le schermate
  for (const tab of ["assistente", "calendario", "attivita", "impostazioni"]) { safe("scheda " + tab, () => click({ tab })); clean("scheda " + tab); }
  click({ tab: "calendario" });
  for (const v of ["week", "month", "day"]) { safe("calendario " + v, () => click({ act: "cal-view", v })); clean("calendario " + v); }
  safe("navigazione", () => { click({ act: "cal-nav", d: "1" }); click({ act: "cal-nav", d: "-1" }); click({ act: "cal-today" }); });
  ok(/Riunione di team/.test(view()) && /Meditazione/.test(view()), "calendario giorno: eventi e routine");
  click({ tab: "attivita" });
  for (const f of ["today", "late", "high", "nodate", "apple", "all"]) { safe("filtro " + f, () => click({ act: "filter", v: f })); clean("filtro " + f); }
  click({ act: "list-tab", v: "events" }); clean("elenco appuntamenti");
  click({ act: "list-tab", v: "tasks" });

  // 4. Aggiunta istantanea (cose nuove di Daily Schedule: subito, con Annulla e Modifica)
  click({ tab: "oggi" });
  const nTasks = app.state.tasks.length;
  safe("richiesta", () => say("Domani devo studiare due ore, andare in palestra e fare la spesa"));
  ok(app.ui.tab === "oggi", "l'aggiunta non cambia schermata");
  ok(app.state.tasks.length === nTasks + 2, "attività aggiunte subito (senza doppioni)", app.state.tasks.length - nTasks);
  ok(document.querySelector("#toast").hidden !== false || !/Aggiunt/.test(document.querySelector("#toast").innerHTML), "nessun messaggio in mezzo allo schermo");
  safe("una sola", () => say("Dentista venerdì alle 17"));
  ok(app.state.events.some((e) => e.title === "Dentista" && e.start.endsWith("T17:00")), "appuntamento aggiunto subito");
  click({ tab: "assistente" });
  safe("aggiunta da assistente", () => say("Leggere il giornale 20 min"));
  ok(/Fatto ✓ Ho aggiunto/.test(view()) && app.state.tasks.some((t) => t.title === "Leggere il giornale"), "dall'assistente: aggiunto e spiegato");
  ok(!app.state.proposals.some((p) => p.status === "pending"), "nessuna conferma per le aggiunte interne");
  // le modifiche continuano a passare dall'anteprima con conferma
  safe("modifica con conferma", () => say("Sposta lo studio al pomeriggio"));
  let p = lastPending();
  ok(p && /Conferma modifiche/.test(view()) && /Modifica proposta/.test(view()) && /Cosa cambia/.test(view()), "le modifiche hanno anteprima e conferma");
  clean("assistente con proposta");
  safe("conferma", () => click({ act: "confirm-proposal", pid: p.id }));
  ok(app.state.proposals.find((x) => x.id === p.id).status === "applied" && app.state.tasks.find((t) => t.id === "d-t2").pref === "afternoon", "proposta applicata");
  ok(/Fatto ✓/.test(view()) && /verificato/.test(view()), "esito comunicato dopo la verifica");

  // 4b. Pulsante + e foglio "Aggiungi" (la barra di testo resta solo nella chat)
  click({ tab: "oggi" });
  ok(els["#quick"].hidden === true && els["#fab"].hidden === false, "in Oggi: niente barra, c'è il pulsante +");
  click({ tab: "assistente" });
  ok(els["#quick"].hidden === false && els["#fab"].hidden === true, "nella chat: barra di testo, niente +");
  click({ tab: "calendario" });
  safe("apri +", () => click({ act: "add-sheet" }));
  ok(/qa-form/.test(modal()) && /Quando/.test(modal()) && /Ora/.test(modal()) && /Durata/.test(modal()) && /Più dettagli/.test(modal()), "foglio Aggiungi veloce");
  document.querySelector("#qa-input").value = "Parrucchiere domani alle 9";
  safe("aggiungi dal foglio", () => handlers.submit({ preventDefault() {}, target: { id: "qa-form" } }));
  ok(app.state.events.some((e) => e.title === "Parrucchiere" && e.start.endsWith("T09:00")) && app.ui.tab === "calendario", "aggiunto dal foglio, senza cambiare schermata");
  // a tocchi: cosa + domani + ora + durata
  const tmwKey = G.time.dateKey(G.time.addDays(G.time.startOfDay(app.now()), 1));
  safe("veloce a tocchi", () => {
    click({ act: "add-sheet" });
    document.querySelector("#qa-input").value = "Palestra serale";
    handlers.input({ target: { id: "qa-input" } });
    click({ act: "qa-day", v: tmwKey });
    handlers.change({ target: { dataset: { set: "qa-time" }, value: "18:00" } });
    click({ act: "qa-dur", v: "90" });
    handlers.submit({ preventDefault() {}, target: { id: "qa-form" } });
  });
  ok(app.state.events.some((e) => e.title === "Palestra serale" && e.start === tmwKey + "T18:00" && e.end === tmwKey + "T19:30"), "appuntamento in 4 tocchi: domani 18:00–19:30");
  safe("anteprima orario scelto", () => {
    click({ act: "add-sheet" });
    document.querySelector("#qa-input").value = "Sistemare la scrivania";
    handlers.input({ target: { id: "qa-input" } });
  });
  ok(/la metto (oggi|domani|[a-zì]+ \d+ [a-z]+) alle \d\d:\d\d/.test(document.querySelector("#qa-preview").innerHTML), "prima di aggiungere mostra quando la mette", document.querySelector("#qa-preview").innerHTML);
  click({ act: "close" });
  safe("veloce senza ora", () => {
    click({ act: "add-sheet" });
    document.querySelector("#qa-input").value = "Comprare il pane";
    click({ act: "qa-day", v: tmwKey });
    handlers.submit({ preventDefault() {}, target: { id: "qa-form" } });
  });
  const pane = app.state.tasks.find((t) => t.title === "Comprare il pane");
  ok(pane && pane.notBefore === tmwKey && !app.state.events.some((e) => e.title === "Comprare il pane"), "senza ora: attività per domani, la sistemo io");
  safe("più dettagli", () => { click({ act: "add-sheet" }); document.querySelector("#qa-input").value = "Riunione alle 11"; click({ act: "qa-more" }); });
  ok(/event-form/.test(modal()) && /Riunione/.test(modal()), "«Più dettagli» apre il modulo completo già compilato");
  click({ act: "close" });

  // 5. Modifica proposta = nuova proposta e nuova conferma
  safe("riunione spostata", () => say("La riunione è stata spostata di un'ora"));
  p = lastPending();
  ok(p && p.ops[0].type === "update_event", "proposta di spostamento evento");
  ok(/dato Apple|demo/.test(view()), "proposta segnala dato Apple");
  safe("modifica proposta", () => click({ act: "edit-proposal", pid: p.id }));
  ok(/event-form/.test(modal()) && /Aggiorna proposta/.test(modal()), "modulo di modifica della proposta");
  safe("salva modifica proposta", () => submit("event-form", { id: "d-e1", occ: "", mode: "proposal", pid: p.id, i: "0" },
    { title: "Riunione di team", date: "2026-10-15", start: "11:30", end: "12:30", location: "Sala B", notes: "" }));
  const p2 = lastPending();
  ok(p2 && p2.id !== p.id && app.state.proposals.find((x) => x.id === p.id).status === "superseded", "la proposta modificata ne crea una nuova");
  ok(p2 && p2.fingerprint !== p.fingerprint, "nuova impronta");
  ok(app.state.events.find((e) => e.id === "d-e1").start === "2026-10-15T10:00", "evento invariato prima della conferma");
  safe("conferma 2", () => click({ act: "confirm-proposal", pid: p2.id }));
  const ev = app.state.events.find((e) => e.id === "d-e1");
  ok(ev.start === "2026-10-15T11:30" && ev.end === "2026-10-15T12:30", "evento aggiornato dopo la conferma");
  ok(/nessun dato reale/.test(view()), "in demo dichiara che è simulato");

  // 6. Annulla
  safe("sposta studio", () => say("Sposta lo studio alla mattina"));
  p = lastPending();
  const prefBefore = app.state.tasks.find((t) => t.id === "d-t2").pref;
  safe("annulla", () => click({ act: "cancel-proposal", pid: p.id }));
  ok(app.state.tasks.find((t) => t.id === "d-t2").pref === prefBefore && /annullato/.test(view()), "annullata senza modifiche");

  // 7. Concorrenza: l'elemento cambia prima della conferma
  safe("completa", () => say("Ho completato la presentazione"));
  p = lastPending();
  app.state.tasks.find((t) => t.id === "d-t1").notes = "cambiata altrove";
  click({ tab: "assistente" });
  ok(/è stato modificato nel frattempo/.test(view()) && /disabled/.test(view()), "conferma bloccata se i dati sono cambiati");
  safe("conferma forzata", () => click({ act: "confirm-proposal", pid: p.id }));
  ok(!app.state.tasks.find((t) => t.id === "d-t1").done && app.state.proposals.find((x) => x.id === p.id).status === "failed", "nessuna modifica in caso di conflitto");

  // 8. Promemoria Apple: completare = proposta; modulo Apple = proposta
  safe("check promemoria", () => click({ act: "done", id: "d-t5" }));
  ok(app.state.tasks.find((t) => t.id === "d-t5").done, "promemoria Apple spuntato: completato (nella demo, simulato)");
  safe("apri evento apple", () => click({ open: "event:d-e3:2026-10-16" }));
  ok(/Proponi modifica/.test(modal()) && !/delete-event/.test(modal()), "evento Apple: niente elimina, solo proposta");
  safe("proponi modifica evento", () => submit("event-form", { id: "d-e3", occ: "", mode: "edit" },
    { title: "Dentista", date: "2026-10-16", start: "16:00", end: "17:00", location: "Via Roma 12", notes: "" }));
  ok(app.state.events.find((e) => e.id === "d-e3").start === "2026-10-16T15:00" && lastPending().ops[0].after.start === "2026-10-16T16:00", "modifica evento Apple diventa proposta");

  // 9. Calendario con anteprima della proposta
  click({ tab: "calendario" }); click({ act: "cal-goto", day: String(new Date(2026, 9, 16).getTime()) });
  ok(/anteprima/.test(view()) && /ev [^"]*prop/.test(view()), "calendario mostra l'anteprima della proposta");
  click({ act: "cal-hide-proposal" });
  ok(!/ev [^"]*prop/.test(view()), "si può nascondere l'anteprima");

  // 10. Altre richieste
  for (const m of ["Cosa dovrei fare adesso?", "Ho solo 45 minuti liberi", "Organizzami la giornata di domani", "Aiuto", "Riorganizza la giornata", "<b>ciao</b>"]) {
    safe("chiedi " + m, () => say(m));
    clean("risposta a " + m);
  }
  ok(!/<b>ciao<\/b>/.test(view()) && /&lt;b&gt;ciao/.test(view()), "testo utente protetto");

  // 10b. Ogni giorno: routine
  click({ tab: "attivita" }); safe("scheda routine", () => click({ act: "list-tab", v: "routines" }));
  ok(/Meditazione/.test(view()) && /Suggerimenti/.test(view()) && /Passeggiata/.test(view()), "routine e suggerimenti mostrati");
  clean("scheda ogni giorno");
  safe("aggiungi routine", () => click({ act: "add-routine", key: "walk" }));
  const walk = app.state.routines.find((r) => r.title === "Passeggiata");
  const today = G.time.dateKey(app.now());
  ok(walk && app.state.tasks.some((t) => t.routineId === walk.id && t.occ === today), "routine aggiunta: attività di oggi creata");
  ok(app.state.tasks.filter((t) => t.routineId === walk.id).length === 7, "routine creata per i prossimi 7 giorni");
  const occ = app.state.tasks.find((t) => t.routineId === walk.id && t.occ === today);
  safe("salta routine", () => click({ act: "skip-routine", id: occ.id }));
  ok(!app.state.tasks.some((t) => t.id === occ.id) && app.state.routineSkips[walk.id + "@" + today], "routine saltata per oggi");
  safe("pausa routine", () => handlers.change({ target: { dataset: { set: "routine-active", id: walk.id }, checked: false } }));
  ok(!app.state.tasks.some((t) => t.routineId === walk.id && !t.done), "routine in pausa: niente occorrenze");
  safe("modulo routine", () => submit("routine-form", { id: "" }, { title: "Stretching", duration: "15", pref: "morning", time: "", days: "1,2,3,4,5" }));
  ok(app.state.routines.some((r) => r.title === "Stretching" && r.days.length === 5), "routine creata dal modulo");
  click({ tab: "oggi" });
  ok(/ogni giorno/.test(view()), "routine segnalate nel programma");

  // 10d. Appuntamenti a qualsiasi ora: tocco su un'ora del calendario
  click({ tab: "calendario" }); click({ act: "cal-view", v: "day" }); click({ act: "cal-today" });
  ok(/data-act="new-at"/.test(view()) && /00<\/div>|>00</.test(view()) && />23</.test(view()), "calendario con tutte le 24 ore");
  const six = G.time.atMin(G.time.startOfDay(app.now()) + 86400000, 6 * 60);
  safe("tocco ora", () => click({ act: "new-at", ts: String(six) }));
  ok(/event-form/.test(modal()) && /value="06:00"/.test(modal()) && /value="07:00"/.test(modal()), "modulo appuntamento alle 06:00");
  safe("salva alle 6", () => submit("event-form", { id: "", occ: "", mode: "new" }, { title: "Treno", date: G.time.dateKey(six), start: "06:00", end: "07:00", repeat: "none", until: "", location: "", notes: "" }));
  ok(app.state.plan.blocks.some((b) => b.title === "Treno" && G.time.fmtHM(b.start) === "06:00"), "appuntamento alle 6 del mattino nel programma");

  // 10c. Oscurare
  click({ tab: "oggi" });
  safe("oscura evento", () => click({ act: "hide", key: "e:d-e1", title: "Riunione di team" }));
  ok(!app.state.plan.blocks.some((b) => b.eventId === "d-e1") && /oscurat/.test(view()), "evento Apple oscurato: sparisce dal programma");
  ok(app.state.events.some((e) => e.id === "d-e1"), "evento oscurato NON cancellato");
  safe("elenco oscurati", () => click({ act: "hidden-menu" }));
  ok(/Riunione di team/.test(modal()) && /Ripristina/.test(modal()), "elenco degli oscurati");
  safe("ripristina", () => click({ act: "unhide", key: "e:d-e1" }));
  ok(app.state.plan.blocks.some((b) => b.eventId === "d-e1"), "evento ripristinato");
  safe("oscura promemoria", () => click({ act: "hide", key: "t:d-t6@" + today, title: "Pagare la bolletta della luce" }));
  const pb = app.state.plan.blocks.find((b) => b.taskId === "d-t6");
  ok(pb && G.time.dateKey(pb.start) !== today && !app.state.tasks.find((t) => t.id === "d-t6").done, "promemoria oscurato oggi: non cancellato, spostato");

  // 10d2. Appuntamento ripetuto in giorni scelti, dal modulo e scrivendo
  safe("palestra dal modulo", () => submit("event-form", { id: "", occ: "", mode: "new" },
    { title: "Palestra nuova", date: G.time.dateKey(app.now()), start: "19:00", end: "20:00", repeat: "days", days: "1,3,5", until: "", location: "", travel: "", notes: "", area: "sport" }));
  const pg = app.state.events.find((e) => e.title === "Palestra nuova");
  ok(pg && pg.repeat === "days" && JSON.stringify(pg.days) === "[1,3,5]", "appuntamento ripetuto lun/mer/ven");
  click({ tab: "attivita" }); click({ act: "list-tab", v: "events" });
  ok(/Ogni lun, mer, ven/.test(view()), "elenco mostra i giorni scelti");
  safe("apri modulo", () => click({ open: "event:" + pg.id }));
  ok(/name="repeat" data-set="ev-repeat"/.test(modal()) && /id="ev-days"(?! hidden)/.test(modal()), "modulo: «Si ripete» in vista con i giorni");
  click({ act: "close" });
  click({ tab: "oggi" }); click({ tab: "attivita" });
  ok(/data-v="today" class="on"/.test(view()), "Attività si apre su «Oggi»");

  // 10e. Briefing del mattino
  click({ tab: "oggi" });
  ok(/La tua giornata/.test(view()) && /Le 3 cose più importanti/.test(view()), "briefing del mattino mostrato");
  safe("briefing ok", () => click({ act: "briefing-ok" }));
  ok(!/Briefing del mattino/.test(view()), "briefing chiuso fino a domani");
  ok(/La tua settimana/.test(view()) && /areabar/.test(view()), "resoconto della settimana");

  // 10f. Timer di concentrazione
  safe("timer", () => click({ act: "focus-start", id: "d-t3" }));
  ok(app.state.focus && app.state.focus.taskId === "d-t3" && /focus-timer/.test(view()), "timer avviato e mostrato");
  safe("pausa", () => click({ act: "focus-pause" }));
  ok(app.state.focus.running === false && /Riprendi/.test(view()), "timer in pausa");
  app.state.focus.accMs = 20 * 60000;
  safe("termina", () => { click({ act: "focus-stop" }); click({ act: "focus-finish", more: "" }); });
  const em = app.state.tasks.find((t) => t.id === "d-t3");
  ok(!app.state.focus && em.spent === 20 && em.remaining === 10 && !em.done, "timer: tempo registrato, stima aggiornata");

  // 10g. Passi
  safe("passo", () => click({ act: "toggle-sub", id: "d-t1", sid: "s2" }));
  ok(app.state.tasks.find((t) => t.id === "d-t1").subtasks.find((x) => x.id === "s2").done, "passo segnato");
  safe("modulo con passi e area", () => submit("task-form", { id: "", mode: "new" },
    { title: "Trasloco", duration: "60", priority: "2", dlDate: "", dlTime: "", pref: "", notBefore: "", pinnedStart: "", splittable: "on", notes: "", area: "casa",
      subtasks: JSON.stringify([{ id: "a", text: "Scatoloni", done: false }, { id: "b", text: "Furgone", done: true }]) }));
  const tr = app.state.tasks.find((t) => t.title === "Trasloco");
  ok(tr && tr.area === "casa" && tr.subtasks.length === 2 && tr.subtasks[1].done, "attività con area e passi");
  click({ tab: "attivita" }); click({ act: "list-tab", v: "tasks" }); click({ act: "filter", v: "all" });
  ok(/1\/2 passi/.test(view()) && /areachip/.test(view()), "elenco mostra passi e filtri per area");
  safe("filtro area", () => click({ act: "filter", v: "casa" }));
  ok(/Trasloco/.test(view()) && !/Studiare per l/.test(view()), "filtro per area");
  click({ act: "filter", v: "all" });

  // 10h. Spostamento
  safe("evento con luogo", () => submit("event-form", { id: "", occ: "", mode: "new" },
    { title: "Visita", date: G.time.dateKey(app.now()), start: "17:00", end: "17:30", repeat: "none", until: "", location: "Via Verdi 3", travel: "25", notes: "", area: "personale" }));
  const vb = app.state.plan.blocks.find((b) => b.kind === "travel" && /Visita/.test(b.title));
  ok(vb && G.time.fmtHM(vb.start) === "16:35", "spostamento di 25 minuti prima della visita");

  // 10i. Chiusura della sera
  app.state.settings.eveningTime = "09:00";
  click({ tab: "oggi" });
  ok(/Chiudi la giornata/.test(view()), "invito a chiudere la giornata");
  safe("apri chiusura", () => click({ act: "evening-open" }));
  ok(/Rimaste/.test(modal()) && /Domani/.test(modal()), "foglio della chiusura");
  const leftBefore = app.state.tasks.filter((t) => !t.done && !t.routineId && t.id === "d-t4");
  safe("chiudi", () => click({ act: "evening-close" }));
  const tomorrowKey = G.time.dateKey(G.time.addDays(G.time.startOfDay(app.now()), 1));
  ok(leftBefore.length && app.state.tasks.find((t) => t.id === "d-t4").notBefore === tomorrowKey, "le rimaste passano a domani");
  ok(app.state.daily[G.time.dateKey(app.now())].closed, "giornata segnata come chiusa");

  // 10j. Serie
  const med = app.state.tasks.find((t) => t.routineId === "d-r1" && t.occ === G.time.dateKey(app.now()));
  if (med) {
    safe("routine fatta", () => click({ act: "done", id: med.id }));
    ok(app.state.routineLog["d-r1"].includes(G.time.dateKey(app.now())) && G.stats.streak(app.state, app.state.routines.find((r) => r.id === "d-r1"), app.now()) === 7, "serie aggiornata dopo una routine fatta");
  }

  // 11. Torno ai dati reali: separati
  safe("esci demo", () => click({ act: "exit-demo" }));
  ok(app.mode === "real" && els["#demo-banner"].hidden === true, "uscita dalla demo");
  ok(/Benvenuto/.test(view()), "dati reali vuoti: benvenuto");
  els["#w-name"] = Object.assign(mkEl("w-name"), { value: "Elia" });
  safe("inizia reale", () => click({ act: "start-real" }));
  ok(app.state.profile.name === "Elia" && app.state.tasks.length === 0, "dati reali separati dalla demo");

  // 12. Uso reale: assistente + conferma, imprevisto, check-in, impostazioni
  safe("aggiungi reale", () => say("Dentista oggi alle 11"));
  ok(app.state.events.length === 1 && app.state.events[0].source === "internal", "appuntamento interno creato");
  safe("attività dal modulo", () => submit("task-form", { id: "", mode: "new" },
    { title: "Report", duration: "60", priority: "1", dlDate: "", dlTime: "", pref: "", notBefore: "", pinnedStart: "", splittable: "on", notes: "" }));
  ok(app.state.tasks.length === 1, "attività interna creata dal modulo (senza proposta)");
  safe("imprevisto", () => { click({ act: "imprevisto" }); click({ act: "imprevisto-go", min: "60" }); });
  const imp = app.state.events.find((e) => e.imprevisto);
  ok(imp && app.state.plan.blocks.filter((b) => b.kind === "task").every((b) => b.start >= G.time.fromISO(imp.end)), "imprevisto sposta le attività");
  safe("check-in", () => {
    const st = app.state;
    st.tasks.push({ id: "ci", title: "Prova checkin", duration: 30, remaining: 30, priority: 1, createdAt: "2026-10-15T08:00", source: "internal" });
    st.plan.blocks.push({ kind: "task", id: "ci#0", taskId: "ci", title: "Prova checkin", start: app.now() - 40 * 60000, end: app.now() - 10000 });
    st.lastTick = app.now() - 60000;
    click({ tab: "oggi" });
    app.tick();
  });
  ok(/Hai finito «Prova checkin»/.test(view()) && !app.state.tasks.find((t) => t.id === "ci").done, "orario passato: chiede, non segna fatto");
  safe("check-in domani", () => click({ act: "checkin-tomorrow", id: "ci" }));
  ok(!app.state.checkins.length && G.time.dateKey(app.state.plan.info.ci.start) === "2026-10-16", "check-in: spostata a domani");
  safe("impostazioni", () => handlers.change({ target: { dataset: { set: "num", key: "dailyLoad" }, value: "70", min: "30", max: "100" } }));
  ok(app.state.settings.dailyLoad === 70, "impostazione margine salvata");

  // 12b. "Sistema": rimedi concreti
  const dk = G.time.dateKey(app.now());
  safe("due appuntamenti sovrapposti", () => { say("Call con Marco oggi dalle 15 alle 16"); say("Riunione budget oggi dalle 15:30 alle 16:30"); });
  let cw = app.state.plan.warnings.find((w) => w.type === "conflict" && /Call con Marco/.test(w.text));
  ok(cw && cw.key && cw.a && cw.b, "avviso di sovrapposizione con i due impegni");
  click({ tab: "oggi" });
  ok(new RegExp('data-act="fix" data-key="' + cw.key.replace(/[|]/g, "\\|")).test(view()), "pulsante Sistema collegato all'avviso");
  safe("apri sistema", () => click({ act: "fix", key: cw.key }));
  ok(/Due impegni si sovrappongono/.test(modal()) && /move-event/.test(modal()) && /Va bene così/.test(modal()) && /Oscura/.test(modal()), "rimedi proposti");
  const rb = app.state.events.find((e) => e.title === "Riunione budget");
  const callEv = app.state.events.find((e) => e.title === "Call con Marco");
  const after = G.time.fromISO(callEv.end) + app.state.settings.buffer * 60000;
  safe("sposta dopo", () => click({ act: "fix-do", op: "move-event", id: rb.id, start: String(after), end: String(after + 3600000) }));
  ok(app.state.events.find((e) => e.id === rb.id).start === G.time.toISO(after) && !app.state.plan.warnings.some((w) => w.type === "conflict"), "spostato: sovrapposizione risolta");
  // promemoria Apple a orario contro evento Apple (versione reale: Apple non si modifica)
  G.apple.merge(app.state, { events: [{ id: "EV@x", externalId: "EV", title: "Medico", start: dk + "T10:00", end: dk + "T11:00", allDay: false }],
    reminders: [{ id: "RM", title: "Integratori", due: dk + "T10:00", hasTime: true, priority: 0 }] }, app.now(), { calendar: true, reminders: true });
  app.tick();
  cw = app.state.plan.warnings.find((w) => w.type === "conflict" && w.taskId === "ar:RM");
  ok(cw, "promemoria alle 10 sovrapposto al medico: avviso");
  safe("sistema apple", () => click({ act: "fix", key: cw.key }));
  ok(!/move-event" data-id="ac:/.test(modal()) && /pin-task/.test(modal()), "evento Apple non spostabile da qui, il promemoria sì (solo in Daily Schedule)");
  safe("dopo il medico", () => click({ act: "fix-do", op: "pin-task", id: "ar:RM", at: String(G.time.fromISO(dk + "T11:10")) }));
  const rmb = app.state.plan.blocks.find((b) => b.taskId === "ar:RM");
  ok(rmb && G.time.fmtHM(rmb.start) === "11:10" && app.state.tasks.find((t) => t.id === "ar:RM").pinnedStart === dk + "T10:00", "promemoria spostato alle 11:10 in Daily Schedule, dato Apple intatto");
  G.apple.merge(app.state, { events: [{ id: "EV@x", externalId: "EV", title: "Medico", start: dk + "T10:00", end: dk + "T11:00", allDay: false }],
    reminders: [{ id: "RM", title: "Integratori", due: dk + "T10:00", hasTime: true, priority: 0 }] }, app.now(), { calendar: true, reminders: true });
  app.tick();
  ok(G.time.fmtHM(app.state.plan.blocks.find((b) => b.taskId === "ar:RM").start) === "11:10", "la scelta resta dopo l'aggiornamento da Apple");
  // va bene così
  safe("due eventi sovrapposti 2", () => { say("Pranzo con Anna oggi dalle 18 alle 19"); say("Aperitivo oggi dalle 18:30 alle 19:30"); });
  cw = app.state.plan.warnings.find((w) => w.type === "conflict" && /Pranzo con Anna/.test(w.text));
  safe("ack", () => click({ act: "fix-do", op: "ack", key: cw.key }));
  ok(!app.state.plan.warnings.some((w) => w.key === cw.key), "«Va bene così» toglie l'avviso");
  // attività scaduta
  app.state.tasks.push({ id: "old1", title: "Vecchia pratica", duration: 30, remaining: 30, priority: 2, deadline: "2026-10-01", source: "internal", createdAt: "2026-09-20T09:00" });
  app.tick();
  const ow = app.state.plan.warnings.find((w) => w.type === "overdue" && w.taskId === "old1");
  safe("sistema scaduta", () => click({ act: "fix", key: ow.key }));
  ok(/Falla oggi/.test(modal()) && /Spostala a domani/.test(modal()), "rimedi per un'attività scaduta");
  safe("falla oggi", () => click({ act: "fix-do", op: "plan-day", id: "old1", day: dk }));
  ok(app.state.tasks.find((t) => t.id === "old1").deadline === dk && !app.state.plan.warnings.some((w) => w.taskId === "old1" && w.type === "overdue"), "scaduta riprogrammata per oggi");

  // 12c. Spuntare un promemoria Apple lo completa davvero in Promemoria (app per Mac simulata)
  const calls = [];
  globalThis.webkit = { messageHandlers: { apple: { postMessage: (m) => {
    calls.push(m);
    if (m.method === "completeReminder") return Promise.resolve({ ok: true, completed: true });
    if (m.method === "fetch") return Promise.resolve({ events: [], reminders: [], status: { calendar: "fullAccess", reminders: "fullAccess" } });
    return Promise.resolve({ calendar: "fullAccess", reminders: "fullAccess" });
  } } } };
  app.state.integrations = { calendar: "off", reminders: "off" };
  G.apple.merge(app.state, { events: [], reminders: [{ id: "GPT", title: "ChatGPT", due: dk, priority: 0 }] }, app.now(), { calendar: false, reminders: true });
  app.tick();
  safe("spunta promemoria", () => { click({ act: "done", id: "ar:GPT" }); for (let i = 0; i < 50; i++) drainMicrotasks(); });
  const gpt = app.state.tasks.find((t) => t.id === "ar:GPT");
  ok(gpt.done && calls.some((c) => c.method === "completeReminder" && c.params.id === "GPT" && c.params.completed === true), "spunta → completato anche in Apple Promemoria");
  ok(gpt.appleComplete === "done", "completamento confermato dall'app per Mac");
  ok(!app.state.plan.blocks.some((b) => b.taskId === "ar:GPT"), "sparisce dal programma di oggi");
  delete globalThis.webkit;

  // 13. Salvataggio
  const saved = JSON.parse(store["dailyschedule.real"]);
  ok(saved.tasks.some((t) => t.title === "Report") && saved.events.some((e) => e.title === "Dentista") && saved.profile.name === "Elia", "dati reali salvati");
  const demoSaved = JSON.parse(store["dailyschedule.demo"]);
  ok(demoSaved.tasks.some((t) => t.title === "Leggere il giornale"), "dati demo conservati a parte");

  // 14. Migrazione dal vecchio nome
  store["giornata.v1"] = JSON.stringify({ tasks: [{ id: "old", title: "Vecchia", duration: 30 }], events: [] });
  delete store["dailyschedule.real"];
  const migrated = G.store.load("real");
  ok(migrated.tasks.length === 1 && migrated.tasks[0].source === "internal" && migrated.onboarded, "dati della versione precedente recuperati");

  print("");
  failures.forEach((f) => print("  ✗ " + f));
  print("Interfaccia: " + pass + " prove superate, " + fail + " fallite");
  if (fail) throw new Error("prove fallite");
})();
