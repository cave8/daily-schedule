// Test del livello proposte/conferme e dell'assistente.
/* global G, print */
(function () {
  "use strict";
  const T = G.time, S = G.scheduler, PR = G.proposals, A = G.assistant;
  let pass = 0, fail = 0;
  const failures = [];
  function eq(a, e, name) { const x = JSON.stringify(a), y = JSON.stringify(e); if (x === y) pass++; else { fail++; failures.push(name + "\n     atteso:   " + y + "\n     ottenuto: " + x); } }
  function ok(c, name, extra) { if (c) pass++; else { fail++; failures.push(name + (extra ? " — " + extra : "")); } }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const NOW = new Date(2026, 9, 15, 9, 20).getTime(); // giovedì
  function fresh() { const st = G.demo.build(NOW); st.plan = S.plan(st, NOW); return st; }

  // ---------- proposte ----------
  let st = fresh();
  const before = clone(st);
  let op = PR.op(st, "create_task", { after: { title: "Leggere un libro", duration: 30, remaining: 30 } });
  let p = PR.create(st, [op], { summary: "x" }, NOW);
  eq(PR.validate(p, st), [], "proposta valida");
  ok(JSON.stringify(st.tasks) === JSON.stringify(before.tasks), "creare/validare una proposta non modifica i dati");
  PR.preview(p, st, NOW);
  ok(JSON.stringify(st.tasks) === JSON.stringify(before.tasks), "l'anteprima non modifica i dati");

  // senza conferma: niente
  let r = PR.apply(p, st, null, NOW, { mode: "demo" });
  ok(!r.ok && /conferma/.test(r.error), "senza conferma non si applica");
  // conferma di un'altra proposta: niente
  r = PR.apply(p, st, { proposalId: "altra", fingerprint: p.fingerprint }, NOW, { mode: "demo" });
  ok(!r.ok, "la conferma di un'altra proposta non vale");
  // proposta cambiata dopo la conferma: niente
  const conf = { proposalId: p.id, fingerprint: p.fingerprint };
  const tampered = clone(p); tampered.ops[0].after.title = "Altro";
  r = PR.apply(tampered, st, conf, NOW, { mode: "demo" });
  ok(!r.ok && /cambiata/.test(r.error), "proposta modificata dopo la conferma: serve nuova conferma");
  // conferma corretta
  r = PR.apply(p, st, conf, NOW, { mode: "demo" });
  ok(r.ok && r.state.tasks.some((t) => t.title === "Leggere un libro"), "con la conferma giusta si applica");
  ok(!st.tasks.some((t) => t.title === "Leggere un libro"), "l'applicazione non tocca lo stato originale finché non viene salvata");

  // operazioni non permesse (eliminazione)
  const bad = PR.create(st, [{ type: "delete_event", targetId: "d-e1" }], {}, NOW);
  ok(PR.validate(bad, st).length > 0, "eliminazione non permessa");
  r = PR.apply(bad, st, { proposalId: bad.id, fingerprint: bad.fingerprint }, NOW, { mode: "demo" });
  ok(!r.ok, "eliminazione rifiutata anche se confermata");

  // campi non permessi
  const bad2 = PR.create(st, [PR.op(st, "update_task", { targetId: "d-t3", after: { hacker: 1 } })], {}, NOW);
  ok(PR.validate(bad2, st).length > 0, "campo sconosciuto rifiutato");

  // concorrenza: l'elemento cambia tra proposta e conferma
  st = fresh();
  op = PR.op(st, "update_event", { targetId: "d-e1", after: { start: T.toISO(new Date(2026, 9, 15, 11, 0).getTime()), end: T.toISO(new Date(2026, 9, 15, 12, 0).getTime()) } });
  p = PR.create(st, [op], {}, NOW);
  st.events.find((e) => e.id === "d-e1").title = "Riunione di team (spostata da un collega)";
  r = PR.apply(p, st, { proposalId: p.id, fingerprint: p.fingerprint }, NOW, { mode: "demo" });
  ok(!r.ok && /modificato nel frattempo/.test(r.error), "modifica concorrente: mi fermo");

  // dati Apple in modalità reale senza collegamento: rifiuto
  st = fresh();
  op = PR.op(st, "update_event", { targetId: "d-e1", after: { location: "Sala C" } });
  p = PR.create(st, [op], {}, NOW);
  r = PR.apply(p, st, { proposalId: p.id, fingerprint: p.fingerprint }, NOW, { mode: "real", appleBridge: null });
  ok(!r.ok && /Mac/.test(r.error), "senza companion Mac nessuna modifica ai dati Apple");
  r = PR.apply(p, st, { proposalId: p.id, fingerprint: p.fingerprint }, NOW, { mode: "demo" });
  ok(r.ok && r.simulatedApple, "in demo la modifica Apple è simulata e dichiarata tale");

  // campi solo interni di un promemoria Apple non contano come modifica Apple
  op = PR.op(st, "update_task", { targetId: "d-t5", after: { pref: "afternoon" } });
  ok(!PR.touchesApple(op), "momento preferito di un promemoria = dato interno");
  op = PR.op(st, "update_task", { targetId: "d-t5", after: { deadline: "2026-10-20" } });
  ok(PR.touchesApple(op), "scadenza di un promemoria = dato Apple");

  // anteprima: cosa cambia
  st = fresh();
  op = PR.op(st, "update_event", { targetId: "d-e1", after: { start: "2026-10-15T11:00", end: "2026-10-15T12:00" } });
  p = PR.create(st, [op], {}, NOW);
  let pv = PR.preview(p, st, NOW);
  const mv = pv.changes.find((c) => c.title === "Riunione di team");
  ok(mv && mv.type === "moved" && mv.direct && T.fmtHM(mv.before.start) === "10:00" && T.fmtHM(mv.after.start) === "11:00", "anteprima: orario prima e dopo");
  ok(pv.unchanged.length > 0, "anteprima: elenca ciò che resta invariato");

  // ---------- assistente ----------
  st = fresh();
  const say = (m) => A.respond(m, st, NOW);
  r = say("Domani devo studiare due ore, andare in palestra e fare la spesa");
  eq(r.ops.map((o) => [o.type, o.after.title, o.after.duration, o.after.notBefore]),
    [["create_task", "Studiare", 120, "2026-10-16"], ["create_task", "Andare in palestra", 60, "2026-10-16"]], "assistente: attività per domani");
  ok(/Fare la spesa — c'è già/.test(r.text), "assistente: non duplica «Fare la spesa» già presente");
  ok(/stimate/.test(r.text), "assistente: dichiara le durate stimate");

  r = say("Aggiungi un promemoria per chiamare il dentista venerdì");
  eq([r.ops.length, r.ops[0].type, r.ops[0].after.title, r.ops[0].after.source, r.ops[0].after.deadline], [1, "create_task", "Chiamare il dentista", "apple-reminders", "2026-10-16"], "assistente: promemoria");
  ok(!r.ops.some((o) => o.type === "create_event"), "assistente: un promemoria senza orario NON diventa un appuntamento");

  r = say("Ho una riunione alle 10:00 e devo lavorare per tre ore. Organizzami il resto della giornata");
  eq(r.ops.map((o) => [o.type, o.after.title, o.after.duration]), [["create_task", "Lavorare", 180]], "assistente: riunione già esistente non duplicata");

  r = say("Sposta lo studio al pomeriggio");
  eq([r.ops[0].type, r.ops[0].targetId, r.ops[0].after.pref], ["update_task", "d-t2", "afternoon"], "assistente: sposta al pomeriggio");

  r = say("La riunione è stata spostata di un'ora");
  eq([r.ops[0].type, r.ops[0].after.start, r.ops[0].after.end], ["update_event", "2026-10-15T11:00", "2026-10-15T12:00"], "assistente: riunione spostata di un'ora");
  ok(/conferm/.test(r.text), "assistente: chiede conferma per l'evento Apple");

  r = say("Ho completato la presentazione");
  eq([r.ops[0].type, r.ops[0].targetId], ["complete_task", "d-t1"], "assistente: completata");

  r = say("Non sono riuscito a finire il lavoro previsto per oggi. Spostalo a domani e riorganizza gli altri impegni");
  ok(r.ops.length >= 1 && r.ops.every((o) => o.type === "update_task" && o.after.notBefore === "2026-10-16"), "assistente: lavoro di oggi a domani");

  r = say("Qual è la cosa più importante che dovrei fare adesso?");
  ok(!r.ops && /Preparare la presentazione/.test(r.text), "assistente: cosa fare adesso (nessuna modifica)");

  r = say("Ho solo 45 minuti liberi. Cosa mi consigli di fare?");
  ok(!r.ops && /45 min/.test(r.text) && r.actions.length > 0, "assistente: consigli per 45 minuti");

  r = say("Organizzami la giornata di domani");
  ok(!r.ops && r.dayPlan === "2026-10-16", "assistente: piano di domani");

  r = say("Aggiungi due ore di studio domani mattina");
  eq([r.ops[0].after.title, r.ops[0].after.duration, r.ops[0].after.pref, r.ops[0].after.notBefore], ["Studio", 120, "morning", "2026-10-16"], "assistente: due ore di studio domani mattina");

  r = say("Riorganizza il pomeriggio perché devo dedicare un'ora in più allo studio");
  eq([r.ops[0].type, r.ops[0].targetId, r.ops[0].after.remaining], ["update_task", "d-t2", 150], "assistente: un'ora in più allo studio");

  r = say("Sposta il dentista alle 17");
  eq([r.ops[0].after.start, r.ops[0].after.end], ["2026-10-16T17:00", "2026-10-16T18:00"], "assistente: sposta evento a un orario");

  r = say("blablabla qwerty");
  ok(r.ops ? r.ops.length === 1 : true, "assistente: testo strano non rompe nulla");

  // Ogni proposta dell'assistente è valida e applicabile solo con conferma
  for (const m of ["Domani devo studiare due ore, andare in palestra e fare la spesa", "Sposta lo studio al pomeriggio", "La riunione è stata spostata di un'ora", "Ho completato la presentazione"]) {
    const rr = A.respond(m, st, NOW);
    const pp = PR.create(st, rr.ops, {}, NOW);
    eq(PR.validate(pp, st), [], "valida: " + m);
    const res = PR.apply(pp, st, { proposalId: pp.id, fingerprint: pp.fingerprint }, NOW, { mode: "demo" });
    ok(res.ok, "applicabile con conferma: " + m, res.error);
  }

  print("");
  failures.forEach((f) => print("  ✗ " + f));
  print("Proposte e assistente: " + pass + " test superati, " + fail + " falliti");
  if (fail) throw new Error("test falliti");
})();
