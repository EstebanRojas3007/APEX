import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc} from './harness';
import {educationalFixtureSQL} from './learning-fixture';
import {beginDiagnostic,beginControl,finishWith,publishSections,completeSections,resolveReview,historicalCopy} from './teacher-summary-fixture';

const baseline=Date.UTC(2026,9,25,12);
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
async function setup(){
 const db=await database();
 // Registered before English authorization/configuration: no English assignment.
 const missing=await identity(db,1700);
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles');");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec(read('../transition-learning-v2.sql'));await db.exec(educationalFixtureSQL);
 await db.exec(`CREATE SCHEMA intervention_clock;CREATE TABLE intervention_clock.time(ms bigint);INSERT INTO intervention_clock.time VALUES(${baseline});
 CREATE OR REPLACE FUNCTION apex_private.epoch_ms() RETURNS bigint LANGUAGE sql VOLATILE AS $$SELECT ms FROM intervention_clock.time$$;
 UPDATE apex_private.configuracion_reloj SET activa=true;`);
 const teacher=await identity(db,1701,'docente'),second=await identity(db,1702,'docente'),stranger=await identity(db,1703,'docente');
 const admin=await identity(db,1704,'administrador'),student=await identity(db,1705);
 const call=(user:typeof teacher|null,op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
 const group=await call(admin,'admin_group_save',{code:'INTERVENTION',name:'Synthetic interventions',componentId:'ingles'});
 for(const user of [teacher,second])await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:user.id,active:true});
 for(const user of [student,missing])await call(admin,'admin_group_member',{groupId:group.id,studentId:user.id,active:true});
 const scope=(user=student)=>({groupId:group.id,studentId:user.id});
 const detail=(user=student)=>call(teacher,'teacher_student',scope(user));
 const assign=(actor=teacher,user=missing)=>call(actor,'teacher_assign_diagnostic',scope(user));
 const suspend=(attemptId:string,actor=teacher,user=student)=>call(actor,'teacher_suspend_attempt',{...scope(user),attemptId,reason:'Incidente técnico verificado en prueba aislada',confirmed:true});
 const time=(ms:number)=>db.query('UPDATE intervention_clock.time SET ms=$1',[ms]);
 const start=(assignmentId:string,resumeAttemptId?:string,user=student)=>call(user,'start',{assignmentId,confirmed:true,...(resumeAttemptId?{resumeAttemptId}:{})});
 const process=async()=>(await db.query<any>('SELECT apex_private.cerrar_intentos_vencidos(100) v')).rows[0]!.v;
 const scalar=async<T=any>(sql:string,args:unknown[]=[])=>Object.values((await db.query<Record<string,T>>(sql,args)).rows[0]!)[0]!;
 const stored=async(iid:string)=>({
  attempt:(await db.query<Record<string,unknown>>('SELECT * FROM apex_private.intento WHERE id=$1',[iid])).rows[0],
  selection:(await db.query('SELECT * FROM apex_private.seleccion_intento WHERE id_intento=$1 ORDER BY orden',[iid])).rows,
  answers:(await db.query('SELECT * FROM apex_private.respuesta WHERE id_intento=$1 ORDER BY id_item',[iid])).rows,
  clock:(await db.query('SELECT * FROM apex_private.reloj_intento WHERE id_intento=$1',[iid])).rows[0],
 });
 return {db,teacher,second,stranger,admin,student,missing,call,group,scope,detail,assign,suspend,time,start,process,scalar,stored};
}

