import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {adminFixture} from './admin-fixture';
import {asUser} from './harness';
import {dispatchInvitation,InvitationError} from '../../server/admin/invitations';

test('Invitation saga: verified new Auth UUID, quarantine, SMTP simulation, own password and one acceptance',async()=>{
 const f=await adminFixture();try{
  const id=randomUUID(),email='new-teacher@example.test';
  const prepared=await f.prepare(email,id);assert.equal(prepared.status,'pending');assert.equal((await f.prepare(email,id)).id,id);
  await assert.rejects(f.prepare(email),/pendiente/);
  assert.equal(JSON.stringify(prepared).includes('nonce'),false);
  await dispatchInvitation(f.ports,f.admin.sid,id);await dispatchInvitation(f.ports,f.admin.sid,id);assert.equal(f.delivery().mails,1);
  await f.call(f.admin,'admin_invite_resend',{invitationId:id,reason:'Reenvío explícito de invitación vigente',confirmed:true});
  await dispatchInvitation(f.ports,f.admin.sid,id);assert.equal(f.delivery().mails,2);assert.equal(f.delivery().recoveries,1);assert.equal(f.delivery().created.length,1);
  const authId=f.delivery().created[0]!;const invited=await f.acceptedSession(authId);
  assert.equal(await f.scalar('SELECT estado FROM apex_private.usuario WHERE auth_user_id=$1',[authId]),'inactivo');
  await assert.rejects(f.call(invited,'me'),/inactiva/);
  await assert.rejects(f.accept(invited),/contraseña/);
  await f.db.query("UPDATE auth.users SET encrypted_password='synthetic-password-hash-not-a-real-password' WHERE id=$1",[authId]);
  assert.deepEqual(await f.accept(invited),{accepted:true});assert.equal((await f.accept(invited)).alreadyAccepted,true);
  assert.equal((await f.call(invited,'me')).profile.role,'docente');
  await assert.rejects(f.call(invited,'admin_overview'),/administrador/);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.auditoria_rol WHERE destinatario=$1',[authId]),1);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.estudiante WHERE id_usuario=$1',[authId]),0,'No fabricated student registration');
  await f.update(invited,{expectedRole:'docente',role:'estudiante'});
  assert.equal((await f.accept(invited)).alreadyAccepted,true);assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE auth_user_id=$1',[authId]),'estudiante','Old invitation cannot restore a subsequently removed role');
 }finally{await f.db.close();}
});

test('Invitation retries repair partial Auth/delivery/database failure without adopting or duplicating identities',async()=>{
 const f=await adminFixture();try{
  const invite=await f.prepare('partial@example.test');
  const realInvite=f.ports.invite;let fail=true;
  f.ports.invite=async(...args)=>{const id=await realInvite(...args);if(fail){fail=false;throw new InvitationError('DELIVERY_FAILED');}return id;};
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,invite.id),/DELIVERY_FAILED/);
  assert.equal((await f.call(f.admin,'admin_invitations')).rows[0].status,'error');
  const bound=await f.scalar('SELECT auth_destinatario FROM apex_private.invitacion_docente WHERE id=$1',[invite.id]);assert.ok(bound);
  await dispatchInvitation(f.ports,f.admin.sid,invite.id);assert.equal(f.delivery().created.length,1);assert.equal(f.delivery().recoveries,1);
  const next=await f.prepare('finish-failure@example.test'),complete=f.ports.complete;let failComplete=true;
  f.ports.complete=async(...args)=>{if(failComplete){failComplete=false;throw Error('Synthetic DB outage');}await complete(...args);};
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,next.id),/DELIVERY_FAILED/);
  await dispatchInvitation(f.ports,f.admin.sid,next.id);assert.equal(f.delivery().created.length,2);assert.equal(f.delivery().recoveries,2);
  const profile=await f.prepare('profile-failure@example.test');
  await f.db.exec("CREATE FUNCTION public.synthetic_profile_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF new.correo='profile-failure@example.test' THEN RAISE EXCEPTION 'Synthetic profile insertion failure';END IF;RETURN new;END$$;CREATE TRIGGER synthetic_profile_failure BEFORE INSERT ON apex_private.usuario FOR EACH ROW EXECUTE FUNCTION public.synthetic_profile_failure();");
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,profile.id),/DELIVERY_FAILED/);
  assert.equal(await f.scalar("SELECT count(*)::int FROM auth.users WHERE email='profile-failure@example.test'"),0);
  assert.equal(await f.scalar('SELECT auth_destinatario FROM apex_private.invitacion_docente WHERE id=$1',[profile.id]),null);
  await f.db.exec('DROP TRIGGER synthetic_profile_failure ON apex_private.usuario');
  await dispatchInvitation(f.ports,f.admin.sid,profile.id);assert.equal(f.delivery().created.length,3);
  assert.equal(await f.scalar("SELECT count(*)::int FROM apex_private.usuario WHERE rol='docente'"),1,'Only the fixture teacher; no pending invite can enter');
 }finally{await f.db.close();}
});

