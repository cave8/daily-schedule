// Daily Schedule: crea l'account (già confermato, senza email di conferma).
// È un'app personale: si può creare UN SOLO account confermato. Dopo il primo, la funzione rifiuta.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://cave8.github.io", "https://daily-schedules.netlify.app", "http://localhost:8080", "http://127.0.0.1:8080"];

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

function reply(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Metodo non permesso" });
  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch { return reply(origin, 400, { error: "Richiesta non valida" }); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return reply(origin, 400, { error: "Email non valida" });
  if (password.length < 8 || password.length > 200) return reply(origin, 400, { error: "La password deve avere almeno 8 caratteri" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (listErr) return reply(origin, 500, { error: "Errore del server, riprova" });
  // conta solo gli account confermati (quelli creati da qui): eventuali iscrizioni non confermate non bloccano
  if (list.users.some((u) => u.email_confirmed_at)) {
    return reply(origin, 409, { error: "Esiste già un account Daily Schedule: usa «Accedi» con la stessa email e password." });
  }
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return reply(origin, 400, { error: "Non riesco a creare l'account: " + error.message });
  return reply(origin, 200, { ok: true });
});
