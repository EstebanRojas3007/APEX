import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc,registration} from './harness';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
type DB=Awaited<ReturnType<typeof database>>;
type User=Awaited<ReturnType<typeof identity>>;
const my=(db:DB,u:User,operation:string,payload:unknown={})=>asUser(db,u,()=>rpc(db,operation,payload));
async function setup(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 await db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=true; INSERT INTO apex_private.programa_academico VALUES('diagnostic-only','English-only test program'),('not-authorized','Program without English'); INSERT INTO apex_private.programa_componente VALUES('diagnostic-only','ingles');");
 return db;
}
const student=(db:DB,n:number,program='diagnostic-only')=>identity(db,n,'estudiante',{...registration,program});
const transition=(db:DB,admin:User,ids:string[])=>asUser(db,admin,async()=>(await db.query<any>('SELECT public.apex_transition_diagnostic($1::text[]) v',[ids])).rows[0]!.v);

test('Enabled templates alone reproduce empty listing; explicit cutover and administrative repair are idempotent without AI',async()=>{
 const db=await setup();try{
  const affected=await student(db,611),admin=await identity(db,612,'administrador');
  assert.equal((await my(db,affected,'me')).profile.complete,true);
  assert.equal((await my(db,affected,'me')).assignments.length,0);
  assert.equal((await my(db,affected,'me')).diagnosticAvailability.code,'not_activated');
  await assert.rejects(transition(db,admin,[affected.id]),/no habilitada/);
  await db.exec(read('../transition-learning-v2.sql'));
  await my(db,affected,'profile',{name:registration.name,program:'diagnostic-only',semester:2});
  assert.equal((await my(db,affected,'me')).assignments.length,0,'Profile editing does not replay initial assignment');
  assert.equal((await my(db,affected,'me')).diagnosticAvailability.code,'needs_transition');
  assert.deepEqual(await transition(db,admin,[affected.id,affected.id]),{assigned:1,requested:2});
  assert.equal((await transition(db,admin,[affected.id])).assigned,0);
  const fresh=await student(db,613),outsider=await student(db,614);
  for(const user of [affected,fresh]){
   const listing=await my(db,user,'me');assert.equal(listing.assignments.length,1);
   assert.equal(listing.diagnosticAvailability.code,'assigned');
   const assignment=listing.assignments[0];assert.equal(assignment.kind,'diagnostico');assert.equal(assignment.count,7);assert.equal(assignment.attemptId,null);
   const attempt=await my(db,user,'start',{assignmentId:assignment.id,confirmed:true});
   assert.deepEqual([1,2,3].map(level=>attempt.questions.filter((q:any)=>q.level===level).length),[2,2,3]);
   await my(db,user,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:attempt.questions[0].options[0].id});
   const saved=await my(db,user,'attempt',{attemptId:attempt.id});
   const resumed=await my(db,user,'start',{assignmentId:assignment.id,confirmed:true});
   assert.equal(resumed.id,saved.id);assert.deepEqual(resumed.questions,saved.questions);assert.deepEqual(resumed.answers,saved.answers);
   await assert.rejects(my(db,outsider,'start',{assignmentId:assignment.id,confirmed:true}),/no asignada|no autorizad/);
   assert.equal((await transition(db,admin,[user.id])).assigned,0);
   await my(db,user,'finish',{attemptId:attempt.id});
   const history=(await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows;
   assert.equal((await transition(db,admin,[user.id])).assigned,0);
   assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[attempt.id])).rows,history);
   assert.equal((await my(db,user,'me')).results.length,1);
  }
  assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM apex_private.trabajo_ia WHERE estado='ready'")).rows[0]!.n,0,'No worker or generated content needed for the diagnostic');
  await asUser(db,null,()=>assert.rejects(rpc(db,'me'),/permission denied/));
  await assert.rejects(transition(db,outsider,[affected.id]),/administrador/);
  await db.exec(read('../inspect-diagnostic-assignment.sql').replace("apex.inspect_auth_id='00000000-0000-0000-0000-000000000000'",`apex.inspect_auth_id='${affected.id}'`));
 }finally{await db.close();}
});