test('Scoped diagnostic regularization: four states, idempotency, audit and immutable English history',async()=>{
 const f=await setup();try{
  assert.equal((await f.detail(f.missing)).teacherActions.diagnostic.state,'not_assigned');
  assert.equal((await f.assign()).assigned,1);assert.equal((await f.assign(f.second)).assigned,0);
  assert.equal(await f.scalar("SELECT count(*)::int FROM apex_private.intervencion_docente WHERE accion='regularizar_diagnostico'"),1);
  assert.equal((await f.detail(f.missing)).teacherActions.diagnostic.state,'assigned');
  assert.equal((await f.detail()).teacherActions.diagnostic.state,'assigned');
  const attempt=await beginDiagnostic(f.db,f.student),before=await f.stored(attempt.id);
  assert.equal((await f.detail()).teacherActions.diagnostic.state,'in_progress');
  assert.equal((await f.assign(f.teacher,f.student)).assigned,0);assert.deepEqual(await f.stored(attempt.id),before);
  await finishWith(f.db,f.student,attempt,3);
  const finished=await f.stored(attempt.id),result=await f.scalar('SELECT detalle FROM apex_private.resultado WHERE id_intento=$1',[attempt.id]);
  assert.equal((await f.detail()).teacherActions.diagnostic.state,'completed');
  assert.equal((await f.assign(f.teacher,f.student)).assigned,0);assert.deepEqual(await f.stored(attempt.id),finished);
  assert.deepEqual(await f.scalar('SELECT detalle FROM apex_private.resultado WHERE id_intento=$1',[attempt.id]),result);
  const event=(await f.db.query<any>('SELECT * FROM apex_private.intervencion_docente')).rows[0]!;
  assert.equal(event.id_actor,f.teacher.id);assert.equal(event.id_estudiante,f.missing.id);assert.equal(event.id_grupo,f.group.id);assert.equal(event.creada_en,baseline);assert.ok(event.motivo);
 }finally{await f.db.close();}
});

test('Teacher actions deny foreign teachers/students/admin, altered IDs and revoked scope/role/program; private helpers stay private',async()=>{
 const f=await setup();try{
  const active=await beginDiagnostic(f.db,f.student);
  for(const actor of [f.stranger,f.student,f.admin])await assert.rejects(f.assign(actor),/Solo docente|Grupo no asignado/);
  for(const actor of [f.stranger,f.student,f.admin])await assert.rejects(f.suspend(active.id,actor),/Solo docente|Grupo no asignado/);
  await assert.rejects(f.suspend(active.id,f.teacher,f.missing),/Intento no autorizado/);
  await assert.rejects(f.call(null,'teacher_assign_diagnostic',f.scope()),/permission denied/);
  await assert.rejects(f.call(f.teacher,'teacher_assign_diagnostic',{...f.scope(),studentId:f.admin.id}),/no asignado/);
  await asUser(f.db,f.teacher,async()=>{
   await assert.rejects(f.db.exec('SELECT * FROM apex_private.intervencion_docente'),/permission denied/);
   await assert.rejects(f.db.query('SELECT public.apex_api_pre_intervencion($1,$2::jsonb)',['teacher_assign_diagnostic',JSON.stringify(f.scope())]),/permission denied/);
   await assert.rejects(f.db.query('SELECT apex_private.iniciar_reemplazo_docente($1,true)',['forged']),/permission denied/);
   await assert.rejects(f.db.query('SELECT public.apex_transition_diagnostic($1::text[])',[[f.missing.id]]),/Solo administrador/);
  });
  const cases=[
   ["UPDATE apex_private.grupo_docente SET activa=false WHERE id_docente=$1","UPDATE apex_private.grupo_docente SET activa=true WHERE id_docente=$1",f.teacher.id],
   ["UPDATE apex_private.grupo_integrante SET activa=false WHERE id_estudiante=$1","UPDATE apex_private.grupo_integrante SET activa=true WHERE id_estudiante=$1",f.missing.id],
   ["UPDATE apex_private.grupo SET estado='inactivo' WHERE id=$1","UPDATE apex_private.grupo SET estado='activo' WHERE id=$1",f.group.id],
   ["UPDATE apex_private.usuario SET rol='estudiante' WHERE id=$1","UPDATE apex_private.usuario SET rol='docente' WHERE id=$1",f.teacher.id],
   ["UPDATE apex_private.usuario SET estado='inactivo' WHERE id=$1","UPDATE apex_private.usuario SET estado='activo' WHERE id=$1",f.missing.id],
  ];
  for(const [deny,restore,id] of cases){await f.db.query(deny!,[id]);await assert.rejects(f.assign(),/Solo docente|no asignado/);await f.db.query(restore!,[id]);}
  await f.db.exec("DELETE FROM apex_private.programa_componente WHERE id_programa='demo' AND id_componente='ingles'");
  await assert.rejects(f.assign(),/no asignado/);await f.db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles')");
  await f.db.query("UPDATE apex_private.usuario SET estado='inactivo' WHERE id=$1",[f.teacher.id]);await assert.rejects(f.assign(),/inactiva/);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.intervencion_docente'),0);
 }finally{await f.db.close();}
});

