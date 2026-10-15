// DATI DIMOSTRATIVI. Vengono creati solo nello spazio "demo" e sono sempre
// etichettati come tali. Gli elementi con source "apple-*" sono FINTI: servono a
// mostrare come appariranno Apple Calendar e Apple Promemoria dopo il collegamento.
(function (G) {
  "use strict";
  const T = G.time;

  function build(now) {
    const today = T.startOfDay(now);
    const day = (n) => T.addDays(today, n);
    const at = (n, hm) => T.toISO(T.atMin(day(n), T.hmToMin(hm)));
    const key = (n) => T.dateKey(day(n));
    const created = T.toISO(now - 86400000);
    const apple = (id) => ({ externalId: "demo-" + id, externalModified: created });
    // primo martedì/giovedì da oggi, per la palestra
    const nextWd = (wd) => { for (let i = 0; i < 7; i++) if (new Date(day(i)).getDay() === wd) return i; return 0; };

    const st = G.store.empty();
    st.onboarded = true;
    st.profile = { name: "Elia" };
    st.events = [
      Object.assign({ id: "d-e1", title: "Riunione di team", start: at(0, "10:00"), end: at(0, "11:00"), location: "Sala B", travel: 0, area: "lavoro", source: "apple-calendar", calendar: "Lavoro" }, apple("e1")),
      { id: "d-e2", area: "lavoro", title: "Call con un cliente", start: at(0, "16:00"), end: at(0, "16:30"), source: "internal" },
      Object.assign({ id: "d-e3", title: "Dentista", start: at(1, "15:00"), end: at(1, "16:00"), location: "Via Roma 12", travel: 20, area: "personale", source: "apple-calendar", calendar: "Personale" }, apple("e3")),
      Object.assign({ id: "d-e4", title: "Palestra", area: "sport", start: at(nextWd(2), "19:00"), end: at(nextWd(2), "20:00"), repeat: "weekly", source: "apple-calendar", calendar: "Personale" }, apple("e4")),
      Object.assign({ id: "d-e5", title: "Palestra", area: "sport", start: at(nextWd(4), "19:00"), end: at(nextWd(4), "20:00"), repeat: "weekly", source: "apple-calendar", calendar: "Personale" }, apple("e5")),
      Object.assign({ id: "d-e6", title: "Compleanno di Luca", start: key(2), end: key(3), allDay: true, source: "apple-calendar", calendar: "Compleanni" }, apple("e6")),
      { id: "d-e7", area: "studio", title: "Lezione di inglese", start: at(3, "11:00"), end: at(3, "12:30"), source: "internal" },
    ].map((e) => Object.assign({ repeat: "none", exceptions: [], createdAt: created }, e));
    st.tasks = [
      { id: "d-t1", title: "Preparare la presentazione", duration: 120, priority: 1, deadline: key(1), area: "lavoro",
        subtasks: [{ id: "s1", text: "Raccogliere i dati", done: true }, { id: "s2", text: "Preparare le slide", done: false }, { id: "s3", text: "Provare a voce alta", done: false }] },
      { id: "d-t2", area: "studio", title: "Studiare per l'esame", duration: 90, priority: 2, pref: "morning", deadline: key(5) },
      { id: "d-t3", area: "lavoro", title: "Rispondere alle email", duration: 30, priority: 2 },
      { id: "d-t4", area: "casa", title: "Fare la spesa", duration: 45, priority: 2, pref: "evening", deadline: key(0) },
      { id: "d-t5", area: "lavoro", title: "Chiamare il commercialista", duration: 15, priority: 2, deadline: key(2), onDay: true, source: "apple-reminders", list: "Promemoria" },
      { id: "d-t6", area: "casa", title: "Pagare la bolletta della luce", duration: 15, priority: 1, deadline: key(3), onDay: true, source: "apple-reminders", list: "Casa" },
      { id: "d-t7", title: "Rinnovare l'abbonamento dei mezzi", duration: 20, priority: 3, noAuto: true, source: "apple-reminders", list: "Promemoria" },
      { id: "d-t8", area: "sport", title: "Allenamento mattutino", duration: 30, actual: 35, priority: 2, done: true, doneAt: at(0, "07:30") },
    ].map((t) => Object.assign({ source: "internal", splittable: true, createdAt: created, done: false, remaining: t.duration },
      t.source && t.source !== "internal" ? apple(t.id) : {}, t));
    st.routines = [
      G.routines.create({ id: "d-r1", title: "Meditazione", duration: 10, pref: "morning", priority: 3 }, now),
      G.routines.create({ id: "d-r2", title: "Leggere", duration: 30, pref: "evening", priority: 3 }, now),
      G.routines.create({ id: "d-r3", title: "Controllare la posta", duration: 20, pref: "morning", days: [1, 2, 3, 4, 5], priority: 3 }, now),
    ];
    // un po' di storico, per vedere le serie
    st.routineLog = { "d-r1": [1, 2, 3, 4, 5, 6].map((i) => key(-i)), "d-r2": [1, 2, 3].map((i) => key(-i)) };
    G.routines.sync(st, now);
    st.chat = [{ role: "assistant", at: now, text: "Ciao! Questi sono DATI DIMOSTRATIVI: puoi provare tutto senza toccare niente di reale.\nProva a scrivermi «Cosa dovrei fare adesso?» oppure «Domani devo studiare due ore, andare in palestra e fare la spesa»." }];
    st.integrations = { calendar: "demo", reminders: "demo" };
    return st;
  }

  G.demo = { build };
})(globalThis.G || (globalThis.G = {}));
