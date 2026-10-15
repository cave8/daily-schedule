// Utilità per date e orari (sempre in ora locale).
// Internamente i momenti sono millisecondi (come Date.getTime()).
// Nei dati salvati usiamo stringhe leggibili: "2026-10-15" e "2026-10-15T14:30".
(function (G) {
  "use strict";

  const MIN = 60000;
  const pad = (n) => String(n).padStart(2, "0");

  const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
    "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  function dateKey(t) {
    const d = new Date(t);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function fromKey(k) {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  function startOfDay(t) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  // Aggiunge giorni di calendario (corretto anche al cambio dell'ora legale)
  function addDays(t, n) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n,
      d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
  }

  function hmToMin(s) {
    const [h, m] = String(s).split(":").map(Number);
    return h * 60 + (m || 0);
  }

  // Il momento "giorno + minuti dalla mezzanotte"
  function atMin(dayMs, minutes) {
    const d = new Date(dayMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
  }

  function minOfDay(t) {
    const d = new Date(t);
    return d.getHours() * 60 + d.getMinutes();
  }

  function toISO(t) {
    const d = new Date(t);
    return dateKey(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // "2026-10-15" -> mezzanotte; "2026-10-15T14:30" -> quel momento
  function fromISO(s) {
    if (!s) return null;
    const [dk, hm] = String(s).split("T");
    const day = fromKey(dk);
    return hm ? atMin(day, hmToMin(hm)) : day;
  }

  function hasTime(s) {
    return typeof s === "string" && s.includes("T");
  }

  function ceilTo(t, stepMin) {
    const d = new Date(t);
    const m = d.getHours() * 60 + d.getMinutes() + (d.getSeconds() || d.getMilliseconds() ? 1 : 0);
    return atMin(startOfDay(t), Math.ceil(m / stepMin) * stepMin);
  }

  function fmtHM(t) {
    const d = new Date(t);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function fmtDur(min) {
    min = Math.round(min);
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return m ? h + " h " + m + " min" : h + " h";
  }

  // "1h 30m" (versione corta per i riepiloghi)
  function fmtDurShort(min) {
    min = Math.round(min);
    if (min < 60) return min + "m";
    const h = Math.floor(min / 60), m = min % 60;
    return m ? h + "h " + m + "m" : h + "h";
  }

  // "Oggi", "Domani", "Ieri" oppure "lunedì 20 ottobre"
  function fmtDay(t, now, opts) {
    const diff = Math.round((startOfDay(t) - startOfDay(now)) / 86400000);
    if (diff === 0) return "Oggi";
    if (diff === 1) return "Domani";
    if (diff === -1) return "Ieri";
    const d = new Date(t);
    if (opts && opts.short) return GIORNI_BREVI[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
    return GIORNI[d.getDay()] + " " + d.getDate() + " " + MESI[d.getMonth()];
  }

  function fmtLongDate(t) {
    const d = new Date(t);
    const s = GIORNI[d.getDay()] + " " + d.getDate() + " " + MESI[d.getMonth()];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  G.time = {
    MIN, pad, GIORNI, GIORNI_BREVI, MESI,
    dateKey, fromKey, startOfDay, addDays, hmToMin, atMin, minOfDay,
    toISO, fromISO, hasTime, ceilTo, fmtHM, fmtDur, fmtDurShort, fmtDay, fmtLongDate,
  };
})(globalThis.G || (globalThis.G = {}));
