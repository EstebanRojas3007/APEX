import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {database,identity,asUser,rpc,profile} from './harness';
import {englishFixture} from './english-fixture';
import {buildEnglishLoad,sourceId,storagePath,officialUrl,diagnosticId} from '../../scripts/build-english-load.mjs';

test('English draft load, shared blocks, explicit assignment and no key pages for AI',async()=>{
 const db=await database();
 try {
 const admin=await identity(db,40,'administrador'),existing=await identity(db,41);
 await asUser(db,existing,()=>rpc(db,'profile',profile));
 const before=await db.query("SELECT * FROM apex_private.evaluacion WHERE id='diagnostico-v1'");
 const fixture=englishFixture(),sql=buildEnglishLoad(fixture.content,fixture.key);
 await assert.rejects(db.exec(sql),/existing source/);await db.exec('ROLLBACK');
 await db.query("INSERT INTO apex_private.fuente(id,titulo,organismo,referencia_edicion,url_origen,ruta_archivo) VALUES($1,'SYNTHETIC TEST FIXTURE','TEST',NULL,$2,$3)",[sourceId,officialUrl,storagePath]);
 await db.exec(sql);
 assert.deepEqual(await db.query("SELECT * FROM apex_private.evaluacion WHERE id='diagnostico-v1'"),before);
 assert.equal((await db.query("SELECT * FROM apex_private.pregunta WHERE id_fuente=$1 AND estado_revision='borrador'",[sourceId])).rows.length,25);
 assert.equal((await db.query("SELECT * FROM apex_private.bloque_preguntas WHERE estado_revision='borrador'")).rows.length,4);
 assert.equal((await db.query("SELECT * FROM apex_private.fuente WHERE id=$1",[sourceId])).rows.length,1);
 const assign=()=>db.query("SELECT public.apex_assign_english(ARRAY['demo']) AS value");
 await asUser(db,existing,()=>assert.rejects(assign(),/Solo administrador/));
 await asUser(db,admin,()=>assert.rejects(assign(),/publica/));
 await assert.rejects(db.exec(`UPDATE apex_private.evaluacion SET publicada=true WHERE id='${diagnosticId}'`),/revisado/);
 await assert.rejects(db.exec(sql),/already present/);await db.exec('ROLLBACK');
 // Test-only approval simulates a later, separate human review; never generated in load SQL.
 await db.query("UPDATE apex_private.fuente SET estado='revisado' WHERE id=$1",[sourceId]);
 await db.query("UPDATE apex_private.pregunta SET estado_revision='revisada',revisada_por=$1,revisada_en=now() WHERE id_fuente=$2",[admin.id,sourceId]);
 await db.query("UPDATE apex_private.bloque_preguntas SET estado_revision='revisada',revisada_por=$1,revisada_en=now() WHERE id_fuente=$2",[admin.id,sourceId]);
 await db.query('UPDATE apex_private.evaluacion SET publicada=true WHERE id=$1',[diagnosticId]);
 await asUser(db,admin,async()=>{
  assert.equal((await assign()).rows.length,1);await assign();
 });
 const assignments=await db.query('SELECT * FROM apex_private.asignacion_evaluacion WHERE id_evaluacion=$1',[diagnosticId]);assert.equal(assignments.rows.length,1);
 await identity(db,42); // New registration receives the now-published diagnostic.
 assert.equal((await db.query('SELECT * FROM apex_private.asignacion_evaluacion WHERE id_evaluacion=$1',[diagnosticId])).rows.length,2);
 assert.equal((await db.query("SELECT * FROM apex_private.estudiante WHERE id_programa='demo'")).rows.length,2,'English never replaces academic program');
 await asUser(db,existing,async()=>{
  const summary=await rpc(db,'me');const a=summary.assignments.find((a:{title:string})=>a.title.includes('Inglés'));
  const attempt=await rpc(db,'start',{assignmentId:a.id,confirmed:true});
  assert.deepEqual(attempt.questions.map((q:{originalNumber:number})=>q.originalNumber),fixture.selection);
  assert.equal(attempt.questions[0].context.sharedOptions.length,8);
  assert.equal(attempt.questions[0].options[7].label,'H');
  assert.match(attempt.questions[3].context.reading,/\(11\).*\(18\)/);
  assert.equal(attempt.questions[5].sourcePage,9);assert.equal(attempt.questions[5].context.pageStart,8);
  assert.doesNotMatch(JSON.stringify(attempt),/es_correcta|pagina_clave|correctAnswer/);
  await assert.rejects(db.query('SELECT * FROM apex_private.bloque_preguntas'),/permission denied/);
 });
 await assert.rejects(db.exec("UPDATE apex_private.bloque_preguntas SET lectura='changed' WHERE formato='cloze'"),/inmutable/);
 // Even accidental approval of a key fragment cannot expose it to the tutor.
 await db.query("INSERT INTO apex_private.fragmento_documental(id_fuente,pagina,ordinal,texto,metodo_extraccion,version_extractor,revisado,uso_contexto,tipo_contenido) VALUES($1,10,1,'SYNTHETIC SECRET KEY','fixture','1',true,true,'documental')",[sourceId]);
 await asUser(db,admin,async()=>{
  const r=await db.query<{value:unknown}>('SELECT public.apex_document_context($1) AS value',[sourceId]);assert.deepEqual(r.rows[0]!.value,[]);
 });
 }finally{await db.close();}
});

