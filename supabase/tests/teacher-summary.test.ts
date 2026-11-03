import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc} from './harness';
import {educationalFixtureSQL} from './learning-fixture';
import {beginDiagnostic,finishWith,publishSections,completeSections,beginControl,resolveReview,prepareSummaryStudent,studentCall,historicalCopy} from './teacher-summary-fixture';
import {technicalIdentity,syntheticSchedulerSQL} from './technical-clock-fixture';
import type {GroupSummary,TrackingStudent} from '../../shared/teacher';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles')");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));await db.exec(read('../transition-learning-v2.sql'));await db.exec(educationalFixtureSQL);
 const teacher=await identity(db,1101,'docente'),other=await identity(db,1102,'docente'),admin=await identity(db,1103,'administrador');
 const call=(user:typeof teacher|null,op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
 const create=async(code:string,owner=teacher)=>{
  const g=await call(admin,'admin_group_save',{code,name:`Synthetic ${code}`,componentId:'ingles'});
  await call(admin,'admin_group_teacher',{groupId:g.id,teacherId:owner.id,active:true});return g;
 };
 const group=await create('SUMMARY-A'),foreign=await create('SUMMARY-B',other);
 const member=async(n:number)=>{
  const u=await identity(db,n);await call(admin,'admin_group_member',{groupId:group.id,studentId:u.id,active:true});return u;
 };
 const summary=()=>call(teacher,'teacher_group_summary',{groupId:group.id}) as Promise<GroupSummary>;
 return {db,teacher,other,admin,call,group,foreign,member,summary};
}
test('Summary authorization, empty/no-result groups, unique population, reservations, revocation and read-only behavior',async()=>{
 const f=await setup();const {db,teacher,other,admin,call,group,foreign,member,summary}=f;
 try {
  let dto=await summary();assert.equal(dto.population,0);assert.equal(dto.reviewPending,0);assert.ok(dto.skills.every(x=>x.withResult===0&&x.groups.length===0));
  const student=await member(1110),inactive=await member(1111);
  await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:other.id,active:true});
  await db.query("UPDATE apex_private.usuario SET estado='inactivo' WHERE id=$1",[inactive.id]);
  const before=(await db.query('SELECT (SELECT count(*) FROM apex_private.intento) attempts,(SELECT count(*) FROM apex_private.progreso_seccion) progress,(SELECT count(*) FROM apex_private.trabajo_ia) jobs,(SELECT count(*) FROM apex_private.auditoria_grupo) audit')).rows;
  dto=await summary();assert.equal(dto.population,1);assert.equal(dto.group.membershipCount,2);assert.deepEqual(dto.diagnostic,{completed:0,inProgress:0,pending:1});
  assert.ok(dto.study.every(l=>l.pending===1&&l.withRoute===0&&l.completedSections===0));
  assert.ok(dto.assessments.every(a=>a.withoutResult===1&&a.notPassed===0&&a.passed===0&&a.undecided===0));
  assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM apex_private.intento) attempts,(SELECT count(*) FROM apex_private.progreso_seccion) progress,(SELECT count(*) FROM apex_private.trabajo_ia) jobs,(SELECT count(*) FROM apex_private.auditoria_grupo) audit')).rows,before);
  await assert.rejects(call(teacher,'teacher_group_summary',{groupId:foreign.id}),/no asignado/);
  await assert.rejects(call(student,'teacher_group_summary',{groupId:group.id}),/no asignado/);
  await assert.rejects(call(admin,'teacher_group_summary',{groupId:group.id}),/no asignado/);
  await assert.rejects(call(null,'teacher_group_summary',{groupId:group.id}),/permission denied|Inicia sesión/);
  await assert.rejects(call(teacher,'teacher_group_summary',{}),/no asignado/);
  await asUser(db,teacher,async()=>{
   for(const sql of ['SELECT apex_private.resumen_grupo_docente($1::uuid)',"SELECT public.apex_api_pre_resumen_docente('teacher_groups','{}'::jsonb)"])
    await assert.rejects(db.query(sql,sql.includes('$1')?[foreign.id]:[]),/permission denied/);
   await assert.rejects(db.query("SELECT apex_private.evidencia_habilidades_docente('any')"),/permission denied/);
  });
  await call(admin,'admin_group_member',{groupId:group.id,studentId:student.id,active:false});assert.equal((await summary()).population,0);
  await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:teacher.id,active:false});await assert.rejects(summary(),/no asignado/);
  await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:teacher.id,active:true});
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[teacher.sid]);await assert.rejects(summary(),/revocada/);
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  await db.exec(read('../preflight-teacher-summary.sql'));await db.exec(read('../verify-teacher-summary.sql'));
 }finally{await db.close();}
});

