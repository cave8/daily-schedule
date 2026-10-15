# Supabase (progetto "cave8's Project", eu-west-2, piano gratuito)

- `migrations/20261016_daily_schedule_sync_v1.sql`: tabella `sync_items` (RLS: ogni utente vede solo i suoi dati) e funzione `sync_push` (vince la modifica più recente).
- `functions/ds-account`: crea l'account già confermato. App personale: dopo il primo account confermato rifiuta nuove registrazioni.

Applicati con gli strumenti Supabase il 16/10/2026. Verifiche fatte sul server: utenti separati, anonimi senza accesso, conflitti risolti dal più recente.
