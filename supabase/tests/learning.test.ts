import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {database,identity,asUser,rpc,registration} from './harness';
import {generatedFixture as generated,educationalFixtureSQL} from './learning-fixture';
type User=Awaited<ReturnType<typeof identity>>;
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles');");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec(read('../transition-learning-v2.sql'));
 await db.exec(educationalFixtureSQL);
 return db;
}
async function service<T>(db:PGlite,fn:()=>Promise<T>){await db.exec('SET ROLE service_role');try{return await fn();}finally{await db.exec('RESET ROLE');}}
async function claim(db:PGlite){return service(db,async()=>(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v);}
async function finishJob(db:PGlite,j:any,data:any=null,failure:string|null=null){return service(db,async()=>(await db.query<any>('SELECT public.apex_ai_finish($1,$2,$3::jsonb,$4) v',[j.jobId,j.lease,JSON.stringify(data),failure])).rows[0]!.v);}
async function generate(db:PGlite){const j=await claim(db);assert.equal(j.input.kind,'sections');const data=generated(j);await finishJob(db,j,data);return {j,data};}
const my=(db:PGlite,u:User,operation:string,payload:unknown={})=>asUser(db,u,()=>rpc(db,operation,payload));
async function route(db:PGlite,u:User){return asUser(db,u,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v);}
async function assignment(db:PGlite,u:User,kind:string,level?:number){
 const row=(await db.query<any>(`SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo=$2 AND ($3::integer IS NULL OR p.nivel=$3)`,[u.id,kind,level??null])).rows[0];assert.ok(row);return row.id;
}
async function start(db:PGlite,u:User,aid:string){return my(db,u,'start',{assignmentId:aid,confirmed:true});}
async function score(db:PGlite,u:User,a:any,correct:number){
 for(const q of a.questions.slice(0,correct)){const option=(await db.query<any>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[q.questionId])).rows[0]!.id;await my(db,u,'answer',{attemptId:a.id,item:q.id,option});}
 return my(db,u,'finish',{attemptId:a.id});
}
async function completeLevel(db:PGlite,u:User,level:number){
 const status=await route(db,u);const sections=status.levels[level-1].sections;assert.equal(sections.length,7);
 for(const s of sections)await my(db,u,'section_complete',{sectionId:s.id});
 return sections;
}
async function review(db:PGlite,u:User,attemptId:string){
 const chat=await my(db,u,'chat_open',{kind:'review',attemptId});
 for(const text of [null,'Please help with this skill']){
  if(text)await my(db,u,'chat_send',{sessionId:chat.id,key:'message-unique-1',text});
  const j=await claim(db);assert.equal(j.input.kind,'chat');
  const ref=j.input.references[0];await finishJob(db,j,{contractVersion:2,kind:'chat',text:'Synthetic tutor guidance without keys',references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:ref.page}]});
 }
 return my(db,u,'review_complete',{sessionId:chat.id});
}
function wholeBlocks(a:any){
 const content=JSON.parse(read('../../content/apex-ingles-v0.2/revision.json'));
 assert.equal(new Set(a.questions.map((q:any)=>q.questionId)).size,a.questions.length);
 for(const b of new Set(a.questions.map((q:any)=>q.context.id))){const actual=a.questions.filter((q:any)=>q.context.id===b).map((q:any)=>q.questionId);assert.deepEqual(actual,content.blocks.find((x:any)=>x.id===b).questionIds);}
 assert.doesNotMatch(JSON.stringify(a),/es_correcta|justificacion_privada|correctAnswer|claves_originales/);
}
test('MVP: real-bank 2+2+3, stable recovery, explicit 7-section gate, 6/7 threshold, linked tutor, one retry and preserved history',async()=>{
 const db=await setup();try{
  const u=await identity(db,501),other=await identity(db,502),admin=await identity(db,503,'administrador');
  const aid=await assignment(db,u,'diagnostico');const a=await start(db,u,aid);wholeBlocks(a);
  assert.deepEqual([1,2,3].map(l=>a.questions.filter((q:any)=>q.level===l).length),[2,2,3]);
  assert.deepEqual((await start(db,u,aid)).questions,a.questions);
  await my(db,u,'activity',{scope:'menu'});await assert.rejects(my(db,u,'answer',{attemptId:a.id,item:a.questions[0].id,option:a.questions[0].options[0].id}),/Retoma/);
  await db.query('INSERT INTO auth.sessions VALUES($1,$2,now())',['30000000-0000-4000-8000-000000000501',u.id]);const fresh={...u,sid:'30000000-0000-4000-8000-000000000501'};
  assert.equal((await start(db,fresh,aid)).id,a.id);
  const diagnostic=await score(db,fresh,a,2);assert.equal(diagnostic.total,7);assert.equal(diagnostic.passed,null);assert.equal(diagnostic.threshold,null);
  assert.equal((await start(db,fresh,aid)).id,a.id);await assert.rejects(my(db,other,'attempt',{attemptId:a.id}),/no autorizado/);
  const {j,data}=await generate(db);assert.equal(j.input.diagnosticBySkill.reduce((n:number,x:any)=>n+x.total,0),7);
  assert.doesNotMatch(JSON.stringify(j),/student501|example.test|es_correcta|correctAnswer|justificacion_privada|APEX_Banco/);
  assert.deepEqual(await finishJob(db,j,data),{status:'ready'});await assert.rejects(finishJob(db,j,{...data,reason:'Changed duplicate'}),/diferente/);
  const sections=(await route(db,fresh)).levels[0].sections;assert.equal(sections.length,7);
  await my(db,fresh,'section',{sectionId:sections[0].id});assert.equal((await route(db,fresh)).levels[0].completed,0,'Opening never completes');
  await assert.rejects(my(db,fresh,'section_complete',{sectionId:sections[1].id}),/bloqueada/);
  for(const s of sections.slice(0,6))await my(db,fresh,'section_complete',{sectionId:s.id});
  assert.equal((await route(db,fresh)).levels[0].controlAvailable,false);
  // An administrative early assignment cannot bypass the server gate.
  await asUser(db,admin,()=>db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[u.id],'apex-ingles-control-1-v2']));
  const controlId=await assignment(db,fresh,'control',1);await assert.rejects(start(db,fresh,controlId),/prerrequisitos/);
  await my(db,fresh,'section_complete',{sectionId:sections[6].id});await my(db,fresh,'section_complete',{sectionId:sections[6].id});
  assert.equal((await route(db,fresh)).levels[0].completed,7);
  const c=await start(db,fresh,controlId);wholeBlocks(c);const wrongItem=c.questions[6];const wrongOption=(await db.query<any>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=0 LIMIT 1',[wrongItem.questionId])).rows[0]!.id;
  await my(db,fresh,'answer',{attemptId:c.id,item:wrongItem.id,option:wrongOption});const failed=await score(db,fresh,c,6);assert.equal(failed.correct,6);assert.equal(failed.passed,false);assert.equal(failed.threshold,7);
  await assert.rejects(start(db,fresh,controlId),/repaso/);await assert.rejects(my(db,fresh,'chat_open',{kind:'review',attemptId:a.id}),/reprobada/);
  const optional=await my(db,fresh,'chat_open',{kind:'section',sectionId:sections[6].id});await assert.rejects(my(db,fresh,'review_complete',{sessionId:optional.id}),/vinculado/);
  let job=await claim(db);await finishJob(db,job,null,'AI_NOT_CONFIGURED');
  const chat=await my(db,fresh,'chat_open',{kind:'review',attemptId:c.id});assert.equal((await my(db,fresh,'chat_open',{kind:'review',attemptId:c.id})).id,chat.id);
  await assert.rejects(my(db,other,'chat_get',{sessionId:chat.id}),/no autorizado/);
  job=await claim(db);assert.equal(job.input.context.errors.length,4);assert.equal(job.input.context.errors.filter((e:any)=>e.omitted).length,3);assert.equal(job.input.context.errors.find((e:any)=>!e.omitted).selectedOptionId,wrongOption);
  assert.doesNotMatch(JSON.stringify(job),/es_correcta|correctAnswer|justificacion_privada|claves_originales/);
  await finishJob(db,job,null,'AI_UNAVAILABLE');await assert.rejects(my(db,fresh,'review_complete',{sessionId:chat.id}),/disponible/);
  await my(db,fresh,'chat_open',{kind:'review',attemptId:c.id});job=await claim(db);let ref=job.input.references[0];
  await finishJob(db,job,{contractVersion:2,kind:'chat',text:'Synthetic tutor introduction',references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:ref.page}]});
  await assert.rejects(my(db,fresh,'review_complete',{sessionId:chat.id}),/intercambio/);
  const sent=await my(db,fresh,'chat_send',{sessionId:chat.id,key:'message-idempotent-1',text:'Explain my omission'});
  assert.deepEqual(await my(db,fresh,'chat_send',{sessionId:chat.id,key:'message-idempotent-1',text:'Explain my omission'}),sent);
  await assert.rejects(my(db,fresh,'chat_send',{sessionId:chat.id,key:'message-idempotent-1',text:'Changed message'}),/diferente/);
  job=await claim(db);ref=job.input.references[0];await finishJob(db,job,{contractVersion:2,kind:'chat',text:'Synthetic formative guidance',references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:ref.page}]});
  const completed=await my(db,fresh,'review_complete',{sessionId:chat.id});assert.ok(completed.completedAt);assert.deepEqual(await my(db,fresh,'review_complete',{sessionId:chat.id}),completed);
  const retry=await start(db,fresh,controlId);assert.notEqual(retry.id,c.id);assert.equal((await start(db,fresh,controlId)).id,retry.id);wholeBlocks(retry);
  const passed=await score(db,fresh,retry,7);assert.equal(passed.passed,true);assert.equal(passed.correct,7);assert.equal((await start(db,fresh,controlId)).id,retry.id);
  assert.equal((await my(db,fresh,'me')).results.length,3);assert.equal((await my(db,fresh,'me')).assignments.filter((x:any)=>x.kind==='control').length,1);
  const next=await claim(db);assert.equal(next.input.level,2);assert.ok(next.input.assessmentResults.some((x:any)=>x.attemptId===retry.id&&x.correct===7));assert.equal(next.input.progress.length,7);
  assert.deepEqual((await my(db,fresh,'finish',{attemptId:c.id})),failed,'Repeated grading preserves failed result');
  assert.equal((await route(db,fresh)).levels[0].sections[0].id,sections[0].id);
 }finally{await db.close();}
});