test('Cancelled/expired invitations and revoked admin never grant access; forged metadata is not authority',async()=>{
 const f=await adminFixture();try{
  const cancelled=await f.prepare('cancelled@example.test');await dispatchInvitation(f.ports,f.admin.sid,cancelled.id);
  const authId=f.delivery().created[0]!,user=await f.acceptedSession(authId);
  await f.call(f.admin,'admin_invite_cancel',{invitationId:cancelled.id,reason:'Cancelación de prueba',confirmed:true});
  await f.db.query("UPDATE auth.users SET encrypted_password='synthetic-hash' WHERE id=$1",[authId]);
  await assert.rejects(f.accept(user),/cancelada/);await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,cancelled.id),/cancelada/);
  await assert.rejects(f.update(user,{role:'docente',status:'activo',expectedRole:'estudiante',expectedStatus:'inactivo'}),/aceptación/);
  const expired=await f.prepare('expired@example.test');await f.db.query("UPDATE apex_private.invitacion_docente SET vence_en=now()-interval '1 second' WHERE id=$1",[expired.id]);
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,expired.id),/vencida/);
  await assert.rejects(f.call(f.admin,'admin_invite_resend',{invitationId:expired.id,reason:'No se renueva una autorización vencida',confirmed:true}),/vigente/);
  await assert.rejects(f.db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)',[randomUUID(),'forged@example.test',JSON.stringify({role:'administrador',apex_invite_nonce:randomUUID()})]),/Invitación inválida/);
  const pending=await f.prepare('revoked@example.test');await f.update(f.admin,{status:'inactivo'});
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,pending.id),/inactiva/);
  await assert.rejects(f.dispatch(pending.id,f.admin.id,'claim'),/no autorizado/);
 }finally{await f.db.close();}
});

test('An account registered during an invite race is never linked by email; old leases and parallel dispatch are fenced',async()=>{
 const f=await adminFixture();try{
  const invite=await f.prepare('race@example.test');
  const existing=randomUUID();await f.db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[existing,invite.email]);
  const claim=await f.dispatch(invite.id,f.admin.id,'claim');
  assert.equal((await f.dispatch(invite.id,f.admin.id,'claim')).dispatch,false);
  await assert.rejects(f.dispatch(invite.id,f.admin.id,'sent',claim.lease,existing),/no vinculada/);
  assert.equal(await f.scalar('SELECT auth_destinatario FROM apex_private.invitacion_docente WHERE id=$1',[invite.id]),null);
  await f.db.query("UPDATE apex_private.invitacion_docente SET lease_hasta=now()-interval '1 second' WHERE id=$1",[invite.id]);
  const newer=await f.dispatch(invite.id,f.admin.id,'claim');assert.notEqual(newer.lease,claim.lease);
  await assert.rejects(f.dispatch(invite.id,f.admin.id,'error',claim.lease,null,'DELIVERY_FAILED'),/obsoleta/);
  assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE auth_user_id=$1',[existing]),'estudiante');
  await asUser(f.db,f.student,async()=>{
   await assert.rejects(f.db.query('SELECT public.apex_admin_invitation_dispatch($1,$2,$3)',[invite.id,f.admin.id,'claim']),/permission denied/);
   await assert.rejects(f.db.query('SELECT public.apex_accept_teacher_invitation_v2()'),/inválido/);
  });
 }finally{await f.db.close();}
});
