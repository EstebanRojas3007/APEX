import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,identity,asUser,rpc,profile} from './harness';
import type {RouteProposal} from '../../shared/contracts';
import {englishFixture} from './english-fixture';
import {buildEnglishLoad,sourceId,storagePath,officialUrl,diagnosticId} from '../../scripts/build-english-load.mjs';
test('Route contract: empty/pending, authorized catalog and rules, prerequisites, stale proposals, idempotence and preserved completed work',async()=>{
 const db=await database();
 try{
  const user=await identity(db,301);await asUser(db,user,()=>rpc(db,'profile',profile));
  await db.exec("INSERT INTO apex_private.componente VALUES('ingles','Inglés'); INSERT INTO apex_private.programa_componente VALUES('demo','ingles'); INSERT INTO apex_private.competencia(id,id_componente,nombre,origen_clasificacion) VALUES('route-fixture-skill','ingles','Synthetic skill','propuesta_apex');");
  const status=await asUser(db,user,()=>db.query<any>('SELECT public.apex_my_route() value'));
  assert.equal(status.rows[0]!.value.message,'generación de ruta pendiente');assert.equal(status.rows[0]!.value.integrationConnected,false);
  const getContext=async()=> {await db.exec('SET ROLE service_role');try{return (await db.query<any>('SELECT public.apex_route_agent_context($1) value',[user.id])).rows[0]!.value;}finally{await db.exec('RESET ROLE');}};
  const empty=await getContext();assert.deepEqual(empty.input.catalog,[]);assert.deepEqual(empty.input.rules,[]);assert.deepEqual(empty.input.diagnosticBySkill,[]);
  // Synthetic lessons/rules are test fixtures, never application defaults.
  await db.exec(`INSERT INTO apex_private.fuente(id,titulo,organismo,estado,ruta_archivo,sha256,paginas) VALUES('lesson-doc','Synthetic educational source','TEST','revisado','test-lessons.pdf',repeat('b',64),4);
   INSERT INTO apex_private.regla_ruta_version VALUES('route-fixture-rule',1,'[[1,1],[1,2],[2,1],[2,2]]',true,'{"authority":"responsable del proyecto","testOnly":true}');`);
  const lesson=async(id:string,level:number,prerequisites:string[]=[],approved=true,source='lesson-doc')=> db.query(`INSERT INTO apex_private.leccion_version(id,codigo,version,titulo,nivel,id_competencia,objetivo,explicacion,ejemplos,practica_propia,referencias,prerrequisitos,procedencia,aprobada,aprobacion) VALUES($1,$1,1,$1,$2,'route-fixture-skill','Synthetic objective','Synthetic explanation',$3,$3,$4,$5,'propia_apex',$6,'{"authority":"responsable del proyecto","testOnly":true}')`,[id,level,JSON.stringify([{prompt:'Synthetic lesson exercise '+id,response:'Synthetic solution',explanation:'Synthetic explanation'}]),JSON.stringify([{sourceId:source,page:1}]),prerequisites,approved]);
  await lesson('lesson-a',1);await lesson('lesson-b',2,['lesson-a']);await lesson('draft-lesson',1,[],false);
  await assert.rejects(lesson('bad-prereq',1,['unknown']),/Prerrequisitos/);
  await db.exec("INSERT INTO apex_private.fuente(id,titulo,organismo,estado,ruta_archivo,sha256,paginas,contiene_soluciones,contexto_tutor_permitido) VALUES('secret-bank','Synthetic secret bank','TEST','revisado','secret.pdf',repeat('a',64),4,true,false);");
  await assert.rejects(lesson('bad-source',1,[],true,'secret-bank'),/Referencia didáctica/);
  const ctx=await getContext();
  assert.deepEqual(ctx.input.catalog.map((l:any)=>l.lessonVersionId),['lesson-a','lesson-b']);
  assert.doesNotMatch(JSON.stringify(ctx),/student301|example.test|birthDate|password|es_correcta|correctAnswer|justification|secret.pdf|Synthetic solution/);
  const step=(id:string,order:number,kind:'lesson'|'reinforcement'='lesson')=>({lessonVersionId:id,order,kind,reason:'Synthetic individual reason',prerequisites:id==='lesson-b'?['lesson-a']:[]});
  const proposal:RouteProposal={contractVersion:1,contextId:ctx.contextId,baseVersion:0,ruleVersionId:'route-fixture-rule',reason:'Synthetic route based on skill data',agent:{provider:'test',model:'fixture',promptVersion:'1'},steps:[step('lesson-a',1),step('lesson-b',2)]};
  const save=async(p:unknown)=>(await db.query<any>('SELECT public.apex_save_route_proposal($1::jsonb) value',[JSON.stringify(p)])).rows[0]!.value;
  await assert.rejects(save({...proposal,steps:[step('draft-lesson',1)]}),/Contenido no autorizado/);
  await assert.rejects(save({...proposal,ruleVersionId:'invented-rule'}),/Reglas pedagógicas/);
  await assert.rejects(save({...proposal,steps:[step('lesson-b',1),step('lesson-a',2)]}),/Orden de prerrequisitos/);
  await assert.rejects(save({...proposal,steps:[step('lesson-a',1),step('lesson-b',2),step('lesson-a',3)]}),/repetido/);
  await assert.rejects(save({...proposal,steps:[step('lesson-a',2)]}),/Paso de ruta/);
  await assert.rejects(save({...proposal,steps:[step('lesson-a',1),{...step('lesson-b',2),prerequisites:[]}]}),/no coinciden/);
  await assert.rejects(save({...proposal,correctAnswer:'invented'}),/Contrato de ruta/);
  await db.exec('SET ROLE service_role');let saved;
  try{saved=await save(proposal);}finally{await db.exec('RESET ROLE');}
  assert.equal(saved.version,1);assert.deepEqual(await save(proposal),saved);
  await assert.rejects(save({...proposal,reason:'Different duplicate'}),/propuesta diferente/);
  await assert.rejects(db.query("UPDATE apex_private.leccion_version SET explicacion='changed' WHERE id='lesson-a'"),/inmutable/);
  // Only an authoritative backend may supply evidence of completion. No client completion endpoint exists.
  await db.query("INSERT INTO apex_private.progreso_leccion VALUES($1,'lesson-a',now(),'route-fixture-rule','{\"fixture\":\"verified evidence\"}')",[user.id]);
  const completedBefore=(await db.query('SELECT * FROM apex_private.progreso_leccion')).rows;
  const ctx2=await getContext(),obsolete=await getContext();
  const p2={...proposal,contextId:ctx2.contextId,baseVersion:1,steps:[step('lesson-b',1),step('lesson-a',2,'reinforcement')]};
  const saved2=await save(p2);assert.equal(saved2.version,2);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.progreso_leccion')).rows,completedBefore);
  assert.equal((await db.query('SELECT * FROM apex_private.ruta_version')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM apex_private.paso_ruta WHERE id_ruta=$1',[saved.routeId])).rows.length,2);
  assert.equal((await db.query<any>('SELECT id_anterior FROM apex_private.ruta_version WHERE id=$1',[saved2.routeId])).rows[0]!.id_anterior,saved.routeId);
  await assert.rejects(save({...p2,contextId:obsolete.contextId}),/desactualizados/);
  const ctx3=await getContext();
  await assert.rejects(save({...proposal,contextId:ctx3.contextId,baseVersion:2,steps:[step('lesson-a',1)]}),/Conserva lo realizado/);
  await db.exec(`INSERT INTO apex_private.regla_ruta_version VALUES('no-reforces',2,'[[1,1],[1,2],[2,1],[2,2]]',false,'{"authority":"responsable del proyecto"}');`);
  const ctx4=await getContext();
  await assert.rejects(save({...proposal,contextId:ctx4.contextId,baseVersion:2,ruleVersionId:'no-reforces',steps:[step('lesson-a',1,'reinforcement')]}),/Refuerzo no autorizado/);
  await db.exec(`INSERT INTO apex_private.regla_ruta_version VALUES('no-transition',3,'[[1,1]]',true,'{"authority":"responsable del proyecto"}');`);
  const ctx5=await getContext();
  await assert.rejects(save({...proposal,contextId:ctx5.contextId,baseVersion:2,ruleVersionId:'no-transition',steps:[step('lesson-a',1,'reinforcement'),step('lesson-b',2)]}),/Transición pedagógica/);
  await asUser(db,user,async()=>{
   const pending=(await db.query<any>('SELECT public.apex_my_route() value')).rows[0]!.value;
   assert.equal(pending.status,'pending');assert.equal(pending.validatedVersion,2);assert.deepEqual(pending.completedLessons,['lesson-a']);
   await assert.rejects(db.query('SELECT * FROM apex_private.ruta_version'),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_route_agent_context($1)',[user.id]),/permission denied/);
   await assert.rejects(save(proposal),/permission denied/);
  });
 }finally{await db.close();}
});

test('Route agent receives real server metrics for the preserved seven-item English diagnostic, including omissions and excluding other components',async()=>{
 const db=await database();
 try{
  const user=await identity(db,401),admin=await identity(db,402,'administrador');
  await asUser(db,user,async()=>{
   await rpc(db,'profile',profile);const me=await rpc(db,'me');const demo=await rpc(db,'start',{assignmentId:me.assignments[0].id,confirmed:true});await rpc(db,'finish',{attemptId:demo.id});
  });
  const f=englishFixture();await db.query("INSERT INTO apex_private.fuente(id,titulo,organismo,url_origen,ruta_archivo) VALUES($1,'Synthetic diagnostic source','TEST',$2,$3)",[sourceId,officialUrl,storagePath]);
  await db.exec(buildEnglishLoad(f.content,f.key));
  await db.query("UPDATE apex_private.fuente SET estado='revisado' WHERE id=$1",[sourceId]);
  await db.query("UPDATE apex_private.pregunta SET estado_revision='revisada',revisada_por=$1,revisada_en=now() WHERE id_fuente=$2",[admin.id,sourceId]);
  await db.query("UPDATE apex_private.bloque_preguntas SET estado_revision='revisada',revisada_por=$1,revisada_en=now() WHERE id_fuente=$2",[admin.id,sourceId]);
  await db.query('UPDATE apex_private.evaluacion SET publicada=true WHERE id=$1',[diagnosticId]);
  await asUser(db,admin,()=>db.query("SELECT public.apex_assign_english(ARRAY['demo'])"));
  const a=(await db.query<any>('SELECT id FROM apex_private.asignacion_evaluacion WHERE id_estudiante=$1 AND id_evaluacion=$2',[user.id,diagnosticId])).rows[0]!.id;
  await asUser(db,user,async()=>{
   const english=await rpc(db,'start',{assignmentId:a,confirmed:true});assert.equal(english.questions.length,7);
   await rpc(db,'answer',{attemptId:english.id,item:english.questions[0].id,option:english.questions[0].options[0].id});await rpc(db,'finish',{attemptId:english.id});
  });
  const response=(await db.query<any>('SELECT public.apex_route_agent_context($1) value',[user.id])).rows[0]!.value;
  assert.equal(response.input.diagnosticBySkill.reduce((n:number,s:any)=>n+s.total,0),7);
  assert.equal(response.input.diagnosticBySkill.reduce((n:number,s:any)=>n+s.correct,0),1);
  assert.equal(response.input.progress.assessmentResults.length,1,'Quantitative demo remains in history but is excluded from English route context');
  assert.equal((await asUser(db,user,()=>rpc(db,'me'))).results.length,2);
  assert.doesNotMatch(JSON.stringify(response),/es_correcta|correctAnswer|Synthetic option|Synthetic word|@example/);
 }finally{await db.close();}
});