test('Diagnostic assignment respects unavailable templates/configuration/profile and any prior English control history',async()=>{
 const f=await setup();try{
  await f.db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=false WHERE id='apex-ingles-diagnostico-v2'");
  await assert.rejects(f.assign(),/no está disponible/);
  await f.db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=true WHERE id='apex-ingles-diagnostico-v2';UPDATE apex_private.configuracion_mvp SET diagnostico=NULL;");
  await assert.rejects(f.assign(),/no está activado/);
  await f.db.exec("UPDATE apex_private.configuracion_mvp SET diagnostico='apex-ingles-diagnostico-v2'");
  await f.db.query('UPDATE apex_private.usuario SET perfil_completo=false WHERE id=$1',[f.missing.id]);await assert.rejects(f.assign(),/perfil/);
  await f.db.query('UPDATE apex_private.usuario SET perfil_completo=true WHERE id=$1',[f.missing.id]);
  const diag=await beginDiagnostic(f.db,f.student);await finishWith(f.db,f.student,diag,3);await publishSections(f.db,f.student);await completeSections(f.db,f.student);
  const control=await beginControl(f.db,f.student);await finishWith(f.db,f.student,control,7);
  await historicalCopy(f.db,f.missing,control.id);
  assert.equal((await f.detail(f.missing)).teacherActions.diagnostic.state,'not_assigned');
  assert.equal((await f.detail(f.missing)).teacherActions.diagnostic.canAssign,false);
  assert.equal((await f.assign()).assigned,0);
 }finally{await f.db.close();}
});

test('Diagnostic exact 30-minute boundary: preserved original, one deferred replacement, stale writes rejected and no academic failure/review',async()=>{
 const f=await setup();try{
  const attempt=await beginDiagnostic(f.db,f.student),assignmentId=await f.scalar('SELECT id_asignacion FROM apex_private.intento WHERE id=$1',[attempt.id]);
  await f.call(f.student,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:attempt.questions[0].options[0].id});
  const before=await f.stored(attempt.id);
  await f.time(baseline+1800000-1);assert.equal((await f.detail()).teacherActions.exams[0].canSuspend,false);await assert.rejects(f.suspend(attempt.id),/umbral/);
  await f.time(baseline+1800000);assert.deepEqual(await f.process(),{processed:0,failed:0});
  assert.equal((await f.detail()).teacherActions.exams[0].canSuspend,true);
  for(const payload of [{reason:' ',confirmed:true},{reason:'Motivo',confirmed:false}])await assert.rejects(f.call(f.teacher,'teacher_suspend_attempt',{...f.scope(),attemptId:attempt.id,...payload}),/motivo|confirma/);
  assert.equal((await f.suspend(attempt.id)).code,'suspended');assert.equal((await f.suspend(attempt.id,f.second)).code,'already_suspended');
  const after=await f.stored(attempt.id);
  assert.deepEqual(after,{...before,attempt:{...before.attempt,estado:'suspendido'}});
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.intento WHERE estado=\'activo\''),0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.resultado'),0);assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.decision_avance'),0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.sesion_refuerzo'),0);
  for(const operation of ['attempt','attempt_clock','answer','finish'])assert.equal((await f.call(f.student,operation,{attemptId:attempt.id,item:attempt.questions[0].id,option:null})).error.code,'ATTEMPT_SUSPENDED');
  assert.equal((await f.start(assignmentId,attempt.id)).error.code,'ATTEMPT_SUSPENDED');
  await assert.rejects(f.db.query('UPDATE apex_private.respuesta SET id_opcion=NULL WHERE id_intento=$1',[attempt.id]),/no activo/);
  await assert.rejects(f.db.query("INSERT INTO apex_private.resultado VALUES($1,0,0,7,'aciertos-v1','{}'::jsonb)",[attempt.id]),/suspendido/);
  const summary=await f.call(f.teacher,'teacher_group_summary',{groupId:f.group.id});assert.equal(summary.diagnostic.completed,0);assert.equal(summary.reviewPending,0);
  const me=await f.call(f.student,'me');assert.equal(me.assignments.find((a:any)=>a.id===assignmentId).restartAvailable,true);
  await f.time(baseline+1900000);const replacement=await f.start(assignmentId);
  assert.notEqual(replacement.id,attempt.id);assert.equal(replacement.clock.startedAt,baseline+1900000);assert.equal(replacement.clock.expiresAt,null);
  assert.equal((await f.start(assignmentId)).id,replacement.id);assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.intervencion_docente WHERE id_original=$1',[attempt.id]),1);
  assert.equal(await f.scalar('SELECT id_reemplazo FROM apex_private.intervencion_docente WHERE id_original=$1',[attempt.id]),replacement.id);
  assert.deepEqual(await f.stored(attempt.id),after);
  assert.equal((await f.call(f.student,'me')).assignments.filter((a:any)=>a.kind==='diagnostico'&&a.componentIds.includes('ingles')).length,1);
  await finishWith(f.db,f.student,replacement,3);await assert.rejects(f.suspend(replacement.id),/calificado|cerrado/);
  await f.db.exec(read('../preflight-teacher-interventions.sql'));
  const reports=await f.db.exec(read('../verify-teacher-interventions.sql'));
  for(const report of reports)for(const row of report.rows){
   for(const name of ['suspended_with_academic_result','suspended_without_authorization','invalid_replacements','technical_interventions'])if(name in row)assert.equal(Number(row[name]),0,name);
  }
 }finally{await f.db.close();}
});

