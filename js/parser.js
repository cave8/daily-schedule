// Capisce frasi in italiano scritte nella barra "Aggiungi".
// Esempi:
//   "Dentista domani alle 15"                  -> appuntamento
//   "Riunione lunedì dalle 10 alle 11:30"      -> appuntamento
//   "Palestra ogni martedì alle 19 per 1h30"   -> appuntamento ripetuto
//   "Scrivere report 2h entro venerdì !"       -> attività, priorità alta
//   "Chiamare Marco domani mattina 15 min"     -> attività da fare domani mattina
// Se c'è un orario preciso è un appuntamento, altrimenti un'attività.
(function (G) {
  "use strict";
  const T = G.time;

  const WD = { domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6,
    dom: 0, lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6 };
  const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
    settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    gen: 1, feb: 2, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };

  const WD_RE = "(?:domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)";
  const MESE_RE = "(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)";
  const DATE_RE = "(?:oggi|stasera|stamattina|stanotte|domattina|domani|dopodomani|" +
    "(?:(?:il\\s+)?prossimo\\s+|(?:la\\s+)?prossima\\s+)?" + WD_RE + "(?:\\s+prossim[oa])?|" +
    "(?:il\\s+)?\\d{1,2}\\s+" + MESE_RE + "(?:\\s+\\d{4})?|" +
    "\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|" +
    "(?:il|l')\\s*\\d{1,2}(?![\\d:.,]|\\s*(?:h|ore|ora|min)))";
  const HOUR_RE = "(\\d{1,2})(?:[:.](\\d{2}))?(\\s+e\\s+mezz[ao]|\\s+e\\s+un\\s+quarto|\\s+e\\s+tre\\s+quarti)?";
  const DUR_RE = "(?:un'ora e mezz[ao]|un'ora|mezz'ora|un quarto d'ora|" +
    "\\d+(?:[.,]\\d+)?\\s*h\\s*\\d{1,2}(?:\\s*m(?:in)?)?|" +
    "\\d+\\s+or[ae]\\s+e\\s+mezz[ao]|" +
    "\\d+(?:[.,]\\d+)?\\s*(?:h|ore|ora|min|minuti|m)(?![a-zà-ù]))";

  const noAccent = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Restituisce la mezzanotte del giorno indicato, più un eventuale momento della giornata
  function parseDate(expr, now) {
    const e = noAccent(expr.toLowerCase().trim()).replace(/^(il|la|l')\s*/, "");
    const today = T.startOfDay(now);
    if (e === "oggi") return { day: today };
    if (e === "stasera" || e === "stanotte") return { day: today, pref: "evening" };
    if (e === "stamattina") return { day: today, pref: "morning" };
    if (e === "domani") return { day: T.addDays(today, 1) };
    if (e === "domattina") return { day: T.addDays(today, 1), pref: "morning" };
    if (e === "dopodomani") return { day: T.addDays(today, 2) };
    const wdm = e.match(/(domenica|lunedi|martedi|mercoledi|giovedi|venerdi|sabato)/);
    if (wdm) {
      const target = WD[wdm[1]];
      let diff = (target - new Date(today).getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return { day: T.addDays(today, diff) };
    }
    let m = e.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if (m && MESI[m[2]]) return { day: resolveDay(+m[1], MESI[m[2]], m[3] ? +m[3] : null, today) };
    m = e.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (m) {
      let y = m[3] ? +m[3] : null;
      if (y != null && y < 100) y += 2000;
      return { day: resolveDay(+m[1], +m[2], y, today) };
    }
    m = e.match(/^(\d{1,2})$/);
    if (m) {
      const d = new Date(today);
      let cand = new Date(d.getFullYear(), d.getMonth(), +m[1]).getTime();
      if (cand < today) cand = new Date(d.getFullYear(), d.getMonth() + 1, +m[1]).getTime();
      return { day: cand };
    }
    return null;
  }

  function resolveDay(d, mo, y, today) {
    const cy = new Date(today).getFullYear();
    let t = new Date(y || cy, mo - 1, d).getTime();
    if (!y && t < today) t = new Date(cy + 1, mo - 1, d).getTime();
    return t;
  }

  function parseHour(h, m, extra) {
    let hh = +h, mm = m ? +m : 0;
    if (extra) {
      if (/mezz/.test(extra)) mm = 30;
      else if (/tre quarti/.test(extra)) mm = 45;
      else if (/quarto/.test(extra)) mm = 15;
    }
    if (hh > 24 || mm > 59) return null;
    return { h: hh, m: mm, explicitMin: !!m || !!extra };
  }

  // Minuti di una durata ("1h30", "2 ore", "mezz'ora", "45 min", "1,5h")
  function parseDuration(s) {
    const e = s.toLowerCase().trim();
    if (/^un'ora e mezz/.test(e)) return 90;
    if (e === "un'ora") return 60;
    if (e === "mezz'ora") return 30;
    if (e === "un quarto d'ora") return 15;
    let m = e.match(/^(\d+)\s+or[ae]\s+e\s+mezz/);
    if (m) return +m[1] * 60 + 30;
    m = e.match(/^(\d+(?:[.,]\d+)?)\s*h\s*(\d{1,2})/);
    if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60) + +m[2];
    m = e.match(/^(\d+(?:[.,]\d+)?)\s*(h|ore|ora|min|minuti|m)$/);
    if (m) {
      const n = parseFloat(m[1].replace(",", "."));
      return /^(h|ore|ora)$/.test(m[2]) ? Math.round(n * 60) : Math.round(n);
    }
    return null;
  }

  const NUM_WORDS = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8,
    nove: 9, dieci: 10, quindici: 15, venti: 20, venticinque: 25, trenta: 30, quaranta: 40, quarantacinque: 45, novanta: 90 };

  // "due ore" -> "2 ore", "venti minuti" -> "20 minuti"
  function numberWords(s) {
    return s.replace(/\b(uno|una|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici|venticinque|venti|trenta|quarantacinque|quaranta|novanta)\s+(ore|ora|minuti|min)\b/gi,
      (m, w, u) => NUM_WORDS[w.toLowerCase()] + " " + u);
  }

  function parse(text, now) {
    const original = String(text || "");
    let work = " " + numberWords(original) + " ";
    const res = { kind: "task", title: "", priority: 2, recognized: [] };
    const take = (re) => {
      const m = work.match(re);
      if (!m) return null;
      work = work.slice(0, m.index) + " ".repeat(m[0].length) + work.slice(m.index + m[0].length);
      return m;
    };

    // Ripetizione
    let m = take(new RegExp("\\s(?:ogni\\s+giorno|tutti\\s+i\\s+giorni)(?=\\s)", "i"));
    if (m) res.repeat = "daily";
    if (!m && (m = take(/\s(?:ogni\s+giorno\s+feriale|nei\s+giorni\s+feriali|dal\s+luned[iì]\s+al\s+venerd[iì])(?=\s)/i))) res.repeat = "weekdays";
    if (!res.repeat && (m = take(new RegExp("\\sogni\\s+(" + WD_RE + ")(?=\\s)", "i")))) {
      res.repeat = "weekly";
      res._repeatDay = parseDate(m[1], now);
    }
    if (!res.repeat && (m = take(/\sogni\s+settimana(?=\s)/i))) res.repeat = "weekly";
    if (!res.repeat && (m = take(/\sogni\s+mese(?=\s)/i))) res.repeat = "monthly";
    if (res.repeat) res.recognized.push("ripetizione");

    // Scadenza: "entro venerdì", "entro il 20", "entro domani alle 12"
    m = take(new RegExp("\\s(?:entro|per|prima\\s+di)\\s+(" + DATE_RE + ")(?:\\s+(?:alle|ore)\\s+" + HOUR_RE + ")?(?=[\\s,.!])", "i"));
    if (m) {
      const d = parseDate(m[1], now);
      if (d) {
        const hr = m[2] ? parseHour(m[2], m[3], m[4]) : null;
        res.deadline = hr ? T.toISO(T.atMin(d.day, hr.h * 60 + hr.m)) : T.dateKey(d.day);
        res.recognized.push("scadenza");
      }
    }

    // Orario: "dalle 10 alle 11:30" oppure "alle 15" / "ore 9" / "15:30"
    // Un'ora tra 1 e 7 senza altre indicazioni si intende di pomeriggio/sera ("alle 3" = 15:00),
    // a meno che non sia scritta con lo zero ("alle 07:00") o accompagnata da "di mattina".
    let startMin = null, endMin = null, guessPm = false;
    const pmGuess = (raw, h) => h >= 1 && h <= 7 && !/^0/.test(raw);
    m = take(new RegExp("\\s(?:dalle|dall')\\s*" + HOUR_RE + "\\s+(?:alle|all')\\s*" + HOUR_RE + "(?=[\\s,.!])", "i"));
    if (m) {
      const a = parseHour(m[1], m[2], m[3]), b = parseHour(m[4], m[5], m[6]);
      if (a && b) { startMin = a.h * 60 + a.m; endMin = b.h * 60 + b.m; guessPm = pmGuess(m[1], a.h); }
    }
    if (startMin == null) {
      m = take(new RegExp("\\s(?:alle|all'|ore)\\s*" + HOUR_RE + "(?=[\\s,.!])", "i")) ||
        take(/\s(\d{1,2})[:.](\d{2})()(?=[\s,.!])/);
      if (m) {
        const a = parseHour(m[1], m[2], m[3]);
        if (a) { startMin = a.h * 60 + a.m; guessPm = pmGuess(m[1], a.h); }
      }
    }

    // Giorno
    let day = null, pref = null;
    m = take(new RegExp("\\s(" + DATE_RE + ")(?=[\\s,.!])", "i"));
    if (m) {
      const d = parseDate(m[1], now);
      if (d) { day = d.day; pref = d.pref || null; }
    }
    if (!day && res._repeatDay) day = res._repeatDay.day;
    m = take(/\s(?:di\s+|in\s+|nel\s+|del\s+|della\s+|al\s+)?(mattina|mattino|mattinata|pomeriggio|sera|serata|notte)(?=[\s,.!])/i);
    if (m) pref = /^matt/i.test(m[1]) ? "morning" : /^pom/i.test(m[1]) ? "afternoon" : "evening";
    if (pref) res.recognized.push("momento");

    // Mattina o pomeriggio? Ora si decide, sapendo anche "di mattina" / "di sera"
    if (startMin != null) {
      const h = Math.floor(startMin / 60);
      let shift = 0;
      if (pref === "morning") shift = 0;
      else if ((pref === "afternoon" || pref === "evening") && h < 12) shift = 720;
      else if (guessPm) shift = 720;
      startMin += shift;
      if (endMin != null) { endMin += shift; if (endMin <= startMin) endMin += 720; }
    }

    // Durata
    m = take(new RegExp("\\s(?:per\\s+|durata\\s+)?(" + DUR_RE + ")(?=[\\s,.!])", "i"));
    if (m) {
      const d = parseDuration(m[1]);
      if (d && d > 0 && d <= 24 * 60) { res.duration = d; res.recognized.push("durata"); }
    }

    // Priorità
    if ((m = take(/\s(?:priorit[aà]\s+)?(alta|urgente|importante)(?=[\s,.!])/i)) || (m = take(/\s(!{1,3})(?=\s)/)) ||
      (m = take(/(!{1,3})(?=\s*$)/))) {
      res.priority = 1;
      res.recognized.push("priorità alta");
    } else if ((m = take(/\s(?:priorit[aà]\s+bassa|poco\s+importante|con\s+calma|quando\s+posso)(?=[\s,.!])/i))) {
      res.priority = 3;
      res.recognized.push("priorità bassa");
    } else if ((m = take(/\spriorit[aà]\s+media(?=[\s,.!])/i))) {
      res.priority = 2;
    }

    // Titolo: quello che resta, ripulito
    let title = work.replace(/\s+/g, " ").trim();
    title = title.replace(/^(?:(?:il|la|lo|di|a|per|alle|entro|e|da|con)\s+)+/i, "")
      .replace(/(?:\s+(?:il|la|lo|di|a|per|alle|entro|e|da|con|,|-))+$/i, "")
      .replace(/[,\-–:]+$/, "").trim();
    if (!title) title = original.trim();
    res.title = title.charAt(0).toUpperCase() + title.slice(1);

    if (startMin != null) {
      res.kind = "event";
      if (!day) {
        day = T.startOfDay(now);
        // Se l'orario di oggi è già passato, si intende domani
        if (!res.repeat && T.atMin(day, startMin) < now) day = T.addDays(day, 1);
      }
      const s = T.atMin(day, startMin);
      const dur = endMin != null && endMin > startMin ? endMin - startMin : (res.duration || 60);
      res.start = T.toISO(s);
      res.end = T.toISO(s + dur * 60000);
      res.duration = dur;
      res.recognized.unshift("orario");
    } else {
      if (res.repeat) {
        // un'abitudine ripetuta senza orario: la trattiamo come attività normale
        res.recognized = res.recognized.filter((r) => r !== "ripetizione");
        delete res.repeat;
      }
      res.duration = res.duration || 30;
      if (day) {
        res.notBefore = T.dateKey(day);
        if (!res.deadline) res.deadline = T.dateKey(day);
        res.recognized.unshift("giorno");
      }
      if (pref) res.pref = pref;
    }
    delete res._repeatDay;
    return res;
  }

  G.parser = { parse, parseDuration, parseDate };
})(globalThis.G || (globalThis.G = {}));