test('Three controls unlock final; 21/22 threshold, exhausted unseen blocks reuse whole LRU blocks, and histories stay immutable',async()=>{
 const db=await setup();try{
  const u=await identity(db,511);const diag=await start(db,u,await assignment(db,u,'diagnostico'));await score(db,u,diag,0);
  for(let level=1;level<=3;level++){await generate(db);await completeLevel(db,u,level);const a=await start(db,u,await assignment(db,u,'control',level));await score(db,u,a,7);}
  assert.equal((await route(db,u)).finalAvailable,true);
  const finalId=await assignment(db,u,'final');const f=await start(db,u,finalId);wholeBlocks(f);
  assert.deepEqual([1,2,3].map(l=>f.questions.filter((q:any)=>q.level===l).length),[8,7,10]);
  const failed=await score(db,u,f,21);assert.equal(failed.passed,false);assert.equal(failed.threshold,22);await assert.rejects(start(db,u,finalId),/repaso/);
  await review(db,u,f.id);const retry=await start(db,u,finalId);wholeBlocks(retry);assert.notEqual(retry.id,f.id);
  const passed=await score(db,u,retry,22);assert.equal(passed.passed,true);assert.equal(passed.correct,22);
  assert.equal((await my(db,u,'me')).results.length,6);assert.deepEqual(await my(db,u,'finish',{attemptId:f.id}),failed);
  const exposure=(await db.query<any>('SELECT count(*) n,count(DISTINCT id_original) unique_n FROM apex_private.exposicion_pregunta WHERE id_estudiante=$1',[u.id])).rows[0]!;
  assert.equal(exposure.n,87);assert.ok(Number(exposure.unique_n)<87,'Reuse records additional exposures without deleting old ones');
 }finally{await db.close();}
});

