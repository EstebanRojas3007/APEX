import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { database,identity,asUser,rpc,profile } from './harness';

test('Supabase: complete journey, authorization, immutable versions and Storage policies',async()=>{
 const db=await database();
 try {
 const alice=await identity(db,1),bob=await identity(db,2),teacher=await identity(db,3,'docente'),admin=await identity(db,4,'administrador');
 let attempt:any,assignment:string;
 await asUser(db,null,async()=>{
  await assert.rejects(rpc(db,'me'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM apex_private.opcion_respuesta'),/permission denied/);
 });
 await asUser(db,alice,async()=>{
  assert.equal((await rpc(db,'me')).profile.role,'estudiante','user metadata must not assign roles');
  await assert.rejects(rpc(db,'set_role',{userId:alice.id,role:'administrador'}),/Solo administrador/);
  await assert.rejects(db.query("UPDATE apex_private.usuario SET rol='administrador'"),/permission denied/);
  await assert.rejects(rpc(db,'profile',{...profile,birthDate:'2000-02-31'}));
  await rpc(db,'profile',profile); await rpc(db,'profile',profile);
  const summary=await rpc(db,'me'); assert.equal(summary.assignments.length,1);
  assignment=summary.assignments[0].id;
  attempt=await rpc(db,'start',{assignmentId:assignment,confirmed:true});
  assert.equal(attempt.questions.length,7);
  assert.deepEqual((await db.query<{value:any}>('SELECT public.apex_materials() AS value')).rows[0]!.value,[],'do not expose a source PDF or its study content during its active attempt');
  assert.doesNotMatch(JSON.stringify(attempt),/es_correcta|correctAnswer|isCorrect/);
  assert.equal((await rpc(db,'start',{assignmentId:assignment,confirmed:true})).id,attempt.id);
  await assert.rejects(rpc(db,'answer',{attemptId:attempt.id,item:'item1',option:'q2-o0'}),/incompatible/);
  await assert.rejects(rpc(db,'answer',{attemptId:attempt.id,item:'missing',option:'q1-o0'}),/incompatible/);
  await rpc(db,'answer',{attemptId:attempt.id,item:'item1',option:'q1-o0'});
  await rpc(db,'activity',{scope:'menu'});
  await assert.rejects(rpc(db,'answer',{attemptId:attempt.id,item:'item1',option:null}),/Retoma/);
  const resumed=await rpc(db,'start',{assignmentId:assignment,confirmed:true});
  assert.equal(resumed.answers.item1,'q1-o0');
 });
 await asUser(db,bob,async()=>{
  await rpc(db,'profile',profile);
  await assert.rejects(rpc(db,'attempt',{attemptId:attempt.id}),/no autorizado/);
  await assert.rejects(rpc(db,'answer',{attemptId:attempt.id,item:'item1',option:'q1-o0'}),/no autorizado/);
  await assert.rejects(rpc(db,'finish',{attemptId:attempt.id}),/no autorizado/);
  await assert.rejects(rpc(db,'start',{assignmentId:assignment,confirmed:true}),/no asignada/);
 });
 let result:any;
 await asUser(db,alice,async()=>{
  result=await rpc(db,'finish',{attemptId:attempt.id});
  assert.equal(result.correct,1);assert.equal(result.total,7);assert.equal(result.nuclei.reduce((n:number,x:any)=>n+x.total,0),7);
  assert.deepEqual(await rpc(db,'finish',{attemptId:attempt.id}),result);
  await assert.rejects(rpc(db,'answer',{attemptId:attempt.id,item:'item1',option:null}),/Retoma/);
  assert.deepEqual((await rpc(db,'me')).results,[result]);
  await assert.rejects(db.query('SELECT * FROM apex_private.v_historial_academico'),/permission denied/);
 });
 await assert.rejects(db.query("UPDATE apex_private.opcion_respuesta SET es_correcta=0 WHERE id='q1-o0'"),/inmutable/);
 await assert.rejects(db.query("INSERT INTO apex_private.opcion_respuesta VALUES ('new-option','q1','new',9,0)"),/inmutable/);
 await assert.rejects(db.query("UPDATE apex_private.pregunta SET enunciado='changed' WHERE id='q1'"),/inmutable/);
 await assert.rejects(db.query("UPDATE apex_private.nucleo_tematico SET nombre='changed' WHERE id='datos'"),/inmutable/);
 await assert.rejects(db.query("UPDATE apex_private.item_evaluacion SET id_pregunta='q2' WHERE id='item1'"),/inmutable/);
 await assert.rejects(db.query("UPDATE apex_private.respuesta SET id_opcion=null WHERE id_intento=$1",[attempt.id]),/no activo/);
 await asUser(db,teacher,async()=>{
  assert.deepEqual(await rpc(db,'students'),[]);
  await assert.rejects(rpc(db,'student_results',{studentId:alice.id}),/no asignado/);
 });
 await asUser(db,admin,async()=>{
  await assert.rejects(rpc(db,'assign_teacher',{teacherId:teacher.id,studentId:alice.id}),/asignaciones explícitas de grupo/);
  await db.exec('RESET ROLE');await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[bob.id]);await db.exec('SET ROLE authenticated');
  await assert.rejects(rpc(db,'set_role',{userId:bob.id,role:'docente',reason:'Verified synthetic role assignment',confirmed:true}),/aceptación/);
  // Other authorized staff operations remain supported by the legacy endpoint.
  await rpc(db,'set_role',{userId:bob.id,role:'administrador',reason:'Verified synthetic role assignment',confirmed:true});
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('materiales-estudio','revision/documento.pdf')");
  assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1);
  assert.equal((await db.query("DELETE FROM storage.objects WHERE name='revision/documento.pdf' RETURNING id")).rows.length,0);
 });
 await asUser(db,teacher,async()=>{
  assert.deepEqual(await rpc(db,'students'),[],'legacy unscoped teacher listing is retired');
  await assert.rejects(rpc(db,'student_results',{studentId:alice.id}),/selecciona su grupo/);
  await assert.rejects(rpc(db,'student_results',{studentId:bob.id}),/no asignado/);
 });
 await asUser(db,alice,async()=>{
  assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0,'unreviewed PDFs not readable');
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('materiales-estudio','forged.pdf')"),/row-level security/);
 });
 assert.equal((await db.query('SELECT * FROM apex_private.auditoria_rol')).rows.length,1);
 // Server gate cannot be reset using activity, a refreshed JWT, or a different operation.
 await db.query("UPDATE apex_private.sesion_actividad SET ultima_actividad=now()-interval '91 seconds' WHERE id=$1",[alice.sid]);
 await asUser(db,alice,async()=>{
  await assert.rejects(rpc(db,'activity'),/inactividad/);
  await assert.rejects(rpc(db,'me'),/inactividad/);
 });
 // Revoked Auth sessions are also denied.
 await db.query('DELETE FROM auth.sessions WHERE id=$1',[teacher.sid]);
 await asUser(db,teacher,()=>assert.rejects(rpc(db,'me'),/revocada/));
 }finally{await db.close();}
});

