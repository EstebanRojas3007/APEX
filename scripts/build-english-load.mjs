import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const sourceId='icfes-ingles-2018-v1';
export const storagePath='Ingles/icfes-2018/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf';
export const officialUrl='https://www.icfes.gov.co/wp-content/uploads/2025/01/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf';
export const diagnosticId='diagnostico-ingles-2018-v1';
export const selection=[1,4,6,11,16,21,24];
export const categories=[
 ['vocabulario','Vocabulario: estados y necesidades','Interpretación léxica'],
 ['conversaciones','Conversaciones cotidianas','Respuesta comunicativa pertinente'],
 ['gramatica','Gramática y cohesión en contexto','Selección gramatical y cohesión'],
 ['lectura','Comprensión lectora: información explícita','Localización de información explícita'],
];
const category=n=>n<=5?0:n<=10?1:n<=18?2:3;
const page=n=>n<=5?5:n<=10?6:n<=18?7:9;
const qid=n=>`${sourceId}-q${String(n).padStart(2,'0')}`;
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):typeof value==='boolean'?String(value):`'${String(value).replaceAll("'","''")}'`;
const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});\n`;
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};

export function buildEnglishLoad(content,answerKey) {
 requireValue(content.source.id===sourceId&&content.source.storagePath===storagePath&&content.source.url===officialUrl,'Source identity/path/URL mismatch.');
 requireValue(content.extractionStatus==='visually_checked_pending_human_review','Extraction is incomplete or not visually checked. No SQL generated.');
 requireValue(/^[a-f0-9]{64}$/.test(content.source.sha256??'')&&content.source.pages===11,'Missing verified PDF hash/pages.');
 requireValue(content.questions.length===25&&new Set(content.questions.map(q=>q.number)).size===25,'Expected exactly 25 distinct questions.');
 requireValue(content.blocks.length===4,'Expected four original blocks.');
 requireValue(answerKey.sourceId===sourceId&&answerKey.page===10&&answerKey.visuallyChecked===true,'Key page requires visual verification.');
 for(let n=1;n<=25;n++){
  const q=content.questions.find(q=>q.number===n),b=content.blocks.find(b=>b.id===q?.blockId);
  requireValue(q&&b&&q.page===page(n)&&q.visuallyChecked===true&&typeof q.text==='string'&&q.text.trim(),'Incomplete question '+n);
  requireValue(b.format===['vocabulario_compartido','conversacion','cloze','lectura'][category(n)],'Question/block type mismatch '+n);
  const expected=n<=5?'ABCDEFGH':'ABC';
  requireValue(q.options.map(o=>o.label).join('')===expected&&q.options.every(o=>typeof o.text==='string'&&o.text.trim()),'Invalid original options '+n);
  requireValue(expected.includes(answerKey.answers[String(n)])&&answerKey.answers[String(n)].length===1,'Missing/invalid key '+n);
  if(n<=5)requireValue(JSON.stringify(q.options)===JSON.stringify(b.sharedOptions),'Shared choices must be identical for questions 1–5.');
 }
 for(const b of content.blocks){
  requireValue(b.visuallyChecked===true&&b.instructions?.trim(),'Unverified block '+b.id);
  if(['cloze','lectura'].includes(b.format))requireValue(b.reading?.trim(),'Missing reading '+b.id);
 }
 const cloze=content.blocks.find(b=>b.format==='cloze');
 for(let n=11;n<=18;n++)requireValue(cloze.reading.includes(`(${n})`),'Missing original gap '+n);
 let sql=`-- PRIVATE REVIEW LOAD. Contains server answer keys. Never bundle/import into client or tutor context.\n-- Does not publish, mark reviewed, or assign any assessment. Existing source is required.\n-- Requires migration 202610040001_english_question_blocks.sql.\n-- PDF SHA-256: ${content.source.sha256}\n-- 25 original questions; 4 blocks; 100 option rows; 7 selected items. Human approval pending.\nBEGIN;\nSET LOCAL search_path TO apex_private,pg_catalog;\n`;
 sql+=`DO $$ DECLARE f fuente; BEGIN\nSELECT * INTO f FROM fuente WHERE id=${literal(sourceId)} FOR UPDATE;\nIF f.id IS NULL THEN RAISE EXCEPTION 'Register the existing source first; this load never creates it.'; END IF;\nIF f.ruta_archivo IS DISTINCT FROM ${literal(storagePath)} OR f.url_origen IS DISTINCT FROM ${literal(officialUrl)} OR (f.sha256 IS NOT NULL AND f.sha256<>${literal(content.source.sha256)}) OR (f.paginas IS NOT NULL AND f.paginas<>11) THEN RAISE EXCEPTION 'Existing source metadata mismatch; reconcile without overwriting.'; END IF;\nIF EXISTS(SELECT 1 FROM pregunta WHERE id LIKE '${sourceId}-q%') OR EXISTS(SELECT 1 FROM bloque_preguntas WHERE id LIKE '${sourceId}-%') OR EXISTS(SELECT 1 FROM evaluacion WHERE id=${literal(diagnosticId)}) THEN RAISE EXCEPTION 'English load already present or partially present. No overwrite; inspect before retry.'; END IF;\nEND $$;\n`;
 sql+=`UPDATE fuente SET sha256=${literal(content.source.sha256)},paginas=11,referencia_edicion=coalesce(referencia_edicion,'octubre de 2018') WHERE id=${literal(sourceId)} AND (sha256 IS NULL OR paginas IS NULL OR referencia_edicion IS NULL);\n`;
 sql+="INSERT INTO componente(id,nombre) VALUES('ingles','Inglés') ON CONFLICT(id) DO NOTHING;\n";
 for(const [suffix,nucleus,competency] of categories){
  sql+=`INSERT INTO nucleo_tematico(id,id_componente,nombre,origen_clasificacion) VALUES('ingles-${suffix}','ingles',${literal(nucleus)},'propuesta_apex') ON CONFLICT(id) DO NOTHING;\n`;
  sql+=`INSERT INTO competencia(id,id_componente,nombre,origen_clasificacion) VALUES('ingles-${suffix}','ingles',${literal(competency)},'propuesta_apex') ON CONFLICT(id) DO NOTHING;\n`;
  sql+=`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM nucleo_tematico WHERE id='ingles-${suffix}' AND id_componente='ingles' AND nombre=${literal(nucleus)} AND origen_clasificacion='propuesta_apex') OR NOT EXISTS(SELECT 1 FROM competencia WHERE id='ingles-${suffix}' AND id_componente='ingles' AND nombre=${literal(competency)} AND origen_clasificacion='propuesta_apex') THEN RAISE EXCEPTION 'Existing pedagogical classification mismatch.'; END IF; END $$;\n`;
 }
 for(const b of content.blocks)sql+=insert('bloque_preguntas',{id:b.id,id_fuente:sourceId,titulo:b.title,instrucciones:b.instructions,lectura:b.reading??null,ejemplo:b.example??null,opciones_compartidas:JSON.stringify(b.sharedOptions??[]),formato:b.format,pagina_inicio:b.pageStart,pagina_fin:b.pageEnd,estado_revision:'borrador'});
 for(const q of content.questions){
  const classification='ingles-'+categories[category(q.number)][0];
  sql+=insert('pregunta',{id:qid(q.number),id_fuente:sourceId,id_nucleo:classification,id_competencia:classification,enunciado:q.text,version:1,tipo:'seleccion_unica',procedencia:'original_pdf',pagina_inicio:q.page,pagina_fin:q.page,estado_revision:'borrador',id_bloque:q.blockId,numero_original:q.number,pagina_clave:10});
  q.options.forEach((o,index)=>sql+=insert('opcion_respuesta',{id:`${qid(q.number)}-${o.label}`,id_pregunta:qid(q.number),texto:o.text,orden:index+1,es_correcta:o.label===answerKey.answers[String(q.number)]?1:0,etiqueta_original:o.label}));
 }
 sql+=insert('evaluacion',{id:diagnosticId,titulo:'Diagnóstico de práctica de Inglés · selección APEX / ICFES 2018',version:1,tipo:'diagnostico',publicada:false});
 sql+=insert('evaluacion_componente',{id_evaluacion:diagnosticId,id_componente:'ingles'});
 selection.forEach((number,index)=>sql+=insert('item_evaluacion',{id:`${diagnosticId}-item${index+1}`,id_evaluacion:diagnosticId,id_pregunta:qid(number),orden:index+1}));
 return sql+'-- No programa_academico/estudiante/demo/results changes. No AI fragments are inserted.\nCOMMIT;\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=new URL('../content/ingles-2018/',import.meta.url);
 const content=JSON.parse(readFileSync(new URL('revision.json',directory),'utf8'));
 const key=JSON.parse(readFileSync(new URL('claves.servidor.json',directory),'utf8'));
 const pdf=readFileSync(new URL('../Docs/materiales/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf',import.meta.url));
 requireValue(createHash('sha256').update(pdf).digest('hex')===content.source.sha256,'Local PDF hash does not match the checked transcription.');
 requireValue(key.verification?.sourceSha256===content.source.sha256,'Answer key verification belongs to another PDF.');
 const sql=buildEnglishLoad(content,key);
 const output=new URL('../supabase/content/',import.meta.url);mkdirSync(output,{recursive:true});
 writeFileSync(new URL('icfes-ingles-2018-draft.sql',output),sql,{flag:'wx'});
 console.log('Generated private draft SQL. No remote calls, reviews, publication or assignments performed.');
}
