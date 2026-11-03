import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
export const testServiceSchemaSQL=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',email_confirmed_at timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),created_at timestamptz DEFAULT now());
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
 GRANT USAGE ON SCHEMA auth,storage TO authenticated,anon;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,anon;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;`;
export async function database(beforeExtensions?:(db:PGlite)=>Promise<void>,beforeProfileMigration?:(db:PGlite)=>Promise<void>,beforeLearningMigration?:(db:PGlite)=>Promise<void>,beforeClockMigration?:(db:PGlite)=>Promise<void>) {
 const db=new PGlite();
 // Real PostgreSQL engine; Auth/Storage service schemas are minimal local test fixtures.
 await db.exec(testServiceSchemaSQL);
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort()) {
  try { if(file==='202610060004_registration_profile.sql'&&beforeProfileMigration)await beforeProfileMigration(db);if(file==='202610110001_learning_schema.sql'&&beforeLearningMigration)await beforeLearningMigration(db);if(file==='202610120001_assessment_clocks.sql'&&beforeClockMigration)await beforeClockMigration(db);await db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));if(file==='202609280001_initial_private.sql'&&beforeExtensions)await beforeExtensions(db); }
  catch(error) {await db.close();const e=error as {message:string;position?:string};throw new Error(`Migration ${file}: ${e.message} (position ${e.position})`);}
 }
 if(!beforeExtensions)await db.exec(readFileSync(new URL('../seed-demo.sql',import.meta.url),'utf8'));
 return db;
}
export async function identity(db:PGlite,n:number,role='estudiante',metadata:Record<string,unknown>=role==='estudiante'?{...registration,role:'administrador'}:{role:'administrador'},email=`student${n}@example.test`) {
 const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const sid=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id,email,JSON.stringify(metadata)]);
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,id]);
 if(role!=='estudiante')await db.query('UPDATE apex_private.usuario SET rol=$1 WHERE auth_user_id=$2',[role,id]);
 return {id,sid};
}
export async function asUser<T>(db:PGlite,user:{id:string;sid:string}|null,operation:()=>Promise<T>):Promise<T> {
 await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?{sub:user.id,session_id:user.sid}:{})]);
 await db.exec(`SET ROLE ${user?'authenticated':'anon'}`);
 try{return await operation();}finally{await db.exec('RESET ROLE');}
}
export async function rpc(db:PGlite,operation:string,payload:unknown={}) {
 const result=await db.query<{value:any}>('SELECT public.apex_api($1,$2::jsonb) AS value',[operation,JSON.stringify(payload)]);
 return result.rows[0]!.value;
}
export const profile={name:'Estudiante prueba',program:'demo',semester:1};
export const registration={...profile,birthDate:'2000-01-31',consent:true};