test('Summary diagnostic states, generated routes, latest completed results, active retries, resolved review and skill denominators',async()=>{
 const {db,member,summary,teacher,call,group}=await setup();try{
  await member(1120);const active=await member(1121),finished=await member(1122);
  await beginDiagnostic(db,active);
  const attempts=await prepareSummaryStudent(db,finished);
  let dto=await summary();assert.equal(dto.population,3);assert.deepEqual(dto.diagnostic,{completed:1,inProgress:1,pending:1});
  assert.deepEqual(dto.stages.map(s=>s.count),[2,0,1,0,0]);
  assert.deepEqual(dto.study,[{level:1,withRoute:1,pending:2,completedSections:7},{level:2,withRoute:1,pending:2,completedSections:3},{level:3,withRoute:0,pending:3,completedSections:0}]);
  assert.equal(dto.reviewPending,0,'old resolved failure must not sustain alert');
  assert.deepEqual(dto.assessments[0],{key:'control_1',withoutResult:2,passed:1,notPassed:0,undecided:0,activeAttempts:0,activeRetries:0});
  const skills=dto.skills.find(s=>s.key==='control_1')!;assert.equal(skills.supportedStudents,1);assert.equal(skills.groups.length,1);
  assert.equal(skills.groups[0]!.skills.reduce((n,s)=>n+s.total,0),10,'all omitted questions are included');
  assert.equal(skills.groups[0]!.skills.reduce((n,s)=>n+s.correct,0),7,'only newest finished attempt contributes');
  assert.ok(skills.groups[0]!.skills.every(s=>s.students===1&&s.id));
  // A separate control chain fails, its linked review resolves, then retry stays active.
  await completeSections(db,finished,2);
  const failed=await beginControl(db,finished,2);await finishWith(db,finished,failed,6);
  dto=await summary();assert.equal(dto.reviewPending,1);assert.equal(dto.assessments[1]!.notPassed,1);
  await resolveReview(db,finished,failed.id);const retry=await beginControl(db,finished,2);
  dto=await summary();assert.equal(dto.reviewPending,0);assert.equal(dto.assessments[1]!.notPassed,1);assert.equal(dto.assessments[1]!.activeRetries,1);
  const tracking=await call(teacher,'teacher_student',{groupId:group.id,studentId:finished.id}) as TrackingStudent;
  assert.equal(tracking.assessments[1]!.status,'finalizado');assert.equal(tracking.assessments[1]!.correct,6);assert.equal(tracking.assessments[1]!.activeRetry,true);
  await finishWith(db,finished,retry,7);dto=await summary();assert.equal(dto.assessments[1]!.passed,1);assert.equal(dto.assessments[1]!.notPassed,0);assert.equal(dto.reviewPending,0);
  assert.deepEqual(dto.stages.map(s=>s.count),[2,0,0,1,0]);
  assert.doesNotMatch(JSON.stringify(dto),/"(questionId|enunciado|es_correcta|correctAnswer|references|contexto|conversaciones|explicacion|assignmentId|studentId)"\s*:/);
  assert.equal(dto.skills[0]!.groups[0]!.skills.reduce((n,s)=>n+s.total,0),7);
  assert.equal(attempts.retry.questions.length,10);
 }finally{await db.close();}
});

