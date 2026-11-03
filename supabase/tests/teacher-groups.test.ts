import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc} from './harness';
import {educationalFixtureSQL,generatedFixture} from './learning-fixture';
import {technicalIdentity,syntheticSchedulerSQL} from './technical-clock-fixture';
import type {TeacherRoster,TrackingStudent} from '../../shared/teacher';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles')");
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec(read('../transition-learning-v2.sql'));
 await db.exec(educationalFixtureSQL);
 return db;
}
test('Teacher groups: roles, two-teacher isolation, tampered IDs, legacy bypasses and revocation',async()=>{
 const db=await setup();try{
  const a=await identity(db,801,'docente'),b=await identity(db,802,'docente'),admin=await identity(db,803,'administrador'),alice=await identity(db,804),bob=await identity(db,805);
  const call=(user:typeof a|null,op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
  assert.deepEqual(await call(a,'teacher_groups'),[]);
  await assert.rejects(call(null,'teacher_groups'),/permission denied/);
  await assert.rejects(call(alice,'teacher_groups'),/Solo docente/);
  const ga=await call(admin,'admin_group_save',{code:'SYNTH-A',name:'Synthetic A',componentId:'ingles'});
  const gb=await call(admin,'admin_group_save',{code:'SYNTH-B',name:'Synthetic B',componentId:'ingles'});
  for(const [group,teacher,student] of [[ga,a,alice],[gb,b,bob]]){
   await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:teacher.id,active:true});
   await call(admin,'admin_group_member',{groupId:group.id,studentId:student.id,active:true});
  }
  assert.equal((await call(a,'teacher_groups'))[0].activeCount,1);
  assert.equal((await call(b,'teacher_groups'))[0].id,gb.id);
  assert.equal((await call(a,'teacher_group',{groupId:ga.id})).students[0].id,alice.id);
  await assert.rejects(call(a,'teacher_group',{groupId:gb.id}),/no asignado/);
  await assert.rejects(call(a,'teacher_student',{groupId:ga.id,studentId:bob.id}),/no asignado/);
  await assert.rejects(call(a,'teacher_student',{groupId:gb.id,studentId:alice.id}),/no asignado/);
  await assert.rejects(call(alice,'teacher_student',{groupId:ga.id,studentId:alice.id}),/Solo docente/);
  await assert.rejects(call(a,'student_results',{studentId:alice.id}),/selecciona su grupo/);
  for(const op of ['admin_group_save','admin_group_member','admin_group_teacher','set_role','assign_teacher'])await assert.rejects(call(a,op),/Solo administrador/);
  for(const op of ['answer','finish','start','chat_open','review_complete'])await assert.rejects(call(a,op,{studentId:alice.id}),/no autorizada/);
  await asUser(db,a,async()=>{
   await assert.rejects(db.exec('SELECT * FROM apex_private.grupo_integrante'),/permission denied/);
   await assert.rejects(db.exec('SELECT * FROM apex_private.auditoria_grupo'),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_api_pre_docente($1,$2::jsonb)',['students','{}']),/permission denied/);
   await assert.rejects(db.query('SELECT apex_private.seguimiento_estudiante($1,$2)',[bob.id,'ingles']),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_transition_diagnostic($1::text[])',[[bob.id]]),/Solo administrador/);
   await assert.rejects(db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[bob.id],'apex-ingles-final-v2']),/Solo administrador/);
   assert.deepEqual((await db.query('SELECT public.apex_materials() value')).rows[0],{value:[]});
   await assert.rejects(db.query("SELECT public.apex_document_context('learning-doc')"),/no autorizada/);
   assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
  });
  // Legacy pairs cannot preserve access after a group membership is withdrawn.
  await db.query('INSERT INTO apex_private.asignacion_docente VALUES($1,$2)',[a.id,alice.id]);
  await call(admin,'admin_group_member',{groupId:ga.id,studentId:alice.id,active:false});
  await assert.rejects(call(a,'teacher_student',{groupId:ga.id,studentId:alice.id}),/no asignado/);
  await asUser(db,a,async()=>assert.equal((await db.query<{value:boolean}>('SELECT apex_private.puede_leer_estudiante($1) value',[alice.id])).rows[0]!.value,false));
  assert.equal((await call(a,'teacher_group',{groupId:ga.id})).group.activeCount,0);
  await call(admin,'admin_group_member',{groupId:ga.id,studentId:alice.id,active:true});
  await call(admin,'admin_group_teacher',{groupId:ga.id,teacherId:a.id,active:false});
  await assert.rejects(call(a,'teacher_group',{groupId:ga.id}),/no asignado/);
  assert.deepEqual(await call(a,'teacher_groups'),[]);
  await call(admin,'admin_group_teacher',{groupId:ga.id,teacherId:a.id,active:true});
  await call(admin,'admin_group_save',{groupId:ga.id,code:ga.code,name:ga.name,componentId:'ingles',status:'inactivo'});
  await assert.rejects(call(a,'teacher_student',{groupId:ga.id,studentId:alice.id}),/no asignado/);
  assert.ok((await db.query('SELECT * FROM apex_private.auditoria_grupo')).rows.length>5);
  await assert.rejects(db.exec('DELETE FROM apex_private.auditoria_grupo'),/inmutable/);
  // Neither absence of a group nor its revocation changes a student's own route.
  assert.equal((await call(alice,'me')).assignments.length,1);
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[a.sid]);
  await assert.rejects(call(a,'teacher_groups'),/revocada/);
 }finally{await db.close();}
});