test('Registration completes before email confirmation; English authorization and stored consent govern initial assignment',async()=>{
 const db=await setup();try{
  await db.exec(read('../transition-learning-v2.sql'));
  const denied=await student(db,621,'not-authorized'),admin=await identity(db,622,'administrador');
  assert.equal((await my(db,denied,'me')).profile.complete,true);assert.equal((await my(db,denied,'me')).assignments.length,0);
  assert.equal((await my(db,denied,'me')).diagnosticAvailability.code,'program_not_authorized');
  await assert.rejects(transition(db,admin,[denied.id]),/inválidos/);
  await db.exec("INSERT INTO apex_private.programa_componente VALUES('not-authorized','ingles')");
  assert.equal((await my(db,denied,'me')).assignments.length,0,'Authorization after signup needs explicit transition');
  assert.equal((await transition(db,admin,[denied.id])).assigned,1);
  const fresh=await student(db,623);
  assert.equal((await db.query<any>('SELECT email_confirmed_at FROM auth.users WHERE id=$1',[fresh.id])).rows[0]!.email_confirmed_at,null);
  assert.equal((await my(db,fresh,'me')).assignments.length,1,'Auth INSERT has already stored the complete profile and assignment');
  const invited=await identity(db,624,'estudiante',{});
  await db.query("UPDATE apex_private.usuario SET nombre='Stored invited student',fecha_nacimiento='2000-01-01' WHERE id=$1",[invited.id]);
  await my(db,invited,'profile',{name:'Stored invited student',program:'diagnostic-only',semester:1});
  assert.equal((await my(db,invited,'me')).profile.complete,false);assert.equal((await my(db,invited,'me')).assignments.length,0);
  assert.equal((await my(db,invited,'me')).diagnosticAvailability.code,'profile_pending');
  await my(db,invited,'profile_consent',{consent:true});await my(db,invited,'profile_consent',{consent:true});
  assert.equal((await my(db,invited,'me')).assignments.length,1);
  await db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=false WHERE id='apex-ingles-diagnostico-v2'");
  const unavailable=await student(db,625);
  assert.equal((await my(db,unavailable,'me')).assignments.length,0);
  assert.equal((await my(db,unavailable,'me')).diagnosticAvailability.code,'template_unavailable');
  await db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=true WHERE id='apex-ingles-diagnostico-v2'");
  assert.equal((await transition(db,admin,[unavailable.id])).assigned,1);
  await asUser(db,fresh,async()=>{for(const sql of ['SELECT apex_private.estado_diagnostico($1)','SELECT apex_private.ingles_con_historial($1)'])await assert.rejects(db.query(sql,[denied.id]),/permission denied/);});
 }finally{await db.close();}
});

test('Administrative diagnostic transition must skip any existing English attempt and preserve active answers and finished results',async()=>{
 const db=await setup();try{
  const active=await student(db,631),finished=await student(db,632),admin=await identity(db,633,'administrador');
  await asUser(db,admin,()=>db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[active.id,finished.id],'apex-ingles-control-1-v1']));
  const attempts=[];
  for(const user of [active,finished]){
   const aid=(await my(db,user,'me')).assignments[0].id;
   const attempt=await my(db,user,'start',{assignmentId:aid,confirmed:true});
   await my(db,user,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:attempt.questions[0].options[0].id});
   if(user===finished)await my(db,user,'finish',{attemptId:attempt.id});
   attempts.push(await my(db,user,'attempt',{attemptId:attempt.id}));
  }
  const results=(await db.query('SELECT * FROM apex_private.resultado')).rows;
  await db.exec(read('../transition-learning-v2.sql'));
  assert.deepEqual(await transition(db,admin,[active.id,finished.id]),{assigned:0,requested:2});
  await asUser(db,admin,async()=>assert.equal((await db.query<any>('SELECT public.apex_assign_bank($1::text[],$2) v',[[active.id,finished.id],'apex-ingles-diagnostico-v2'])).rows[0]!.v.assigned,0));
  for(const [i,user] of [active,finished].entries()){
   const current=await my(db,user,'attempt',{attemptId:attempts[i].id});
   // The clock sample and optional result projection are not persisted attempt fields.
   // The unchanged result snapshots are verified directly below across the learning cutover.
   assert.deepEqual({...current,result:undefined,clock:{...current.clock,serverNow:0}},{...attempts[i],result:undefined,clock:{...attempts[i].clock,serverNow:0}});assert.equal((await my(db,user,'me')).assignments.length,1);
   assert.equal((await my(db,user,'me')).diagnosticAvailability.code,'english_history');
  }
  await db.query('UPDATE apex_private.usuario SET perfil_completo=false WHERE id=$1',[finished.id]);
  await my(db,finished,'profile_consent',{consent:true});
  assert.equal((await my(db,finished,'me')).assignments.length,1,'Legacy initial profile recovery cannot allocate another diagnostic over English history');
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado')).rows,results);
 }finally{await db.close();}
});
