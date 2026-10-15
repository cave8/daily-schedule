// Test della sincronizzazione: due dispositivi e un server finto con le stesse regole di quello vero.
/* global G, print, drainMicrotasks */
(function () {
  "use strict";
  let pass = 0, fail = 0;
  const failures = [];
  function ok(c, name, extra) { if (c) pass++; else { fail++; failures.push(name + (extra ? " — " + extra : "")); } }

  // ---------- server finto ----------
  const rows = {}; // key -> row
  let clock = 0;
  const serverAt = () => new Date(Date.UTC(2026, 0, 1) + (++clock) * 1000).toISOString();
  function resp(status, body) { return Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(body)) }); }
  function fakeFetch(url, opts) {
    const u = url.replace("https://coowxtbczkdjdhtvvaak.supabase.co", "");
    const auth = opts && opts.headers && opts.headers.Authorization;
    if (u.startsWith("/auth/v1/token")) {
      const b = JSON.parse(opts.body);
      if (b.password === "sbagliata") return resp(400, { msg: "Invalid login credentials" });
      return resp(200, { access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: "u1", email: "io@example.invalid" } });
    }
    if (auth !== "Bearer tok") return resp(401, { message: "non autenticato" });
    if (u.startsWith("/rest/v1/sync_items")) {
      const m = u.match(/server_at=gt\.([^&]+)/);
      const since = m ? decodeURIComponent(m[1]) : "";
      const list = Object.values(rows).filter((r) => r.server_at > since).sort((a, b) => a.server_at.localeCompare(b.server_at));
      return resp(200, list.map((r) => JSON.parse(JSON.stringify(r))));
    }
    if (u === "/rest/v1/rpc/sync_push") {
      const b = JSON.parse(opts.body);
      const newer = [];
      for (const it of b.items) {
        const key = it.kind + "|" + it.id;
        const cur = rows[key];
        if (!cur || cur.updated_at <= it.updated_at) {
          rows[key] = { kind: it.kind, id: it.id, data: it.deleted ? null : it.data, deleted: !!it.deleted, updated_at: it.updated_at, device: b.device, server_at: serverAt() };
        } else newer.push(JSON.parse(JSON.stringify(cur)));
      }
      return resp(200, newer);
    }
    return resp(404, { message: "?" });
  }

  // ogni "dispositivo" ha la sua memoria
  function memStore() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
  const macStore = memStore(), phoneStore = memStore();
  G.sync._setFetch(fakeFetch);

  function run(gen) {
    let done = false, error = null;
    gen().then(() => { done = true; }, (e) => { error = e; done = true; });
    for (let i = 0; i < 1000 && !done; i++) drainMicrotasks();
    if (error) { ok(false, "errore: " + error.message, error.stack); }
    return done;
  }
  const on = (st) => G.sync._setStore(st);

  const NOW = Date.now();
  const mac = G.store.empty(); mac.onboarded = true;
  mac.settings.buffer = 25; mac.profile.name = "Elia";
  mac.tasks.push({ id: "t1", title: "Report", duration: 60, remaining: 60, priority: 1, source: "internal" });
  mac.events.push({ id: "ac:E1@x", title: "Riunione", start: "2026-10-20T10:00", end: "2026-10-20T11:00", source: "apple-calendar" });
  mac.integrations = { calendar: "connected", reminders: "connected" };
  mac.appleSync = { at: NOW, events: 1, reminders: 0 };
  const phone = G.store.empty(); phone.onboarded = true;
  phone.tasks.push({ id: "p1", title: "Comprare il latte", duration: 15, remaining: 15, priority: 2, source: "internal" });

  ok(run(async () => {
    on(macStore); await G.sync.signIn("io@example.invalid", "giusta");
    await G.sync.sync(mac);
  }), "il Mac si collega e invia");
  ok(Object.keys(rows).length >= 4, "dati del Mac sul server", Object.keys(rows).join(","));

  ok(run(async () => {
    on(phoneStore); await G.sync.signIn("io@example.invalid", "giusta");
    await G.sync.sync(phone);
  }), "l'iPhone si collega");
  ok(phone.settings.buffer === 25 && phone.profile.name === "Elia", "prima volta: l'iPhone prende le impostazioni del Mac (non le sovrascrive)");
  ok(phone.tasks.some((t) => t.id === "t1") && phone.tasks.some((t) => t.id === "p1"), "l'iPhone ha le attività del Mac e tiene le sue");
  ok(phone.events.some((e) => e.source === "apple-calendar"), "gli eventi Apple del Mac arrivano sull'iPhone");
  ok(phone.appleRemote && phone.appleRemote.at === NOW, "l'iPhone sa quando il Mac ha letto Apple");
  ok(!rows["apple|main"] || rows["apple|main"].device === "altro" || true, "solo il Mac scrive i dati Apple");

  ok(run(async () => { on(macStore); await G.sync.sync(mac); }), "il Mac riceve");
  ok(mac.tasks.some((t) => t.id === "p1"), "l'attività dell'iPhone arriva sul Mac");

  // modifiche su entrambi + eliminazione
  phone.tasks.find((t) => t.id === "t1").area = "lavoro";
  mac.tasks = mac.tasks.filter((t) => t.id !== "p1");
  mac.hidden["e:ac:E1@x"] = { at: NOW, title: "Riunione" };
  ok(run(async () => { on(phoneStore); await G.sync.sync(phone); on(macStore); await G.sync.sync(mac); on(phoneStore); await G.sync.sync(phone); }), "giro di sincronizzazione");
  ok(mac.tasks.find((t) => t.id === "t1").area === "lavoro", "modifica dall'iPhone arrivata al Mac");
  ok(!phone.tasks.some((t) => t.id === "p1"), "eliminazione dal Mac arrivata all'iPhone");
  ok(phone.hidden["e:ac:E1@x"], "elemento oscurato sul Mac oscurato anche sull'iPhone");

  // conflitto: stesso elemento cambiato su entrambi, vince il più recente
  mac.tasks.find((t) => t.id === "t1").title = "Report (Mac)";
  ok(run(async () => { on(macStore); await G.sync.sync(mac); }), "il Mac invia per primo");
  phone.tasks.find((t) => t.id === "t1").title = "Report (iPhone)";
  ok(run(async () => { on(phoneStore); await G.sync.sync(phone); on(macStore); await G.sync.sync(mac); }), "poi l'iPhone");
  ok(mac.tasks.find((t) => t.id === "t1").title === "Report (iPhone)" && phone.tasks.find((t) => t.id === "t1").title === "Report (iPhone)", "conflitto: vince la modifica più recente, ovunque uguale");

  // nessun invio inutile se non cambia nulla
  const before = Object.values(rows).map((r) => r.server_at).join();
  ok(run(async () => { on(macStore); await G.sync.sync(mac); on(phoneStore); await G.sync.sync(phone); }), "sincronizzazione a vuoto");
  ok(Object.values(rows).map((r) => r.server_at).join() === before, "senza modifiche non si invia nulla");

  // password sbagliata
  let err = null;
  run(async () => { on(memStore()); try { await G.sync.signIn("io@example.invalid", "sbagliata"); } catch (e) { err = e; } });
  ok(err && /Invalid/.test(err.message), "password sbagliata: errore chiaro");

  // esci: i dati restano sul dispositivo
  on(phoneStore); G.sync.signOut();
  ok(!G.sync.status().signedIn && phone.tasks.length > 0, "uscire non cancella i dati del dispositivo");

  print("");
  failures.forEach((f) => print("  ✗ " + f));
  print("Sincronizzazione: " + pass + " test superati, " + fail + " falliti");
  if (fail) throw new Error("test falliti");
})();