test('AI contract rejects fake/secret references, copied bank practice, invalid prerequisites, stale context and unauthorized clients',async()=>{
 const db=await setup();try{
  const u=await identity(db,521);const diag=await start(db,u,await assignment(db,u,'diagnostico'));await score(db,u,diag,0);const j=await claim(db);const data=generated(j);
  for(const mutate of [
   (p:any)=>p.sections.pop(),(p:any)=>p.sections[0].references[0].page=99,(p:any)=>p.sections[0].references[0].sourceId='apex-ingles-105-v0.2',
   (p:any)=>p.sections[0].prerequisites=[1],(p:any)=>p.correctAnswer='forbidden',(p:any)=>p.sections[1].order=1,
   (p:any)=>p.kind=null,(p:any)=>p.sections[0].origin=null
  ]){const bad=structuredClone(data);mutate(bad);await assert.rejects(finishJob(db,j,bad));}
  const prompt=(await db.query<any>("SELECT enunciado FROM apex_private.pregunta WHERE id_fuente='apex-ingles-105-v0.2' LIMIT 1")).rows[0]!.enunciado;
  const copied=structuredClone(data);copied.sections[0]!.practice[0]!.prompt=prompt;await assert.rejects(finishJob(db,j,copied),/separada/);
  assert.equal((await db.query('SELECT * FROM apex_private.ruta_nivel_version')).rows.length,0);
  await asUser(db,u,async()=>{for(const sql of ['SELECT public.apex_ai_claim()',"SELECT public.apex_ai_finish(gen_random_uuid(),gen_random_uuid(),'{}')",'SELECT * FROM apex_private.seccion_ruta','SELECT * FROM apex_private.decision_avance'])await assert.rejects(db.query(sql),/permission denied/);});
  await db.exec("UPDATE apex_private.fragmento_documental SET uso_contexto=false WHERE id_fuente='learning-doc'");await assert.rejects(finishJob(db,j,data),/desactualizado/);
  await finishJob(db,j,null,'NO_AUTHORIZED_REFERENCES');const status=await route(db,u);assert.equal(status.levels[0].status,'unavailable');assert.equal(status.integrationConnected,false);
  await my(db,u,'route_retry',{level:1});const empty=await claim(db);assert.deepEqual(empty.input.references,[]);await finishJob(db,empty,null,'NO_AUTHORIZED_REFERENCES');
 }finally{await db.close();}
});

