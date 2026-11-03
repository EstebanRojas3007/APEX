import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {database,identity,asUser,rpc} from './harness';
import {technicalIdentity,syntheticSchedulerSQL,academicEvidence} from './technical-clock-fixture';
import {educationalFixtureSQL} from './learning-fixture';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const enable=read('../enable-technical-clock-test.sql'),withdraw=read('../withdraw-technical-clock-test.sql');
const baseline=Date.UTC(2026,9,12,12);
type User=Awaited<ReturnType<typeof identity>>;
const my=(db:PGlite,user:User,operation:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,operation,payload));
const time=(db:PGlite,ms:number)=>db.query('UPDATE technical_fixture.time SET ms=$1',[ms]);
const process=async(db:PGlite)=>(await db.query<any>('SELECT apex_private.cerrar_intentos_vencidos(100) v')).rows[0]!.v;
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles');");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec(read('../transition-learning-v2.sql'));
 await db.exec(educationalFixtureSQL);
 await db.exec(syntheticSchedulerSQL);
 await db.exec(`CREATE SCHEMA technical_fixture;CREATE TABLE technical_fixture.time(ms bigint);INSERT INTO technical_fixture.time VALUES(${baseline});
 CREATE OR REPLACE FUNCTION apex_private.epoch_ms() RETURNS bigint LANGUAGE sql VOLATILE AS $$SELECT ms FROM technical_fixture.time$$;`);
 const user=await technicalIdentity(db);
 return {db,user};
}
async function count(db:PGlite,table:string){return Number((await db.query<{n:number}>(`SELECT count(*) n FROM apex_private.${table}`)).rows[0]!.n);}
async function enabled(db:PGlite,user:User){await db.exec(enable);return (await my(db,user,'me')).technicalAssessment;}
async function start(db:PGlite,user:User,assignmentId:string,resumeAttemptId?:string){return my(db,user,'start',{assignmentId,confirmed:true,...(resumeAttemptId?{resumeAttemptId}:{})});}