test('Generator refuses missing reading, incomplete visual check, labels or key',()=>{
 let f=englishFixture();f.content.blocks[2]!.reading=null;assert.throws(()=>buildEnglishLoad(f.content,f.key),/Missing reading/);
 f=englishFixture();f.content.extractionStatus='pending_attachment';assert.throws(()=>buildEnglishLoad(f.content,f.key),/incomplete/);
 f=englishFixture();f.content.questions[0]!.options[0]!.label='X';assert.throws(()=>buildEnglishLoad(f.content,f.key),/Invalid original options/);
 f=englishFixture();f.key.visuallyChecked=false;assert.throws(()=>buildEnglishLoad(f.content,f.key),/visual verification/);
});

test('Actual ICFES draft SQL loads all transcribed content without approval, assignment or demo history changes',async()=>{
 const root=new URL('../../',import.meta.url);
 const content=JSON.parse(readFileSync(new URL('content/ingles-2018/revision.json',root),'utf8'));
 const key=JSON.parse(readFileSync(new URL('content/ingles-2018/claves.servidor.json',root),'utf8'));
 const sql=readFileSync(new URL('supabase/content/icfes-ingles-2018-draft.sql',root),'utf8');
 const pdf=readFileSync(new URL(content.source.localPath,root));
 assert.equal(createHash('sha256').update(pdf).digest('hex'),content.source.sha256);
 assert.equal(key.verification.sourceSha256,content.source.sha256);
 assert.equal(sql,buildEnglishLoad(content,key),'Committed SQL must match the checked editorial files');
 assert.equal(content.humanReview.status,'pending');assert.equal(key.humanReview.status,'pending');
 assert.equal(content.verification.humanApproval,false);
 // The missing text layer must not be mistaken for the complete reading.
 const raw=JSON.parse(readFileSync(new URL('content/ingles-2018/evidence/automatic-text.json',root),'utf8'));
 assert.doesNotMatch(raw.text.find((p:{page:number})=>p.page===7).text,/GREEK AND ROMAN CULTURES/);
 assert.match(content.blocks[2].reading,/GREEK AND ROMAN CULTURES/);
 assert.deepEqual([...content.blocks[2].reading.matchAll(/\((\d+)\)/g)].map(m=>Number(m[1])),[0,11,12,13,14,15,16,17,18]);
 const db=await database();
 try {
  const student=await identity(db,60),admin=await identity(db,61,'administrador');
  await asUser(db,student,async()=>{
   await rpc(db,'profile',profile);
   const me=await rpc(db,'me');
   const attempt=await rpc(db,'start',{assignmentId:me.assignments[0].id,confirmed:true});
   await rpc(db,'answer',{attemptId:attempt.id,item:attempt.questions[0].id,option:attempt.questions[0].options[0].id});
   await rpc(db,'finish',{attemptId:attempt.id});
  });
  const before=await asUser(db,student,()=>rpc(db,'me'));
  await db.query("INSERT INTO apex_private.fuente(id,titulo,organismo,url_origen,ruta_archivo,estado) VALUES($1,'Título ya registrado','ICFES',$2,'wrong-path.pdf','pendiente')",[sourceId,officialUrl]);
  await assert.rejects(db.exec(sql),/metadata mismatch/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT * FROM apex_private.pregunta WHERE id_fuente=$1',[sourceId])).rows.length,0);
  await db.query('UPDATE apex_private.fuente SET ruta_archivo=$1 WHERE id=$2',[storagePath,sourceId]);
  await db.exec(sql);
  assert.deepEqual(await asUser(db,student,()=>rpc(db,'me')),before,'Demo result, answers, profile and assignments unchanged');
  const source=(await db.query<{titulo:string;estado:string;sha256:string}>('SELECT titulo,estado,sha256 FROM apex_private.fuente WHERE id=$1',[sourceId])).rows[0]!;
  assert.equal(source.titulo,'Título ya registrado');assert.equal(source.estado,'pendiente');assert.equal(source.sha256,content.source.sha256);
  const questions=(await db.query<{numero_original:number;enunciado:string;pagina_inicio:number;pagina_clave:number;estado_revision:string;revisada_por:string|null;revisada_en:string|null}>('SELECT * FROM apex_private.pregunta WHERE id_fuente=$1 ORDER BY numero_original',[sourceId])).rows;
  assert.equal(questions.length,25);
  for(const [i,q] of questions.entries()){
   assert.equal(q.numero_original,i+1);assert.equal(q.enunciado,content.questions[i].text);assert.equal(q.pagina_inicio,content.questions[i].page);
   assert.equal(q.pagina_clave,10);assert.equal(q.estado_revision,'borrador');assert.equal(q.revisada_por,null);assert.equal(q.revisada_en,null);
  }
  const opts=(await db.query<{numero_original:number;etiqueta_original:string;texto:string;es_correcta:number}>('SELECT p.numero_original,o.etiqueta_original,o.texto,o.es_correcta FROM apex_private.opcion_respuesta o JOIN apex_private.pregunta p ON p.id=o.id_pregunta WHERE p.id_fuente=$1 ORDER BY p.numero_original,o.orden',[sourceId])).rows;
  assert.equal(opts.length,100);
  for(const o of opts){
   assert.equal(o.texto,content.questions[o.numero_original-1].options.find((v:{label:string})=>v.label===o.etiqueta_original).text);
   assert.equal(o.es_correcta,o.etiqueta_original===key.answers[String(o.numero_original)]?1:0);
  }
  const blocks=(await db.query<{id:string;lectura:string|null;instrucciones:string;estado_revision:string;revisada_por:string|null}>('SELECT * FROM apex_private.bloque_preguntas WHERE id_fuente=$1',[sourceId])).rows;
  assert.equal(blocks.length,4);
  for(const b of blocks){const original=content.blocks.find((v:{id:string})=>v.id===b.id);assert.equal(b.lectura,original.reading);assert.equal(b.instrucciones,original.instructions);assert.equal(b.estado_revision,'borrador');assert.equal(b.revisada_por,null);}
  assert.equal((await db.query<{publicada:boolean}>('SELECT publicada FROM apex_private.evaluacion WHERE id=$1',[diagnosticId])).rows[0]!.publicada,false);
  assert.equal((await db.query('SELECT * FROM apex_private.asignacion_evaluacion WHERE id_evaluacion=$1',[diagnosticId])).rows.length,0);
  assert.equal((await db.query('SELECT * FROM apex_private.fragmento_documental WHERE id_fuente=$1',[sourceId])).rows.length,0);
  assert.deepEqual((await db.query<{numero_original:number}>('SELECT p.numero_original FROM apex_private.item_evaluacion i JOIN apex_private.pregunta p ON p.id=i.id_pregunta WHERE i.id_evaluacion=$1 ORDER BY i.orden',[diagnosticId])).rows.map(r=>r.numero_original),content.proposedDiagnostic);
  await asUser(db,admin,()=>assert.rejects(db.query("SELECT public.apex_assign_english(ARRAY['demo'])"),/publica/));
  await asUser(db,student,()=>assert.rejects(db.query('SELECT * FROM apex_private.opcion_respuesta'),/permission denied/));
  await assert.rejects(db.exec(sql),/already present/);await db.exec('ROLLBACK');
 }finally{await db.close();}
});