test('Summary historical gaps, unknown decisions, deterministic ties, incompatible rules and version separation',async()=>{
 const {db,member,summary,teacher,call,group}=await setup();try{
  const first=await member(1130),second=await member(1131);const source=await prepareSummaryStudent(db,first);
  const diag=await beginDiagnostic(db,second);await finishWith(db,second,diag,2);
  await historicalCopy(db,first,source.diag.id,{id:'summary-gap',breakdown:false});
  let dto=await summary();assert.equal(dto.skills[0]!.fallbackStudents,1);assert.equal(dto.skills[0]!.supportedStudents,2);
  const at=Date.now()+20000;
  await historicalCopy(db,second,diag.id,{id:'summary-a',at});await historicalCopy(db,second,diag.id,{id:'summary-z',at});
  const track=await call(teacher,'teacher_student',{groupId:group.id,studentId:second.id}) as TrackingStudent;assert.equal(track.diagnostic!.id,'summary-z');
  await historicalCopy(db,first,source.retry.id,{id:'summary-no-decision',breakdown:false});
  dto=await summary();assert.equal(dto.assessments[0]!.undecided,1);assert.equal(dto.assessments[0]!.passed,0);assert.equal(dto.assessments[0]!.notPassed,0);assert.equal(dto.assessments[0]!.withoutResult,1);
  assert.equal(dto.skills[1]!.fallbackStudents,1,'skills may use older compatible, results must use latest completed');
  await historicalCopy(db,second,diag.id,{id:'summary-unknown-rule',rule:'synthetic-incompatible-rule',at:at+1000});
  dto=await summary();assert.equal(dto.skills[0]!.fallbackStudents,2,'incompatible rule is not combined');
  const unsupported=await member(1132);await historicalCopy(db,unsupported,diag.id,{breakdown:false});
  dto=await summary();assert.equal(dto.skills[0]!.withResult,3);assert.equal(dto.skills[0]!.supportedStudents,2);
  await historicalCopy(db,unsupported,source.retry.id,{result:false});dto=await summary();assert.equal(dto.incompleteHistory,1);assert.equal(dto.assessments[0]!.withoutResult,2);
  // Existing v1 template is a separate compatible series, even with the same skill IDs.
  await db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=true WHERE id='apex-ingles-control-1-v1'");
  await publishSections(db,second);await completeSections(db,second);
  const normal=await beginControl(db,second);await finishWith(db,second,normal,7);
  await db.query("INSERT INTO apex_private.convocatoria_banco(id_estudiante,id_plantilla) VALUES($1,'apex-ingles-control-1-v1')",[second.id]);
  const aid=(await db.query<{id:string}>("SELECT id FROM apex_private.convocatoria_banco WHERE id_estudiante=$1 AND id_plantilla='apex-ingles-control-1-v1'",[second.id])).rows[0]!.id;
  const version1=await studentCall(db,second,'start',{assignmentId:aid,confirmed:true});await finishWith(db,second,version1,7);
  // first retains a v2 compatible result; second contributes only its latest v1.
  dto=await summary();assert.equal(dto.skills[1]!.groups.length,2);assert.equal(dto.skills[1]!.groups.reduce((n,g)=>n+g.students,0),2);
 }finally{await db.close();}
});

test('Summary final uses 22/25, keeps 21/25 during an active retry and advances only with the saved final decision',async()=>{
 const {db,member,summary}=await setup();try{
  const user=await member(1150);await prepareSummaryStudent(db,user);
  await completeSections(db,user,2);const control2=await beginControl(db,user,2);await finishWith(db,user,control2,7);
  await publishSections(db,user,3);await completeSections(db,user,3);const control3=await beginControl(db,user,3);await finishWith(db,user,control3,7);
  const aid=(await db.query<{id:string}>("SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo='final'",[user.id])).rows[0]!.id;
  const final=await studentCall(db,user,'start',{assignmentId:aid,confirmed:true});const result=await finishWith(db,user,final,21);assert.equal(result.threshold,22);assert.equal(result.passed,false);
  let dto=await summary();assert.equal(dto.assessments[3]!.notPassed,1);assert.equal(dto.stages[3]!.count,1);assert.equal(dto.reviewPending,1);
  await resolveReview(db,user,final.id);const retry=await studentCall(db,user,'start',{assignmentId:aid,confirmed:true});
  dto=await summary();assert.equal(dto.assessments[3]!.activeRetries,1);assert.equal(dto.assessments[3]!.notPassed,1);assert.equal(dto.reviewPending,0);
  await finishWith(db,user,retry,22);dto=await summary();assert.equal(dto.assessments[3]!.passed,1);assert.equal(dto.assessments[3]!.notPassed,0);assert.equal(dto.stages[4]!.count,1);
  assert.equal(dto.skills[4]!.groups[0]!.skills.reduce((n,s)=>n+s.total,0),25);assert.equal(dto.skills[4]!.groups[0]!.skills.reduce((n,s)=>n+s.correct,0),22);
 }finally{await db.close();}
});