for(const [kind,threshold] of [['control',2700000],['final',3600000]] as const)test(`${kind}: exact ${threshold/60000}-minute exception, expiry required, suspend beats scheduler, retry chain remains usable`,async()=>{
 const f=await setup();try{
  const diag=await beginDiagnostic(f.db,f.student);await finishWith(f.db,f.student,diag,3);
  for(let level=1;level<=(kind==='final'?3:1);level++){
   await publishSections(f.db,f.student,level);await completeSections(f.db,f.student,level);
   if(kind==='final')await finishWith(f.db,f.student,await beginControl(f.db,f.student,level),7);
  }
  const assignmentId=await f.scalar(`SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo=$2 AND ($2='final' OR p.nivel=1)`,[f.student.id,kind]);
  const attempt=await f.start(assignmentId);const before=await f.stored(attempt.id);
  await f.time(baseline+threshold-1);await assert.rejects(f.suspend(attempt.id),/umbral/);
  await f.time(baseline+threshold);assert.equal((await f.detail()).teacherActions.exams.find((a:any)=>a.attemptId===attempt.id).canSuspend,true);
  await f.suspend(attempt.id);assert.deepEqual(await f.process(),{processed:0,failed:0});
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.resultado WHERE id_intento=$1',[attempt.id]),0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.decision_avance WHERE id_intento=$1',[attempt.id]),0);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.sesion_refuerzo WHERE id_intento=$1',[attempt.id]),0);
  assert.deepEqual((await f.stored(attempt.id)).selection,before.selection);
  await f.time(baseline+threshold+12345);const next=await f.start(assignmentId);
  assert.equal(next.clock.startedAt,baseline+threshold+12345);assert.equal(next.clock.durationSeconds,kind==='control'?900:2250);
  assert.equal((await f.start(assignmentId)).id,next.id);
  await finishWith(f.db,f.student,next,0);await assert.rejects(f.suspend(next.id),/calificado|cerrado/);
  await resolveReview(f.db,f.student,next.id);const ordinaryRetry=await f.start(assignmentId);
  assert.notEqual(ordinaryRetry.id,next.id);
  await f.time(ordinaryRetry.clock.startedAt+threshold);await f.suspend(ordinaryRetry.id);
  assert.equal((await f.call(f.student,'me')).assignments.find((a:any)=>a.id===assignmentId).restartAvailable,true);
  const secondReplacement=await f.start(assignmentId);assert.notEqual(secondReplacement.id,ordinaryRetry.id);
  assert.equal((await f.start(assignmentId)).id,secondReplacement.id);
 }finally{await f.db.close();}
});

