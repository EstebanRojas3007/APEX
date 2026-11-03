import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,identity,asUser,rpc,profile,registration} from './harness';

test('Registration persists validated data, consent and diagnostic atomically before email confirmation',async()=>{
 const db=await database();
 try {
  const id=randomUUID();
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id,'pending@example.test',JSON.stringify({...registration,name:'  Perfil guardado  ',role:'administrador',estado:'inactivo',complete:true})]);
  const read=async()=>(await db.query<{value:any}>('SELECT apex_private.perfil_json($1) AS value',[id])).rows[0]!.value;
  assert.deepEqual(await read(),{id,name:'Perfil guardado',email:'pending@example.test',birthDate:registration.birthDate,program:'demo',semester:1,role:'estudiante',complete:true});
  assert.equal((await db.query('SELECT * FROM auth.sessions WHERE user_id=$1',[id])).rows.length,0,'persistence does not require a session');
  assert.equal((await db.query<{email_confirmed_at:string|null}>('SELECT email_confirmed_at FROM auth.users WHERE id=$1',[id])).rows[0]!.email_confirmed_at,null);
  assert.equal((await db.query('SELECT * FROM apex_private.consentimiento WHERE id_usuario=$1',[id])).rows.length,1);
  const assignments=(await db.query<{id:string}>('SELECT * FROM apex_private.asignacion_evaluacion WHERE id_estudiante=$1',[id])).rows;
  assert.equal(assignments.length,1);
  await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[id]);
  const savedProfile=await read();
  // Confirmation and repeated new sessions never re-run the registration or reset data.
  for(let n=0;n<2;n++){
   const sid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,id]);
   await asUser(db,{id,sid},async()=>{
    const me=await rpc(db,'me');assert.deepEqual(me.profile,savedProfile);assert.equal(me.assignments[0].id,assignments[0]!.id);
    const attempt=await rpc(db,'start',{assignmentId:me.assignments[0].id,confirmed:true});
    assert.equal(attempt.questions.length,7);
   });
  }
  const invalid=[{name:' '},{name:123},{name:true},{name:'a'.repeat(101)},{birthDate:'2000-02-31'},{birthDate:'2100-01-01'},{birthDate:'1899-12-31'},{semester:0},{semester:21},{semester:1.5},{semester:'1'},{program:'missing'},{consent:false},{consent:'true'},{consent:null}];
  for(const patch of invalid){
   const bad=randomUUID();
   await assert.rejects(db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[bad,`${bad}@example.test`,JSON.stringify({...registration,...patch})]));
   assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1',[bad])).rows.length,0,'Auth insert is rolled back');
   assert.equal((await db.query('SELECT * FROM apex_private.usuario WHERE auth_user_id=$1',[bad])).rows.length,0,'no partial complete profile');
   assert.equal((await db.query('SELECT * FROM apex_private.estudiante WHERE id_usuario=$1',[bad])).rows.length,0);
   assert.equal((await db.query('SELECT * FROM apex_private.consentimiento WHERE id_usuario=$1',[bad])).rows.length,0);
  }
 }finally{await db.close();}
});

test('Profile RPC rejects birth, identity and privilege changes; Auth metadata cannot replay registration',async()=>{
 const db=await database();
 try {
  const user=await identity(db,501),other=await identity(db,502),teacher=await identity(db,503,'docente');
  const before=await asUser(db,user,()=>rpc(db,'me'));
  await asUser(db,user,async()=>{
   for(const patch of [{birthDate:'2001-01-01'},{birthDate:registration.birthDate},{email:'forged@example.test'},{role:'administrador'},{complete:true},{consent:true},{id:other.id},{auth_user_id:other.id},{estado:'inactivo'}]){
    await assert.rejects(rpc(db,'profile',{...profile,...patch}),/Solo puedes editar/);
   }
   for(const patch of [{name:' '},{semester:1.2},{semester:21},{program:'missing'}])await assert.rejects(rpc(db,'profile',{...profile,...patch}));
   await assert.rejects(db.query('UPDATE apex_private.usuario SET fecha_nacimiento=$1 WHERE id=$2',['2001-01-01',user.id]),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_api_pre_perfil($1,$2)', ['profile',JSON.stringify(registration)]),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_api_anterior($1,$2)', ['profile',JSON.stringify(registration)]),/permission denied/);
   await assert.rejects(db.query('SELECT apex_private.guardar_perfil_registro($1,$2,true)',[user.id,JSON.stringify(registration)]),/permission denied/);
   assert.deepEqual(await rpc(db,'me'),before);
   await rpc(db,'profile',{...profile,name:'Nombre editado',semester:3});
  });
  await db.query('UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2',[JSON.stringify({...registration,name:'Metadata manipulada',birthDate:'2002-02-02',semester:8,role:'administrador'}),user.id]);
  await asUser(db,user,async()=>{
   const me=await rpc(db,'me');assert.equal(me.profile.name,'Nombre editado');assert.equal(me.profile.birthDate,registration.birthDate);assert.equal(me.profile.semester,3);assert.equal(me.profile.role,'estudiante');
  });
  await asUser(db,other,async()=>assert.equal((await rpc(db,'me')).profile.name,registration.name));
  await asUser(db,teacher,async()=>{
   const result=await rpc(db,'profile',{name:'Docente editado'});assert.equal(result.role,'docente');assert.equal(result.complete,false);
   await assert.rejects(rpc(db,'profile',profile),/Solo el estudiante/);
   await assert.rejects(rpc(db,'start',{confirmed:true,assignmentId:before.assignments[0].id}));
  });
 }finally{await db.close();}
});

