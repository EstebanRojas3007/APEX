import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {database,identity,asUser,rpc} from './harness';
import {educationalFixtureSQL,generatedFixture} from './learning-fixture';

type User=Awaited<ReturnType<typeof identity>>;
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const baseline=Date.UTC(2026,9,12,12);
const my=(db:PGlite,user:User,operation:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,operation,payload));
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles');");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec(read('../transition-learning-v2.sql'));
 await db.exec(educationalFixtureSQL);
 await db.exec(`CREATE SCHEMA clock_fixture;CREATE TABLE clock_fixture.time(ms bigint NOT NULL);INSERT INTO clock_fixture.time VALUES(${baseline});
 CREATE OR REPLACE FUNCTION apex_private.epoch_ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=clock_fixture,pg_catalog AS $$SELECT ms FROM time$$;
 UPDATE apex_private.configuracion_reloj SET activa=true WHERE id;`);
 return db;
}
const time=(db:PGlite,ms:number)=>db.query('UPDATE clock_fixture.time SET ms=$1',[ms]);
async function aid(db:PGlite,user:User,kind:string,level?:number){
 return (await db.query<{id:string}>(`SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo=$2 AND ($3::integer IS NULL OR p.nivel=$3)`,[user.id,kind,level??null])).rows[0]!.id;
}
const start=(db:PGlite,user:User,id:string,resumeAttemptId?:string)=>my(db,user,'start',{assignmentId:id,confirmed:true,...(resumeAttemptId?{resumeAttemptId}:{})});
async function correctOption(db:PGlite,questionId:string){return (await db.query<{id:string}>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[questionId])).rows[0]!.id;}
async function score(db:PGlite,user:User,attempt:any,correct:number){
 for(const item of attempt.questions.slice(0,correct))await my(db,user,'answer',{attemptId:attempt.id,item:item.id,option:await correctOption(db,item.questionId)});
 return my(db,user,'finish',{attemptId:attempt.id});
}
async function readyUser(db:PGlite,n:number,level:number,final=false){
 const user=await identity(db,n);
 const diag=await start(db,user,await aid(db,user,'diagnostico'));await score(db,user,diag,0);
 for(let current=1;current<=level;current++){
  await db.exec('SET ROLE service_role');
  try{
   for(;;){
    const job=(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v;assert.ok(job);
    await db.exec('RESET ROLE');
    const owner=(await db.query<{id_estudiante:string}>('SELECT id_estudiante FROM apex_private.trabajo_ia WHERE id=$1',[job.jobId])).rows[0]!.id_estudiante;
    await db.exec('SET ROLE service_role');
    await db.query('SELECT public.apex_ai_finish($1,$2,$3::jsonb,NULL)',[job.jobId,job.lease,JSON.stringify(generatedFixture(job))]);
    if(owner===user.id){assert.equal(job.input.level,current);break;}
   }
  }finally{await db.exec('RESET ROLE');}
  const route=await asUser(db,user,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v);
  for(const section of route.levels[current-1].sections)await my(db,user,'section_complete',{sectionId:section.id});
  if(current<level||final)await score(db,user,await start(db,user,await aid(db,user,'control',current)),7);
 }
 return {user,assignmentId:await aid(db,user,final?'final':'control',final?undefined:level)};
}
const processExpired=async(db:PGlite)=>(await db.query<any>('SELECT apex_private.cerrar_intentos_vencidos(100) v')).rows[0]!.v;

test('Exact server durations for every control and final; assignment/instructions do not start a clock',async()=>{
 const db=await setup();try{
  for(const [index,[level,final]] of ([[1,false],[2,false],[3,false],[3,true]] as const).entries()){
   const {user,assignmentId}=await readyUser(db,1100+index,level,final);
   assert.equal((await db.query('SELECT * FROM apex_private.intento WHERE id_asignacion=$1',[assignmentId])).rows.length,0);
   await time(db,baseline+60000*(index+1));
   const attempt=await start(db,user,assignmentId);
   assert.equal(attempt.clock.policy,'total-apex-v1');assert.equal(attempt.clock.startedAt,baseline+60000*(index+1));
   assert.equal(attempt.clock.durationSeconds,final?2250:900);
   assert.equal(attempt.clock.expiresAt-attempt.clock.startedAt,(final?2250:900)*1000);
   assert.equal(attempt.clock.remainingMs,(final?2250:900)*1000);
   assert.equal(attempt.questions.length,final?25:10);
   await my(db,user,'activity',{scope:'menu'});await time(db,attempt.clock.startedAt+10000);
   const resumed=await start(db,user,assignmentId,attempt.id);
   assert.equal(resumed.id,attempt.id);assert.equal(resumed.clock.expiresAt,attempt.clock.expiresAt);
   assert.equal(resumed.clock.startedAt,attempt.clock.startedAt);assert.equal(resumed.clock.remainingMs,attempt.clock.remainingMs-10000);
   assert.deepEqual(resumed.questions,attempt.questions);
   await score(db,user,resumed,final?22:7);
  }
 }finally{await db.close();}
});

test('Diagnostic has no expiry or automatic grade after 30+ minutes; idle recovery remains explicit',async()=>{
 const db=await setup();try{
  const user=await identity(db,1120),assignmentId=await aid(db,user,'diagnostico');
  const attempt=await start(db,user,assignmentId);
  assert.equal(attempt.clock.policy,'diagnostico-sin-limite-v1');assert.equal(attempt.clock.expiresAt,null);assert.equal(attempt.clock.durationSeconds,null);
  await time(db,baseline+1800001);
  assert.deepEqual(await processExpired(db),{processed:0,failed:0});
  const current=await my(db,user,'attempt_clock',{attemptId:attempt.id});assert.equal(current.status,'activo');assert.equal(current.clock.expired,false);assert.equal(current.clock.remainingMs,null);
  await assert.rejects(my(db,user,'finish',{attemptId:attempt.id}),/Retoma/);
  const resumed=await start(db,user,assignmentId,attempt.id);assert.equal(resumed.id,attempt.id);assert.equal(resumed.clock.startedAt,baseline);assert.equal(resumed.clock.expiresAt,null);
  const result=await my(db,user,'finish',{attemptId:attempt.id});assert.equal(result.total,7);assert.equal(result.submissionReason,'manual');assert.equal(result.passed,null);assert.equal(result.threshold,null);
  assert.equal((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows.length,1);
 }finally{await db.close();}
});

test('Logout/disconnection do not pause; server closes without Auth, despite inactivity, and keeps confirmed answers/omissions',async()=>{
 const db=await setup();try{
  const {user,assignmentId}=await readyUser(db,1130,1);
  const attempt=await start(db,user,assignmentId),item=attempt.questions[0];
  const option=await correctOption(db,item.questionId);
  await my(db,user,'answer',{attemptId:attempt.id,item:item.id,option});
  await my(db,user,'logout');await time(db,baseline+300000);
  await assert.rejects(my(db,user,'attempt_clock',{attemptId:attempt.id}),/inactividad/);
  const fresh={...user,sid:'30000000-0000-4000-8000-000000001130'};
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh.sid,user.id]);
  const resumed=await start(db,fresh,assignmentId,attempt.id);
  assert.equal(resumed.id,attempt.id);assert.equal(resumed.clock.expiresAt,attempt.clock.expiresAt);assert.equal(resumed.clock.remainingMs,600000);assert.equal(resumed.answers[item.id],option);
  await db.query("UPDATE apex_private.sesion_actividad SET ultima_actividad=now()-interval '8 minutes' WHERE id=$1",[fresh.sid]);
  await time(db,attempt.clock.expiresAt);
  await assert.rejects(my(db,fresh,'answer',{attemptId:attempt.id,item:item.id,option}),/inactividad/);
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  assert.deepEqual(await processExpired(db),{processed:1,failed:0});
  assert.deepEqual(await processExpired(db),{processed:0,failed:0});
  const row=(await db.query<any>('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows[0]!;
  assert.equal(row.aciertos,1);assert.equal(row.total_preguntas,10);assert.equal(row.detalle.submissionReason,'tiempo_agotado');assert.equal(row.detalle.threshold,7);assert.equal(row.detalle.passed,false);
  assert.equal((await db.query<any>('SELECT estado FROM apex_private.intento WHERE id=$1',[attempt.id])).rows[0]!.estado,'finalizado');
  const saved=(await db.query<any>('SELECT id_opcion FROM apex_private.respuesta WHERE id_intento=$1 AND id_item=$2',[attempt.id,item.id])).rows[0]!.id_opcion;assert.equal(saved,option);
  assert.equal((await db.query<any>('SELECT ambito FROM apex_private.sesion_actividad WHERE id=$1',[fresh.sid])).rows[0]!.ambito,'exam','Scheduler must not modify or acquire Auth session activity');
  await db.query('UPDATE apex_private.sesion_actividad SET ultima_actividad=now() WHERE id=$1',[fresh.sid]);
  const finished=await start(db,fresh,assignmentId,attempt.id);assert.equal(finished.id,attempt.id);assert.equal(finished.status,'finalizado');
  assert.deepEqual(finished.result,row.detalle);
  await assert.rejects(start(db,fresh,assignmentId),/repaso/);
 }finally{await db.close();}
});

test('Exact deadline rejects late saves and grades once; manual delivery before deadline keeps server thresholds',async()=>{
 const db=await setup();try{
  const {user,assignmentId}=await readyUser(db,1140,1);
  const attempt=await start(db,user,assignmentId);
  await time(db,attempt.clock.expiresAt-1);
  await start(db,user,assignmentId,attempt.id);
  const manual=await score(db,user,attempt,7);
  assert.equal(manual.submissionReason,'manual');assert.equal(manual.correct,7);assert.equal(manual.passed,true);
  const other=await readyUser(db,1141,1),late=await start(db,other.user,other.assignmentId);
  const item=late.questions[0];await time(db,late.clock.expiresAt);
  const rejected=await my(db,other.user,'answer',{attemptId:late.id,item:item.id,option:await correctOption(db,item.questionId)});
  assert.equal(rejected.error.code,'ATTEMPT_EXPIRED');assert.equal(rejected.result.correct,0);assert.equal(rejected.result.total,10);
  assert.equal((await db.query('SELECT * FROM apex_private.respuesta WHERE id_intento=$1',[late.id])).rows.length,0);
  assert.deepEqual(await my(db,other.user,'finish',{attemptId:late.id}),rejected.result);
  assert.deepEqual(await processExpired(db),{processed:0,failed:0});
  assert.equal((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[late.id])).rows.length,1);
 }finally{await db.close();}
});

for(const operation of ['INSERT','UPDATE'])test(`Save/closure boundary on ${operation}: recheck server time at the write, after locks; rollback only the late write`,async()=>{
 const db=await setup();try{
  const {user,assignmentId}=await readyUser(db,operation==='INSERT'?1150:1151,1),attempt=await start(db,user,assignmentId),item=attempt.questions[0];
  const option=await correctOption(db,item.questionId);
  if(operation==='UPDATE')await my(db,user,'answer',{attemptId:attempt.id,item:item.id,option});
  // PostgreSQL sequences advance outside transaction rollback, like actual wall time.
  // Jump across the deadline inside the write: the outer RPC previously saw time remaining.
  await db.exec(`CREATE SEQUENCE clock_fixture.ticks MINVALUE 0 START 0;
   CREATE OR REPLACE FUNCTION apex_private.epoch_ms() RETURNS bigint LANGUAGE sql VOLATILE AS $$SELECT ${attempt.clock.startedAt}::bigint+nextval('clock_fixture.ticks')$$;
   CREATE FUNCTION clock_fixture.jump_deadline() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM setval('clock_fixture.ticks',900000);RETURN new;END$$;
   CREATE TRIGGER a_clock_fixture_jump BEFORE ${operation} ON apex_private.respuesta FOR EACH ROW EXECUTE FUNCTION clock_fixture.jump_deadline();`);
  const rejected=await my(db,user,'answer',{attemptId:attempt.id,item:item.id,option:operation==='UPDATE'?null:option});
  assert.equal(rejected.error.code,'ATTEMPT_EXPIRED');assert.equal(rejected.result.submissionReason,'tiempo_agotado');
  assert.equal(rejected.result.correct,operation==='UPDATE'?1:0);
  assert.equal((await db.query('SELECT * FROM apex_private.respuesta WHERE id_intento=$1',[attempt.id])).rows.length,operation==='UPDATE'?1:0);
  assert.equal((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows.length,1);
 }finally{await db.close();}
});

test('Failed automatic grading stays pending and retries atomically; disables no deadlines and fabricates no result',async()=>{
 const db=await setup();try{
  const {user,assignmentId}=await readyUser(db,1160,1),attempt=await start(db,user,assignmentId);
  const definition=(await db.query<{definition:string}>("SELECT pg_get_functiondef('apex_private.registrar_avance(text)'::regprocedure) definition")).rows[0]!.definition;
  await db.exec("CREATE OR REPLACE FUNCTION apex_private.registrar_avance(iid text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic grading failure';END$$;");
  await time(db,attempt.clock.expiresAt);
  assert.deepEqual(await processExpired(db),{processed:0,failed:1});
  const pending=await my(db,user,'attempt_clock',{attemptId:attempt.id});assert.equal(pending.status,'activo');assert.equal(pending.clock.expired,true);assert.equal(pending.result,null);
  assert.equal((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows.length,0);
  const row=(await db.query<any>('SELECT * FROM apex_private.reloj_intento WHERE id_intento=$1',[attempt.id])).rows[0]!;assert.match(row.ultimo_error,/Synthetic/);assert.equal(row.vence_en,attempt.clock.expiresAt);
  const late=await my(db,user,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:null});assert.equal(late.error.code,'ATTEMPT_EXPIRED');assert.equal(late.result,null);
  await db.exec(definition);assert.deepEqual(await processExpired(db),{processed:1,failed:0});
  assert.equal((await my(db,user,'attempt_clock',{attemptId:attempt.id})).result.total,10);
 }finally{await db.close();}
});

test('Idempotent competing requests in PGlite queue, locked policy, no client processor grant, no early automatic finalization',async()=>{
 const db=await setup();try{
  const {user,assignmentId}=await readyUser(db,1170,1),attempt=await start(db,user,assignmentId);
  assert.deepEqual(await processExpired(db),{processed:0,failed:0});
  await assert.rejects(asUser(db,user,()=>processExpired(db)),/permission denied/);
  await assert.rejects(asUser(db,null,()=>processExpired(db)),/permission denied/);
  await assert.rejects(db.query('UPDATE apex_private.reloj_intento SET iniciado_en=iniciado_en+1,vence_en=vence_en+1 WHERE id_intento=$1',[attempt.id]),/plazo/);
  await db.exec('UPDATE apex_private.configuracion_reloj SET activa=false WHERE id;');
  await time(db,attempt.clock.expiresAt);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,session_id:user.sid})]);
  // PGlite serializes statements; this checks both queued callers, not multiconnection lock contention.
  const [manual,automatic,repeated]=await Promise.all([rpc(db,'finish',{attemptId:attempt.id}),processExpired(db),rpc(db,'finish',{attemptId:attempt.id})]);
  assert.deepEqual(manual,repeated);assert.deepEqual(automatic,{processed:0,failed:0});
  assert.equal(manual.submissionReason,'tiempo_agotado');assert.equal((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows.length,1);
  assert.equal((await db.query<any>('SELECT vence_en FROM apex_private.reloj_intento WHERE id_intento=$1',[attempt.id])).rows[0]!.vence_en,attempt.clock.expiresAt);
 }finally{await db.close();}
});