test('Automatic/manual grade wins first; grading failure rolls back and allows later suspension (single connection)',async()=>{
 const f=await setup();try{
  const diagnostic=await beginDiagnostic(f.db,f.student);await finishWith(f.db,f.student,diagnostic,3);await publishSections(f.db,f.student);await completeSections(f.db,f.student);
  const control=await beginControl(f.db,f.student);await f.time(baseline+2700000);
  assert.deepEqual(await f.process(),{processed:1,failed:0});await assert.rejects(f.suspend(control.id),/calificado|cerrado/);
  await assert.rejects(f.suspend(diagnostic.id),/calificado|cerrado/);
  await resolveReview(f.db,f.student,control.id);const retry=await beginControl(f.db,f.student);
  await f.db.exec("CREATE FUNCTION intervention_clock.fail_grade() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic grader failure';END$$;CREATE TRIGGER fail_grade BEFORE INSERT ON apex_private.resultado FOR EACH ROW EXECUTE FUNCTION intervention_clock.fail_grade();");
  await f.time(retry.clock.startedAt+2700000);assert.deepEqual(await f.process(),{processed:0,failed:1});
  assert.equal(await f.scalar('SELECT estado FROM apex_private.intento WHERE id=$1',[retry.id]),'activo');
  await f.suspend(retry.id);await f.db.exec('DROP TRIGGER fail_grade ON apex_private.resultado');
  assert.deepEqual(await f.process(),{processed:0,failed:0});assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.resultado WHERE id_intento=$1',[retry.id]),0);
 }finally{await f.db.close();}
});

test('Historical untimed controls are not given retroactive expiry; suspended pre-bank diagnosis clones its fixed version',async()=>{
 const f=await setup();try{
  const diagnostic=await beginDiagnostic(f.db,f.student);await finishWith(f.db,f.student,diagnostic,3);await publishSections(f.db,f.student);await completeSections(f.db,f.student);
  await f.db.exec('UPDATE apex_private.configuracion_reloj SET activa=false');const control=await beginControl(f.db,f.student);
  await f.time(baseline+2700000);await assert.rejects(f.suspend(control.id),/vencimiento persistido/);
  // Synthetic pre-bank English-only form, preserving question versions.
  await f.db.query("INSERT INTO apex_private.evaluacion(id,titulo,version,tipo) VALUES('legacy-intervention','Legacy fixed English',1,'diagnostico')");
  await f.db.exec("INSERT INTO apex_private.evaluacion_componente VALUES('legacy-intervention','ingles')");
  await f.db.query("INSERT INTO apex_private.item_evaluacion SELECT gen_random_uuid()::text,'legacy-intervention',id_pregunta,orden FROM apex_private.item_evaluacion WHERE id_evaluacion=(SELECT id_evaluacion FROM apex_private.asignacion_evaluacion WHERE id=(SELECT id_asignacion FROM apex_private.intento WHERE id=$1))",[diagnostic.id]);
  await f.db.exec("UPDATE apex_private.evaluacion SET publicada=true WHERE id='legacy-intervention'");
  await f.db.query("INSERT INTO apex_private.asignacion_evaluacion VALUES('legacy-intervention-assignment',$1,'legacy-intervention')",[f.missing.id]);
  const old=await f.start('legacy-intervention-assignment',undefined,f.missing);await f.time(old.clock.startedAt+1800000);await f.suspend(old.id,f.teacher,f.missing);
  const next=await f.start('legacy-intervention-assignment',undefined,f.missing);assert.notEqual(next.id,old.id);
  assert.deepEqual(next.questions.map((q:any)=>q.questionId),old.questions.map((q:any)=>q.questionId));
  assert.equal((await f.call(f.missing,'me')).assignments.filter((a:any)=>a.componentIds.includes('ingles')).length,1);
  await finishWith(f.db,f.missing,next,3);assert.equal((await f.start('legacy-intervention-assignment',undefined,f.missing)).id,next.id);
 }finally{await f.db.close();}
});
