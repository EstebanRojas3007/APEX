// Synthetic data ONLY for isolated PGlite/browser tests. Never imported by app.
import type {PGlite} from '@electric-sql/pglite';
import {asUser,rpc} from './harness';
import {generatedFixture} from './learning-fixture';
import {randomUUID} from 'node:crypto';
type User={id:string;sid:string};
export const studentCall=(db:PGlite,user:User,op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
export async function finishWith(db:PGlite,user:User,attempt:any,correct:number) {
 for(const item of attempt.questions.slice(0,correct)){
  const option=(await db.query<{id:string}>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[item.questionId])).rows[0]!.id;
  await studentCall(db,user,'answer',{attemptId:attempt.id,item:item.id,option});
 }
 return studentCall(db,user,'finish',{attemptId:attempt.id});
}
export async function beginDiagnostic(db:PGlite,user:User) {
 await db.query("INSERT INTO apex_private.convocatoria_banco(id_estudiante,id_plantilla) VALUES($1,'apex-ingles-diagnostico-v2') ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING",[user.id]);
 const {rows}=await db.query<{id:string}>("SELECT id FROM apex_private.convocatoria_banco WHERE id_estudiante=$1 AND id_plantilla='apex-ingles-diagnostico-v2'",[user.id]);
 return studentCall(db,user,'start',{assignmentId:rows[0]!.id,confirmed:true});
}
export async function publishSections(db:PGlite,user:User,level=1) {
 for(let n=0;n<100;n++){
  await db.exec('SET ROLE service_role');
  let job:any;
  try {
   job=(await db.query<any>('SELECT public.apex_ai_claim() v')).rows[0]!.v;
   if(!job)throw Error('Missing synthetic route job');
   await db.query('SELECT public.apex_ai_finish($1,$2,$3::jsonb,NULL)',[job.jobId,job.lease,JSON.stringify(generatedFixture(job))]);
  }finally{await db.exec('RESET ROLE');}
  const owner=(await db.query<{id_estudiante:string}>('SELECT id_estudiante FROM apex_private.trabajo_ia WHERE id=$1',[job.jobId])).rows[0]!.id_estudiante;
  if(owner===user.id&&job.input.level===level)break;
 }
 return asUser(db,user,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v);
}
export async function completeSections(db:PGlite,user:User,level=1,count=7) {
 const route=await asUser(db,user,async()=>(await db.query<any>('SELECT public.apex_my_route() v')).rows[0]!.v);
 for(const section of route.levels[level-1].sections.slice(0,count))await studentCall(db,user,'section_complete',{sectionId:section.id});
}
export async function beginControl(db:PGlite,user:User,level=1) {
 const aid=(await db.query<{id:string}>("SELECT c.id FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=$1 AND p.tipo='control' AND p.nivel=$2",[user.id,level])).rows[0]!.id;
 return studentCall(db,user,'start',{assignmentId:aid,confirmed:true});
}
export async function resolveReview(db:PGlite,user:User,attemptId:string) {
 // Deliberately test-only: mark the review complete without connecting any AI.
 await db.query("INSERT INTO apex_private.sesion_refuerzo(id_estudiante,tipo,id_intento,estado,completada_en) VALUES($1,'review',$2,'ready',now()) ON CONFLICT(id_intento) DO UPDATE SET estado='ready',completada_en=now()",[user.id,attemptId]);
}
export async function prepareSummaryStudent(db:PGlite,user:User) {
 const diag=await beginDiagnostic(db,user);await finishWith(db,user,diag,3);
 await publishSections(db,user);await completeSections(db,user);
 const failed=await beginControl(db,user);await finishWith(db,user,failed,6);
 await resolveReview(db,user,failed.id);
 const retry=await beginControl(db,user);await finishWith(db,user,retry,7);
 await publishSections(db,user,2);await completeSections(db,user,2,3);
 return {diag,failed,retry};
}
export async function historicalCopy(db:PGlite,user:User,sourceId:string,{id=randomUUID(),at=Date.now()+10000,breakdown=true,mixed=false,result=true,rule='aciertos-v1'}:{id?:string;at?:number;breakdown?:boolean;mixed?:boolean;result?:boolean;rule?:string}={}) {
 const eid=randomUUID(),aid=randomUUID();
 await db.query(`INSERT INTO apex_private.evaluacion(id,titulo,version,tipo,id_plantilla)
  SELECT $1,'Synthetic historical instrument',e.version,e.tipo,e.id_plantilla FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion JOIN apex_private.evaluacion e ON e.id=a.id_evaluacion WHERE i.id=$2`,[eid,sourceId]);
 await db.query(`INSERT INTO apex_private.evaluacion_componente SELECT $1,ec.id_componente FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion JOIN apex_private.evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE i.id=$2`,[eid,sourceId]);
 if(mixed)await db.query("INSERT INTO apex_private.evaluacion_componente VALUES($1,'rc')",[eid]);
 await db.query(`INSERT INTO apex_private.item_evaluacion SELECT gen_random_uuid()::text,$1,it.id_pregunta,it.orden FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion JOIN apex_private.item_evaluacion it ON it.id_evaluacion=a.id_evaluacion WHERE i.id=$2`,[eid,sourceId]);
 await db.query('UPDATE apex_private.evaluacion SET publicada=true WHERE id=$1',[eid]);
 await db.query('INSERT INTO apex_private.asignacion_evaluacion VALUES($1,$2,$3)',[aid,user.id,eid]);
 await db.query("INSERT INTO apex_private.intento VALUES($1,$2,'activo',$3,$3,NULL)",[id,aid,at-100]);
 if(result)await db.query(`INSERT INTO apex_private.resultado(id_intento,calculado_en,aciertos,total_preguntas,version_regla) SELECT $1,$2,0,count(*),$3 FROM apex_private.item_evaluacion WHERE id_evaluacion=$4`,[id,at,rule,eid]);
 await db.query("UPDATE apex_private.intento SET estado='finalizado',finalizado_en=$2 WHERE id=$1",[id,at]);
 if(result&&breakdown)await db.query('UPDATE apex_private.resultado SET detalle=apex_private.resultado_json($1) WHERE id_intento=$1',[id]);
 return id;
}