test('Auth hook: five failures, correct password cannot bypass lock; hook not callable by client',async()=>{
 const db=await database();
 try {
  const user=await identity(db,5);
  const call=async(valid:boolean)=>(await db.query<{value:any}>('SELECT apex_private.password_verification_hook($1) AS value',[JSON.stringify({user_id:user.id,valid})])).rows[0]!.value;
  for(let n=0;n<4;n++)assert.equal((await call(false)).decision,'continue');
  assert.equal((await call(false)).decision,'reject');assert.equal((await call(true)).decision,'reject');
  await db.query("UPDATE apex_private.bloqueo_auth SET bloqueado_hasta=now()-interval '1 second'");
  assert.equal((await call(true)).decision,'continue');
  await asUser(db,user,()=>assert.rejects(call(true),/permission denied/));
 }finally{await db.close();}
});

test('Draft PDFs never publish questions or AI context; guards survive broad existing Storage policies',async()=>{
 const db=await database();
 try {
  const student=await identity(db,10),admin=await identity(db,11,'administrador');
  await asUser(db,student,()=>rpc(db,'profile',profile));
  // Deliberately synthetic test metadata; not an ICFES source or an application seed.
  await db.exec(`INSERT INTO apex_private.fuente(id,titulo,organismo,url_origen,ruta_archivo,sha256,paginas) VALUES('fixture-pdf','Synthetic fixture','TEST','https://example.test/fixture.pdf','fixture.pdf',repeat('a',64),2);
   INSERT INTO storage.objects(bucket_id,name) VALUES('materiales-estudio','fixture.pdf');
   INSERT INTO apex_private.material_estudio(id,id_fuente,titulo,contenido,version) VALUES('fixture-material','fixture-pdf','Synthetic fixture','TEST',1);
   INSERT INTO apex_private.material_nucleo VALUES('fixture-material','datos');
   CREATE POLICY broad_test_policy ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
   CREATE POLICY broad_anon_test ON storage.objects FOR SELECT TO anon USING(true);
   GRANT SELECT ON storage.objects TO anon;`);
  await assert.rejects(db.exec("INSERT INTO apex_private.fragmento_documental(id_fuente,pagina,ordinal,texto,metodo_extraccion,version_extractor) VALUES('fixture-pdf',3,1,'TEST','fixture','1')"),/Página/);
  await db.exec("INSERT INTO apex_private.fragmento_documental(id_fuente,pagina,ordinal,texto,metodo_extraccion,version_extractor) VALUES('fixture-pdf',1,1,'TEST PAGE','fixture','1')");
  const context=async()=>(await db.query<{value:any}>("SELECT public.apex_document_context('fixture-pdf') AS value")).rows[0]!.value;
  await asUser(db,student,async()=>{
   await assert.rejects(context(),/no autorizada/);
   assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
   await assert.rejects(db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('materiales-estudio','forged.pdf')"),/row-level security/);
  });
  await asUser(db,null,async()=>assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0));
  await asUser(db,admin,async()=>{
   assert.deepEqual(await context(),[]);
   assert.equal((await db.query("UPDATE storage.objects SET name='changed.pdf' RETURNING id")).rows.length,0);
   assert.equal((await db.query('DELETE FROM storage.objects RETURNING id')).rows.length,0);
  });
  await db.exec("UPDATE apex_private.material_estudio SET publicado=true WHERE id='fixture-material'; UPDATE apex_private.fuente SET estado='revisado' WHERE id='fixture-pdf'");
  await asUser(db,student,async()=>{
   assert.deepEqual(await context(),[],'unreviewed fragments not returned');
   assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1);
  });
  await assert.rejects(db.exec("UPDATE apex_private.fragmento_documental SET uso_contexto=true"),/Revisa/);
  await db.exec("UPDATE apex_private.fragmento_documental SET revisado=true,uso_contexto=true");
  await asUser(db,student,async()=>{
   const chunks=await context();assert.equal(chunks[0].page,1);assert.equal(chunks[0].filePath,'fixture.pdf');
  });
  // A new draft version can be edited, but publication rejects unknown provenance/unsupported formats.
  await db.exec(`INSERT INTO apex_private.pregunta(id,id_fuente,id_nucleo,id_competencia,enunciado,version,tipo) VALUES('draft','fixture-pdf','datos','resolver','TEST ONLY',1,'abierta');
   INSERT INTO apex_private.evaluacion(id,titulo,version) VALUES('draft-eval','TEST ONLY',1);
   INSERT INTO apex_private.evaluacion_componente VALUES('draft-eval','rc');
   INSERT INTO apex_private.item_evaluacion SELECT 'draft-'||orden,'draft-eval',CASE WHEN orden=1 THEN 'draft' ELSE id_pregunta END,orden FROM apex_private.item_evaluacion WHERE id_evaluacion='diagnostico-v1';`);
  await assert.rejects(db.exec("UPDATE apex_private.evaluacion SET publicada=true WHERE id='draft-eval'"),/Contenido no revisado/);
  await asUser(db,student,async()=>{
   const a=(await rpc(db,'me')).assignments[0];const i=await rpc(db,'start',{assignmentId:a.id,confirmed:true});
   await assert.rejects(rpc(db,'answer',{attemptId:i.id,item:'draft-2',option:'q2-o0'}),/incompatible/);
   await rpc(db,'answer',{attemptId:i.id,item:'item1',option:null});
  });
  const unsecured=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='apex_private' AND NOT rowsecurity");assert.equal(unsecured.rows.length,0);
 }finally{await db.close();}
});

