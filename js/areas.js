// Aree della vita: ogni attività, appuntamento o routine può appartenere a un'area,
// che le dà un colore e permette di vedere come si distribuisce il tempo.
(function (G) {
  "use strict";

  const AREAS = [
    { id: "lavoro", label: "Lavoro", color: "#2563eb" },
    { id: "studio", label: "Studio", color: "#0891b2" },
    { id: "sport", label: "Sport", color: "#059669" },
    { id: "personale", label: "Personale", color: "#db2777" },
    { id: "casa", label: "Casa", color: "#d97706" },
  ];

  const RULES = [
    ["sport", /palestra|allenament|corsa|correre|nuoto|yoga|sport|calcetto|bici|pilates|stretching|passeggiata|camminata/],
    ["studio", /studi|esame|ripass|lezione|corso|compiti|leggere|libro|universit|tesi/],
    ["casa", /spesa|pulizi|pulire|lavatrice|stirare|casa|bolletta|cucinare|cena|riordinare|bucato|condominio/],
    ["lavoro", /riunione|meeting|call|cliente|report|presentazion|preventiv|progett|email|e-mail|posta|ufficio|lavor|fattur|commercialista/],
    ["personale", /dentista|medico|visita|amic|compleanno|famiglia|meditazion|aperitivo|parrucchiere|pianificare/],
  ];

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function guess(title) {
    const n = norm(title);
    for (const [id, re] of RULES) if (re.test(n)) return id;
    return null;
  }

  function get(id) { return AREAS.find((a) => a.id === id) || null; }
  function color(id) { const a = get(id); return a ? a.color : null; }

  G.areas = { AREAS, guess, get, color };
})(globalThis.G || (globalThis.G = {}));