test('Migration and activation preserve existing active attempts and completed snapshots without retroactive deadlines',async()=>{
 let original:any,active:any,finished:any,user:User;
 const db=await database(async()=>{},undefined,undefined,async prior=>{
  await prior.exec(read('../seed-demo.sql'));await prior.exec(read('../content/apex-ingles-105-v0.2.sql'));
  await prior.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles');UPDATE apex_private.plantilla_evaluacion SET habilitada=true;");
  user=await identity(prior,1180);const admin=await identity(prior,1181,'administrador');
  await asUser(prior,admin,()=>prior.query('SELECT public.apex_assign_bank($1::text[],$2)',[[user.id],'apex-ingles-control-1-v1']));
  active=await start(prior,user,await aid(prior,user,'control',1));
  const diagnostic=(await my(prior,user,'me')).assignments.find((a:any)=>a.kind==='diagnostico');
  finished=await my(prior,user,'start',{assignmentId:diagnostic.id,confirmed:true});await my(prior,user,'finish',{attemptId:finished.id});
  original={attempts:(await prior.query('SELECT * FROM apex_private.intento ORDER BY id')).rows,results:(await prior.query('SELECT * FROM apex_private.resultado ORDER BY id_intento')).rows,selection:(await prior.query('SELECT * FROM apex_private.seleccion_intento ORDER BY id_intento,orden')).rows};
 });
 try{
  assert.deepEqual((await db.query('SELECT * FROM apex_private.intento ORDER BY id')).rows,original.attempts);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado ORDER BY id_intento')).rows,original.results);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.seleccion_intento ORDER BY id_intento,orden')).rows,original.selection);
  await db.exec('UPDATE apex_private.configuracion_reloj SET activa=true WHERE id;');
  const recovered=await start(db,user!,await aid(db,user!,'control',1),active.id);
  assert.equal(recovered.id,active.id);assert.equal(recovered.clock.policy,'anterior-sin-limite-v1');assert.equal(recovered.clock.expiresAt,null);assert.equal(recovered.clock.startedAt,original.attempts.find((a:any)=>a.id===active.id).iniciado_en);
  assert.deepEqual(recovered.questions,active.questions);assert.deepEqual(recovered.answers,active.answers);
  assert.deepEqual(await processExpired(db),{processed:0,failed:0});
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado ORDER BY id_intento')).rows,original.results);
  await db.exec(read('../verify-assessment-clocks.sql'));
 }finally{await db.close();}
});
