// TEST ONLY. Emulates GoTrue HTTP responses; domain RPCs run in real local PostgreSQL (PGlite).
// This is NOT a replacement Auth provider and is never imported by the app.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {database,identity,asUser,rpc} from './harness';
import {educationalFixtureSQL,generatedFixture} from './learning-fixture';
import {technicalIdentity,syntheticSchedulerSQL,academicEvidence} from './technical-clock-fixture';
import {beginDiagnostic,prepareSummaryStudent,historicalCopy} from './teacher-summary-fixture';
import {InvitationError,type InvitationPorts} from '../../server/admin/invitations';
import {invitationHandler} from '../functions/_shared/handler.ts';
async function main(){
const db=await database();
await db.exec('ALTER TABLE auth.users ADD COLUMN encrypted_password text');
// Bank is loaded only in this isolated E2E database. The application never imports it.
await db.exec(readFileSync(new URL('../content/apex-ingles-105-v0.2.sql',import.meta.url),'utf8'));
await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles'); UPDATE apex_private.plantilla_evaluacion SET habilitada=true;");
await db.exec(readFileSync(new URL('../content/apex-learning-v2-templates.sql',import.meta.url),'utf8'));
await db.exec("UPDATE apex_private.plantilla_evaluacion SET habilitada=true WHERE politica_exposicion='no_vistas_lru_bloques-v2';");
await db.exec(educationalFixtureSQL);
await db.exec("INSERT INTO apex_private.programa_academico VALUES('fixture-other','Otra carrera de prueba'); INSERT INTO apex_private.programa_componente SELECT 'fixture-other',id_componente FROM apex_private.programa_componente WHERE id_programa='demo';");
await db.exec("INSERT INTO apex_private.programa_academico VALUES('fixture-english-only','Programa exclusivo de Inglés de prueba'); INSERT INTO apex_private.programa_componente VALUES('fixture-english-only','ingles');");
await db.exec("INSERT INTO apex_private.programa_academico VALUES('fixture-clock','Programa de relojes de prueba'); INSERT INTO apex_private.programa_componente VALUES('fixture-clock','ingles');");
// Controlled time exists only in this isolated test server; production uses clock_timestamp().
await db.exec(`CREATE SCHEMA clock_fixture;CREATE TABLE clock_fixture.offset_ms(ms bigint NOT NULL);INSERT INTO clock_fixture.offset_ms VALUES(0);
 CREATE OR REPLACE FUNCTION apex_private.epoch_ms() RETURNS bigint LANGUAGE sql VOLATILE AS $$SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint+ms FROM clock_fixture.offset_ms$$;`);
const advancementDefinition=(await db.query<{definition:string}>("SELECT pg_get_functiondef('apex_private.registrar_avance(text)'::regprocedure) definition")).rows[0]!.definition;
await db.exec(syntheticSchedulerSQL); // Metadata stub only; no real pg_cron in PGlite.
const fixtureAdmin=await identity(db,900,'administrador');
const accounts=new Map<string,{id:string;email:string;password:string;user_metadata:unknown;confirmed:boolean}>();
const sessions=new Map<string,{id:string;sid:string}>();
// MVP accounts retain the configured primary component on every domain call.
// Legacy accounts keep their original fixtures; the shared DB connection is serialized.
async function domain<T>(user:{id:string;sid:string}|null,operation:()=>Promise<T>){
 const clock=[...accounts.values()].some(account=>account.id===user?.id&&account.email.startsWith('clock-e2e-'));
 const mvp=clock||[...accounts.values()].some(account=>account.id===user?.id&&(account.email.startsWith('mvp-e2e-')||account.email.startsWith('technical-e2e-')||account.email.startsWith('teacher-fixture-')&&account.email.includes('-interventions-')));
 const previous=(await db.query<{diagnostico:string|null}>('SELECT diagnostico FROM apex_private.configuracion_mvp WHERE id')).rows[0]!.diagnostico;
 if(mvp)await db.exec("UPDATE apex_private.configuracion_mvp SET diagnostico='apex-ingles-diagnostico-v2'");
 if(clock)await db.exec('UPDATE apex_private.configuracion_reloj SET activa=true');
 try{return await asUser(db,user,operation);}finally{if(clock)await db.exec('UPDATE apex_private.configuracion_reloj SET activa=false');if(mvp)await db.query('UPDATE apex_private.configuracion_mvp SET diagnostico=$1 WHERE id',[previous]);}
}
let sequence=100;
async function session(account:{id:string;email:string;user_metadata:unknown}) {
 const sid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,account.id]);
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:account.id,session_id:sid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test-signature';
 sessions.set(token,{id:account.id,sid});
 return {access_token:token,refresh_token:randomUUID(),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:account.id,email:account.email,user_metadata:account.user_metadata,aud:'authenticated',created_at:new Date().toISOString()}};
}
// Serialize fixture requests because SET ROLE is connection-scoped. Production uses separate DB transactions.
let queue=Promise.resolve();
function serial<T>(work:()=>Promise<T>){const task=queue.then(work);queue=task.then(()=>{},()=>{});return task;}
let failInviteAfterCreate=false;
const existingInvitationLinks=new Map<string,{id:string;token:string}>();
const serviceStep=async(id:string,actor:string,step:string,lease:string|null=null,authId:string|null=null,code:string|null=null)=>serial(async()=>{
 await db.exec('SET ROLE service_role');try{return (await db.query<any>('SELECT public.apex_admin_invitation_dispatch($1,$2,$3,$4,$5,$6) v',[id,actor,step,lease,authId,code])).rows[0]!.v;}finally{await db.exec('RESET ROLE');}
});
const invitationPorts:InvitationPorts={
 authorize:async token=>serial(async()=>{const user=sessions.get(token);if(!user)throw new InvitationError('FORBIDDEN');await domain(user,()=>rpc(db,'admin_overview'));return user.id;}),
 claim:(id,actor)=>serviceStep(id,actor,'claim'),
 invite:async(email,name,nonce)=>serial(async()=>{
  if(accounts.has(email))throw new InvitationError('AUTH_EXISTS');
  const id=randomUUID();await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES($1,$2,$3::jsonb,now())',[id,email,JSON.stringify({name,apex_invite_nonce:nonce})]);
  accounts.set(email,{id,email,password:'',user_metadata:{name},confirmed:true});
  if(failInviteAfterCreate){failInviteAfterCreate=false;throw new InvitationError('DELIVERY_FAILED');}return id;
 }),
 recoverOwned:async(authId,email)=>serial(async()=>{if(accounts.get(email)?.id!==authId)throw new InvitationError('FORBIDDEN');}),
 sendExisting:async(authId,email,id,token)=>serial(async()=>{if(accounts.get(email)?.id!==authId)throw new InvitationError('FORBIDDEN');existingInvitationLinks.set(email,{id,token});}),
 complete:async(id,actor,lease,authId)=>{await serviceStep(id,actor,'sent',lease,authId);},
 fail:async(id,actor,lease,code)=>{await serviceStep(id,actor,'error',lease,null,code);},
};
const handleInvitation=invitationHandler(invitationPorts,[process.env.APEX_TEST_WEB_ORIGIN??'http://localhost:8091']);
const server=createServer((req,res)=>{
 if(req.url==='/functions/v1/admin-invitations'){
  // Node transport only; invokes the exact Fetch handler deployed to Edge.
  void(async()=>{try{
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)break;}
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
   const response=await handleInvitation(new Request('http://localhost/functions/v1/admin-invitations',{method:req.method,headers,...(req.method==='POST'?{body:raw}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500);res.end('{}');}})();return;
 }

 res.setHeader('Access-Control-Allow-Origin',process.env.APEX_TEST_WEB_ORIGIN??'http://localhost:8091');
 res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,content-profile,accept-profile,x-client-info,x-supabase-api-version');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
 res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.end('{}');return;}
 queue=queue.then(async()=>{
  try {
   let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
   const path=new URL(req.url!,'http://localhost').pathname;
   const token=req.headers.authorization?.replace(/^Bearer /,'')??'',user=sessions.get(token)??null;
   let value:unknown={};
   if(path==='/health')value={ok:true};
   else if(path==='/__test/admin/setup'){
    const key=sequence++,entries:Record<string,{id:string;email:string;name:string}>={};
    for(const [kind,role,name] of [['admin','administrador','Administración sintética'],['backup','administrador','Respaldo sintético'],['teacher','docente','Profesor sintético'],['student','estudiante','Estudiante administrable']] as const){
     const email=`admin-fixture-${kind}-${key}@example.test`;
     const user=await identity(db,sequence++,role,role==='estudiante'?{name,birthDate:'2000-01-01',program:'demo',semester:1,consent:true}:{},email);
     await db.query('UPDATE apex_private.usuario SET nombre=$1 WHERE auth_user_id=$2',[name,user.id]);await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[user.id]);
     accounts.set(email,{id:user.id,email,password:'Prueba123+',user_metadata:{},confirmed:true});entries[kind]={id:user.id,email,name};
    }
    value=entries;
   }else if(path==='/__test/admin/control'){
    const account=[...accounts.values()].find(a=>a.id===user?.id);
    if(!account?.email.startsWith('admin-fixture-admin-'))throw Error('Authenticated synthetic admin fixture required.');
    if(body.action==='fail-next-invite'){failInviteAfterCreate=true;value={ok:true};}
    else if(body.action==='invite-link'){
     const invited=accounts.get(body.email);if(!invited||!body.email.startsWith('admin-invite-'))throw Error('Synthetic invited account required.');
     value=await session(invited);
    }else if(body.action==='existing-invite-link'){
     if(!body.email.startsWith('admin-fixture-student-'))throw Error('Synthetic existing account required.');
     value=existingInvitationLinks.get(body.email);
    }else if(body.action==='revoke'){
     const target=(await db.query<any>('SELECT rol,estado FROM apex_private.usuario WHERE auth_user_id=$1',[user!.id])).rows[0]!;
     value=await domain(user,()=>rpc(db,'admin_user_update',{userId:user!.id,authId:user!.id,expectedRole:target.rol,expectedStatus:target.estado,status:'inactivo',reason:'Revocación sintética',confirmed:true}));
    }else throw Error('Unknown isolated admin action');
   }else if(path==='/__test/teacher/setup') {
    // Synthetic accounts exist only in this in-memory test server. Login still
    // goes through the existing Supabase Auth client and normal fixture endpoint.
    const setupAdmin={...fixtureAdmin,sid:randomUUID()};await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[setupAdmin.sid,setupAdmin.id]);
    const key=String(sequence++),entries=[];
    for(const [kind,name] of [['teacher','Profesora de prueba'],['other','Otro profesor'],['empty','Profesor sin grupos'],['alice','Estudiante asignada'],['bob','Estudiante ajeno']] as const){
     const role=['teacher','other','empty'].includes(kind)?'docente':'estudiante';
     const email=`teacher-fixture-${kind}-${body.interventions?'interventions-':''}${key}@example.test`;
     const identityRecord=await identity(db,sequence++,role,role==='estudiante'?{name,birthDate:'2000-01-31',program:'demo',semester:1,consent:true}:{},email);
     await db.query('UPDATE apex_private.usuario SET nombre=$1 WHERE auth_user_id=$2',[name,identityRecord.id]);
     const account={id:identityRecord.id,email,password:'Prueba123+',user_metadata:{},confirmed:true};accounts.set(email,account);
     entries.push({kind,email,id:identityRecord.id,name});
    }
    
    const [teacher,other,empty,alice,bob]=entries;
    const create=async(code:string,teacherId:string,studentId:string)=>asUser(db,setupAdmin,async()=>{
     const group=await rpc(db,'admin_group_save',{code,name:`Grupo de prueba ${code}`,componentId:'ingles'});
     await rpc(db,'admin_group_teacher',{groupId:group.id,teacherId,active:true});
     await rpc(db,'admin_group_member',{groupId:group.id,studentId,active:true});
     return group;
    });
    const group=await create(`SYNTH-${key}-A`,teacher!.id,alice!.id),otherGroup=await create(`SYNTH-${key}-B`,other!.id,bob!.id);
    let summaryGroups:Record<string,unknown>={};
    if(body.summary){
     const aliceUser={id:alice!.id,sid:(await db.query<{id:string}>('SELECT id FROM auth.sessions WHERE user_id=$1',[alice!.id])).rows[0]!.id};
     const source=await prepareSummaryStudent(db,aliceUser);
     for(const kind of ['active','pending','unsupported','reserved']){
      const u=await identity(db,sequence++,'estudiante',{name:`SINTÉTICO ${kind}`,birthDate:'2000-01-31',program:'demo',semester:1,consent:true});
      await asUser(db,setupAdmin,()=>rpc(db,'admin_group_member',{groupId:group.id,studentId:u.id,active:true}));
      if(kind==='active')await beginDiagnostic(db,u);
      if(kind==='unsupported'){await historicalCopy(db,u,source.diag.id,{breakdown:false});await historicalCopy(db,u,source.retry.id,{breakdown:false});}
      if(kind==='reserved')await db.query("UPDATE apex_private.usuario SET estado='inactivo' WHERE id=$1",[u.id]);
     }
     const emptyGroup=await asUser(db,setupAdmin,async()=>{
      const g=await rpc(db,'admin_group_save',{code:`SYNTH-${key}-EMPTY`,name:'Salón vacío · DATOS SINTÉTICOS',componentId:'ingles'});
      await rpc(db,'admin_group_teacher',{groupId:g.id,teacherId:teacher!.id,active:true});return g;
     });
     summaryGroups={emptyGroup};
    }

    value={teacher,other,empty,alice,bob,group,otherGroup,...summaryGroups};
   }else if(path==='/__test/teacher/intervention-time') {
    const account=[...accounts.values()].find(a=>a.id===user?.id);
    if(!account?.email.startsWith('teacher-fixture-teacher-interventions-'))throw Error('Authenticated isolated intervention fixture required.');
    if(!Number.isInteger(body.advanceMs)||body.advanceMs<0||body.advanceMs>3600000)throw Error('Invalid test-only clock advance');
    await db.query('UPDATE clock_fixture.offset_ms SET ms=ms+$1',[body.advanceMs]);value={ok:true};
   }else if(path==='/__test/teacher/revoke'||path==='/__test/teacher/revoke-access') {
    const account=[...accounts.values()].find(a=>a.id===user?.id);
    if(!account?.email.startsWith('teacher-fixture-teacher-'))throw Error('Authenticated isolated teacher fixture required.');
    const own=await domain(user,()=>rpc(db,'teacher_groups'));
    if(!own.some((g:any)=>g.id===body.groupId))throw Error('Fixture group does not belong to teacher.');
    const revokeAdmin={...fixtureAdmin,sid:randomUUID()};await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[revokeAdmin.sid,revokeAdmin.id]);
    value=await asUser(db,revokeAdmin,()=>rpc(db,path.endsWith('revoke-access')?'admin_group_teacher':'admin_group_member',{groupId:body.groupId,studentId:body.studentId,teacherId:user!.id,active:false}));
   }
   else if(path==='/auth/v1/signup') {
    if(accounts.has(body.email))throw Error('Cuenta existente.');
    const clock=body.email.startsWith('clock-e2e-'),technical=body.email.startsWith('technical-e2e-'),mvp=body.email.startsWith('mvp-e2e-'),learning=body.email.startsWith('learning-e2e-')||mvp||clock||technical;
    if(learning)await db.exec("UPDATE apex_private.configuracion_mvp SET diagnostico='apex-ingles-diagnostico-v2'");
    let account:Awaited<ReturnType<typeof identity>>;
    try{if(mvp)await db.exec(readFileSync(new URL('../authorize-demo-english-mvp.sql',import.meta.url),'utf8'));account=technical?await technicalIdentity(db,body.email):await identity(db,sequence++,'estudiante',clock?{...body.data,program:'fixture-clock'}:body.data??{},body.email);}
    finally{if(learning)await db.exec('UPDATE apex_private.configuracion_mvp SET diagnostico=NULL');}
    await db.query('DELETE FROM auth.sessions WHERE id=$1',[account.sid]);
    const entry={id:account.id,email:body.email,password:body.password,user_metadata:body.data??{},confirmed:!body.email.startsWith('confirm-')};
    accounts.set(body.email,entry);
    if(entry.confirmed)await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[entry.id]);
    if(entry.email.startsWith('bank-e2e-'))await asUser(db,fixtureAdmin,async()=>{
     for(const template of ['apex-ingles-control-3-v1','apex-ingles-final-v1'])await db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[entry.id],template]);
    });
    value=entry.confirmed?await session(entry):{id:entry.id,email:entry.email,user_metadata:entry.user_metadata};
   }else if(path==='/__test/technical-clock') {
    const account=accounts.get(body.email);
    if(!account?.email.startsWith('technical-e2e-')||user?.id!==account.id)throw Error('Authenticated isolated technical fixture required.');
    if(body.action==='enable')await db.exec(readFileSync(new URL('../enable-technical-clock-test.sql',import.meta.url),'utf8'));
    else if(body.action==='withdraw')await db.exec(readFileSync(new URL('../withdraw-technical-clock-test.sql',import.meta.url),'utf8'));
    else if(body.action==='advance'){
     if(!Number.isSafeInteger(body.ms)||body.ms<0||body.ms>7200000)throw Error('Invalid fixture time advance.');
     await db.query('UPDATE clock_fixture.offset_ms SET ms=ms+$1',[body.ms]);
    }else if(body.action==='process')value=(await db.query('SELECT apex_private.cerrar_intentos_vencidos(100) report')).rows[0];
    else if(body.action==='state')value={evidence:await academicEvidence(db,account.id),attempts:(await db.query(`SELECT i.id,i.estado,r.iniciado_en,r.vence_en,r.politica,(SELECT count(*) FROM apex_private.respuesta a WHERE a.id_intento=i.id) confirmed,(SELECT detalle FROM apex_private.resultado g WHERE g.id_intento=i.id) result FROM apex_private.intento i JOIN apex_private.prueba_reloj_tecnica t ON t.id_convocatoria=i.id_asignacion JOIN apex_private.reloj_intento r ON r.id_intento=i.id WHERE t.id_estudiante=$1`,[account.id])).rows};
    else if(body.action==='reset-time')await db.exec('UPDATE clock_fixture.offset_ms SET ms=0');
    else throw Error('Unknown technical fixture action.');
   }else if(path==='/__test/assessment-clock') {
    const account=accounts.get(body.email);
    if(!account?.email.startsWith('clock-e2e-')||user?.id!==account.id)throw Error('Authenticated isolated clock fixture required.');
    if(body.action==='reset'){await db.exec('UPDATE clock_fixture.offset_ms SET ms=0');await db.exec(advancementDefinition);}
    else if(body.action==='advance'){
     if(!Number.isSafeInteger(body.ms)||body.ms<0||body.ms>7200000)throw Error('Invalid fixture time advance.');
     await db.query('UPDATE clock_fixture.offset_ms SET ms=ms+$1',[body.ms]);
    }else if(body.action==='hold')await db.exec("CREATE OR REPLACE FUNCTION apex_private.registrar_avance(iid text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic E2E grading failure';END$$;");
    else if(body.action==='release')await db.exec(advancementDefinition);
    else if(body.action==='process')value=(await db.query('SELECT apex_private.cerrar_intentos_vencidos(100) report')).rows[0];
    else if(body.action==='state')value={attempts:(await db.query(`SELECT i.id,i.estado,r.iniciado_en,r.vence_en,r.politica,(SELECT count(*) FROM apex_private.respuesta a WHERE a.id_intento=i.id) confirmed,(SELECT detalle FROM apex_private.resultado g WHERE g.id_intento=i.id) result FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion JOIN apex_private.reloj_intento r ON r.id_intento=i.id WHERE a.id_estudiante=$1 ORDER BY i.iniciado_en,i.id`,[account.id])).rows};
    else if(body.action==='prepare'){
     const call=(operation:string,payload:unknown={})=>domain(user,()=>rpc(db,operation,payload));
     const assignment=async(kind:string,level?:number)=>(await db.query<{id:string}>(`SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo=$2 AND ($3::integer IS NULL OR p.nivel=$3)`,[account.id,kind,level??null])).rows[0]!.id;
     const diagnostic=await call('start',{assignmentId:await assignment('diagnostico'),confirmed:true});await call('finish',{attemptId:diagnostic.id});
     for(let level=1;level<=(body.final?3:1);level++){
      for(;;){
       await db.exec('SET ROLE service_role');const job=(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v;await db.exec('RESET ROLE');if(!job)throw Error('Missing clock fixture job.');
       const owner=(await db.query<{id_estudiante:string}>('SELECT id_estudiante FROM apex_private.trabajo_ia WHERE id=$1',[job.jobId])).rows[0]!.id_estudiante;
       await db.exec('SET ROLE service_role');try{await db.query('SELECT public.apex_ai_finish($1,$2,$3::jsonb,NULL)',[job.jobId,job.lease,JSON.stringify(generatedFixture(job))]);}finally{await db.exec('RESET ROLE');}
       if(owner===account.id)break;
      }
      const route=await domain(user,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v);
      for(const section of route.levels[level-1].sections)await call('section_complete',{sectionId:section.id});
      if(body.final){const control=await call('start',{assignmentId:await assignment('control',level),confirmed:true});for(const item of control.questions.slice(0,7)){const option=(await db.query<{id:string}>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[item.questionId])).rows[0]!.id;await call('answer',{attemptId:control.id,item:item.id,option});}await call('finish',{attemptId:control.id});}
     }
     value={assignmentId:await assignment(body.final?'final':'control',body.final?undefined:1)};
    }else throw Error('Unknown clock fixture action.');
   }else if(path==='/__test/mvp-legacy') {
    const account=accounts.get(body.email);if(!account?.email.startsWith('mvp-e2e-')||user?.id!==account.id)throw Error('Authenticated isolated MVP fixture required.');
    const aid=randomUUID();await db.query('INSERT INTO apex_private.asignacion_evaluacion(id,id_estudiante,id_evaluacion) VALUES($1,$2,$3)',[aid,account.id,'diagnostico-v1']);
    value=await domain(user,async()=>{
     const a=await rpc(db,'start',{assignmentId:aid,confirmed:true});
     await rpc(db,'answer',{attemptId:a.id,item:a.questions[0].id,option:a.questions[0].options[0].id});
     return {assignmentId:aid,attemptId:a.id,answers:(await rpc(db,'attempt',{attemptId:a.id})).answers};
    });
   }else if(path==='/__test/learning') {
    const account=accounts.get(body.email);if(!account?.email.startsWith('learning-e2e-'))throw Error('Isolated learning fixture account required.');
    if(body.action==='state')value={completed:(await db.query<any>('SELECT count(*) n FROM apex_private.progreso_seccion WHERE id_estudiante=$1 AND completada_en IS NOT NULL',[account.id])).rows[0]!.n};
    else{
     await db.exec('SET ROLE service_role');
     try{
      const job=(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v;if(!job)throw Error('No pending fixture job.');
      await db.exec('RESET ROLE');
      const owner=(await db.query<any>('SELECT id_estudiante FROM apex_private.trabajo_ia WHERE id=$1',[job.jobId])).rows[0];
      if(owner?.id_estudiante!==account.id)throw Error('Wrong fixture account.');
      await db.exec('SET ROLE service_role');
      let data:unknown=null;
      if(body.action!=='unavailable'){
       if(job.input.kind==='sections')data=generatedFixture(job);
       else{const ref=job.input.references[0];data={contractVersion:2,kind:'chat',text:'Synthetic tutor guidance without assessment keys',references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:ref.page}]};}
      }
      value=(await db.query<any>('SELECT public.apex_ai_finish($1,$2,$3::jsonb,$4) v',[job.jobId,job.lease,JSON.stringify(data),body.action==='unavailable'?'AI_UNAVAILABLE':null])).rows[0]!.v;
     }finally{await db.exec('RESET ROLE');}
    }
   }else if(path==='/__test/confirm') {
    // Local fixture only: emulates successful GoTrue email verification without SMTP.
    const account=accounts.get(body.email);if(!account)throw Error('Cuenta inexistente.');
    account.confirmed=true;await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[account.id]);
    value=await session(account);
   }else if(path==='/__test/profile') {
    const account=accounts.get(body.email);if(!account)throw Error('Cuenta inexistente.');
    value=(await db.query<{value:unknown}>('SELECT apex_private.perfil_json($1) AS value',[account.id])).rows[0]!.value;
   }else if(path==='/auth/v1/token') {
    const account=accounts.get(body.email);if(!account||account.password!==body.password){res.statusCode=400;value={error:'invalid_grant',error_description:'Correo o contraseña incorrectos.'};}else if(!account.confirmed){res.statusCode=400;value={error:'invalid_grant',error_description:'Confirma tu correo.'};}else value=await session(account);
   }else if(path==='/auth/v1/recover')value={};
   else if(path==='/auth/v1/user') {
    const account=[...accounts.values()].find(a=>a.id===user?.id);if(!account)throw Error('Inicia sesión.');
    if(body.password){account.password=body.password;await db.query("UPDATE auth.users SET encrypted_password='synthetic-hash' WHERE id=$1",[account.id]);}
    value={id:account.id,email:account.email,user_metadata:account.user_metadata,aud:'authenticated'};
   }else if(path==='/auth/v1/logout') {
    if(user)await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[user.id]);sessions.delete(token);value={};
   }else if(path==='/rest/v1/rpc/apex_api'){
    value=await domain(user,()=>rpc(db,body.operation,body.payload));
   }
    else if(['/rest/v1/rpc/apex_teacher_invitation_review','/rest/v1/rpc/apex_accept_teacher_invitation_v2'].includes(path))value=await domain(user,async()=>{
     const name=path.split('/').at(-1)!;
     return (await db.query<{value:unknown}>(`SELECT public.${name}($1,$2) AS value`,[body.invitation_id,body.invitation_token])).rows[0]!.value;
    });
    else if(['/rest/v1/rpc/apex_catalog','/rest/v1/rpc/apex_materials','/rest/v1/rpc/apex_my_route','/rest/v1/rpc/apex_teacher_invitation_status','/rest/v1/rpc/apex_accept_teacher_invitation'].includes(path))value=await domain(user,async()=>{
    const name=path.split('/').at(-1)!;
    return (await db.query<{value:unknown}>(`SELECT public.${name}() AS value`)).rows[0]!.value;
   });
   else {res.statusCode=404;value={message:'Fixture endpoint missing'};}
   res.end(JSON.stringify(value));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({message:(error as Error).message,code:(error as {code?:string}).code}));}
 }).catch(()=>{res.statusCode=500;res.end('{}');});
});
server.listen(54329,'127.0.0.1',()=>console.log('LOCAL TEST fixture http://127.0.0.1:54329'));
process.on('SIGTERM',()=>{server.close();void db.close();});
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