test('Teacher progress uses actual diagnostic, seven sections, decisions and review history without private content',async()=>{
 const db=await setup();try{
  const teacher=await identity(db,811,'docente'),admin=await identity(db,812,'administrador'),student=await identity(db,813);
  const call=(user:{id:string;sid:string},op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
  const group=await call(admin,'admin_group_save',{code:'SYNTH-P',name:'Synthetic progress',componentId:'ingles'});
  await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:teacher.id,active:true});
  await call(admin,'admin_group_member',{groupId:group.id,studentId:student.id,active:true});
  const tracking=()=>call(teacher,'teacher_student',{groupId:group.id,studentId:student.id}) as Promise<TrackingStudent>;
  let dto=await tracking();assert.equal(dto.currentLevel,null);assert.equal(dto.diagnosticStatus,'pendiente');
  assert.ok(dto.levels.every(l=>l.completed===0&&l.sections.length===7&&l.sections.every(s=>s.status==='pending')));
  const summary=await call(student,'me');const attempt=await call(student,'start',{assignmentId:summary.assignments[0].id,confirmed:true});
  assert.equal(attempt.questions.length,7);assert.deepEqual([1,2,3].map(l=>attempt.questions.filter((q:any)=>q.level===l).length),[2,2,3]);
  await call(student,'finish',{attemptId:attempt.id});
  dto=await tracking();assert.equal(dto.diagnosticStatus,'completado');assert.equal(dto.diagnostic!.total,7);assert.equal(dto.currentLevel,1);
  assert.equal(dto.diagnostic!.skills.reduce((n,s)=>n+s.total,0),7);
  assert.ok(dto.lastActivityAt);assert.equal(dto.lastSignInAt,null,'minimal fixture has no reliable Auth sign-in source');
  await db.exec('ALTER TABLE auth.users ADD COLUMN last_sign_in_at timestamptz');
  await db.query("UPDATE auth.users SET last_sign_in_at='2025-01-01T10:00:00Z' WHERE id=$1",[student.id]);
  dto=await tracking();assert.equal(Date.parse(dto.lastSignInAt!),Date.parse('2025-01-01T10:00:00Z'));assert.notEqual(dto.lastSignInAt,dto.lastActivityAt,'sign-in and activity have separate sources');
  await db.exec('SET ROLE service_role');
  const job=(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v;
  await db.query('SELECT public.apex_ai_finish($1,$2,$3::jsonb,NULL)',[job.jobId,job.lease,JSON.stringify(generatedFixture(job))]);
  await db.exec('RESET ROLE');
  const sections=(await asUser(db,student,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v)).levels[0].sections;
  for(const section of sections)await call(student,'section_complete',{sectionId:section.id});
  const aid=(await call(student,'me')).assignments.find((a:any)=>a.kind==='control').id;
  const control=await call(student,'start',{assignmentId:aid,confirmed:true});await call(student,'finish',{attemptId:control.id});
  dto=await tracking();assert.equal(dto.levels[0]!.completed,7);assert.equal(dto.assessments[0]!.passed,false);assert.equal(dto.reviewRequired,true);
  assert.equal(dto.attempts.length,2);assert.equal(dto.attempts[1]!.threshold,7);
  const review=await call(student,'chat_open',{kind:'review',attemptId:control.id});
  await db.query("INSERT INTO apex_private.mensaje_refuerzo(id_sesion,rol,texto,clave) VALUES($1,'user','PRIVATE-TUTOR-MESSAGE','synthetic-secret')",[review.id]);
  const evidence=JSON.stringify(await tracking());
  assert.doesNotMatch(evidence,/PRIVATE-TUTOR|es_correcta|justificacion_privada|claves_originales|correctAnswer|explicacion|referencias|PRIVATE-KEY/);
  await db.query("INSERT INTO apex_private.asignacion_evaluacion VALUES('teacher-rc-history',$1,'diagnostico-v1')",[student.id]);
  const rc=await call(student,'start',{assignmentId:'teacher-rc-history',confirmed:true});await call(student,'finish',{attemptId:rc.id});
  assert.equal((await tracking()).attempts.length,2,'English teacher scope excludes other academic components');
  const before=(await db.query('SELECT apex_private.historial_json($1) h',[student.id])).rows;
  await call(admin,'admin_group_member',{groupId:group.id,studentId:student.id,active:false});
  assert.deepEqual((await db.query('SELECT apex_private.historial_json($1) h',[student.id])).rows,before);
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.progreso_seccion WHERE id_estudiante=$1',[student.id])).rows[0]!.n,7);
  assert.equal((await call(student,'me')).results.length,3);
 }finally{await db.close();}
});

