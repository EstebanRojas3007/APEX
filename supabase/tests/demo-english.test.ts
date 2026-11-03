import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc,registration} from './harness';
import {primaryAssignments,primaryResults} from '../../src/mvp';
import type {Summary} from '../../shared/contracts';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
type DB=Awaited<ReturnType<typeof database>>;
type User=Awaited<ReturnType<typeof identity>>;
const my=(db:DB,u:User,operation:string,payload:unknown={})=>asUser(db,u,()=>rpc(db,operation,payload));
async function prepared(){
 const db=await database();
 await db.exec(read('../content/apex-ingles-105-v0.2.sql'));
 await db.exec(read('../content/apex-learning-v2-templates.sql'));
 return db;
}
const summary=(db:DB,u:User):Promise<Summary>=>my(db,u,'me');
const transition=(db:DB,admin:User,ids:string[])=>asUser(db,admin,async()=>(await db.query<any>('SELECT public.apex_transition_diagnostic($1::text[]) v',[ids])).rows[0]!.v);

test('Approved demo/ingles association is idempotent, preserves rc, assigns future 2+2+3 without AI, and regularizes only the real target',async()=>{
 const db=await prepared();try{
  const legacy=await identity(db,701),admin=await identity(db,702,'administrador');
  const legacyAssignment=(await summary(db,legacy)).assignments![0]!;
  const rc=await my(db,legacy,'start',{assignmentId:legacyAssignment.id,confirmed:true});
  await my(db,legacy,'answer',{attemptId:rc.id,item:rc.questions[0].id,option:rc.questions[0].options[0].id});
  const stored=await my(db,legacy,'attempt',{attemptId:rc.id});
  await db.exec(read('../transition-learning-v2.sql'));
  await db.exec("INSERT INTO apex_private.programa_academico VALUES('untouched-demo-test','Untouched program'); INSERT INTO apex_private.programa_componente VALUES('untouched-demo-test','rc');");
  const other=await identity(db,703,'estudiante',{...registration,program:'untouched-demo-test'});
  // Only an isolated synthetic identity uses the owner's UUID to validate the exact SQL.
  const affected={id:'6b2c368a-22d1-41e3-bc08-38d3520a260d',sid:'20000000-0000-4000-8000-000000000704'};
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[affected.id,'synthetic-owner-id@example.test',JSON.stringify(registration)]);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[affected.sid,affected.id]);
  assert.equal((await summary(db,affected)).diagnosticAvailability!.code,'program_not_authorized');
  assert.equal((await summary(db,affected)).assignments!.length,0);
  const profiles=(await db.query('SELECT * FROM apex_private.estudiante ORDER BY id_usuario')).rows;
  const programs=(await db.query("SELECT * FROM apex_private.programa_componente WHERE id_programa<>'demo' ORDER BY id_programa,id_componente")).rows;
  const histories=(await db.query('SELECT * FROM apex_private.resultado')).rows;
  await db.exec(read('../authorize-demo-english-mvp.sql'));await db.exec(read('../authorize-demo-english-mvp.sql'));
  assert.deepEqual((await db.query('SELECT id_componente FROM apex_private.programa_componente WHERE id_programa=$1 ORDER BY id_componente',['demo'])).rows,[{id_componente:'ingles'},{id_componente:'rc'}]);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.estudiante ORDER BY id_usuario')).rows,profiles);
  assert.deepEqual((await db.query("SELECT * FROM apex_private.programa_componente WHERE id_programa<>'demo' ORDER BY id_programa,id_componente")).rows,programs);
  assert.equal((await summary(db,other)).assignments!.length,0);
  assert.equal((await summary(db,affected)).diagnosticAvailability!.code,'needs_transition');
  assert.equal((await summary(db,affected)).assignments!.length,0,'Association alone does not backfill profiles');
  const repaired=await asUser(db,admin,()=>db.query<any>(read('../regularize-demo-diagnostic.sql')));
  assert.equal(repaired.rows[0]!.apex_transition_diagnostic.assigned,1);
  assert.equal((await asUser(db,admin,()=>db.query<any>(read('../regularize-demo-diagnostic.sql')))).rows[0]!.apex_transition_diagnostic.assigned,0);
  await assert.rejects(asUser(db,affected,()=>db.query(read('../regularize-demo-diagnostic.sql'))),/administrador/);
  assert.equal((await summary(db,legacy)).assignments!.length,1,'No bulk regularization');
  const afterRC=await my(db,legacy,'attempt',{attemptId:rc.id});
  assert.equal(afterRC.id,stored.id);assert.deepEqual(afterRC.questions,stored.questions);assert.deepEqual(afterRC.answers,stored.answers);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado')).rows,histories);
  const fresh=await identity(db,705);
  for(const user of [affected,fresh]){
   const data=await summary(db,user);assert.equal(data.primaryComponent,'ingles');assert.equal(data.profile.program,'demo');assert.equal(data.assignments!.length,1);
   const assigned=data.assignments![0]!;assert.deepEqual(assigned.componentIds,['ingles']);assert.equal(assigned.count,7);assert.equal(assigned.version,2);
   const a=await my(db,user,'start',{assignmentId:assigned.id,confirmed:true});
   assert.deepEqual([1,2,3].map(level=>a.questions.filter((q:any)=>q.level===level).length),[2,2,3]);
   const result=await my(db,user,'finish',{attemptId:a.id});assert.deepEqual(result.componentIds,['ingles']);assert.equal(result.total,7);
   assert.equal((await transition(db,admin,[user.id])).assigned,0);
   assert.equal(primaryResults(await summary(db,user)).length,1);
  }
  assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM apex_private.trabajo_ia WHERE estado='ready'")).rows[0]!.n,0,'No IA consumer/response required');
  await db.exec(read('../verify-demo-english-mvp.sql'));
 }finally{await db.close();}
});

