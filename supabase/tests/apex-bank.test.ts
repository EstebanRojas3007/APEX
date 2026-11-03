import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {database,identity,asUser,rpc,profile} from './harness';
import {buildBankLoad,templates,bankSourceId} from '../../scripts/build-apex-bank-load.mjs';
const root=new URL('../../',import.meta.url);
const content=JSON.parse(readFileSync(new URL('content/apex-ingles-v0.2/revision.json',root),'utf8'));
const key=JSON.parse(readFileSync(new URL('content/apex-ingles-v0.2/claves.servidor.json',root),'utf8'));
const load=readFileSync(new URL('supabase/content/apex-ingles-105-v0.2.sql',root),'utf8');
const compact=(s:string)=>s.replace(/\s+/g,' ').trim();
async function setup(db:Awaited<ReturnType<typeof database>>) {
 await db.exec(load);
 await db.exec("INSERT INTO apex_private.programa_componente VALUES('demo','ingles'); UPDATE apex_private.plantilla_evaluacion SET habilitada=true;"); // Test-only explicit activation.
}
function wholeBlocks(attempt:any){
 const ids=attempt.questions.map((q:any)=>q.questionId);
 assert.equal(new Set(ids).size,ids.length);
 for(const blockId of new Set(attempt.questions.map((q:any)=>q.context.id))){
  const expected=content.blocks.find((b:any)=>b.id===blockId);
  assert.deepEqual(attempt.questions.filter((q:any)=>q.context.id===blockId).map((q:any)=>q.questionId),expected.questionIds);
  const order=attempt.questions.map((q:any,i:number)=>q.context.id===blockId?i:-1).filter((n:number)=>n>=0);
  assert.equal(order.at(-1)-order[0]+1,expected.questionIds.length);
 }
 assert.doesNotMatch(JSON.stringify(attempt),/es_correcta|correctAnswer|justificacion|justification|pagina_clave|claves_originales/);
}
test('Real PDF: 105 faithful items, 35 per level, complete readings, original IDs and corroborated keys',()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL(content.source.localPath,root))).digest('hex'),content.source.sha256);
 assert.equal(buildBankLoad(content,key),load);
 assert.equal(content.approval.teacherReview,false);assert.equal(content.approval.icfesEndorsement,false);
 const raw=JSON.parse(readFileSync(new URL('content/apex-ingles-v0.2/evidence/automatic-text.json',root),'utf8'));
 assert.equal(raw.pages,65);
 for(const q of content.questions){
  const page=compact(raw.text[q.page-1].text);
  assert.ok(page.includes(compact(q.text)),`Source text ${q.id}`);
  for(const o of q.options)assert.ok(page.includes(o.text),`Source option ${q.id}/${o.label}`);
  const k=key.keys.find((k:any)=>k.id===q.id),kp=compact(raw.text[k.page-1].text);
  assert.ok(kp.includes(k.justification));assert.ok(kp.includes(k.references));assert.ok(kp.includes(k.skill));
 }
 for(const b of content.blocks){
  const source=compact(raw.text.slice(b.pageStart-1,b.pageEnd).map((p:any)=>p.text).join('\n'));
  if(b.reading)assert.ok(source.includes(compact(b.reading)),`Whole reading ${b.id}`);
  if(b.example)assert.ok(source.includes(compact(b.example)));
 }
 for(const t of templates)assert.equal(t.slots.reduce((n:number,s:any)=>n+s.size*s.blocks,0),t.count);
 const broken=structuredClone(content);broken.questions.pop();assert.throws(()=>buildBankLoad(broken,key),/105/);
 const missing=structuredClone(content);missing.blocks.find((b:any)=>b.code==='I01').reading=null;assert.throws(()=>buildBankLoad(missing,key),/Missing reading/);
 const wrong=structuredClone(content);wrong.questions[0].options[0].text='Unapproved modification';assert.throws(()=>buildBankLoad(wrong,key),/Shared options mismatch/);
});
test('Idempotent real import, conflict/partial detection, approval immutability and unchanged diagnostic history',async()=>{
 const db=await database();
 try{
  const student=await identity(db,201);
  await asUser(db,student,async()=>{
   await rpc(db,'profile',profile);const me=await rpc(db,'me');const a=await rpc(db,'start',{assignmentId:me.assignments[0].id,confirmed:true});await rpc(db,'finish',{attemptId:a.id});
  });
  const before=await asUser(db,student,()=>rpc(db,'me'));
  await db.exec(load);await db.exec(load);
  assert.deepEqual(await asUser(db,student,()=>rpc(db,'me')),before);
  const count=(await db.query<any>(`SELECT (SELECT count(*) FROM apex_private.pregunta WHERE id_fuente=$1) questions,(SELECT count(*) FROM apex_private.bloque_preguntas WHERE id_fuente=$1) blocks,(SELECT count(*) FROM apex_private.opcion_respuesta o JOIN apex_private.pregunta p ON p.id=o.id_pregunta WHERE p.id_fuente=$1) options`,[bankSourceId])).rows[0];
  assert.deepEqual(count,{questions:105,blocks:40,options:475});
  const levels=(await db.query<any>('SELECT nivel_pedagogico,count(*) FROM apex_private.pregunta WHERE id_fuente=$1 GROUP BY nivel_pedagogico ORDER BY 1',[bankSourceId])).rows;
  assert.deepEqual(levels.map(l=>[l.nivel_pedagogico,l.count]),[[1,35],[2,35],[3,35]]);
  assert.equal((await db.query('SELECT * FROM apex_private.convocatoria_banco')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM apex_private.plantilla_evaluacion WHERE habilitada')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM apex_private.fragmento_documental WHERE id_fuente=$1',[bankSourceId])).rows.length,0);
  await assert.rejects(db.exec("UPDATE apex_private.pregunta SET enunciado='changed' WHERE id='APEX-EN-C1-01'"),/inmutable/);
  await assert.rejects(db.exec("UPDATE apex_private.opcion_respuesta SET es_correcta=0 WHERE id='APEX-EN-C1-01-E'"),/inmutable/);
  const different=structuredClone(content);different.questions[0].text='Different edition';
  await assert.rejects(db.exec(buildBankLoad(different,key)),/Conflicting/);await db.exec('ROLLBACK');
  await db.exec(load);
  await db.exec(readFileSync(new URL('supabase/verify-apex-bank.sql',root),'utf8'));
 }finally{await db.close();}
 const partial=await database();
 try{
  await partial.query("INSERT INTO apex_private.fuente(id,titulo,organismo,ruta_archivo) VALUES($1,'conflicting partial','APEX',$2)",[bankSourceId,content.source.storagePath]);
  await assert.rejects(partial.exec(load),/Conflicting/);await partial.exec('ROLLBACK');
  assert.equal((await partial.query('SELECT * FROM apex_private.pregunta WHERE id_fuente=$1',[bankSourceId])).rows.length,0);
 }finally{await partial.close();}
});
test('Server selection: exact counts, complete contiguous blocks, recovery, grading and single attempt',async()=>{
 const db=await database();
 try{
  await setup(db);const admin=await identity(db,210,'administrador');
  for(const [index,t] of templates.entries()){
   const user=await identity(db,211+index);await asUser(db,user,()=>rpc(db,'profile',profile));
   const assign=()=>db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[user.id],t.id]);
   await asUser(db,user,()=>assert.rejects(assign(),/Solo administrador/));
   await asUser(db,admin,async()=>{await assign();await assign();});
   const assignment=(await db.query<any>('SELECT id FROM apex_private.convocatoria_banco WHERE id_estudiante=$1',[user.id])).rows[0]!.id;
   const first=await asUser(db,user,()=>rpc(db,'start',{assignmentId:assignment,confirmed:true}));
   assert.equal(first.questions.length,t.count);wholeBlocks(first);
   if(t.kind==='final')assert.deepEqual([1,2,3].map(level=>first.questions.filter((q:any)=>q.level===level).length),[8,7,10]);
   const resume=await asUser(db,user,()=>rpc(db,'start',{assignmentId:assignment,confirmed:true}));
   assert.equal(resume.id,first.id);assert.deepEqual(resume.questions,first.questions);
   const selected=first.questions[0];
   const correct=(await db.query<any>('SELECT id FROM apex_private.opcion_respuesta WHERE id_pregunta=$1 AND es_correcta=1',[selected.questionId])).rows[0]!.id;
   await asUser(db,user,()=>rpc(db,'answer',{attemptId:first.id,item:selected.id,option:correct}));
   await asUser(db,user,()=>rpc(db,'activity',{scope:'menu'}));
   await asUser(db,user,()=>assert.rejects(rpc(db,'answer',{attemptId:first.id,item:selected.id,option:correct}),/Retoma/));
   const sid='20000000-0000-4000-8000-'+String(211+index).padStart(12,'0');await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,user.id]);
   const fresh={...user,sid};
   const recovered=await asUser(db,fresh,()=>rpc(db,'start',{assignmentId:assignment,confirmed:true}));
   assert.deepEqual(recovered.questions,first.questions);assert.equal(recovered.answers[selected.id],correct);
   const result=await asUser(db,fresh,()=>rpc(db,'finish',{attemptId:first.id}));assert.equal(result.total,t.count);assert.equal(result.correct,1);
   assert.deepEqual(await asUser(db,fresh,()=>rpc(db,'finish',{attemptId:first.id})),result);
   const finished=await asUser(db,fresh,()=>rpc(db,'start',{assignmentId:assignment,confirmed:true}));assert.equal(finished.id,first.id);assert.equal(finished.status,'finalizado');
   await asUser(db,fresh,()=>assert.rejects(rpc(db,'answer',{attemptId:first.id,item:selected.id,option:correct}),/Retoma/));
  }
  const histories=(await db.query('SELECT * FROM apex_private.resultado ORDER BY id_intento')).rows;
  await db.exec(load);
  assert.deepEqual((await db.query('SELECT * FROM apex_private.resultado ORDER BY id_intento')).rows,histories,'Reimport after activation and grading preserves results');
 }finally{await db.close();}
});
test('Unseen priority across assignments; controlled, audited exhaustion without partial exposure or new attempts',async()=>{
 const db=await database();
 try{
  await setup(db);const admin=await identity(db,220,'administrador'),user=await identity(db,221);await asUser(db,user,()=>rpc(db,'profile',profile));
  let seen=new Set<string>();
  for(let form=1;form<=3;form++){
   const tid='test-only-level3-form-'+form;
   await db.query("INSERT INTO apex_private.plantilla_evaluacion(id,id_fuente,version,titulo,tipo,nivel,cantidad,composicion,habilitada) SELECT $1,id_fuente,$2,'Separate assigned fixture','control',nivel,cantidad,composicion,true FROM apex_private.plantilla_evaluacion WHERE id='apex-ingles-control-3-v1'",[tid,form]);
   await asUser(db,admin,()=>db.query('SELECT public.apex_assign_bank($1::text[],$2)',[[user.id],tid]));
   const aid=(await db.query<any>('SELECT id FROM apex_private.convocatoria_banco WHERE id_estudiante=$1 AND id_plantilla=$2',[user.id,tid])).rows[0]!.id;
   const a=await asUser(db,user,()=>rpc(db,'start',{assignmentId:aid,confirmed:true}));
   if(form<3){wholeBlocks(a);for(const q of a.questions){assert.ok(!seen.has(q.questionId));seen.add(q.questionId);}await asUser(db,user,()=>rpc(db,'finish',{attemptId:a.id}));}
   else{
    assert.equal(a.error.code,'BANK_EXHAUSTED');assert.equal(a.error.family,'uso_integrado');assert.equal(a.error.availableBlocks,1);
    assert.equal((await db.query<any>('SELECT count(*) n FROM apex_private.exposicion_pregunta WHERE id_estudiante=$1',[user.id])).rows[0]!.n,20);
    assert.equal((await db.query('SELECT * FROM apex_private.asignacion_evaluacion WHERE id=$1',[aid])).rows.length,0);
    assert.equal((await db.query('SELECT * FROM apex_private.agotamiento_banco WHERE id_convocatoria=$1',[aid])).rows.length,1);
    const retry=await asUser(db,user,()=>rpc(db,'start',{assignmentId:aid,confirmed:true}));assert.equal(retry.error.code,'BANK_EXHAUSTED');
    assert.equal((await db.query('SELECT * FROM apex_private.agotamiento_banco WHERE id_convocatoria=$1',[aid])).rows.length,2);
   }
  }
 }finally{await db.close();}
});
test('Server publication rejects wrong totals, fragmented blocks, reordered members and skill compositions',async()=>{
 const db=await database();
 try{
  await setup(db);
  const members=(code:string)=>content.blocks.find((b:any)=>b.code===code).questionIds as string[];
  const notices=content.blocks.filter((b:any)=>b.code.startsWith('N')).flatMap((b:any)=>b.questionIds) as string[];
  async function draft(id:string,templateId:string,ids:string[]){
   await db.query("INSERT INTO apex_private.evaluacion(id,titulo,version,tipo,id_plantilla) VALUES($1,'Invalid fixture',1,'cuestionario',$2)",[id,templateId]);await db.query("INSERT INTO apex_private.evaluacion_componente VALUES($1,'ingles')",[id]);
   for(const [index,qid] of ids.entries())await db.query('INSERT INTO apex_private.item_evaluacion VALUES($1,$2,$3,$4)',[id+'-'+index,id,qid,index+1]);
  }
  await draft('wrong-total','apex-ingles-control-1-v1',[...members('V01'),...notices.slice(0,4)]);
  await assert.rejects(db.query("UPDATE apex_private.evaluacion SET publicada=true WHERE id='wrong-total'"),/Cantidad/);
  await draft('fragmented','apex-ingles-control-1-v1',[...members('V01').slice(0,4),...notices.slice(0,6)]);
  await assert.rejects(db.query("UPDATE apex_private.evaluacion SET publicada=true WHERE id='fragmented'"),/fragmentar/);
  await draft('reordered','apex-ingles-control-1-v1',[...members('V01').slice().reverse(),...notices.slice(0,5)]);
  await assert.rejects(db.query("UPDATE apex_private.evaluacion SET publicada=true WHERE id='reordered'"),/Orden/);
  await draft('wrong-skills','apex-ingles-control-3-v1',[...members('I01'),...members('G01'),...members('G02')]);
  await assert.rejects(db.query("UPDATE apex_private.evaluacion SET publicada=true WHERE id='wrong-skills'"),/Composición pedagógica/);
  assert.equal((await db.query('SELECT * FROM apex_private.evaluacion WHERE id_plantilla IS NOT NULL AND publicada')).rows.length,0);
 }finally{await db.close();}
});
test('Private PDF and tutor exclusions survive permissive Storage policies; client cannot read keys or call server contracts',async()=>{
 const db=await database();
 try{
  await setup(db);const admin=await identity(db,230,'administrador'),student=await identity(db,231),teacher=await identity(db,232,'docente');
  await asUser(db,student,()=>rpc(db,'profile',profile));
  await db.query('INSERT INTO apex_private.asignacion_docente VALUES($1,$2)',[teacher.id,student.id]);
  await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['materiales-estudio',content.source.storagePath]);
  await db.exec('CREATE POLICY test_wide_read ON storage.objects FOR SELECT TO authenticated USING(true);');
  await db.query("INSERT INTO apex_private.fragmento_documental(id_fuente,pagina,ordinal,texto,metodo_extraccion,version_extractor,revisado,uso_contexto,tipo_contenido) VALUES($1,4,1,'Accidentally authorized secret fixture','test','1',true,true,'documental')",[bankSourceId]);
  for(const user of [student,teacher,admin])await asUser(db,user,async()=>{
   assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1',[content.source.storagePath])).rows.length,user===admin?1:0);
   assert.deepEqual((await db.query<any>('SELECT public.apex_document_context($1) value',[bankSourceId])).rows[0]!.value,[]);
   await assert.rejects(db.query('SELECT * FROM apex_private.opcion_respuesta'),/permission denied/);
   await assert.rejects(db.query('SELECT * FROM apex_private.carga_banco'),/permission denied/);
   await assert.rejects(db.query('SELECT public.apex_route_agent_context($1)',[student.id]),/permission denied/);
   await assert.rejects(db.query("SELECT public.apex_save_route_proposal('{}'::jsonb)"),/permission denied/);
   await assert.rejects(db.query("SELECT public.apex_api_anterior('me')"),/permission denied/);
  });
 }finally{await db.close();}
});
