# Daily Schedule — Roadmap

Legenda: ✅ fatto · 🟡 in parte · ⬜ da fare

## Fase 1 — Struttura e interfaccia
- ✅ Architettura definita (docs/ARCHITETTURA.md)
- ✅ Web app responsive installabile (PWA)
- ✅ Schermate: Oggi, Assistente, Calendario (giorno/settimana/mese), Attività, Impostazioni
- ✅ Restyling grafico (v0.5): tema bianco, colore di richiamo viola scuro, font Archivo tutto in stampatello, icone, timeline
- ✅ Calendario su 24 ore: si tocca un'ora libera per creare un appuntamento; «alle 7 di mattina» capito correttamente
- ✅ Dati dimostrativi separati e sempre etichettati

## Fase 2 — Gestione attività
- ✅ Creazione, modifica, completamento, priorità, scadenze, durata
- ✅ Salvataggio sul dispositivo + backup giornalieri + esportazione
- ⬜ Salvataggio su Supabase (arriva con la fase 7)

## Fase 3 — Pianificazione intelligente
- ✅ Spazi liberi, priorità, scadenze, pause, margini, momento preferito
- ✅ Margine per imprevisti: la giornata non si riempie oltre l'80% (regolabile)
- ✅ Avvisi: giornata troppo piena, scadenze a rischio, sovrapposizioni
- ✅ Riorganizzazione dinamica (imprevisti, "fatto prima", "+15 min", "Hai finito?")
- ✅ Anteprima delle modifiche con prima/dopo
- ✅ «Ogni giorno»: routine quotidiane con suggerimenti pronti, giorni della settimana, orario fisso o momento preferito
- ✅ Oscurare eventi e promemoria per un giorno (nascosti e ignorati, non cancellati; ripristinabili)
- ✅ Briefing del mattino e chiusura della sera (le attività rimaste passano a domani con un tocco)
- ✅ Aree della vita con colori, filtro per area, resoconto della settimana
- ✅ Serie delle routine (giorni consecutivi)
- ✅ Timer di concentrazione: il tempo reale aggiorna le stime
- ✅ Passi (sotto-attività) e note visibili nella scheda «Adesso»
- ✅ Tempo di spostamento prima degli appuntamenti con un luogo, con avviso se non c'è tempo
- ✅ «Sistema» con rimedi concreti per ogni avviso (sovrapposizioni, scadute, giornata piena, tempo per arrivare) e «va bene così»
- ✅ Aggiunta istantanea dalla barra, con anteprima mentre scrivi, Annulla e Modifica
- ⬜ Dipendenze tra attività, livello di energia

## Fase 4 — Assistente
- ✅ Chat con interprete locale in italiano: capisce le richieste più comuni e crea proposte
- ❌ IA a pagamento (Claude API): esclusa per scelta, niente costi

## Fase 5 — App nativa Mac (lettura)
- ✅ App nativa per Mac (Swift + EventKit) con l'app web dentro, permessi chiesti solo su richiesta
- ✅ Lettura di eventi (anche ricorrenti e di tutto il giorno) e promemoria (con e senza scadenza)
- ✅ Aggiornamento automatico quando cambiano Calendario o Promemoria; niente doppioni; le aggiunte locali restano
- ✅ Protezioni: nessuna scrittura sui dati Apple in questa versione

## Fase 6 — Modifiche controllate ai dati Apple
- 🟡 Livello proposte/conferme pronto e testato (sulla demo)
- ⬜ Esecuzione reale tramite companion, con controllo delle modifiche concorrenti

## Fase 7 — Backend e sincronizzazione
- ⬜ Login, tabelle con RLS, sincronizzazione Mac ↔ iPhone, coda delle operazioni

## Fase 8 — Test e rifinitura
- ⬜ Prova su iPhone reale, documentazione d'uso completa