test('Editing career and semester preserves assignment IDs, saved answers, attempts, snapshots and completed history',async()=>{
 const db=await database();
 try {
  await db.exec("INSERT INTO apex_private.programa_academico VALUES('other','Otra carrera'); INSERT INTO apex_private.programa_componente SELECT 'other',id_componente FROM apex_private.programa_componente WHERE id_programa='demo';");
  const user=await identity(db,510);
  const snapshot=async()=>{
   const values:Record<string,unknown>={};
   for(const table of ['asignacion_evaluacion','convocatoria_banco','intento','respuesta','resultado','seleccion_intento','exposicion_pregunta','progreso_leccion','solicitud_ruta','ruta_version','paso_ruta']){
    values[table]=(await db.query(`SELECT to_jsonb(t) AS value FROM apex_private.${table} t ORDER BY to_jsonb(t)::text`)).rows;
   }
   return values;
  };
  const call=(operation:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,operation,payload));
   const me=await call('me'),assignment=me.assignments[0].id;
   const attempt=await call('start',{assignmentId:assignment,confirmed:true});
   await call('answer',{attemptId:attempt.id,item:'item1',option:'q1-o0'});
   const active=await snapshot();
   for(const edit of [{name:'Primera edición',program:'other',semester:6},{name:'Segunda edición',program:'demo',semester:7}]){
    await call('profile',edit);assert.deepEqual(await snapshot(),active);
   }
   const resumed=await call('start',{assignmentId:assignment,confirmed:true});assert.equal(resumed.id,attempt.id);assert.equal(resumed.answers.item1,'q1-o0');assert.deepEqual(resumed.questions,attempt.questions);
   const result=await call('finish',{attemptId:attempt.id});const finished=await snapshot();
   await call('profile',{name:'Tercera edición',program:'other',semester:8});
   await call('profile',{name:'Tercera edición',program:'other',semester:8});
   assert.deepEqual(await snapshot(),finished);
   assert.deepEqual((await call('me')).results,[result]);
   assert.equal((await call('start',{assignmentId:assignment,confirmed:true})).id,attempt.id);
   assert.equal((await call('me')).profile.birthDate,registration.birthDate);
 }finally{await db.close();}
});

test('Migration recovers valid pending metadata conservatively; never fabricates date, consent or completion',async()=>{
 const ids=[601,602,603,604].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
 const db=await database(undefined,async db=>{
  await db.exec("INSERT INTO apex_private.programa_academico VALUES('legacy-program','Carrera anterior');");
  const oldRegistration={...registration,program:'legacy-program'};delete (oldRegistration as Partial<typeof registration>).consent;
  const metadata=[oldRegistration,{...registration,program:'legacy-program',name:'Perfil recuperable'},{...registration,program:'legacy-program',birthDate:'2000-02-31'},{}];
  for(let n=0;n<ids.length;n++)await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[ids[n],`old-${n}@example.test`,JSON.stringify(metadata[n])]);
  // Existing persisted birthday/name wins over user-controlled metadata in recovery.
  await db.query("UPDATE apex_private.usuario SET nombre='Nombre ya guardado',fecha_nacimiento='1999-12-31' WHERE id=$1",[ids[1]]);
 });
 try {
  const read=async(id:string)=>(await db.query<{value:any}>('SELECT apex_private.perfil_json($1) AS value',[id])).rows[0]!.value;
  assert.deepEqual(await read(ids[0]!),{id:ids[0],name:registration.name,email:'old-0@example.test',birthDate:registration.birthDate,program:'legacy-program',semester:1,role:'estudiante',complete:false});
  assert.equal((await read(ids[1]!)).complete,true);assert.equal((await read(ids[1]!)).birthDate,'1999-12-31');assert.equal((await read(ids[1]!)).name,'Nombre ya guardado');
  for(const id of ids.slice(2)){assert.equal((await read(id)).complete,false);assert.equal((await read(id)).birthDate,'');}
  const id=ids[0]!,sid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,id]);
  await asUser(db,{id,sid},async()=>{
   await rpc(db,'profile',profile);assert.equal((await rpc(db,'me')).profile.complete,false,'edits alone cannot invent consent');
   await rpc(db,'profile_consent',{consent:true});await rpc(db,'profile_consent',{consent:true});
   assert.equal((await rpc(db,'me')).profile.complete,true);
  });
  assert.equal((await db.query('SELECT * FROM apex_private.consentimiento WHERE id_usuario=$1',[id])).rows.length,1);
  const invalid=ids[2]!,badSid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[badSid,invalid]);
  await asUser(db,{id:invalid,sid:badSid},async()=>{
   await rpc(db,'profile',profile);
   await assert.rejects(rpc(db,'profile_consent',{consent:true}),/Faltan datos válidos/);
   assert.equal((await rpc(db,'me')).profile.complete,false);
  });
 }finally{await db.close();}
});