test('Group capacity: direct SQL and admin RPC cap at 20, idempotency, reactivation and no minimum gate (single connection)',async()=>{
 const db=await setup();try{
  const admin=await identity(db,820,'administrador');
  const call=(op:string,payload:unknown)=>asUser(db,admin,()=>rpc(db,op,payload));
  const group=await call('admin_group_save',{code:'SYNTH-C',name:'Synthetic capacity',componentId:'ingles'});
  for(let n=0;n<21;n++)await identity(db,830+n);
  const ids=(await db.query<{id:string}>("SELECT id FROM apex_private.usuario WHERE correo LIKE 'student8%@example.test' AND rol='estudiante' ORDER BY id")).rows.map(r=>r.id);
  for(const id of ids.slice(0,20))await call('admin_group_member',{groupId:group.id,studentId:id,active:true});
  await call('admin_group_member',{groupId:group.id,studentId:ids[0],active:true});
  await assert.rejects(call('admin_group_member',{groupId:group.id,studentId:ids[20],active:true}),/Máximo 20/);
  await assert.rejects(db.query('INSERT INTO apex_private.grupo_integrante(id_grupo,id_estudiante) VALUES($1,$2)',[group.id,ids[20]]),/Máximo 20/);
  await call('admin_group_member',{groupId:group.id,studentId:ids[0],active:false});
  await call('admin_group_member',{groupId:group.id,studentId:ids[20],active:true});
  await assert.rejects(call('admin_group_member',{groupId:group.id,studentId:ids[0],active:true}),/Máximo 20/);
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.grupo_integrante WHERE id_grupo=$1 AND activa',[group.id])).rows[0]!.n,20);
 }finally{await db.close();}
});

test('Withdrawn technical attempt is excluded from teacher attempts, controls, review flags and progress',async()=>{
 const db=await setup();try{
  await db.exec(syntheticSchedulerSQL);
  const student=await technicalIdentity(db),teacher=await identity(db,860,'docente'),admin=await identity(db,861,'administrador');
  const call=(user:{id:string;sid:string},op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  await db.exec(read('../enable-technical-clock-test.sql'));
  const assignment=(await call(student,'me')).technicalAssessment;
  const attempt=await call(student,'start',{assignmentId:assignment.id,confirmed:true});await call(student,'finish',{attemptId:attempt.id});
  await db.exec(read('../withdraw-technical-clock-test.sql'));
  const group=await call(admin,'admin_group_save',{code:'SYNTH-T',name:'Synthetic technical exclusion',componentId:'ingles'});
  await call(admin,'admin_group_teacher',{groupId:group.id,teacherId:teacher.id,active:true});
  await call(admin,'admin_group_member',{groupId:group.id,studentId:student.id,active:true});
  const dto:TrackingStudent=await call(teacher,'teacher_student',{groupId:group.id,studentId:student.id});
  assert.deepEqual(dto.attempts,[]);assert.equal(dto.diagnosticStatus,'pendiente');assert.equal(dto.reviewRequired,false);assert.equal(dto.currentLevel,null);
  assert.ok(dto.assessments.every(a=>a.status==='pendiente'&&a.passed===null));assert.ok(dto.levels.every(l=>l.completed===0));
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows[0]!.n,1,'technical history preserved');
 }finally{await db.close();}
});

