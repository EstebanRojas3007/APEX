// Native PostgreSQL, two independent psql connections. Never targets Supabase.
// Requires an EMPTY disposable local DB named apex_teacher_test_<suffix>.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {testServiceSchemaSQL} from '../supabase/tests/harness';

const database=process.env.APEX_TEST_PG_DATABASE;
if(!database||!/^apex_teacher_test_[a-z0-9_]+$/.test(database))throw Error('Set APEX_TEST_PG_DATABASE to an empty disposable local apex_teacher_test_<suffix> database. Test NOT executed.');
const port=process.env.APEX_TEST_PG_PORT??'5432';
if(!/^\d{1,5}$/.test(port)||Number(port)>65535)throw Error('Invalid local PostgreSQL port.');
const env={...process.env,PGHOST:'127.0.0.1',PGHOSTADDR:'127.0.0.1',PGDATABASE:database,PGPORT:port,PGCONNECT_TIMEOUT:'5',PGSERVICE:undefined,PGOPTIONS:undefined};
type Outcome={code:number|null;out:string;err:string};
function psql(sql:string,onLine?:(line:string)=>void){
 const child=spawn('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1'],{env,windowsHide:true});
 let out='',err='';
 const done=new Promise<Outcome>((resolve,reject)=>{
  child.on('error',reject);child.stdout.on('data',chunk=>{out+=String(chunk);onLine?.(out);});child.stderr.on('data',chunk=>{err+=String(chunk);});
  child.on('close',code=>resolve({code,out,err}));
 });
 child.stdin.end(`\\set VERBOSITY verbose\nSET statement_timeout='15s';SET lock_timeout='8s';\n${sql}`);
 return {done,child};
}
async function run(sql:string){const result=await psql(sql).done;if(result.code!==0)throw Error(result.err);return result.out;}
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
async function main(){
 const empty=await run("SELECT to_regnamespace('apex_private') IS NULL AND to_regnamespace('auth') IS NULL AND to_regnamespace('storage') IS NULL;");
 assert.match(empty,/\bt\b/,'Refusing to touch an initialized database');
 // Roles are cluster-wide; reuse existing roles without altering their grants.
 const schema=testServiceSchemaSQL.replace(/CREATE ROLE (\w+);/g,(_,role:string)=>`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role};END IF;END$$;`);
 await run(schema);
 for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).sort())await run(read(`../supabase/migrations/${file}`));
 await run(read('../supabase/seed-demo.sql'));
 await run(`INSERT INTO apex_private.componente VALUES('ingles','Inglés sintético') ON CONFLICT DO NOTHING;
 INSERT INTO apex_private.programa_componente VALUES('demo','ingles') ON CONFLICT DO NOTHING;
 INSERT INTO auth.users(id,email) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'concurrency-'||n||'@example.test' FROM generate_series(1,21) n;
 INSERT INTO apex_private.estudiante SELECT id,'demo',1 FROM apex_private.usuario;`);
 for(const [round,isolation,reactivate] of [[1,'READ COMMITTED',false],[2,'REPEATABLE READ',false],[3,'READ COMMITTED',true],[4,'REPEATABLE READ',true]] as const){
  const gid=`20000000-0000-4000-8000-${String(round).padStart(12,'0')}`;
  await run(`INSERT INTO apex_private.grupo(id,codigo,nombre,id_componente) VALUES('${gid}','SYNTH-${round}','Synthetic concurrency','ingles');
   INSERT INTO apex_private.grupo_integrante(id_grupo,id_estudiante) SELECT '${gid}',id FROM apex_private.usuario ORDER BY id LIMIT 19;`);
  if(reactivate)await run(`INSERT INTO apex_private.grupo_integrante SELECT '${gid}',id,false,now() FROM apex_private.usuario ORDER BY id OFFSET 19;`);
  const mutation=(n:number)=>reactivate?`UPDATE apex_private.grupo_integrante SET activa=true WHERE id_grupo='${gid}' AND id_estudiante='00000000-0000-4000-8000-${String(n).padStart(12,'0')}';`:
   `INSERT INTO apex_private.grupo_integrante(id_grupo,id_estudiante) VALUES('${gid}','00000000-0000-4000-8000-${String(n).padStart(12,'0')}');`;
  let signal!:()=>void;
  const locked=new Promise<void>(resolve=>{signal=resolve;});
  const first=psql(`BEGIN ISOLATION LEVEL ${isolation};${mutation(20)} SELECT 'FIRST_LOCKED';SELECT pg_sleep(2);COMMIT;`,line=>{if(line.includes('FIRST_LOCKED'))signal();});
  // A failed first connection must reject the barrier, not hang the runner.
  await Promise.race([locked,first.done.then(r=>{throw Error('First connection finished before barrier: '+r.err);})]);
  const second=psql(`BEGIN ISOLATION LEVEL ${isolation};SELECT count(*) FROM apex_private.grupo_integrante WHERE id_grupo='${gid}';${mutation(21)}COMMIT;`);
  const [winner,loser]=await Promise.all([first.done,second.done]);
  assert.equal(winner.code,0,winner.err);assert.notEqual(loser.code,0,'21st membership must never commit');
  assert.match(loser.err,isolation==='REPEATABLE READ'?/40001|could not serialize/:/23514|Máximo 20/);
  assert.match(await run(`SELECT count(*) FROM apex_private.grupo_integrante WHERE id_grupo='${gid}' AND activa;`),/\b20\b/);
  console.log(`PASS native two-connection ${isolation} ${reactivate?'reactivation':'insert'}: 20 active; losing transaction rejected.`);
 }
 console.log('No remote calls. Synthetic fixture remains in the explicitly named disposable local database.');
}
void main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