test('Additive upgrade preserves a legacy profile and resumes the exact previously started attempt',async()=>{
 const user={id:'00000000-0000-4000-8000-000000000099',sid:'10000000-0000-4000-8000-000000000099'};
 const db=await database(async db=>{
  const seed=readFileSync(new URL('../seed-demo.sql',import.meta.url),'utf8').split('\n').filter(line=>!line.startsWith('UPDATE ')).join('\n');
  await db.exec(seed);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[user.id,'legacy@example.test']);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[user.sid,user.id]);
  await db.exec(`INSERT INTO apex_private.usuario VALUES('legacy','old-provider','old-uid','Legacy','legacy@example.test','2000-01-01','activo');
    INSERT INTO apex_private.estudiante VALUES('legacy','demo',1);
    INSERT INTO apex_private.asignacion_evaluacion VALUES('legacy-assignment','legacy','diagnostico-v1');
    INSERT INTO apex_private.intento VALUES('legacy-attempt','legacy-assignment','activo',1,1,NULL);
    INSERT INTO apex_private.respuesta VALUES('legacy-attempt','item1','q1-o0',1);`);
 });
 try{
  const old=await db.query<{auth_user_id:string|null;uid_auth:string}>("SELECT auth_user_id,uid_auth FROM apex_private.usuario WHERE id='legacy'");
  assert.equal(old.rows[0]!.auth_user_id,null,'no automatic email-based identity linking');assert.equal(old.rows[0]!.uid_auth,'old-uid');
  // Explicit, verified mapping performed by trusted operator; not available to app clients.
  await db.query("UPDATE apex_private.usuario SET auth_user_id=$1,perfil_completo=true WHERE id='legacy'",[user.id]);
  await asUser(db,user,async()=>{
   const resumed=await rpc(db,'start',{assignmentId:'legacy-assignment',confirmed:true});
   assert.equal(resumed.id,'legacy-attempt');assert.equal(resumed.answers.item1,'q1-o0');
   const result=await rpc(db,'finish',{attemptId:resumed.id});assert.equal(result.correct,1);assert.equal(result.total,7);
  });
  assert.equal((await db.query<{publicada:boolean}>("SELECT publicada FROM apex_private.evaluacion WHERE id='diagnostico-v1'")).rows[0]!.publicada,false);
 }finally{await db.close();}
});
