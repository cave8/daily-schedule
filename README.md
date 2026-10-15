# Daily Schedule

Assistente personale che organizza la giornata, gestisce attività e appuntamenti
e riorganizza il programma quando cambia qualcosa. Ogni modifica proposta
dall'assistente (e ogni modifica a dati Apple) richiede una conferma esplicita.

- Architettura e decisioni: [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md)
- Stato delle fasi: [docs/ROADMAP.md](docs/ROADMAP.md)

## Avviare l'app sul Mac
Nel Terminale:

    cd ~/daily-schedule && python3 -m http.server 8080

poi apri http://localhost:8080 nel browser (Safari o Chrome).
Per provare con un orario finto: http://localhost:8080/?now=2026-10-15T09:00

## App per Mac (Apple Calendar e Promemoria)

    ~/daily-schedule/mac/build.sh

Installa «Daily Schedule» in ~/Applications. Aprila, vai in Impostazioni → Collegamenti Apple → Collega.
In questa versione legge soltanto: non modifica nulla in Calendario e Promemoria.

## Test automatici (nessuna installazione necessaria)

    ~/daily-schedule/tests/run.sh

- `tests/tests.js`: motore di pianificazione e interprete delle frasi
- `tests/proposals-tests.js`: proposte, conferme, concorrenza, assistente
- `tests/ui-smoke.js`: interfaccia simulata (tocchi, moduli, demo, salvataggio)

## Struttura del codice
| File | Cosa fa |
|---|---|
| `js/time.js` | date e orari |
| `js/scheduler.js` | il motore che calcola il programma (spazi liberi, priorità, scadenze, margine) |
| `js/parser.js` | capisce date, orari, durate e priorità scritte in italiano |
| `js/assistant.js` | l'assistente in chat (interprete locale, senza IA): produce risposte e proposte |
| `js/proposals.js` | **livello di sicurezza**: valida, mostra l'anteprima, richiede conferma, ricontrolla, esegue, verifica |
| `js/store.js` | salvataggio sul dispositivo, dati reali e demo separati, backup |
| `js/routines.js` | routine «Ogni giorno»: suggerimenti e creazione automatica delle attività quotidiane |
| `js/areas.js` | aree della vita (colori, riconoscimento dal titolo) |
| `js/stats.js` | resoconto settimanale e serie delle routine |
| `js/apple.js` | dati di Apple Calendar e Promemoria ricevuti dall'app per Mac |
| `mac/` | app per Mac (Swift + EventKit) |
| `js/sync.js` | sincronizzazione Mac ↔ iPhone (Supabase) |
| `supabase/` | struttura del database e funzione dell'account |
| `js/demo.js` | dati dimostrativi |
| `js/app.js` | interfaccia: Oggi, Assistente, Calendario, Attività, Impostazioni |
| `sw.js`, `manifest.webmanifest` | installazione come app e uso offline |

## Cosa è reale e cosa è simulato (versione 0.7)
- **Reale:** attività e appuntamenti interni, routine quotidiane, oscuramento di eventi/promemoria, pianificazione, riorganizzazione,
  assistente locale, proposte e conferme, salvataggio sul dispositivo.
- **Apple Calendar e Promemoria:** lettura reale tramite l'app per Mac; nella demo sono finti.
- **Sincronizzazione:** Mac ↔ iPhone con account personale (Impostazioni → Sincronizzazione).
- **Non ancora presente:** notifiche ad app chiusa, modifiche ai dati Apple da Daily Schedule.
- **Costi:** nessuno. Niente API a pagamento.

Font: Archivo (licenza SIL Open Font), incluso in `fonts/`.
