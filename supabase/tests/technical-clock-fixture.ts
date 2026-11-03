// TEST ONLY. Synthetic Auth identity and cron metadata; this does not run pg_cron.
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {registration} from './harness';
export const technicalStudent='d302e3f9-edcf-4cc7-a5ef-0a6c6adcdb70';
export async function technicalIdentity(db:PGlite,email='technical@example.test'){
 const sid=randomUUID();
 await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)',[technicalStudent,email,JSON.stringify({...registration,name:'Technical fixture'})]);
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,technicalStudent]);
 return {id:technicalStudent,sid};
}
export const syntheticSchedulerSQL=`CREATE SCHEMA cron;
 CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,username text,database text,schedule text,command text,active boolean);
 CREATE TABLE cron.job_run_details(jobid bigint,runid bigint,job_pid integer,database text,username text,command text,status text,return_message text,start_time timestamptz,end_time timestamptz);
 INSERT INTO cron.job VALUES(1,'apex-assessment-expiry-v1',current_user,current_database(),'30 seconds','SELECT apex_private.cerrar_intentos_vencidos(100);',true);
 INSERT INTO cron.job_run_details(jobid,status,start_time,end_time) VALUES(1,'succeeded',now(),now());`;
export async function academicEvidence(db:PGlite,uid:string){
 const names=['progreso_seccion','progreso_leccion','ruta_nivel_version','ruta_version','solicitud_ruta','sesion_refuerzo','trabajo_ia','exposicion_pregunta'];
 const state:Record<string,unknown>={};
 for(const name of names)state[name]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') v FROM apex_private.${name} t WHERE id_estudiante=$1`,[uid])).rows[0];
 state.decisions=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id_intento),'[]') v FROM apex_private.decision_avance d JOIN apex_private.intento i ON i.id=d.id_intento JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=$1`,[uid])).rows[0];
 state.context=(await db.query(`SELECT apex_private.contexto_ruta($1) route,apex_private.contexto_generacion($1,1) generation,apex_private.historial_json($1) history,apex_private.historial_ingles_json($1) english,apex_private.ingles_con_historial($1) has_history`,[uid])).rows[0];
 state.assignments=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') v FROM apex_private.asignacion_evaluacion a WHERE id_estudiante=$1 AND NOT apex_private.asignacion_tecnica(a.id)`,[uid])).rows[0];
 state.calls=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') v FROM apex_private.convocatoria_banco c WHERE id_estudiante=$1 AND NOT apex_private.asignacion_tecnica(c.id)`,[uid])).rows[0];
 state.clocks=(await db.query('SELECT * FROM apex_private.configuracion_reloj')).rows;
 return state;
}