test('LRU accounts for every block member, prioritizes unseen blocks and returns audited errors without partial attempts',async()=>{
 const db=await setup();try{
  const u=await identity(db,541),admin=await identity(db,542,'administrador');const d=await start(db,u,await assignment(db,u,'diagnostico'));await score(db,u,d,0);await generate(db);await completeLevel(db,u,1);
  const blocks=(await db.query<any>("SELECT id FROM apex_private.bloque_preguntas WHERE familia_habilidad='vocabulario' ORDER BY codigo_original")).rows;
  for(const [index,b] of blocks.entries()){
   const members=(await db.query<any>('SELECT id,id_original FROM apex_private.pregunta WHERE id_bloque=$1 ORDER BY numero_original',[b.id])).rows;
   // Historical exposure fixtures: block 1 has one old member and four recent ones.
   // Taking MIN would choose it incorrectly. MAX must choose block 2 (all older).
   for(const [member,q] of members.entries())await db.query('INSERT INTO apex_private.exposicion_pregunta(id_estudiante,id_original,id_pregunta,id_intento,registrada_en) VALUES($1,$2,$3,$4,$5)',[u.id,q.id_original,q.id,d.id,new Date(Date.UTC(2020,0,index===0?(member===0?1:10):index===1?5:20))]);
  }
  const cid=await assignment(db,u,'control',1);const a=await start(db,u,cid);assert.equal(a.questions.find((q:any)=>q.context.format==='vocabulario_compartido').context.id,blocks[1].id);wholeBlocks(a);
  const latest=(await db.query<any>('SELECT max(registrada_en) recent FROM apex_private.exposicion_pregunta WHERE id_estudiante=$1 AND id_pregunta IN(SELECT id FROM apex_private.pregunta WHERE id_bloque=$2)',[u.id,blocks[1].id])).rows[0]!.recent;assert.ok(new Date(latest)>new Date('2020-01-20'));
  await score(db,u,a,0);
  await db.exec(`INSERT INTO apex_private.plantilla_evaluacion(id,id_fuente,version,titulo,tipo,nivel,cantidad,composicion,politica_exposicion,habilitada) VALUES('infeasible-v2','apex-ingles-105-v0.2',2,'Test only infeasible composition','control',1,10,'[{"family":"vocabulario","level":1,"difficulty":1,"size":10,"blocks":1}]','no_vistas_lru_bloques-v2',true);`);
  await asUser(db,admin,()=>db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[u.id],'infeasible-v2']));
  const badId=(await db.query<any>("SELECT id FROM apex_private.convocatoria_banco WHERE id_estudiante=$1 AND id_plantilla='infeasible-v2'",[u.id])).rows[0]!.id;
  const counts=(await db.query('SELECT * FROM apex_private.exposicion_pregunta')).rows.length;const error=await start(db,u,badId);assert.equal(error.error.code,'BANK_EXHAUSTED');assert.equal(error.error.policy,'no_vistas_lru_bloques-v2');
  assert.equal((await db.query('SELECT * FROM apex_private.exposicion_pregunta')).rows.length,counts);assert.equal((await db.query('SELECT * FROM apex_private.asignacion_evaluacion WHERE id=$1',[badId])).rows.length,0);assert.equal((await db.query('SELECT * FROM apex_private.agotamiento_banco WHERE id_convocatoria=$1',[badId])).rows.length,1);
 }finally{await db.close();}
});

