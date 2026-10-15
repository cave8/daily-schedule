// Sincronizzazione Mac ↔ iPhone tramite Supabase (piano gratuito).
// - Ogni elemento (attività, appuntamento, routine, impostazioni...) è una riga sul server.
// - Si inviano solo gli elementi cambiati rispetto all'ultima sincronizzazione ("base").
// - Se lo stesso elemento cambia su due dispositivi, vince la modifica più recente (lo decide il server).
// - La prima volta su un dispositivo si SCARICA prima di inviare, così un dispositivo nuovo
//   non sovrascrive i dati buoni con quelli vuoti.
// - Dati solo locali (non sincronizzati): programma calcolato, chat, proposte, timer, collegamenti Apple del Mac.
(function (G) {
  "use strict";
  const CFG = {
    url: "https://coowxtbczkdjdhtvvaak.supabase.co",
    key: "sb_publishable_6h_1drgtcx4OuVFXRGrbLQ_i8U1wKl4", // chiave pubblica: la sicurezza è nelle regole del database
  };
  const META_KEY = "dailyschedule.sync";
  const SEP = "\u001f";

  // Liste di elementi con id, mappe chiave → valore, documenti singoli
  const LISTS = { task: "tasks", event: "events", routine: "routines" };
  const MAPS = { hidden: "hidden", skip: "routineSkips", ack: "ackWarnings", rlog: "routineLog", daily: "daily" };
  const SINGLES = ["settings", "profile", "apple"];

  // ---------- memoria locale della sincronizzazione ----------
  let fetchFn = (typeof fetch !== "undefined") ? fetch.bind(globalThis) : null;
  let store = (typeof localStorage !== "undefined") ? localStorage : null;
  function loadMeta() {
    try { return JSON.parse((store && store.getItem(META_KEY)) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) { try { store && store.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* niente */ } }
  function deviceName() {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    return /iPhone|iPad/.test(ua) ? "iphone" : /Macintosh/.test(ua) ? "mac" : "altro";
  }

  // ---------- istantanea dei dati da sincronizzare ----------
  function appleDoc(state) {
    const i = state.integrations || {};
    if (i.calendar !== "connected" && i.reminders !== "connected") return null; // solo il Mac collegato lo scrive
    const a = state.appleSync || {};
    return { at: a.at || null, events: a.events, reminders: a.reminders, calendar: i.calendar === "connected", remindersOn: i.reminders === "connected" };
  }

  function snapshot(state) {
    const snap = {};
    for (const kind of Object.keys(LISTS)) {
      for (const it of state[LISTS[kind]] || []) if (it && it.id) snap[kind + SEP + it.id] = JSON.stringify(it);
    }
    for (const kind of Object.keys(MAPS)) {
      const m = state[MAPS[kind]] || {};
      for (const k of Object.keys(m)) snap[kind + SEP + k] = JSON.stringify(m[k]);
    }
    snap["settings" + SEP + "main"] = JSON.stringify(state.settings || {});
    snap["profile" + SEP + "main"] = JSON.stringify(state.profile || {});
    const ap = appleDoc(state);
    if (ap) snap["apple" + SEP + "main"] = JSON.stringify(ap);
    return snap;
  }

  const kindOf = (key) => key.slice(0, key.indexOf(SEP));
  const idOf = (key) => key.slice(key.indexOf(SEP) + 1);
  const deletable = (kind) => !!(LISTS[kind] || MAPS[kind]);

  // Cosa inviare: elementi nuovi o cambiati, ed eliminati
  function diff(state, base, now) {
    const cur = snapshot(state);
    const items = [];
    for (const key of Object.keys(cur)) {
      if (base[key] !== cur[key]) items.push({ kind: kindOf(key), id: idOf(key), data: JSON.parse(cur[key]), deleted: false, updated_at: now });
    }
    for (const key of Object.keys(base)) {
      if (!(key in cur) && base[key] != null && deletable(kindOf(key))) items.push({ kind: kindOf(key), id: idOf(key), deleted: true, updated_at: now });
    }
    return { cur, items };
  }

  // Applica una riga arrivata dal server allo stato
  function applyRow(state, row) {
    const kind = row.kind, id = row.id;
    if (LISTS[kind]) {
      const list = state[LISTS[kind]] = state[LISTS[kind]] || [];
      const i = list.findIndex((x) => x.id === id);
      if (row.deleted || row.data == null) { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = row.data;
      else list.push(row.data);
    } else if (MAPS[kind]) {
      const m = state[MAPS[kind]] = state[MAPS[kind]] || {};
      if (row.deleted || row.data == null) delete m[id]; else m[id] = row.data;
    } else if (kind === "settings" && row.data) {
      state.settings = G.scheduler.mergeSettings(row.data);
    } else if (kind === "profile" && row.data) {
      state.profile = Object.assign({ name: "" }, row.data);
    } else if (kind === "apple" && row.data) {
      state.appleRemote = Object.assign({}, row.data, { device: row.device || null });
    }
  }

  // Applica le righe del server, tranne quelle che il dispositivo ha cambiato e non ancora inviato
  function applyRows(state, meta, rows, pendingKeys) {
    let changed = false;
    for (const row of rows) {
      const key = row.kind + SEP + row.id;
      if (pendingKeys && pendingKeys.has(key)) continue;
      applyRow(state, row);
      changed = true;
    }
    // la nuova base è lo stato dopo l'applicazione (così le righe ricevute non vengono rimandate indietro)
    const cur = snapshot(state);
    for (const row of rows) {
      const key = row.kind + SEP + row.id;
      if (pendingKeys && pendingKeys.has(key)) continue;
      if (row.deleted || row.data == null) delete meta.base[key];
      else if (key in cur) meta.base[key] = cur[key];
    }
    return changed;
  }

  // ---------- rete ----------
  async function http(path, opts) {
    if (!fetchFn) throw new Error("rete non disponibile");
    const res = await fetchFn(CFG.url + path, opts);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const msg = (body && (body.msg || body.error_description || body.error || body.message)) || ("errore " + res.status);
      const err = new Error(typeof msg === "string" ? msg : "errore " + res.status);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function sessionFrom(body, email) {
    return { access_token: body.access_token, refresh_token: body.refresh_token,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000, email: (body.user && body.user.email) || email, user_id: body.user && body.user.id };
  }

  async function signIn(email, password) {
    const body = await http("/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: CFG.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email).trim().toLowerCase(), password }),
    });
    const meta = loadMeta();
    // se è un altro account, si riparte da zero (niente base vecchia)
    if (meta.session && meta.session.user_id && body.user && meta.session.user_id !== body.user.id) { meta.base = {}; meta.lastServerAt = null; }
    meta.session = sessionFrom(body, email);
    meta.base = meta.base || {};
    saveMeta(meta);
    return meta.session;
  }

  async function signUp(email, password) {
    await http("/functions/v1/ds-account", {
      method: "POST", headers: { apikey: CFG.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return signIn(email, password);
  }

  async function token() {
    const meta = loadMeta();
    const s = meta.session;
    if (!s) throw new Error("non collegato");
    if (s.expires_at - 60000 > Date.now()) return s.access_token;
    try {
      const body = await http("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: { apikey: CFG.key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      meta.session = sessionFrom(body, s.email);
      saveMeta(meta);
      return meta.session.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { meta.session = null; saveMeta(meta); e.message = "Accesso scaduto: accedi di nuovo"; }
      throw e;
    }
  }

  async function rest(path, opts) {
    const t = await token();
    opts = opts || {};
    opts.headers = Object.assign({ apikey: CFG.key, Authorization: "Bearer " + t, "Content-Type": "application/json" }, opts.headers || {});
    return http("/rest/v1" + path, opts);
  }

  async function pullAll(meta) {
    const rows = [];
    let since = meta.lastServerAt;
    for (let page = 0; page < 50; page++) {
      const q = "/sync_items?select=kind,id,data,deleted,updated_at,device,server_at&order=server_at.asc&limit=1000" +
        (since ? "&server_at=gt." + encodeURIComponent(since) : "");
      const batch = await rest(q, { method: "GET" });
      rows.push(...batch);
      if (batch.length) since = batch[batch.length - 1].server_at;
      if (batch.length < 1000) break;
    }
    return { rows, since };
  }

  let running = null;
  // Sincronizza: scarica le novità e invia le modifiche. Restituisce { changed } se lo stato è cambiato.
  function sync(state) {
    if (running) return running;
    running = (async () => {
      const meta = loadMeta();
      if (!meta.session) return { changed: false, skipped: true };
      meta.base = meta.base || {};
      let changed = false;
      const first = !meta.lastServerAt;
      // 1. cosa ho cambiato qui
      let d = diff(state, meta.base, Date.now());
      const pending = new Set(d.items.map((x) => x.kind + SEP + x.id));
      // 2. scarico le novità (la prima volta: tutto, e i dati del server vincono su quelli di questo dispositivo)
      const pulled = await pullAll(meta);
      if (first) {
        // elementi che il server ha già: prendo quelli del server
        for (const row of pulled.rows) pending.delete(row.kind + SEP + row.id);
      }
      if (pulled.rows.length) changed = applyRows(state, meta, pulled.rows, pending) || changed;
      if (pulled.since) meta.lastServerAt = pulled.since;
      // 3. invio le mie modifiche (ricalcolate dopo l'applicazione)
      d = diff(state, meta.base, Date.now());
      if (d.items.length) {
        for (let i = 0; i < d.items.length; i += 500) {
          const chunk = d.items.slice(i, i + 500);
          const newer = await rest("/rpc/sync_push", { method: "POST", body: JSON.stringify({ items: chunk, device: deviceName() }) });
          for (const it of chunk) {
            const key = it.kind + SEP + it.id;
            if (it.deleted) delete meta.base[key]; else meta.base[key] = d.cur[key];
          }
          if (Array.isArray(newer) && newer.length) changed = applyRows(state, meta, newer, null) || changed;
        }
      }
      if (!meta.lastServerAt) meta.lastServerAt = new Date(0).toISOString();
      meta.lastSync = Date.now();
      meta.error = null;
      saveMeta(meta);
      return { changed, pushed: d.items.length, pulled: pulled.rows.length };
    })().catch((e) => {
      const meta = loadMeta();
      meta.error = e.message || String(e);
      meta.lastError = Date.now();
      saveMeta(meta);
      throw e;
    }).finally(() => { running = null; });
    return running;
  }

  function signOut() {
    const meta = loadMeta();
    const t = meta.session && meta.session.access_token;
    if (t && fetchFn) fetchFn(CFG.url + "/auth/v1/logout", { method: "POST", headers: { apikey: CFG.key, Authorization: "Bearer " + t } }).catch(() => {});
    saveMeta({});
  }

  function status() {
    const m = loadMeta();
    return { signedIn: !!m.session, email: m.session && m.session.email, lastSync: m.lastSync || null, error: m.error || null };
  }

  G.sync = {
    signIn, signUp, signOut, sync, status, snapshot, diff, applyRow, applyRows,
    _setFetch: (f) => { fetchFn = f; }, _setStore: (s) => { store = s; }, SEP,
  };
})(globalThis.G || (globalThis.G = {}));