test('English occupies the main flow while an rc attempt/result remains accessible and immutable',async()=>{
 const db=await prepared();try{
  const legacy=await identity(db,711),admin=await identity(db,712,'administrador');
  const historical=(await summary(db,legacy)).assignments![0]!;
  const rc=await my(db,legacy,'start',{assignmentId:historical.id,confirmed:true});
  await db.exec(read('../transition-learning-v2.sql'));await db.exec(read('../authorize-demo-english-mvp.sql'));
  assert.equal((await transition(db,admin,[legacy.id])).assigned,1,'rc history does not count as English history');
  let data=await summary(db,legacy);
  const current=primaryAssignments(data);assert.equal(current.length,1);assert.notEqual(current[0]!.id,historical.id);
  assert.equal(data.assignments!.find(item=>item.id===historical.id)!.status,'activo');
  const english=await my(db,legacy,'start',{assignmentId:current[0]!.id,confirmed:true});await my(db,legacy,'finish',{attemptId:english.id});
  await my(db,legacy,'start',{assignmentId:historical.id,confirmed:true});const rcResult=await my(db,legacy,'finish',{attemptId:rc.id});
  assert.deepEqual(rcResult.componentIds,['rc']);
  const rows=(await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[rc.id])).rows;
  data=await summary(db,legacy);assert.equal(data.results.length,2);assert.equal(data.results.at(-1)!.attemptId,rc.id);
  assert.equal(primaryResults(data).at(-1)!.attemptId,english.id,'A newer rc result never replaces the English result in the main flow');
  assert.equal(primaryAssignments(data).find(item=>item.status!=='finalizado'),undefined);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado WHERE id_intento=$1',[rc.id])).rows,rows);
  assert.equal((await transition(db,admin,[legacy.id])).assigned,0);
 }finally{await db.close();}
});

test('Demo authorization refuses wrong configuration/IDs and rolls back without authorizing another program',async()=>{
 const db=await prepared();try{
  const original=(await db.query('SELECT * FROM apex_private.programa_componente ORDER BY id_programa,id_componente')).rows;
  await assert.rejects(db.exec(read('../authorize-demo-english-mvp.sql')),/debe estar configurado/);await db.exec('ROLLBACK');
  assert.deepEqual((await db.query('SELECT * FROM apex_private.programa_componente ORDER BY id_programa,id_componente')).rows,original);
  await db.exec(read('../transition-learning-v2.sql'));await db.exec("UPDATE apex_private.programa_academico SET nombre='Unexpected program' WHERE id='demo'");
  await assert.rejects(db.exec(read('../authorize-demo-english-mvp.sql')),/IDs\/nombres/);await db.exec('ROLLBACK');
  assert.deepEqual((await db.query('SELECT * FROM apex_private.programa_componente ORDER BY id_programa,id_componente')).rows,original);
 }finally{await db.close();}
});