test('Worker leases fence duplicate/late responses and interrupted work becomes retryable without replacing completed sections',async()=>{
 const db=await setup();try{
  const u=await identity(db,551);const d=await start(db,u,await assignment(db,u,'diagnostico'));await score(db,u,d,0);const first=await claim(db);
  await db.query("UPDATE apex_private.trabajo_ia SET vence_en=now()-interval '1 second' WHERE id=$1",[first.jobId]);const second=await claim(db);assert.equal(second.jobId,first.jobId);assert.notEqual(second.lease,first.lease);
  await assert.rejects(finishJob(db,first,generated(first)),/Lease/);
  await db.query("UPDATE apex_private.trabajo_ia SET vence_en=now()-interval '1 second',intentos=3 WHERE id=$1",[second.jobId]);assert.equal(await claim(db),null);assert.equal((await route(db,u)).levels[0].status,'error');
  await my(db,u,'route_retry',{level:1});const {j,data}=await generate(db);assert.equal(j.jobId,first.jobId);const snapshot=await route(db,u);await my(db,u,'route_retry',{level:1});assert.equal(await claim(db),null);assert.deepEqual(await route(db,u),snapshot);
  await assert.rejects(db.query('UPDATE apex_private.seccion_ruta SET titulo=$1 WHERE id=$2',['Changed',snapshot.levels[0].sections[0].id]),/inmutable/);
  assert.deepEqual(await finishJob(db,j,data),{status:'ready'});
 }finally{await db.close();}
});

