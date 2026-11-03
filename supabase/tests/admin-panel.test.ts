import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {adminFixture} from './admin-fixture';
import {asUser,identity} from './harness';

const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
test('Administrator reads: real counts, pagination/search/filter, least-privilege audit and live revocation',async()=>{
 const f=await adminFixture();try{
  const overview=await f.call(f.admin,'admin_overview');assert.equal(overview.teachers.active,1);assert.equal(overview.groups.active,0);
  for(const actor of [f.teacher,f.student,null])for(const operation of ['admin_overview','admin_users','admin_groups','admin_catalog','admin_audit','admin_invitations'])await assert.rejects(f.call(actor,operation),/administrador|permission denied/);
  const users=await f.call(f.admin,'admin_users',{page:0,pageSize:1});assert.equal(users.rows.length,1);assert.equal(users.total,4);
  const second=await f.call(f.admin,'admin_users',{page:1,pageSize:1});assert.notEqual(users.rows[0].id,second.rows[0].id);
  const filtered=await f.call(f.admin,'admin_users',{role:'docente',status:'activo',search:'student19003'});assert.equal(filtered.total,1);assert.equal(filtered.rows[0].identityVerified,true);
  await assert.rejects(f.call(f.admin,'admin_users',{pageSize:100000}),/Paginación/);
  await asUser(f.db,f.admin,async()=>{
   await assert.rejects(f.db.exec('SELECT * FROM apex_private.invitacion_docente'),/permission denied/);
   await assert.rejects(f.db.query('SELECT public.apex_api_pre_admin($1,$2::jsonb)',['admin_overview','{}']),/permission denied/);
   await assert.rejects(f.db.query('SELECT public.apex_admin_invitation_dispatch($1,$2,$3)',[randomUUID(),f.admin.id,'claim']),/permission denied/);
  });
  await f.update(f.teacher,{status:'inactivo'});
  const events=await f.call(f.admin,'admin_audit',{entity:'usuario',action:'cambiar_estado'});assert.equal(events.total,1);assert.ok(events.rows[0].reason);assert.deepEqual(events.rows[0].after,{status:'inactivo'});
  assert.equal((await f.call(f.admin,'admin_audit',{fromDate:'2999-01-01'})).total,0);
  await f.update(f.backup,{role:'docente'});await assert.rejects(f.call(f.backup,'admin_overview'),/administrador/);
  await f.db.exec(read('../preflight-admin-panel.sql'));const reports=await f.db.exec(read('../verify-admin-panel.sql'));
  for(const report of reports)for(const row of report.rows)for(const key of ['invalid_invitation_bindings','unaccepted_invitations_with_access','groups_over_capacity'])if(key in row)assert.equal(Number(row[key]),0,key);
 }finally{await f.db.close();}
});

test('User mutations: verified identities, reason/confirmation, idempotent audit, active-exam rejection and conserved history',async()=>{
 const f=await adminFixture();try{
  await assert.rejects(f.update(f.student,{reason:''}),/Motivo/);
  await assert.rejects(f.update(f.student,{role:'docente',confirmed:false}),/aceptación/);
  await assert.rejects(f.update(f.student,{role:'docente',authId:f.teacher.id}),/aceptación/);
  await f.db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1',[f.student.id]);
  await assert.rejects(f.call(f.admin,'admin_invite_lookup',{userId:f.student.id}),/confirmar su correo/);await f.db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[f.student.id]);
  const before=await f.scalar('SELECT jsonb_agg(to_jsonb(a)) FROM apex_private.asignacion_evaluacion a WHERE id_estudiante=$1',[f.student.id]);
  const me=await f.call(f.student,'me'),assignment=me.assignments[0];assert.ok(assignment);
  const attempt=await f.call(f.student,'start',{assignmentId:assignment.id,confirmed:true});
  await f.call(f.student,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:attempt.questions[0].options[0].id});
  const saved=await f.scalar('SELECT to_jsonb(i) FROM apex_private.intento i WHERE id=$1',[attempt.id]);
  await assert.rejects(f.update(f.student,{status:'inactivo'}),/examen activo/);
  await assert.rejects(f.update(f.student,{role:'docente'}),/aceptación/);
  assert.deepEqual(await f.scalar('SELECT to_jsonb(i) FROM apex_private.intento i WHERE id=$1',[attempt.id]),saved);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.resultado WHERE id_intento=$1',[attempt.id]),0);
  await f.call(f.student,'finish',{attemptId:attempt.id});
  const lookup=await f.call(f.admin,'admin_invite_lookup',{userId:f.student.id});
  const invitation=await f.call(f.admin,'admin_invite_prepare',{mode:'existing',userId:f.student.id,role:'docente',invitationId:randomUUID(),expectedRole:lookup.role,expectedStatus:lookup.status,expectedRevision:lookup.revision,reason:'Promoción aceptada',confirmed:true});
  const claim=await f.dispatch(invitation.id,f.admin.id,'claim');await f.dispatch(invitation.id,f.admin.id,'sent',claim.lease,f.student.id);
  await asUser(f.db,f.student,()=>f.db.query('SELECT public.apex_accept_teacher_invitation_v2($1,$2)',[invitation.id,claim.nonce]));
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.auditoria_rol WHERE destinatario=$1',[f.student.id]),1);
  assert.deepEqual(await f.scalar('SELECT jsonb_agg(to_jsonb(a)) FROM apex_private.asignacion_evaluacion a WHERE id_estudiante=$1',[f.student.id]),before);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.respuesta WHERE id_intento=$1',[attempt.id]),1);
 }finally{await f.db.close();}
});

