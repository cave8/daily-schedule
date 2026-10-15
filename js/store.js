// Salvataggio dei dati sul dispositivo (localStorage) con backup giornalieri.
// I dati reali e quelli dimostrativi stanno in due spazi separati e non si mescolano mai.
(function (G) {
  "use strict";
  const KEYS = { real: "dailyschedule.real", demo: "dailyschedule.demo" };
  const MODE_KEY = "dailyschedule.mode";
  const BACKUP_KEY = "dailyschedule.backups";
  const LEGACY_KEY = "giornata.v1"; // nome precedente dell'app
  const VERSION = 2;

  function empty() {
    return {
      version: VERSION,
      profile: { name: "" },
      settings: G.scheduler.defaultSettings(),
      tasks: [],
      events: [],
      plan: null,
      checkins: [],
      notified: {},
      lastTick: null,
      notifications: false,
      chat: [],       // conversazione con l'assistente
      proposals: [],  // proposte di modifica e il loro stato
      onboarded: false,
      // stato dei collegamenti Apple: "off" | "demo" | "connected"
      integrations: { calendar: "off", reminders: "off" },
      routines: [],      // cose da fare ogni giorno
      routineSkips: {},  // "idRoutine@giorno": occorrenze saltate
      hidden: {},        // elementi oscurati: "e:idOccorrenza" o "t:idAttività@giorno"
      routineLog: {},    // "idRoutine": [giorni in cui è stata fatta]
      daily: {},         // "giorno": { briefing, closed } (briefing del mattino, chiusura della sera)
      focus: null,       // timer di concentrazione in corso
    };
  }

  function normalize(s) {
    const base = empty();
    if (!s || typeof s !== "object") return base;
    const out = Object.assign(base, s);
    out.profile = Object.assign({ name: "" }, s.profile);
    out.settings = G.scheduler.mergeSettings(s.settings);
    out.tasks = Array.isArray(s.tasks) ? s.tasks.filter((t) => t && t.id).map((t) => Object.assign({ source: "internal" }, t)) : [];
    out.events = Array.isArray(s.events) ? s.events.filter((e) => e && e.id && e.start).map((e) => Object.assign({ source: "internal" }, e)) : [];
    out.checkins = Array.isArray(s.checkins) ? s.checkins : [];
    out.notified = s.notified && typeof s.notified === "object" ? s.notified : {};
    out.chat = Array.isArray(s.chat) ? s.chat.slice(-200) : [];
    out.proposals = Array.isArray(s.proposals) ? s.proposals.slice(-100) : [];
    out.routines = Array.isArray(s.routines) ? s.routines.filter((r) => r && r.id && r.title) : [];
    out.routineSkips = s.routineSkips && typeof s.routineSkips === "object" ? s.routineSkips : {};
    out.hidden = s.hidden && typeof s.hidden === "object" ? s.hidden : {};
    out.routineLog = s.routineLog && typeof s.routineLog === "object" ? s.routineLog : {};
    out.daily = s.daily && typeof s.daily === "object" ? s.daily : {};
    out.integrations = Object.assign({ calendar: "off", reminders: "off" }, s.integrations);
    out.version = VERSION;
    return out;
  }

  function getMode() {
    try { return localStorage.getItem(MODE_KEY) === "demo" ? "demo" : "real"; } catch (e) { return "real"; }
  }
  function setMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode === "demo" ? "demo" : "real"); } catch (e) { /* niente */ }
  }

  function load(mode) {
    mode = mode || getMode();
    try {
      let raw = localStorage.getItem(KEYS[mode]);
      if (!raw && mode === "real") {
        // Recupera i dati salvati con il vecchio nome dell'app
        raw = localStorage.getItem(LEGACY_KEY);
        if (raw) { const st = normalize(JSON.parse(raw)); st.onboarded = true; return st; }
      }
      return raw ? normalize(JSON.parse(raw)) : empty();
    } catch (e) {
      console.error("Lettura dati non riuscita", e);
      return empty();
    }
  }

  function save(state, mode) {
    mode = mode || getMode();
    try {
      localStorage.setItem(KEYS[mode], JSON.stringify(state));
      if (mode === "real") dailyBackup(state);
      return true;
    } catch (e) {
      console.error("Salvataggio non riuscito", e);
      return false;
    }
  }

  function clearDemo() {
    try { localStorage.removeItem(KEYS.demo); } catch (e) { /* niente */ }
  }

  // Tiene una copia al giorno degli ultimi 7 giorni (solo dati reali)
  function dailyBackup(state) {
    try {
      const list = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      const today = G.time.dateKey(Date.now());
      if (list.length && list[0].day === today) return;
      list.unshift({ day: today, data: exportData(state) });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 7)));
    } catch (e) { /* lo spazio può finire: il backup è un extra */ }
  }

  function backups() {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]"); } catch (e) { return []; }
  }

  // Solo i dati dell'utente (il programma si ricalcola). Gli elementi Apple non si esportano:
  // la fonte originale resta Apple.
  function exportData(state) {
    return JSON.stringify({ app: "Daily Schedule", version: VERSION, exportedAt: new Date().toISOString(),
      profile: state.profile, settings: state.settings, routines: state.routines,
      tasks: state.tasks.filter((t) => (t.source || "internal") === "internal" && !t.routineId),
      events: state.events.filter((e) => (e.source || "internal") === "internal") });
  }

  function importData(json) {
    const d = JSON.parse(json);
    if (!d || (!Array.isArray(d.tasks) && !Array.isArray(d.events))) throw new Error("File non valido");
    return normalize({ profile: d.profile, settings: d.settings, routines: d.routines, tasks: d.tasks, events: d.events, onboarded: true });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  G.store = { load, save, empty, normalize, exportData, importData, backups, uid, getMode, setMode, clearDemo, KEYS };
})(globalThis.G || (globalThis.G = {}));
