// Assistente in chat — interprete LOCALE (senza intelligenza artificiale).
// Capisce le richieste più comuni in italiano e risponde con:
//  - informazioni verificate (dal programma calcolato),
//  - stime (segnalate come tali),
//  - PROPOSTE di modifica (mai eseguite qui: le esegue solo il livello proposte dopo conferma).
// Funziona interamente sul dispositivo: gratis e senza inviare dati a servizi esterni.
(function (G) {
  "use strict";
  const T = G.time, S = G.scheduler, P = G.parser, PR = G.proposals;
  const MIN = T.MIN;

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const STOP = new Set(["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra",
    "del", "della", "dei", "delle", "al", "alla", "allo", "ai", "e", "che", "mi", "ti", "si", "ho", "devo", "questa", "questo", "attivita", "oggi", "domani"]);

  function words(s) {
    return norm(s).split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w));
  }
  // somiglianza tra la frase dell'utente e un titolo (radici di 4 lettere in comune)
  function score(phrase, title) {
    const pw = words(phrase).map((w) => w.slice(0, 4));
    const tw = new Set(words(title).map((w) => w.slice(0, 4)));
    let s = 0;
    for (const w of pw) if (tw.has(w)) s++;
    return s;
  }

  // ---------- stime di durata ----------
  const ESTIMATES = [
    [/palestra|allenament|corsa|correre|nuoto|yoga|sport|calcetto/, 60, "allenamento"],
    [/spesa|supermercato/, 45, "spesa"],
    [/studi|ripass|esame|compiti/, 60, "studio"],
    [/e-?mail|posta|messaggi/, 30, "email"],
    [/chiam|telefon/, 15, "telefonata"],
    [/call|videochiamata/, 30, "call"],
    [/riunione|meeting|incontro/, 60, "riunione"],
    [/dentista|medico|visita|dottore/, 60, "visita"],
    [/lavor|progett|report|relazione|presentazion/, 120, "lavoro"],
    [/legger|libro/, 30, "lettura"],
    [/pulizi|pulire|lavatrice|stirare/, 60, "faccende"],
    [/cucinare|cena|pranzo/, 60, "pasto"],
    [/pagare|bolletta|bonifico|prenotare|rinnovare/, 15, "pratica veloce"],
  ];
  function estimate(title) {
    const n = norm(title);
    for (const [re, min] of ESTIMATES) if (re.test(n)) return min;
    return 30;
  }

  // ---------- contesto ----------
  function ctxOf(state, now) {
    const plan = state.plan || S.plan(state, now);
    const open = state.tasks.filter((t) => !t.done);
    return { plan, open, now };
  }

  function currentBlock(plan, now) {
    return plan.blocks.find((b) => (b.kind === "task" || b.kind === "event") && b.start <= now && b.end > now) || null;
  }

  function findTask(state, phrase, opts) {
    const list = state.tasks.filter((t) => (opts && opts.includeDone) || !t.done);
    let best = null, bs = 0;
    for (const t of list) { const s = score(phrase, t.title); if (s > bs) { bs = s; best = t; } }
    return best;
  }

  function upcomingEvents(state, now, days) {
    return S.visibleEvents(state, T.startOfDay(now), T.addDays(T.startOfDay(now), days || 14)).filter((o) => !o.allDay && o.end > now - 12 * 3600000);
  }

  function findEvent(state, phrase, now) {
    let best = null, bs = 0;
    for (const o of upcomingEvents(state, now)) {
      const s = score(phrase, o.title);
      if (s > bs || (s === bs && s > 0 && best && Math.abs(o.start - now) < Math.abs(best.start - now))) { bs = s; best = o; }
    }
    return best;
  }

  function fmtWhen(ms, now) { return T.fmtDay(ms, now).toLowerCase() + " alle " + T.fmtHM(ms); }

  function taskLine(t, info, now) {
    const i = info[t.id] || {};
    return "«" + t.title + "» (" + T.fmtDur(S.taskRemaining(t)) + (i.start ? ", " + fmtWhen(i.start, now) : ", senza posto") + ")";
  }

  // Ordine di importanza: prima quelle già pianificate, per orario
  function rankedTasks(state, plan) {
    return state.tasks.filter((t) => !t.done).sort((a, b) => {
      const ia = plan.info[a.id] && plan.info[a.id].start, ib = plan.info[b.id] && plan.info[b.id].start;
      return (ia || Infinity) - (ib || Infinity);
    });
  }

  // Trova uno spazio libero di durata "dur" in una fascia (per spostare un appuntamento)
  function findSlot(state, now, day, fromMin, toMin, dur, excludeEventId) {
    const st = JSON.parse(JSON.stringify(state));
    st.events = st.events.filter((e) => e.id !== excludeEventId);
    const occ = S.visibleEvents(st, day, T.addDays(day, 1)).filter((o) => !o.allDay);
    const buf = (st.settings.buffer || 0) * MIN;
    let free = [[Math.max(T.atMin(day, fromMin), T.ceilTo(now, 5)), T.atMin(day, toMin)]];
    for (const o of occ) free = S.subtract(free, o.start - buf, o.end + buf);
    for (const [a, b] of free) if ((b - a) / MIN >= dur) return a;
    return null;
  }

  // ---------- riconoscimento di giorni, fasce, durate ----------
  const DAY_RE = /\b(oggi|stasera|stamattina|domattina|domani|dopodomani|(?:luned|marted|mercoled|gioved|venerd)[iì]|sabato|domenica)\b/i;
  const SLOT = { mattina: "morning", mattinata: "morning", pomeriggio: "afternoon", sera: "evening", serata: "evening" };
  const SLOT_HOURS = { morning: [9 * 60, 13 * 60], afternoon: [14 * 60, 18 * 60], evening: [18 * 60, 22 * 60] };

  function parseDelta(s) {
    const n = norm(s);
    let m = n.match(/(\d+(?:[.,]\d+)?|un'?|una|mezz'?)\s*(ora|ore|h|minuti|min)\b/);
    if (/mezz'?ora/.test(n)) return 30;
    if (/un'ora e mezza/.test(n)) return 90;
    if (!m) return null;
    const q = /^un|^una/.test(m[1]) ? 1 : parseFloat(m[1].replace(",", "."));
    return /^(ora|ore|h)$/.test(m[2]) ? Math.round(q * 60) : Math.round(q);
  }

  // ---------- intenti ----------
  function respond(text, state, now, opts) {
    opts = opts || {};
    const raw = String(text || "").trim();
    const n = norm(raw);
    const { plan, open } = ctxOf(state, now);
    if (!raw) return { text: "Scrivimi pure cosa ti serve." };

    // Aiuto
    if (/^(aiuto|help|\?|cosa sai fare|come funzioni|che cosa puoi fare)/.test(n)) return help();

    // Cosa fare adesso / la cosa più importante
    if (/(cosa|che cosa|che)\s+(devo|dovrei|posso)\s+fare\s+(adesso|ora|subito)|piu importante|priorita.*adesso|da dove (comincio|inizio)/.test(n)) {
      return whatNow(state, plan, now);
    }

    // Ho N minuti liberi
    let m = n.match(/(?:ho|avrei|mi restano|ci sono)\s+(?:solo\s+|soltanto\s+|appena\s+)?(.{1,20}?)\s*(?:liberi|libere|di tempo|a disposizione)/);
    if (m && parseDelta(m[1])) return freeTime(state, plan, now, parseDelta(m[1]));

    // Non sono riuscito a finire
    if (/non (sono riuscit[oa] a |ho fatto in tempo a |riesco a |ce l'ho fatta a )?(finire|finito|completare|completato|terminare|terminato|fare)\b/.test(n)) {
      return notFinished(state, plan, now, raw);
    }

    // Completato
    m = n.match(/^(?:ho\s+)?(?:appena\s+)?(?:completato|finito|fatto|terminato)\s*(.*)$/) || n.match(/^(.+?)\s+(?:e\s+)?(?:fatt[oa]|completat[oa]|finit[oa])[.!]?$/);
    if (m) return completed(state, plan, now, m[1] || "");

    // Un'ora in più a X / X dura di più
    m = n.match(/(.+?)\s+in piu\s+(?:a|al|allo|alla|per|sul|sulla|sullo|agli|alle)\s+(.+)/);
    if (m && parseDelta(m[1])) return extendItem(state, plan, now, m[2], parseDelta(m[1]));
    m = n.match(/(.+?)\s+(?:dura|durera|sta durando|e durat[oa])\s+(?:piu del previsto|di piu|piu a lungo)(?:\s+(?:di\s+)?(.+))?/);
    if (m) return extendItem(state, plan, now, m[1], (m[2] && parseDelta(m[2])) || 30);

    // X finisce alle H
    m = n.match(/(.+?)\s+(?:finisce|finira|termina)\s+alle\s+(\d{1,2})(?:[:.](\d{2}))?/);
    if (m) return endsAt(state, plan, now, m[1], +m[2] * 60 + (m[3] ? +m[3] : 0));

    // Spostamenti
    m = n.match(/(.+?)\s+(?:e stat[oa]|sono stat[ie]|e)\s+(?:spostat[oaie]|rimandat[oaie]|anticipat[oaie]|posticipat[oaie])\s+(.+)/);
    if (m) return move(state, plan, now, m[1], m[2], raw);
    m = n.match(/^(?:puoi\s+)?(?:sposta(?:re|mi)?|rimanda(?:re|mi)?|posticipa(?:re)?|anticipa(?:re)?|metti)\s+(.+?)\s+((?:a|al|alla|alle|allo|di|per|in|verso|dopo|prima|tra|fra)\s+.+)$/);
    if (m) return move(state, plan, now, m[1], m[2], raw);

    // Organizza / riorganizza la giornata (solo se non contiene altri impegni)
    const orgRe = /(ri)?organizza(mi)?(\s+(il resto del(la)?|la|il))?(\s+(giornata|settimana|pomeriggio|mattina|programma|sera))?(\s+di)?(\s+(oggi|domani|dopodomani))?/;
    const withoutOrg = n.replace(orgRe, "").replace(/[.,!?]/g, " ").trim();
    if (orgRe.test(n) && (/^(ri)?organizza/.test(n) || withoutOrg.length < 4)) {
      const dm = n.match(DAY_RE);
      return organize(state, plan, now, dm ? dm[1] : "oggi");
    }

    // Aggiungere (anche più cose in una frase)
    return add(state, plan, now, raw, opts);
  }

  function help() {
    return { text: "Posso aiutarti così (scrivi come parleresti):\n" +
      "• «Domani devo studiare due ore, andare in palestra e fare la spesa»\n" +
      "• «Aggiungi un promemoria per chiamare il dentista venerdì»\n" +
      "• «Cosa dovrei fare adesso?» · «Ho solo 45 minuti liberi»\n" +
      "• «Sposta lo studio al pomeriggio» · «La riunione è stata spostata di un'ora»\n" +
      "• «Ho completato la presentazione» · «Non sono riuscito a finire il lavoro, spostalo a domani»\n" +
      "• «Organizzami la giornata di domani»\n" +
      "Ogni modifica ti viene mostrata prima: decidi tu se confermarla.",
    suggestions: ["Cosa dovrei fare adesso?", "Organizzami la giornata di domani"] };
  }

  function whatNow(state, plan, now) {
    const cur = currentBlock(plan, now);
    if (cur && cur.kind === "event") {
      return { text: "In questo momento hai «" + cur.title + "» fino alle " + T.fmtHM(cur.end) + " (appuntamento confermato in calendario)." +
        nextLine(plan, now, cur.end) };
    }
    if (cur && cur.kind === "task") {
      const t = state.tasks.find((x) => x.id === cur.taskId);
      const why = (plan.info[cur.taskId] && plan.info[cur.taskId].reasons) || [];
      return { text: "Adesso è il momento di «" + cur.title + "», fino alle " + T.fmtHM(cur.end) + "." +
        (why.length ? "\nPerché: " + why.join(", ") + "." : ""),
        actions: t ? [{ label: "✓ Fatto", act: "done", id: t.id }, { label: "+15 min", act: "extend", id: t.id }] : [] };
    }
    const ranked = rankedTasks(state, plan);
    if (!ranked.length) return { text: "Non hai attività da fare. Goditi il tempo libero! 🙂" + nextLine(plan, now, now) };
    const top = ranked[0];
    const info = plan.info[top.id] || {};
    const nextEv = plan.blocks.find((b) => b.kind === "event" && b.start > now);
    const freeUntil = nextEv ? nextEv.start : null;
    const fits = !freeUntil || (freeUntil - now) / MIN >= Math.min(S.taskRemaining(top), state.settings.minChunk || 25);
    return {
      text: "La cosa più importante adesso è «" + top.title + "» (" + T.fmtDur(S.taskRemaining(top)) + ")." +
        (info.reasons && info.reasons.length ? "\nPerché: " + info.reasons.join(", ") + "." : "") +
        (info.start ? "\nNel programma è prevista " + fmtWhen(info.start, now) + " (orario suggerito)." : "") +
        (freeUntil ? "\nSei libero fino alle " + T.fmtHM(freeUntil) + " («" + nextEv.title + "»)." : "") +
        (!fits ? "\nAttenzione: prima del prossimo impegno non c'è abbastanza tempo per iniziarla bene." : ""),
      actions: fits ? [{ label: "▶︎ Inizia ora", act: "start", id: top.id }] : [],
    };
  }

  function nextLine(plan, now, after) {
    const nx = plan.blocks.find((b) => (b.kind === "task" || b.kind === "event") && b.start >= after && b.start > now);
    return nx ? "\nPoi: «" + nx.title + "» " + fmtWhen(nx.start, now) + (nx.suggested ? " (suggerito)" : "") + "." : "";
  }

  function freeTime(state, plan, now, minutes) {
    const cands = state.tasks.filter((t) => !t.done).map((t) => {
      const i = plan.info[t.id] || {};
      const rem = S.taskRemaining(t);
      const fitsAll = rem <= minutes;
      const canSplit = t.splittable !== false && minutes >= (state.settings.minChunk || 25);
      let sc = (t.priority === 1 ? 30 : t.priority === 2 ? 15 : 0);
      if (t.deadline) sc += Math.max(0, 40 - (S.deadlineMs(t.deadline) - now) / 3600000);
      if (fitsAll) sc += 20;
      if (i.late) sc += 25;
      return { t, rem, fitsAll, canSplit, sc };
    }).filter((c) => c.fitsAll || c.canSplit).sort((a, b) => b.sc - a.sc).slice(0, 3);
    if (!cands.length) return { text: "Con " + T.fmtDur(minutes) + " non c'è un'attività che ci stia. Potresti usarli per una pausa o per sistemare piccole cose." };
    const lines = cands.map((c, i) => (i + 1) + ". «" + c.t.title + "» — " + (c.fitsAll ? T.fmtDur(c.rem) + ", la finisci" : "ne fai " + T.fmtDur(minutes) + " su " + T.fmtDur(c.rem)) +
      (c.t.deadline ? ", scade " + T.fmtDay(S.deadlineMs(c.t.deadline) - 1, now).toLowerCase() : "") + (c.t.priority === 1 ? ", priorità alta" : ""));
    return { text: "Con " + T.fmtDur(minutes) + " liberi ti consiglio:\n" + lines.join("\n") + "\nLa prima è la più urgente/importante tra quelle che ci stanno.",
      actions: cands.map((c) => ({ label: "▶︎ " + c.t.title, act: "start", id: c.t.id })) };
  }

  function targetTaskFromContext(state, plan, now, phrase) {
    const p = norm(phrase).replace(/^(il|lo|la|l'|i|gli|le)\s+/, "").trim();
    if (p && !/^(questa|questo|quest'|la cosa|l'attivita|quello|quella|tutto|$)/.test(p)) {
      const t = findTask(state, p);
      if (t) return t;
    }
    const cur = currentBlock(plan, now);
    if (cur && cur.kind === "task") return state.tasks.find((t) => t.id === cur.taskId);
    if (state.checkins && state.checkins.length) return state.tasks.find((t) => t.id === state.checkins[state.checkins.length - 1].taskId);
    return null;
  }

  function completed(state, plan, now, phrase) {
    const t = targetTaskFromContext(state, plan, now, phrase);
    if (!t) return { text: "Quale attività hai completato? Non l'ho trovata tra quelle da fare." + listHint(state, plan, now) };
    return {
      text: "Ottimo! Segno «" + t.title + "» come completata" + (PR.isApple(t.source) ? " anche in Apple Promemoria" : "") + ". Il resto della giornata si sposta di conseguenza.",
      ops: [PR.op(state, "complete_task", { targetId: t.id })],
      summary: "Completare «" + t.title + "»",
      reason: "Mi hai detto che l'hai finita.",
    };
  }

  function listHint(state, plan, now) {
    const r = rankedTasks(state, plan).slice(0, 4);
    return r.length ? "\nQuelle aperte: " + r.map((t) => "«" + t.title + "»").join(", ") + "." : "";
  }

  function notFinished(state, plan, now, raw) {
    const n = norm(raw);
    const tomorrow = T.addDays(T.startOfDay(now), 1);
    const dm = n.match(/\b(dopodomani|(?:luned|marted|mercoled|gioved|venerd)i|sabato|domenica)\b/);
    const targetDay = dm ? P.parseDate(dm[1], now).day : tomorrow;
    let tasks = [];
    if (/(lavoro|tutto|attivita)\s+(previst[oe]|di oggi|per oggi)|quello che (avevo|era) previsto|tutto quello/.test(n)) {
      const endToday = T.addDays(T.startOfDay(now), 1);
      tasks = state.tasks.filter((t) => !t.done && (
        (plan.info[t.id] && plan.info[t.id].start < endToday) || (state.checkins || []).some((c) => c.taskId === t.id)));
    } else {
      const phrase = n.replace(/.*non (sono riuscit[oa] a |ho fatto in tempo a |riesco a |ce l'ho fatta a )?(finire|finito|completare|completato|terminare|terminato|fare)/, "")
        .replace(/[,.;].*$/, "").replace(/\b(spostal[oa]|spostale|rimandal[oa]|a domani|per oggi|oggi)\b.*/, "");
      const t = targetTaskFromContext(state, plan, now, phrase);
      if (t) tasks = [t];
    }
    if (!tasks.length) return { text: "Quale attività non sei riuscito a finire?" + listHint(state, plan, now) };
    const ops = tasks.map((t) => {
      const after = { notBefore: T.dateKey(targetDay) };
      if (t.snoozeUntil) after.snoozeUntil = null;
      if (t.pinnedStart) after.pinnedStart = null;
      if (t.deadline && S.deadlineMs(t.deadline) <= T.addDays(targetDay, 1) - 1 && S.deadlineMs(t.deadline) < T.addDays(targetDay, 1)) {
        if (S.deadlineMs(t.deadline) <= targetDay) after.deadline = T.dateKey(targetDay);
      }
      return PR.op(state, "update_task", { targetId: t.id, after });
    });
    const movedDl = ops.filter((o) => o.after.deadline);
    return {
      text: "Nessun problema. Propongo di spostare " + (tasks.length > 1 ? "queste " + tasks.length + " attività" : "«" + tasks[0].title + "»") + " a " +
        T.fmtDay(targetDay, now).toLowerCase() + " e di riorganizzare il resto." +
        (movedDl.length ? "\nAttenzione: " + movedDl.map((o) => "«" + o.before.title + "»").join(", ") + " scadeva prima, quindi sposterei anche la scadenza. Se la scadenza non si può spostare, annulla e dimmelo." : "") +
        "\nSe è troppo grande, puoi anche ridurne la durata o dividerla con «Modifica».",
      ops,
      summary: "Spostare a " + T.fmtDay(targetDay, now).toLowerCase() + ": " + tasks.map((t) => "«" + t.title + "»").join(", "),
      reason: "Non sono state completate oggi.",
    };
  }

  function extendItem(state, plan, now, phrase, delta) {
    const ev = findEvent(state, phrase, now);
    const t = findTask(state, phrase);
    if (t && (!ev || score(phrase, t.title) >= score(phrase, ev.title))) {
      const rem = S.taskRemaining(t) + delta;
      return {
        text: "Va bene: aggiungo " + T.fmtDur(delta) + " a «" + t.title + "» (in totale " + T.fmtDur(rem) + ") e sposto quello che viene dopo, senza toccare gli appuntamenti fissi.",
        ops: [PR.op(state, "update_task", { targetId: t.id, after: { remaining: rem, duration: Math.max(t.duration || 0, rem) } })],
        summary: "+" + T.fmtDur(delta) + " a «" + t.title + "»", reason: "Ti serve più tempo per questa attività.",
      };
    }
    if (ev) return shiftEvent(state, plan, now, ev, 0, delta, "Dura " + T.fmtDur(delta) + " in più del previsto.");
    return { text: "Non ho trovato l'attività o l'appuntamento a cui aggiungere tempo." + listHint(state, plan, now) };
  }

  function endsAt(state, plan, now, phrase, endMin) {
    const ev = findEvent(state, phrase, now);
    if (!ev) return { text: "Non ho trovato quell'appuntamento nei prossimi giorni." };
    const newEnd = T.atMin(T.startOfDay(ev.start), endMin);
    if (newEnd <= ev.start) return { text: "L'orario di fine sarebbe prima dell'inizio: controlla l'ora." };
    return shiftEvent(state, plan, now, ev, 0, (newEnd - ev.end) / MIN, "Finisce alle " + T.fmtHM(newEnd) + ".");
  }

  // Sposta/allunga un appuntamento: dStart e dEnd in minuti
  function shiftEvent(state, plan, now, occ, dStart, dEnd, reason) {
    const ev = state.events.find((e) => e.id === occ.eventId);
    if (!ev) return { text: "Non trovo più quell'appuntamento." };
    const recurring = ev.repeat && ev.repeat !== "none";
    if (recurring) {
      return { text: "«" + ev.title + "» si ripete: per ora posso modificare solo l'intera serie dal modulo dell'appuntamento. Aprilo dal Calendario per cambiarlo.", actions: [{ label: "Apri «" + ev.title + "»", act: "open-event", id: ev.id }] };
    }
    const s = T.fromISO(ev.start) + dStart * MIN, e = T.fromISO(ev.end) + dEnd * MIN;
    const after = { start: T.toISO(s), end: T.toISO(e) };
    const apple = PR.isApple(ev.source);
    return {
      text: "Propongo di aggiornare «" + ev.title + "»: " + T.fmtHM(T.fromISO(ev.start)) + "–" + T.fmtHM(T.fromISO(ev.end)) + " → " + T.fmtHM(s) + "–" + T.fmtHM(e) +
        (T.dateKey(s) !== T.dateKey(T.fromISO(ev.start)) ? " (" + T.fmtDay(s, now).toLowerCase() + ")" : "") + "." +
        (apple ? "\nÈ un evento di Apple Calendar: lo modifico solo se confermi." : "") +
        "\nLe attività verranno riorganizzate attorno al nuovo orario.",
      ops: [PR.op(state, "update_event", { targetId: ev.id, after })],
      summary: "Aggiornare «" + ev.title + "»", reason,
    };
  }

  function move(state, plan, now, what, dest, raw) {
    const d = norm(dest);
    const ev = findEvent(state, what, now);
    const t = findTask(state, what);
    const useEvent = ev && (!t || score(what, ev.title) > score(what, t.title) || /riunione|appuntamento|incontro|call|visita|evento/.test(norm(what)));
    const delta = parseDelta(d);
    const back = /\b(prima|indietro|anticipat)/.test(d) || /anticipa/.test(norm(raw));
    const timeM = d.match(/\balle\s+(\d{1,2})(?:[:.](\d{2}))?/);
    const slotM = d.match(/\b(mattina|mattinata|pomeriggio|sera|serata)\b/);
    const dayM = d.match(DAY_RE);
    const day = dayM ? P.parseDate(dayM[1], now) : null;

    if (useEvent) {
      const evStart = ev.start;
      if (delta && !timeM) return shiftEvent(state, plan, now, ev, back ? -delta : delta, back ? -delta : delta, (back ? "Anticipato" : "Spostato") + " di " + T.fmtDur(delta) + ".");
      const baseDay = day ? day.day : T.startOfDay(evStart);
      let newStart = null;
      if (timeM) {
        let h = +timeM[1];
        if (h >= 1 && h <= 7 && !/^0/.test(timeM[1]) && !/mattin/.test(d)) h += 12;
        newStart = T.atMin(baseDay, h * 60 + (timeM[2] ? +timeM[2] : 0));
      } else if (slotM) {
        const [a, b] = SLOT_HOURS[SLOT[slotM[1]]];
        newStart = findSlot(state, now, baseDay, a, b, (ev.end - ev.start) / MIN, ev.eventId);
        if (newStart == null) return { text: "Non trovo uno spazio libero di " + T.fmtDur((ev.end - ev.start) / MIN) + " " + (day ? T.fmtDay(baseDay, now).toLowerCase() + " " : "") + "di " + slotM[1] + ". Vuoi indicarmi un orario preciso?" };
      } else if (day) {
        newStart = T.atMin(baseDay, T.minOfDay(evStart));
      }
      if (newStart == null) return { text: "Dove vuoi spostare «" + ev.title + "»? Ad esempio: «alle 15», «a domani», «di un'ora»." };
      const dm = (newStart - evStart) / MIN;
      return shiftEvent(state, plan, now, ev, dm, dm, "Lo hai chiesto tu.");
    }
    if (t) {
      const after = {};
      let what2 = "";
      if (slotM) { after.pref = SLOT[slotM[1]]; what2 = "di " + slotM[1]; }
      if (day) {
        after.notBefore = T.dateKey(day.day);
        if (day.pref) after.pref = day.pref;
        if (t.deadline && S.deadlineMs(t.deadline) <= day.day) after.deadline = T.dateKey(day.day);
        what2 = T.fmtDay(day.day, now).toLowerCase() + (what2 ? " " + what2 : "");
      } else if (slotM) {
        const info = plan.info[t.id];
        const base = info && info.start ? T.startOfDay(info.start) : T.startOfDay(now);
        if (base > T.startOfDay(now)) after.notBefore = T.dateKey(base);
      }
      if (timeM) {
        let h = +timeM[1];
        if (h >= 1 && h <= 7 && !/^0/.test(timeM[1]) && !/mattin/.test(d)) h += 12;
        const base = day ? day.day : T.startOfDay((plan.info[t.id] && plan.info[t.id].start) || now);
        after.pinnedStart = T.toISO(T.atMin(base, h * 60 + (timeM[2] ? +timeM[2] : 0)));
        what2 = fmtWhen(T.fromISO(after.pinnedStart), now) + " (orario fisso)";
      }
      if (delta && !timeM && !day && !slotM) {
        const info = plan.info[t.id];
        const base = info && info.start ? info.start : now;
        after.notBefore = T.toISO(T.ceilTo(base + (back ? -delta : delta) * MIN, 5));
        what2 = (back ? "prima" : "più tardi") + " di " + T.fmtDur(delta);
      }
      if (!Object.keys(after).length) return { text: "Quando vuoi spostare «" + t.title + "»? Ad esempio: «al pomeriggio», «a domani», «alle 16»." };
      if ((after.pref || after.notBefore) && t.snoozeUntil) after.snoozeUntil = null;
      if ((after.pref || after.notBefore) && !timeM && t.pinnedStart) after.pinnedStart = null;
      return {
        text: "Propongo di spostare «" + t.title + "» " + what2 + ". Ti mostro qui sotto come cambia il programma." +
          (after.deadline ? "\nLa scadenza era prima, quindi la sposterei anche quella: controlla nell'anteprima." : ""),
        ops: [PR.op(state, "update_task", { targetId: t.id, after })],
        summary: "Spostare «" + t.title + "» " + what2, reason: "Lo hai chiesto tu.",
      };
    }
    return { text: "Non ho trovato «" + what.trim() + "» tra le attività o gli appuntamenti." + listHint(state, plan, now) };
  }

  function organize(state, plan, now, dayWord) {
    const dd = P.parseDate(dayWord, now) || { day: T.startOfDay(now) };
    const d = dd.day, de = T.addDays(d, 1);
    const bl = plan.blocks.filter((b) => (b.kind === "task" || b.kind === "event") && b.start < de && b.end > Math.max(d, now));
    const allDay = plan.blocks.filter((b) => b.kind === "allday" && b.start < de && b.end > d);
    const h = state.settings.hours[new Date(d).getDay()];
    const label = T.fmtDay(d, now);
    if (!bl.length && !allDay.length) return { text: label + " non hai niente in programma" + (h && h.on ? "" : " (è un giorno libero nelle tue impostazioni)") + ". Vuoi aggiungere qualcosa?" };
    const taskMin = bl.filter((b) => b.kind === "task").reduce((a, b) => a + (b.end - b.start) / MIN, 0);
    const evCount = new Set(bl.filter((b) => b.kind === "event").map((b) => b.id)).size;
    const warns = plan.warnings.filter((w) => w.type === "overloaded" ? w.day === T.dateKey(d) : w.type !== "conflict" || true).slice(0, 4);
    const tops = bl.filter((b) => b.kind === "task").map((b) => b.taskId).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
      .map((id) => ({ t: state.tasks.find((x) => x.id === id), i: plan.info[id] || {} })).filter((x) => x.t);
    let text = "Ecco " + (T.dateKey(d) === T.dateKey(now) ? "il resto della giornata" : "il programma di " + label.toLowerCase()) + ": " +
      evCount + " appuntament" + (evCount === 1 ? "o" : "i") + " e " + T.fmtDur(taskMin || 0) + " di attività" +
      (h && h.on ? ", con un margine per gli imprevisti." : ".");
    if (allDay.length) text += "\nTutto il giorno: " + allDay.map((b) => "«" + b.title + "»").join(", ") + ".";
    if (tops.length) text += "\nScelte principali: " + tops.map((x) => "«" + x.t.title + "» " + T.fmtHM(x.i.start) + (x.i.reasons && x.i.reasons.length ? " (" + x.i.reasons[0] + ")" : "")).join("; ") + ".";
    if (warns.length) text += "\n⚠︎ " + warns.map((w) => w.text).join("\n⚠︎ ");
    text += "\nGli orari delle attività sono suggerimenti: si aggiornano da soli se qualcosa cambia.";
    return { text, dayPlan: T.dateKey(d) };
  }

  // ---------- aggiunta di una o più cose ----------
  const PREFIX = /^(?:(?:per favore|perfavore|puoi|potresti|vorrei|mi serve)\s+)?(?:aggiung(?:i|ere|imi)|inserisci|metti(?:mi)?|segna(?:mi)?|crea|programma|pianifica)?\s*(?:anche\s+)?/i;
  const REMINDER = /\b(?:un\s+)?(?:promemoria|ricordami|ricordarmi|reminder)\s*(?:per|di|:)?\s*/i;
  const LEAD = /^(?:(?:e|poi|anche|inoltre|dopo|quindi)\s+)*(?:(?:io\s+)?(?:ho|avrei|c'è|ce|devo|dovrei|voglio|vorrei|tocca|bisogna)\s+(?:anche\s+)?(?:da\s+)?)?/i;

  function splitClauses(text) {
    const parts = text.split(/\s*(?:[;\n]|,(?!\d)|\.(?=\s|$))\s*/).filter((x) => x && x.trim());
    const out = [];
    for (const p of parts) {
      // " e " separa due cose solo se dopo c'è un verbo o un impegno
      const sub = p.split(/\s+e\s+(?=(?:poi\s+|anche\s+|dopo\s+)?(?:devo\s+|ho\s+|dovrei\s+|voglio\s+)?(?:[a-zàèéìòù']+(?:are|ere|ire|arsi|ersi|irsi)\b|riunione|appuntamento|palestra|spesa|lezione|visita|cena|pranzo|call)\b)/i);
      out.push(...sub);
    }
    return out.map((x) => x.trim()).filter((x) => x.length > 1);
  }

  function add(state, plan, now, raw, opts) {
    let text = raw.replace(/[.!]+$/, "");
    const wantsOrganize = /(ri)?organizza(mi)?\s+(il resto|la giornata|tutto|la mattina|il pomeriggio)/i.test(text);
    text = text.replace(/[.,]?\s*(e\s+)?(ri)?organizza(mi)?\s+(il resto|la giornata|tutto|la mattina|il pomeriggio).*$/i, "");
    const isReminder = REMINDER.test(text);
    text = text.replace(PREFIX, "").replace(REMINDER, "");
    const dayInMsg = text.match(DAY_RE);
    const clauses = splitClauses(text);
    const ops = [], lines = [], estimates = [];
    // Creare promemoria Apple: per ora solo nella demo (nella versione reale la lettura è attiva, la scrittura arriverà)
    const remindersOn = !!(state.integrations && state.integrations.reminders === "demo");
    for (let c of clauses) {
      c = c.replace(LEAD, "").replace(/^(un|una|uno|il|la|lo)\s+(?=riunione|appuntamento|incontro|call|lezione|visita|cena|pranzo)/i, "");
      if (!c || c.length < 2) continue;
      if (dayInMsg && !DAY_RE.test(c)) c = c + " " + dayInMsg[1];
      const r = P.parse(c, now);
      r.title = cap(r.title.replace(LEAD, "").trim());
      if (!r.title || r.title.length < 2) continue;
      if (r.kind === "event") {
        // C'è già un appuntamento simile a quell'ora? Allora è lo stesso: non lo duplico
        const s0 = T.fromISO(r.start);
        const dup = upcomingEvents(state, now).find((o) => Math.abs(o.start - s0) < 31 * MIN && (score(r.title, o.title) > 0 || o.start === s0));
        if (dup) { lines.push("📅 " + r.title + " — c'è già «" + dup.title + "» " + fmtWhen(dup.start, now) + ": considero quello"); continue; }
        const explicitDur = r.recognized.includes("durata") || /dalle/.test(norm(c));
        let end = r.end;
        if (!explicitDur) {
          const est = estimate(r.title);
          end = T.toISO(T.fromISO(r.start) + est * MIN);
          if (est !== 60) estimates.push("«" + r.title + "»: " + T.fmtDur(est));
          else estimates.push("«" + r.title + "»: 1 h");
        }
        const after = { title: r.title, start: r.start, end, repeat: r.repeat || "none", area: G.areas.guess(r.title) };
        if (r.repeat === "days") after.days = r.days;
        ops.push(PR.op(state, "create_event", { after }));
        lines.push("📅 " + r.title + " — " + fmtWhen(T.fromISO(r.start), now) + "–" + T.fmtHM(T.fromISO(end)) + (r.repeat ? " (si ripete)" : ""));
      } else {
        // Esiste già un'attività aperta con lo stesso nome? Non la duplico
        const twin = state.tasks.find((t) => !t.done && norm(t.title) === norm(r.title));
        if (twin) {
          const ti = plan.info[twin.id] || {};
          lines.push("✓ " + r.title + " — c'è già" + (ti.start ? " (suggerita " + fmtWhen(ti.start, now) + ")" : "") + ": non la duplico. Per spostarla scrivi «sposta " + twin.title.toLowerCase() + " a …»");
          continue;
        }
        const explicitDur = r.recognized.includes("durata");
        const dur = explicitDur ? r.duration : estimate(r.title);
        if (!explicitDur) estimates.push("«" + r.title + "»: " + T.fmtDur(dur));
        const after = { title: r.title, duration: dur, remaining: dur, priority: r.priority, deadline: r.deadline || null,
          notBefore: r.notBefore || null, pref: r.pref || null, splittable: dur > 30, area: G.areas.guess(r.title) };
        if (isReminder && remindersOn) after.source = "apple-reminders";
        ops.push(PR.op(state, "create_task", { after }));
        const bits = [T.fmtDur(dur)];
        if (r.notBefore) bits.push(T.fmtDay(T.fromISO(r.notBefore), now).toLowerCase());
        else if (r.deadline) bits.push("entro " + T.fmtDay(S.deadlineMs(r.deadline) - 1, now).toLowerCase());
        if (r.pref) bits.push({ morning: "mattina", afternoon: "pomeriggio", evening: "sera" }[r.pref]);
        if (r.priority === 1) bits.push("priorità alta");
        lines.push((after.source === "apple-reminders" ? "🔔 " : "✓ ") + r.title + " — " + bits.join(", "));
      }
    }
    if (!ops.length && lines.length) {
      return { text: "Ecco cosa ho capito:\n" + lines.join("\n") + "\nNon c'è niente di nuovo da aggiungere." + (wantsOrganize ? "\n" + organize(state, plan, now, "oggi").text : "") };
    }
    if (!ops.length) {
      return { text: "Non sono sicuro di aver capito. Vuoi aggiungere un'attività o un appuntamento? Prova ad esempio: «Dentista venerdì alle 15» o «Studiare 2 ore domani mattina».", suggestions: ["Aiuto"] };
    }
    const reminderNote = isReminder ? (remindersOn ? "\nLo creerò come promemoria in Apple Promemoria" + (state.integrations.reminders === "demo" ? " (demo)" : "") + ", solo dopo la tua conferma. Non lo trasformo in un appuntamento: l'orario nel programma è solo un suggerimento."
      : "\nLo aggiungo come attività di Daily Schedule" + (state.integrations && state.integrations.reminders === "connected" ? " (creare promemoria Apple da qui arriverà in un prossimo aggiornamento)." : ": Apple Promemoria non è collegato.")) : "";
    return {
      text: "Ecco cosa ho capito:\n" + lines.join("\n") +
        (estimates.length ? "\nDurate stimate da me (puoi cambiarle): " + estimates.join(", ") + "." : "") + reminderNote +
        (wantsOrganize ? "\nHo organizzato il resto della giornata attorno a questi impegni: guarda l'anteprima." : "\nQui sotto vedi dove li metterei."),
      ops,
      summary: ops.length === 1 ? "Aggiungere " + (ops[0].type === "create_event" ? "l'appuntamento" : isReminder ? "il promemoria" : "l'attività") + " «" + ops[0].after.title + "»" : "Aggiungere " + ops.length + " elementi",
      reason: "Richiesta: «" + raw + "»",
    };
  }

  G.assistant = { respond, estimate, splitClauses, findTask, findEvent };
})(globalThis.G || (globalThis.G = {}));