test('Last active administrator: serialized competing changes cannot remove both (one PGlite connection)',async()=>{
 const f=await adminFixture();try{
  await f.update(f.admin,{status:'inactivo'});
  await assert.rejects(f.update(f.backup,{status:'inactivo'},f.backup),/último administrador/);
  await assert.rejects(f.db.query("UPDATE apex_private.usuario SET rol='estudiante' WHERE id=$1",[f.backup.id]),/último administrador/);
  assert.equal(await f.scalar("SELECT count(*)::int FROM apex_private.usuario WHERE rol='administrador' AND estado='activo'"),1);
  await assert.rejects(f.call(f.admin,'admin_overview'),/inactiva/);
 }finally{await f.db.close();}
});

test('Catalog/associations and groups reuse existing data, preserve IDs and block unsafe withdrawal',async()=>{
 const f=await adminFixture();try{
  const args={reason:'Cambio sintético revisado',confirmed:true};
  const count=await f.scalar('SELECT count(*)::int FROM apex_private.asignacion_evaluacion');
  await f.call(f.admin,'admin_catalog_save',{...args,entity:'program',id:'new-program',name:'Programa de prueba'});
  await f.call(f.admin,'admin_catalog_save',{...args,entity:'component',id:'new-component',name:'Componente no publicado'});
  await f.call(f.admin,'admin_association_add',{...args,programId:'new-program',componentId:'new-component'});
  await f.call(f.admin,'admin_association_remove',{...args,programId:'new-program',componentId:'new-component'});
  await assert.rejects(f.call(f.admin,'admin_association_remove',{...args,programId:'demo',componentId:'ingles'}),/principal del MVP/);
  await assert.rejects(f.call(f.admin,'admin_association_remove',{...args,programId:'demo',componentId:'rc'}),/perfiles vinculados/);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.asignacion_evaluacion'),count);
  const gid=randomUUID();await f.call(f.admin,'admin_group_save',{groupId:gid,code:'ADM-SYNTH',name:'Salón sintético',componentId:'ingles',reason:'Creación de prueba'});
  await f.call(f.admin,'admin_group_teacher',{groupId:gid,teacherId:f.teacher.id,active:true});
  await f.call(f.admin,'admin_group_member',{groupId:gid,studentId:f.student.id,active:true});
  const group=await f.call(f.admin,'admin_group_detail',{groupId:gid});assert.equal(group.group.membershipCount,1);assert.equal(group.teachers[0].id,f.teacher.id);
  await f.call(f.admin,'admin_group_save',{groupId:gid,code:'ADM-SYNTH',name:'Salón sintético editado',componentId:'ingles',status:'inactivo'});
  assert.equal((await f.call(f.admin,'admin_groups')).rows[0].membershipCount,1);
  assert.equal((await f.call(f.teacher,'teacher_groups')).length,0);
  assert.ok((await f.call(f.admin,'admin_audit',{entity:'grupo'})).total>0);
 }finally{await f.db.close();}
});

test('Designated first administrator: owner-only, exact email/UUID/link, different domain ID, idempotent audit',async()=>{
 const f=await adminFixture();try{
  const authId='7bde9803-7f58-4346-87e9-4e438364579a';
  await f.db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[authId,'incorrect@example.test']);
  await f.db.query("UPDATE apex_private.usuario SET id='domain-first-admin-local' WHERE auth_user_id=$1",[authId]);
  await f.db.exec("SELECT set_config('request.jwt.claims','{}',false)");
  const promote=async()=>{try{await f.db.exec(read('../assign-first-admin.sql'));}catch(error){await f.db.exec('ROLLBACK');throw error;}};
  await f.db.exec(read('../verify-first-admin.sql'));
  await assert.rejects(promote(),/no coinciden/);
  await f.db.query('UPDATE auth.users SET email=$2 WHERE id=$1',[authId,'apex.soporte.co@gmail.com']);
  await assert.rejects(promote(),/discrepante/);
  await f.db.query("UPDATE apex_private.usuario SET correo='apex.soporte.co@gmail.com' WHERE auth_user_id=$1",[authId]);
  await f.db.query("UPDATE apex_private.usuario SET estado='inactivo' WHERE auth_user_id=$1",[authId]);await assert.rejects(promote(),/inactiva/);
  await f.db.query("UPDATE apex_private.usuario SET estado='activo' WHERE auth_user_id=$1",[authId]);
  await promote();await promote();assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE auth_user_id=$1',[authId]),'administrador');
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.auditoria_rol WHERE destinatario=$1',[authId]),1);
  const event=await f.scalar('SELECT to_jsonb(a) FROM apex_private.auditoria_rol a WHERE destinatario=$1',[authId]);assert.equal(event.actor,null);assert.ok(event.operador_bd);assert.ok(event.motivo);
  await f.db.exec(read('../verify-first-admin.sql'));
  await asUser(f.db,f.admin,async()=>{await assert.rejects(promote(),/propietario SQL/);});
 }finally{await f.db.close();}
});
