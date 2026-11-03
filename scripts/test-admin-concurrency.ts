// Optional real PostgreSQL check. Two independent psql processes; no Supabase.
// Requires an explicitly created EMPTY local DB named apex_admin_test_<suffix>.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testServiceSchemaSQL} from '../supabase/tests/harness';
const database=process.env.APEX_ADMIN_TEST_PG_DATABASE;
if(!database||!/^apex_admin_test_[a-z0-9_]+$/.test(database))throw Error('Set APEX_ADMIN_TEST_PG_DATABASE to an EMPTY disposable local apex_admin_test_<suffix>. Test NOT executed.');
const port=process.env.APEX_ADMIN_TEST_PG_PORT??'5432';
if(!/^\d{1,5}$/.test(port)||Number(port)>65535)throw Error('Invalid local port.');
const env={...process.env,PGHOST:'127.0.0.1',PGHOSTADDR:'127.0.0.1',PGDATABASE:database,PGPORT:port,PGCONNECT_TIMEOUT:'5',PGSERVICE:undefined,PGOPTIONS:undefined};
function psql(sql:string,onOutput?:(value:string)=>void){
 const child=spawn('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1'],{env,windowsHide:true});let out='',err='';
 const done=new Promise<{code:number|null;out:string;err:string}>((resolve,reject)=>{
  child.on('error',reject);child.stdout.on('data',chunk=>{out+=String(chunk);onOutput?.(out);});child.stderr.on('data',chunk=>{err+=String(chunk);});child.on('close',code=>resolve({code,out,err}));
 });
 child.stdin.end(`\set VERBOSITY verbose
SET statement_timeout='15s';SET lock_timeout='8s';
${sql}`);return {done};
}
async function run(sql:string){const r=await psql(sql).done;assert.equal(r.code,0,r.err);return r.out;}
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
async function main(){
 assert.match(await run("SELECT to_regnamespace('apex_private') IS NULL AND to_regnamespace('auth') IS NULL AND to_regnamespace('storage') IS NULL"),/\bt\b/,'Refusing an initialized DB');
 await run(testServiceSchemaSQL.replace(/CREATE ROLE (\w+);/g,(_,role:string)=>`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role};END IF;END$$;`));
 for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).sort())await run(read(`../supabase/migrations/${file}`));
 await run(read('../supabase/seed-demo.sql'));
 const ids=['00000000-0000-4000-8000-000000019001','00000000-0000-4000-8000-000000019002'];
 const sids=['10000000-0000-4000-8000-000000019001','10000000-0000-4000-8000-000000019002'];
 for(let n=0;n<2;n++)await run(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${ids[n]}','concurrent-admin-${n}@example.test',now());
 UPDATE apex_private.usuario SET rol='administrador' WHERE auth_user_id='${ids[n]}';INSERT INTO auth.sessions(id,user_id) VALUES('${sids[n]}','${ids[n]}');`);
 const change=(n:number)=>`SELECT set_config('request.jwt.claims','${JSON.stringify({sub:ids[n],session_id:sids[n]})}',true);SET LOCAL ROLE authenticated;
 SELECT public.apex_api('admin_user_update','${JSON.stringify({userId:ids[n],authId:ids[n],expectedRole:'administrador',expectedStatus:'activo',status:'inactivo',reason:'Isolated concurrent last-admin check',confirmed:true})}'::jsonb);`;
 for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
  await run("UPDATE apex_private.usuario SET estado='activo' WHERE rol='administrador'");
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  const first=psql(`BEGIN ISOLATION LEVEL ${isolation};${change(0)} SELECT 'FIRST_CHANGED';SELECT pg_sleep(2);COMMIT;`,out=>{if(out.includes('FIRST_CHANGED'))release();});
  await Promise.race([held,first.done.then(result=>{throw Error('First process failed before barrier: '+result.err);})]);
  const second=psql(`BEGIN ISOLATION LEVEL ${isolation};SELECT count(*) FROM apex_private.usuario;${change(1)}COMMIT;`);
  const [a,b]=await Promise.all([first.done,second.done]);assert.equal(a.code,0,a.err);assert.notEqual(b.code,0,'Both admins must never be deactivated');
  assert.match(b.err,isolation==='REPEATABLE READ'?/40001|serialize/:/último administrador/);
  assert.match(await run("SELECT count(*) FROM apex_private.usuario WHERE rol='administrador' AND estado='activo'"),/\b1\b/);
  console.log(`PASS two independent PostgreSQL connections: ${isolation}, exactly one active administrator retained.`);
 }
 // Same local disposable DB; no Auth HTTP or actual mail. Two independent
 // connections race to prepare/accept the same invitation and repeat safely.
 await run("UPDATE apex_private.usuario SET estado='activo' WHERE rol='administrador'");
 const recipient='00000000-0000-4000-8000-000000019004',recipientSession='10000000-0000-4000-8000-000000019004';
 await run(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES('${recipient}','concurrent-recipient@example.test',now(),'${JSON.stringify({name:'Concurrent recipient',birthDate:'2000-01-01',program:'demo',semester:1,consent:true})}');
 INSERT INTO auth.sessions(id,user_id) VALUES('${recipientSession}','${recipient}');`);
 for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
  await run(`UPDATE apex_private.usuario SET rol='estudiante' WHERE auth_user_id='${recipient}'`);
  const invitationId=randomUUID();
  const revision=Number((await run(`SELECT revision_cuenta FROM apex_private.usuario WHERE auth_user_id='${recipient}'`)).trim());
  const prepare=`SELECT set_config('request.jwt.claims','${JSON.stringify({sub:ids[0],session_id:sids[0]})}',true);SET LOCAL ROLE authenticated;
   SELECT public.apex_api('admin_invite_prepare','${JSON.stringify({invitationId,mode:'existing',userId:recipient,role:'docente',expectedRole:'estudiante',expectedStatus:'activo',expectedRevision:revision,reason:'Local concurrent invitation',confirmed:true})}');`;
  const prepared=await Promise.all([psql(`BEGIN;${prepare}COMMIT;`).done,psql(`BEGIN;${prepare}COMMIT;`).done]);
  for(const result of prepared)assert.equal(result.code,0,result.err);
  assert.match(await run(`SELECT count(*) FROM apex_private.invitacion_docente WHERE id='${invitationId}'`),/\b1\b/);
  const claim=JSON.parse((await run(`SELECT public.apex_admin_invitation_dispatch('${invitationId}','${ids[0]}','claim')`)).trim());
  await run(`SELECT public.apex_admin_invitation_dispatch('${invitationId}','${ids[0]}','sent','${claim.lease}','${recipient}')`);
  const accept=`SELECT set_config('request.jwt.claims','${JSON.stringify({sub:recipient,session_id:recipientSession})}',true);SET LOCAL ROLE authenticated;
   SELECT public.apex_accept_teacher_invitation_v2('${invitationId}','${claim.nonce}');`;
  let released!:()=>void;const barrier=new Promise<void>(resolve=>{released=resolve;});
  const first=psql(`BEGIN ISOLATION LEVEL ${isolation};${accept}SELECT 'ACCEPTED_BARRIER';SELECT pg_sleep(2);COMMIT;`,out=>{if(out.includes('ACCEPTED_BARRIER'))released();});
  await Promise.race([barrier,first.done.then(()=>{throw Error('Acceptance failed before barrier');})]);
  const second=psql(`BEGIN ISOLATION LEVEL ${isolation};SELECT count(*) FROM apex_private.usuario;${accept}COMMIT;`);
  const [a,b]=await Promise.all([first.done,second.done]);assert.equal(a.code,0,a.err);
  if(isolation==='REPEATABLE READ'){assert.notEqual(b.code,0);assert.match(b.err,/40001|serialize/);}else assert.equal(b.code,0,b.err);
  await run(`BEGIN;${accept}COMMIT;`); // Retry the entire transaction after serialization failure.
  assert.match(await run(`SELECT count(*) FROM apex_private.auditoria_administrativa WHERE destinatario='${invitationId}' AND accion='aceptar_invitacion'`),/\b1\b/);
  assert.match(await run(`SELECT rol FROM apex_private.usuario WHERE auth_user_id='${recipient}'`),/docente/);
  console.log(`PASS independent PostgreSQL connections: ${isolation}, duplicate preparation and one atomic acceptance.`);
 }
 console.log('Synthetic fixture retained in the named local disposable DB. No remote calls or cleanup deletion.');
}
void main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
