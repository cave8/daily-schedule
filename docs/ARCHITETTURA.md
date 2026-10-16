# Daily Schedule — Architettura

## Stato di partenza (analisi del 15/10/2026)
- Esisteva già una prima versione funzionante (ex "Giornata"): web app installabile
  in JavaScript semplice, senza dipendenze, con motore di pianificazione testato
  (49 test) e interfaccia testata in simulazione (30 prove).
- Sul Mac: **niente Node.js**, Python 3 presente, **Swift 6.1** (Command Line Tools,
  senza Xcode). Già in uso altrove: GitHub (account cave8), Netlify, Supabase.

## Decisioni (e perché)

| Parte | Scelta | Motivo |
|---|---|---|
| App web (Mac + iPhone) | PWA in JavaScript semplice, senza build | Funziona già, si testa senza installare nulla, nessuna dipendenza da aggiornare. Next.js + TypeScript aggiungerebbero Node, npm e una fase di build senza un beneficio concreto oggi. Si potrà migrare se il codice crescerà molto. |
| Backend + database + login | **Supabase**, piano gratuito (Postgres con regole RLS per utente, Auth) | Gratuito per uso personale, già usato per Dibs, HTTPS incluso, nessun server da gestire. |
| Assistente | Interprete locale in italiano (`js/assistant.js`), nessuna IA a pagamento | Scelta dell'utente (15/10/2026): niente servizi a pagamento. Gratis, privato (nessun dato inviato), prevedibile. Produce **solo proposte** e non può scrivere i dati. |
| Apple Calendar e Promemoria | **Daily Schedule per Mac** (`mac/`): app nativa Swift + EventKit che mostra l'app web in una finestra e le passa i dati Apple tramite un ponte interno (WKWebView) | Il browser non può leggere i dati Apple. Il ponte risponde solo alla nostra pagina, non apre porte di rete, e in questa versione è in **sola lettura**. Con la sincronizzazione (fase 7) i dati arriveranno anche all'iPhone. |
| iPhone | La stessa PWA | Vede gli eventi Apple tramite l'istantanea che il Mac carica su Supabase. Calendario e Promemoria si sincronizzano già tra i dispositivi via iCloud. |

Semplificazione rispetto alla proposta iniziale: niente server "nostro" separato.
Il backend è Supabase (database, login, funzioni), quindi una cosa in meno da mantenere.

## Schema

```
 iPhone / Mac (browser)                 Supabase (cloud)                    Mac
┌──────────────────────┐   HTTPS   ┌──────────────────────────┐  HTTPS  ┌──────────────────────┐
│ PWA Daily Schedule   │◄────────►│ Auth  · Postgres (RLS)    │◄───────│ Companion SwiftUI    │
│ - pianificatore      │          │ tabelle: tasks, settings, │ (solo  │ - EventKit: legge     │
│ - proposte/conferme  │          │ apple_snapshot, proposals,│ uscita)│   Calendario/Promem.  │
│ - funziona offline   │          │ operations                │        │ - esegue SOLO operaz. │
└──────────────────────┘          │ Edge Function "assistant" │        │   confermate          │
                                  │   └─► Claude (chiave qui) │        └──────────────────────┘
                                  └──────────────────────────┘
```

## Il percorso di una modifica (regola assoluta)

1. Una richiesta (chat o pulsante) produce una **proposta**: elenco di operazioni,
   ciascuna con lo stato "prima" e "dopo" dell'elemento.
2. Il livello applicativo (`js/proposals.js`) **valida** la proposta, calcola
   l'**anteprima** (cosa cambia, cosa resta uguale, conflitti) e le dà un'**impronta** (hash).
3. L'utente vede l'anteprima e sceglie **Conferma / Modifica / Annulla**.
4. La conferma è legata all'impronta: se la proposta cambia, ne serve una nuova.
5. Prima di eseguire si ricontrolla che ogni elemento non sia cambiato nel frattempo
   (confronto con lo stato "prima"). Se è cambiato ci si ferma e lo si dice.
6. Si eseguono solo le operazioni confermate, poi si **verifica** il risultato.
7. Per gli elementi Apple (fase 6) l'esecuzione la fa il companion Mac: scrive in
   EventKit, rilegge l'elemento e conferma l'esito. Ogni operazione ha una
   **chiave di idempotenza**, così non si creano doppioni.
8. **Nessuna eliminazione** di elementi Apple nella prima versione.

Le attività interne di Daily Schedule seguono regole più leggere: le crei o le
completi direttamente dall'app, con la possibilità di annullare.

## Provenienza dei dati

Ogni elemento ha una `source`:
- `internal`: creato in Daily Schedule.
- `apple-calendar`: evento di Apple Calendar (con `externalId` e `externalModified`).
- `apple-reminders`: promemoria di Apple (con `externalId` e `externalModified`).

Gli orari che il pianificatore assegna alle attività sono **suggerimenti**: non
vengono mai scritti come eventi in Calendario senza una proposta confermata.

## Dati dimostrativi

La modalità demo usa uno spazio di archiviazione separato (`dailyschedule.demo`)
e mostra sempre un'etichetta "DATI DIMOSTRATIVI". Gli elementi "Apple" della demo
sono finti e non toccano i dati reali.

## Costi
Nessuno. Niente API a pagamento. Servizi previsti, tutti con piano gratuito: GitHub (codice), Netlify (pubblicazione), Supabase (sincronizzazione, fase 7).

## Daily Schedule per Mac (fase 5)
- Codice: `mac/Sources/main.swift`; si costruisce con `mac/build.sh` (solo strumenti già presenti nel Mac, nessun Xcode) e si installa in `~/Applications`.
- Il ponte (`window.webkit.messageHandlers.apple`) offre solo: `status`, `requestAccess`, `fetch`. Ogni altra richiesta viene rifiutata.
- Il ponte risponde solo a pagine di `daily-schedules.netlify.app` (o `localhost` per le prove).
- La pagina (`js/apple.js`) fonde i dati: gli identificativi Apple sono stabili (`ac:` eventi, `ar:` promemoria), quindi niente doppioni; area, durata stimata, passi e spostamenti aggiunti in Daily Schedule restano.
- Quando cambia qualcosa in Calendario o Promemoria, macOS lo segnala e il programma si aggiorna da solo.
- Autoverifica senza finestra: `DS_URL=http://localhost:8080/ "~/Applications/Daily Schedule.app/Contents/MacOS/DailySchedule" --selftest`.

## Completare i promemoria (versione 0.10)
- Spuntare un promemoria Apple in Daily Schedule è un'azione esplicita dell'utente su QUEL promemoria: vale come conferma
  per quella singola operazione (decisione dell'utente, 16/10/2026). Le proposte dell'assistente restano con anteprima e conferma.
- Unica scrittura permessa all'app per Mac: `completeReminder` (completa o riapre un promemoria). Dopo il salvataggio rilegge
  il promemoria per verificare. Niente creazione, modifica o eliminazione di eventi e promemoria.
- Dall'iPhone la spunta viene sincronizzata; il Mac la esegue appena è acceso (`appleComplete: "pending"` → `"done"`).
- Firma dell'app per Mac: certificato locale fisso (`mac/setup-signing.sh`, portachiavi separato) così macOS ricorda i permessi tra un aggiornamento e l'altro.