test('Explicit cutover preserves an active legacy attempt; preparation idempotence creates no assignments and new registration allocates only v2',async()=>{
 const db=await database();try{
  const old=await identity(db,531);const before=await my(db,old,'me');const a=await start(db,old,before.assignments[0].id);
  await db.exec(read('../content/apex-ingles-105-v0.2.sql'));await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles')");
  await db.exec(read('../content/apex-learning-v2-templates.sql'));await db.exec(read('../content/apex-learning-v2-templates.sql'));
  await db.exec(read('../verify-learning-v2.sql'));
  assert.equal((await db.query('SELECT * FROM apex_private.convocatoria_banco')).rows.length,0);
  await db.exec(read('../transition-learning-v2.sql'));const recovered=await start(db,old,before.assignments[0].id);assert.equal(recovered.id,a.id);assert.deepEqual(recovered.questions,a.questions);assert.deepEqual(recovered.answers,a.answers);
  const newer=await identity(db,532);const summary=await my(db,newer,'me');assert.equal(summary.assignments.length,1);assert.equal(summary.assignments[0].kind,'diagnostico');assert.equal(summary.assignments[0].version,2);
  const admin=await identity(db,533,'administrador');const transition=()=>asUser(db,admin,()=>db.query<any>('SELECT public.apex_transition_diagnostic($1::text[]) v',[[newer.id]]));assert.equal((await transition()).rows[0]!.v.assigned,0);
  await assert.rejects(my(db,newer,'chat_open',{kind:'review',attemptId:a.id}),/propia reprobada/);
 }finally{await db.close();}
});

test('Upgrade over the already loaded bank preserves active/failed v1 controls, then linked review authorizes one v2 selection',async()=>{
 let activeUser!:User,failedUser!:User,activeAttempt:any,failedAttempt:any,activeId:string,failedId:string,oldResultRows:unknown;
 const db=await database(undefined,undefined,async prior=>{
  await prior.exec(read('../content/apex-ingles-105-v0.2.sql'));
  await prior.exec("INSERT INTO apex_private.programa_academico VALUES('legacy-upgrade','Legacy upgrade fixture');INSERT INTO apex_private.programa_componente VALUES('legacy-upgrade','ingles');UPDATE apex_private.plantilla_evaluacion SET habilitada=true;");
  activeUser=await identity(prior,561,'estudiante',{...registration,program:'legacy-upgrade'});failedUser=await identity(prior,562,'estudiante',{...registration,program:'legacy-upgrade'});const admin=await identity(prior,563,'administrador');
  await asUser(prior,admin,()=>prior.query('SELECT public.apex_assign_bank($1::text[],$2)',[[activeUser.id,failedUser.id],'apex-ingles-control-1-v1']));
  activeId=await assignment(prior,activeUser,'control',1);failedId=await assignment(prior,failedUser,'control',1);
  activeAttempt=await start(prior,activeUser,activeId);failedAttempt=await start(prior,failedUser,failedId);await score(prior,failedUser,failedAttempt,0);
  oldResultRows=(await prior.query('SELECT * FROM apex_private.resultado')).rows;
 });
 try{
  await db.exec(read('../content/apex-learning-v2-templates.sql'));await db.exec(educationalFixtureSQL);await db.exec(read('../transition-learning-v2.sql'));
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado')).rows,oldResultRows);
  const recovered=await start(db,activeUser,activeId!);assert.equal(recovered.id,activeAttempt.id);assert.deepEqual(recovered.questions,activeAttempt.questions);assert.deepEqual(recovered.answers,activeAttempt.answers);
  const completed=await my(db,activeUser,'finish',{attemptId:activeAttempt.id});assert.equal(completed.passed,false);assert.equal(completed.threshold,7);
  await assert.rejects(start(db,failedUser,failedId!),/repaso/);await review(db,failedUser,failedAttempt.id);
  const next=await start(db,failedUser,failedId!);assert.notEqual(next.id,failedAttempt.id);wholeBlocks(next);assert.equal((await start(db,failedUser,failedId!)).id,next.id);
  const ledger=(await db.query<any>('SELECT numero,politica_seleccion FROM apex_private.intento_ruta WHERE id_convocatoria=$1 ORDER BY numero',[failedId!])).rows;
  assert.deepEqual(ledger,[{numero:1,politica_seleccion:'solo_no_vistas-v1'},{numero:2,politica_seleccion:'no_vistas_lru_bloques-v2'}]);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[failedAttempt.id])).rows,oldResultRows);
  await asUser(db,activeUser,()=>assert.rejects(db.query('SELECT public.apex_assign_english($1::text[])',[['legacy-upgrade']]),/vigente/));
 }finally{await db.close();}
});