test('Summary excludes withdrawn technical, other components, mixed instruments and currently unauthorized members',async()=>{
 const {db,member,summary,admin,call,group}=await setup();try{
  const student=await member(1140);const diag=await beginDiagnostic(db,student);await finishWith(db,student,diag,1);
  const before=await summary();await historicalCopy(db,student,diag.id,{mixed:true});
  await db.query("INSERT INTO apex_private.asignacion_evaluacion VALUES('summary-rc',$1,'diagnostico-v1')",[student.id]);
  const rc=await studentCall(db,student,'start',{assignmentId:'summary-rc',confirmed:true});await studentCall(db,student,'finish',{attemptId:rc.id});
  let dto=await summary();assert.deepEqual(dto.skills,before.skills);assert.deepEqual(dto.diagnostic,before.diagnostic);
  await db.exec(syntheticSchedulerSQL);const technical=await technicalIdentity(db);
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");await db.exec(read('../enable-technical-clock-test.sql'));
  const technicalAssignment=(await studentCall(db,technical,'me')).technicalAssessment;
  const attempt=await studentCall(db,technical,'start',{assignmentId:technicalAssignment.id,confirmed:true});await studentCall(db,technical,'finish',{attemptId:attempt.id});
  await db.exec(read('../withdraw-technical-clock-test.sql'));
  await call(admin,'admin_group_member',{groupId:group.id,studentId:technical.id,active:true});
  dto=await summary();assert.equal(dto.population,2);assert.equal(dto.reviewPending,0);assert.ok(dto.assessments.every(a=>a.withoutResult===2));assert.equal(dto.skills[0]!.withResult,1);
  await db.query("UPDATE apex_private.estudiante SET id_programa='demo' WHERE id_usuario=$1",[technical.id]);
  // Remove English authorization without changing a membership reservation.
  await db.exec("DELETE FROM apex_private.programa_componente WHERE id_programa='demo' AND id_componente='ingles'");
  dto=await summary();assert.equal(dto.population,0);assert.equal(dto.group.membershipCount,2);assert.ok(dto.skills.every(s=>s.withResult===0));
 }finally{await db.close();}
});

test('Review chain order uses server attempt number when timestamps tie; optional section reinforcement does not count',async()=>{
 const {db,member,summary,teacher,call,group}=await setup();try{
  const sourceUser=await identity(db,1160),source=await prepareSummaryStudent(db,sourceUser),user=await member(1161);
  const at=Date.now()+10000;
  const first=await historicalCopy(db,user,source.retry.id,{id:'summary-z-first',at}),second=await historicalCopy(db,user,source.retry.id,{id:'summary-a-second',at});
  const chain=(await db.query<{id:string}>("INSERT INTO apex_private.convocatoria_banco(id_estudiante,id_plantilla) VALUES($1,'apex-ingles-control-1-v2') RETURNING id",[user.id])).rows[0]!.id;
  for(const [id,number] of [[first,1],[second,2]] as const){
   await db.query("INSERT INTO apex_private.intento_ruta(id_intento,id_convocatoria,numero,politica_seleccion) VALUES($1,$2,$3,'no_vistas_lru_bloques-v2')",[id,chain,number]);
   await db.query("INSERT INTO apex_private.decision_avance(id_intento,tipo,nivel,aciertos,total,umbral,aprobada) VALUES($1,'control',1,0,10,7,false)",[id]);
  }
  await resolveReview(db,user,first);await db.query('UPDATE apex_private.sesion_refuerzo SET id_nuevo_intento=$1 WHERE id_intento=$2',[second,first]);
  let dto=await summary();assert.equal(dto.reviewPending,1,'newest numbered failure remains pending even with lexically lower ID');
  let tracking=await call(teacher,'teacher_student',{groupId:group.id,studentId:user.id}) as TrackingStudent;assert.equal(tracking.assessments[0]!.reviewRequired,true);
  await resolveReview(db,user,second);dto=await summary();assert.equal(dto.reviewPending,0);
  tracking=await call(teacher,'teacher_student',{groupId:group.id,studentId:user.id}) as TrackingStudent;assert.equal(tracking.assessments[0]!.reviewRequired,false);
  // A real optional section session has no mandatory-review effect.
  await call((await identity(db,1162,'administrador')),'admin_group_member',{groupId:group.id,studentId:sourceUser.id,active:true});
  const section=(await db.query<{id:string}>('SELECT s.id FROM apex_private.seccion_ruta s JOIN apex_private.ruta_nivel_version r ON r.id=s.id_ruta WHERE r.id_estudiante=$1 LIMIT 1',[sourceUser.id])).rows[0]!.id;
  await db.query("INSERT INTO apex_private.sesion_refuerzo(id_estudiante,tipo,id_seccion) VALUES($1,'section',$2)",[sourceUser.id,section]);
  assert.equal((await summary()).reviewPending,0);
 }finally{await db.close();}
});