test('Owner initialization maps Auth to a different domain ID, is idempotent, audited and reversible without touching history',async()=>{
 const db=await setup();try{
  const authId='15824777-ce97-43d0-815a-f815eba41bdb',sid='10000000-0000-4000-8000-000000000899';
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[authId,'synthetic-owner-target@example.test']);
  await db.query("UPDATE apex_private.usuario SET id='historical-domain-teacher',nombre='Historical teacher',fecha_nacimiento='2000-01-01',perfil_completo=true WHERE auth_user_id=$1",[authId]);
  await db.exec("INSERT INTO apex_private.estudiante VALUES('historical-domain-teacher','demo',3); INSERT INTO apex_private.asignacion_evaluacion VALUES('owner-historical-assignment','historical-domain-teacher','diagnostico-v1');");
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,authId]);
  const student={id:authId,sid};
  const attempt=await asUser(db,student,()=>rpc(db,'start',{assignmentId:'owner-historical-assignment',confirmed:true}));
  await asUser(db,student,()=>rpc(db,'finish',{attemptId:attempt.id}));
  const snapshot=async()=>(await db.query("SELECT to_jsonb(u)-ARRAY['rol','revision_cuenta'] profile,to_jsonb(e) student,apex_private.historial_json(u.id) history FROM apex_private.usuario u JOIN apex_private.estudiante e ON e.id_usuario=u.id WHERE u.auth_user_id=$1",[authId])).rows;
  const before=await snapshot();
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  await db.exec(read('../verify-first-teacher.sql'));
  for(let n=0;n<2;n++)await db.exec(read('../assign-first-teacher.sql'));
  assert.deepEqual(await snapshot(),before);
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.auditoria_rol')).rows[0]!.n,1);
  const audit=(await db.query<any>('SELECT * FROM apex_private.auditoria_rol')).rows[0]!;assert.equal(audit.actor,null);assert.equal(audit.origen,'inicializacion_propietario_20261022');
  assert.equal((await asUser(db,student,()=>rpc(db,'me'))).profile.role,'docente');
  await asUser(db,student,async()=>{await assert.rejects(db.exec(read('../assign-first-teacher.sql')),/Solo el propietario SQL/);await db.exec('ROLLBACK');});
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  for(let n=0;n<2;n++)await db.exec(read('../revert-first-teacher.sql'));
  assert.deepEqual(await snapshot(),before);assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.auditoria_rol')).rows[0]!.n,2);
  assert.equal((await asUser(db,student,()=>rpc(db,'me'))).profile.role,'estudiante');
  await db.exec(read('../verify-teacher-groups.sql'));
  await db.exec(read('../preflight-teacher-groups.sql'));
 }finally{await db.close();}
});

test('Directed group SQL requires explicit IDs, validates membership, is idempotent and reverses only selected links',async()=>{
 const db=await setup();try{
  const teacher=await identity(db,891,'docente'),student=await identity(db,892);
  const template=read('../manage-teacher-group.sql');
  await assert.rejects(db.exec(template),/Completa grupo/);await db.exec('ROLLBACK');
  const prepared=template.replace('group_id UUID:=NULL',"group_id UUID:='20000000-0000-4000-8000-000000000891'")
   .replace('group_code TEXT:=NULL',"group_code TEXT:='SYNTH-EXPLICIT'").replace('group_name TEXT:=NULL',"group_name TEXT:='Synthetic explicit group'")
   .replace('teacher_ids TEXT[]:=ARRAY[]::TEXT[]',`teacher_ids TEXT[]:=ARRAY['${teacher.id}']::TEXT[]`)
   .replace('student_ids TEXT[]:=ARRAY[]::TEXT[]',`student_ids TEXT[]:=ARRAY['${student.id}']::TEXT[]`);
  for(let n=0;n<2;n++)await db.exec(prepared);
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.grupo_integrante')).rows[0]!.n,1);
  assert.equal((await asUser(db,teacher,()=>rpc(db,'teacher_groups')))[0].activeCount,1);
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  const reverse=read('../revoke-teacher-group.sql').replace('group_id UUID:=NULL',"group_id UUID:='20000000-0000-4000-8000-000000000891'")
   .replace('student_ids TEXT[]:=ARRAY[]::TEXT[]',`student_ids TEXT[]:=ARRAY['${student.id}']::TEXT[]`);
  for(let n=0;n<2;n++)await db.exec(reverse);
  assert.equal((await asUser(db,teacher,()=>rpc(db,'teacher_groups')))[0].activeCount,0);
  assert.equal((await db.query<{n:number}>('SELECT count(*) n FROM apex_private.grupo_docente WHERE activa')).rows[0]!.n,1,'unselected teacher link remains active');
  assert.equal((await asUser(db,student,()=>rpc(db,'me'))).assignments.length,1,'own diagnostic is independent of the roster');
 }finally{await db.close();}
});