test('Preparation grants no access; explicit enabling is idempotent and preserves all academic/AI state',async()=>{
 const {db,user}=await setup();try{
  await db.exec(read('../preflight-technical-clock-test.sql'));
  assert.equal(await count(db,'prueba_reloj_tecnica'),0);assert.equal((await my(db,user,'me')).technicalAssessment,null);
  const before=await academicEvidence(db,user.id);const t=await enabled(db,user);
  assert.equal(t.title,'Prueba técnica del reloj — no afecta tu progreso');assert.equal(t.count,10);assert.equal(t.durationSeconds,900);assert.equal(t.attemptId,null);
  const marker=(await db.query('SELECT * FROM apex_private.prueba_reloj_tecnica')).rows;
  await db.exec(enable);assert.deepEqual((await db.query('SELECT * FROM apex_private.prueba_reloj_tecnica')).rows,marker);
  assert.equal(await count(db,'intento'),0);assert.deepEqual(await academicEvidence(db,user.id),before);
  await db.exec(withdraw);await db.exec(withdraw);assert.equal((await my(db,user,'me')).technicalAssessment,null);
  assert.equal((await my(db,user,'start',{assignmentId:t.id,confirmed:true})).error.code,'TECHNICAL_ACCESS_REVOKED');
  await assert.rejects(db.exec(enable),/retirada definitivamente/);await db.exec('ROLLBACK');
  assert.equal(await count(db,'intento'),0);assert.deepEqual(await academicEvidence(db,user.id),before);
 }finally{await db.close();}
});
test('Active diagnostic blocks enabling atomically, without closing, changing answers or replacing it',async()=>{
 const {db,user}=await setup();try{
  const summary=await my(db,user,'me');const diagnostic=await start(db,user,summary.assignments[0].id);
  await my(db,user,'answer',{attemptId:diagnostic.id,item:diagnostic.questions[0].id,option:diagnostic.questions[0].options[0].id});
  const before=await my(db,user,'attempt',{attemptId:diagnostic.id}),evidence=await academicEvidence(db,user.id);
  await assert.rejects(db.exec(enable),/otro intento activo/);await db.exec('ROLLBACK');
  assert.equal(await count(db,'prueba_reloj_tecnica'),0);assert.equal(await count(db,'resultado'),0);
  assert.deepEqual(await my(db,user,'attempt',{attemptId:diagnostic.id}),before);assert.deepEqual(await academicEvidence(db,user.id),evidence);
  assert.equal(before.clock.policy,'diagnostico-sin-limite-v1');assert.equal(before.clock.expiresAt,null);
 }finally{await db.close();}
});
test('Enabling fails without an actual-job precondition; an academic attempt appearing later also blocks technical start',async()=>{
 const {db,user}=await setup();try{
  await db.exec("UPDATE cron.job_run_details SET status='failed'");
  await assert.rejects(db.exec(enable),/ejecución real exitosa/);await db.exec('ROLLBACK');assert.equal(await count(db,'prueba_reloj_tecnica'),0);
  await db.exec("UPDATE cron.job_run_details SET status='succeeded'");const t=await enabled(db,user);
  const diag=(await my(db,user,'me')).assignments[0];const i=await start(db,user,diag.id);
  await assert.rejects(start(db,user,t.id),/otro intento activo/);
  assert.equal(await count(db,'intento'),1);assert.equal((await my(db,user,'attempt',{attemptId:i.id})).status,'activo');
 }finally{await db.close();}
});
test('Server denies other students, staff and anonymous callers, known IDs, aliases and private/previous endpoints',async()=>{
 const {db,user}=await setup();try{
  const t=await enabled(db,user),i=await start(db,user,t.id);
  for(const other of [await identity(db,601),await identity(db,602,'docente'),await identity(db,603,'administrador')]){
   assert.equal((await my(db,other,'me')).technicalAssessment,null);
   for(const [operation,payload] of [['technical_status',{}],['start',{assignmentId:t.id,confirmed:true}],['attempt',{attemptId:i.id}],['attempt_clock',{attemptId:i.id}],['answer',{attemptId:i.id,item:i.questions[0].id,option:i.questions[0].options[0].id}],['finish',{attemptId:i.id}],['chat_open',{kind:'review',attemptId:i.id}],['start',{assignmentId:'unknown',resumeAttemptId:i.id,confirmed:true}]] as const)
    await assert.rejects(my(db,other,operation,payload),(e:any)=>e.code==='42501');
   if(other.id.endsWith('603'))await asUser(db,other,async()=>{
    const history=await rpc(db,'student_results',{studentId:user.id});assert.deepEqual(history,[]);
    await assert.rejects(db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[other.id],'apex-clock-technical-v1']),(e:any)=>e.code==='42501');
   });
  }
  await asUser(db,null,()=>assert.rejects(rpc(db,'start',{assignmentId:t.id,confirmed:true}),(e:any)=>e.code==='42501'));
  for(const role of ['authenticated','anon','service_role']){
   const permissions=(await db.query<any>(`SELECT has_function_privilege($1,'public.apex_api_pre_tecnica(text,jsonb)','EXECUTE') old_api,has_function_privilege($1,'apex_private.iniciar_prueba_tecnica(jsonb)','EXECUTE') private_start,has_table_privilege($1,'apex_private.prueba_reloj_tecnica','SELECT') marker,has_table_privilege($1,'apex_private.respuesta','SELECT') answers,has_function_privilege($1,'apex_private.cerrar_intentos_vencidos(integer)','EXECUTE') processor`,[role])).rows[0];
   assert.ok(Object.values(permissions).every(x=>x===false));
  }
  await assert.rejects(my(db,user,'chat_open',{kind:'review',attemptId:i.id}),(e:any)=>e.code==='42501');
  assert.ok(!/es_correcta|justificacion_privada|claves_originales|correctOption/.test(JSON.stringify(i)));
 }finally{await db.close();}
});
test('One real attempt preserves complete bank blocks, saved answers and its immutable 900-second deadline on resume',async()=>{
 const {db,user}=await setup();try{
  const before=await academicEvidence(db,user.id),t=await enabled(db,user);
  await assert.rejects(my(db,user,'start',{assignmentId:t.id,confirmed:false}),/Confirma/);
  await assert.rejects(start(db,user,t.id,'invented'),/no autorizado/);assert.equal(await count(db,'intento'),0);
  const i=await start(db,user,t.id);assert.equal(i.technical,true);assert.equal(i.questions.length,10);assert.equal(i.clock.expiresAt-i.clock.startedAt,900000);
  const blocks=(await db.query<any>(`SELECT s.id_bloque,count(*) n,b.cantidad_preguntas FROM apex_private.seleccion_intento s JOIN apex_private.bloque_preguntas b ON b.id=s.id_bloque WHERE s.id_intento=$1 GROUP BY s.id_bloque,b.cantidad_preguntas`,[i.id])).rows;
  assert.ok(blocks.every(b=>Number(b.n)===b.cantidad_preguntas));assert.ok(i.questions.some((q:any)=>q.context?.reading||q.context?.sharedOptions.length));
  await my(db,user,'answer',{attemptId:i.id,item:i.questions[0].id,option:i.questions[0].options[0].id});
  await time(db,baseline+300000);await my(db,user,'activity',{scope:'menu'});
  const resumed=await start(db,user,t.id,i.id);assert.equal(resumed.id,i.id);assert.deepEqual(resumed.questions,i.questions);assert.deepEqual(resumed.answers,{[i.questions[0].id]:i.questions[0].options[0].id});assert.equal(resumed.clock.startedAt,i.clock.startedAt);assert.equal(resumed.clock.expiresAt,i.clock.expiresAt);
  await my(db,user,'logout');user.sid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[user.sid,user.id]);
  const newSession=await start(db,user,t.id,i.id);assert.equal(newSession.id,i.id);assert.deepEqual(newSession.answers,resumed.answers);assert.deepEqual(newSession.questions,i.questions);assert.equal(newSession.clock.expiresAt,i.clock.expiresAt);
  await assert.rejects(db.query('UPDATE apex_private.reloj_intento SET vence_en=vence_en+1000 WHERE id_intento=$1',[i.id]),/No renueves/);
  assert.deepEqual(await academicEvidence(db,user.id),before);
  const summary=await my(db,user,'me');assert.equal(summary.attempt,null);assert.ok(summary.assignments.every((a:any)=>a.id!==t.id));assert.deepEqual(summary.results,[]);
  await time(db,baseline+899999);assert.equal((await process(db)).processed,0);assert.equal(await count(db,'resultado'),0);
  await time(db,baseline+900000);await asUser(db,null,async()=>{});assert.equal((await process(db)).processed,1);assert.equal((await process(db)).processed,0);
  const closed=await start(db,user,t.id);assert.equal(closed.id,i.id);assert.equal(closed.status,'finalizado');assert.equal(closed.clock.expiresAt,i.clock.expiresAt);assert.equal(closed.result.technical,true);assert.equal(closed.result.submissionReason,'tiempo_agotado');assert.equal(closed.result.total,10);assert.equal(closed.result.passed,null);assert.equal(await count(db,'resultado'),1);
  const raw=(await db.query<any>('SELECT detalle FROM apex_private.resultado WHERE id_intento=$1',[i.id])).rows[0]!.detalle;assert.equal(raw.technical,true);
  const expected=Number((await db.query<any>('SELECT es_correcta FROM apex_private.opcion_respuesta WHERE id=$1',[i.questions[0].options[0].id])).rows[0]!.es_correcta);
  assert.equal(closed.result.correct,expected);assert.equal(closed.result.percentage,expected*10);
  assert.deepEqual(await academicEvidence(db,user.id),before);await db.exec(read('../verify-technical-clock-test.sql'));
  for(const view of ['v_historial_academico','v_progreso_nucleo','v_progreso_competencia'])assert.equal(await count(db,view),0);
  await db.exec(withdraw);await db.exec(withdraw);assert.equal((await my(db,user,'me')).technicalAssessment,null);assert.equal(await count(db,'resultado'),1);assert.deepEqual(await academicEvidence(db,user.id),before);
 }finally{await db.close();}
});
test('Authorized save rejects the exact deadline, common manual grade remains idempotent, and no technical review/advance can be written',async()=>{
 const {db,user}=await setup();try{
  const before=await academicEvidence(db,user.id),t=await enabled(db,user),i=await start(db,user,t.id);
  for(const item of i.questions){const option=(await db.query<any>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[item.questionId])).rows[0]!.id;await my(db,user,'answer',{attemptId:i.id,item:item.id,option});}
  for(const sql of [`INSERT INTO apex_private.decision_avance(id_intento,tipo,nivel,aciertos,total,umbral,aprobada) VALUES('${i.id}','control',1,10,10,7,true)`,`INSERT INTO apex_private.sesion_refuerzo(id_estudiante,tipo,id_intento) VALUES('${user.id}','review','${i.id}')`,`INSERT INTO apex_private.intento_ruta(id_intento,id_convocatoria,numero,politica_seleccion) VALUES('${i.id}','${t.id}',1,'no_vistas_lru_bloques-v2')`])await assert.rejects(db.exec(sql),/no admite/);
  const r=await my(db,user,'finish',{attemptId:i.id});assert.equal(r.submissionReason,'manual');assert.equal(r.correct,10);assert.equal(r.total,10);assert.equal(r.technical,true);assert.equal(r.passed,null);assert.equal(r.reviewRequired,false);
  assert.deepEqual(await my(db,user,'finish',{attemptId:i.id}),r);assert.equal((await start(db,user,t.id)).id,i.id);assert.equal(await count(db,'intento'),1);assert.deepEqual(await academicEvidence(db,user.id),before);
 }finally{await db.close();}
 const fresh=await setup();try{
  const t=await enabled(fresh.db,fresh.user),i=await start(fresh.db,fresh.user,t.id);await time(fresh.db,baseline+900000);
  const response=await my(fresh.db,fresh.user,'answer',{attemptId:i.id,item:i.questions[0].id,option:i.questions[0].options[0].id});assert.equal(response.error.code,'ATTEMPT_EXPIRED');assert.equal(response.result.technical,true);assert.equal(await count(fresh.db,'respuesta'),0);assert.equal(await count(fresh.db,'resultado'),1);
 }finally{await fresh.db.close();}
});
test('Coordinated active withdrawal revokes every operation immediately; the existing processor still closes at the original deadline',async()=>{
 const {db,user}=await setup();try{
  const before=await academicEvidence(db,user.id),t=await enabled(db,user),i=await start(db,user,t.id);
  await my(db,user,'answer',{attemptId:i.id,item:i.questions[0].id,option:i.questions[0].options[0].id});
  await assert.rejects(db.exec(withdraw),/Intento técnico activo/);await db.exec('ROLLBACK');assert.ok((await my(db,user,'me')).technicalAssessment);
  await db.exec(withdraw.replace('acknowledge_active_attempt BOOLEAN:=false','acknowledge_active_attempt BOOLEAN:=true'));
  for(const operation of ['technical_status','start','attempt','attempt_clock','answer','finish']){
   const denied=await my(db,user,operation,{assignmentId:t.id,attemptId:i.id,confirmed:true});assert.equal(denied.error.code,'TECHNICAL_ACCESS_REVOKED');assert.equal(denied.questions,undefined);assert.equal(denied.result,undefined);
  }
  assert.equal((await my(db,user,'me')).technicalAssessment,null);await time(db,baseline+899999);assert.equal((await process(db)).processed,0);
  await time(db,baseline+900000);assert.equal((await process(db)).processed,1);assert.equal((await process(db)).processed,0);
  assert.equal(await count(db,'resultado'),1);assert.deepEqual(await academicEvidence(db,user.id),before);await db.exec(read('../verify-technical-clock-test.sql'));
 }finally{await db.close();}
});
