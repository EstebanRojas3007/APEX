import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const bankSourceId='apex-ingles-105-v0.2';
const lit=v=>v===null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(v).replaceAll("'","''")}'`;
// Compares every supplied field on retry; never updates an existing version.
function ensure(table,row,pk='id'){
 const target=JSON.parse(JSON.stringify(row));
 const values=Object.values(row).map(v=>lit(typeof v==='object'&&v!==null?JSON.stringify(v):v));
 return `DO $row$ BEGIN IF NOT EXISTS(SELECT 1 FROM ${table} WHERE ${pk}=${lit(row[pk])}) THEN\nINSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${values.join(',')});\nELSIF NOT EXISTS(SELECT 1 FROM ${table} t WHERE ${pk}=${lit(row[pk])} AND to_jsonb(t) @> ${lit(JSON.stringify(target))}::jsonb) THEN RAISE EXCEPTION 'Conflicting existing version in ${table}: %',${lit(row[pk])}; END IF; END $row$;\n`;
}
export const familyNames={vocabulario:'Vocabulario en contexto',avisos:'Avisos e instrucciones',conversaciones:'Interacciones pertinentes',gramatica:'Gramática en contexto',lectura_literal:'Lectura literal y paráfrasis',lectura_inferencial:'Inferencia, propósito y evidencia',uso_integrado:'Léxico, cohesión y clases de palabras'};
const slot=(family,level,size,blocks)=>({family,level,difficulty:level,size,blocks});
export const templates=[
 {id:'apex-ingles-control-1-v1',title:'Control de Inglés · Nivel 1',kind:'control',level:1,count:10,slots:[slot('vocabulario',1,5,1),slot('avisos',1,1,5)]},
 {id:'apex-ingles-control-2-v1',title:'Control de Inglés · Nivel 2',kind:'control',level:2,count:10,slots:[slot('conversaciones',2,2,1),slot('gramatica',2,3,2),slot('lectura_literal',2,2,1)]},
 {id:'apex-ingles-control-3-v1',title:'Control de Inglés · Nivel 3',kind:'control',level:3,count:10,slots:[slot('lectura_inferencial',3,4,1),slot('uso_integrado',3,3,2)]},
 {id:'apex-ingles-final-v1',title:'Examen final de Inglés',kind:'final',level:null,count:25,slots:[slot('vocabulario',1,5,1),slot('avisos',1,1,3),slot('conversaciones',2,2,1),slot('gramatica',2,3,1),slot('lectura_literal',2,2,1),slot('lectura_inferencial',3,4,1),slot('uso_integrado',3,3,2)]},
];
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export function buildBankLoad(content,key){
 assert(content.source.id===bankSourceId&&content.source.version==='0.2'&&content.source.pages===65&&content.source.storagePath==='Ingles/apex/banco-preguntas/v0.2/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf','Source/version/path mismatch');
 assert(content.visualVerification?.pages.length===65&&content.visualVerification.performedBy==='asistente','Visual verification missing');
 assert(content.approval.scope==='banco_interno'&&content.approval.teacherReview===false&&content.approval.icfesEndorsement===false,'Internal approval required');
 assert(key.sourceId===bankSourceId&&key.sourceSha256===content.source.sha256,'Key hash mismatch');
 assert(content.questions.length===105&&new Set(content.questions.map(q=>q.id)).size===105&&new Set(content.questions.map(q=>q.number)).size===105&&key.keys.length===105,'Expected 105 unique questions/keys');
 assert(content.blocks.length===40&&new Set(content.blocks.map(b=>b.id)).size===40,'Expected 40 whole blocks');
 for(const level of [1,2,3])assert(content.questions.filter(q=>q.level===level).length===35,'Expected 35 per level');
 for(const b of content.blocks){
  assert(b.instructions?.trim()&&b.version===2,'Missing block context/version');
  assert(content.questions.filter(q=>q.blockId===b.id).map(q=>q.id).sort().join()===b.questionIds.slice().sort().join(),'Incomplete block '+b.id);
  if(['cloze','lectura'].includes(b.format))assert(b.reading?.trim(),'Missing reading '+b.id);
 }
 for(const q of content.questions){
  const k=key.keys.find(k=>k.id===q.id),b=content.blocks.find(b=>b.id===q.blockId);
  assert(k&&b&&q.version===2&&q.level===b.level&&q.family===b.family&&q.page===b.pageEnd&&k.number===q.number&&k.level===q.level&&k.blockCode===b.code&&k.skill===q.skill&&k.references===q.references&&k.references?.trim()&&k.justification?.trim(),'Incomplete key/reference/version '+q.id);
  const labels=b.format==='vocabulario_compartido'?'ABCDEFGH':q.level===3?'ABCD':'ABC';
  assert(q.text?.trim()&&q.options.map(o=>o.label).join('')===labels&&q.options.every(o=>o.text?.trim())&&k.answer.length===1&&labels.includes(k.answer),'Invalid question/options '+q.id);
  if(b.format==='vocabulario_compartido')assert(JSON.stringify(q.options)===JSON.stringify(b.sharedOptions),'Shared options mismatch '+q.id);
  if(b.format==='cloze')assert(b.reading.includes(`(${q.number})`),'Missing original gap '+q.id);
 }
 for(const t of templates){
  assert(t.slots.reduce((n,s)=>n+s.size*s.blocks,0)===t.count,'Invalid composition');
  for(const s of t.slots)assert(content.blocks.filter(b=>b.family===s.family&&b.level===s.level&&b.questionIds.length===s.size).length>=s.blocks,'Infeasible composition');
 }
 let sql=`-- PRIVATE SERVER IMPORT: contains keys/justifications. Never bundle or feed to tutor.\n-- Idempotent, conflict detecting, atomic. No upload, publication or assignments.\n-- Requires all migrations through 202610060002. PDF SHA256 ${content.source.sha256}\nBEGIN;\nSET LOCAL search_path TO apex_private,pg_catalog;\nSELECT pg_advisory_xact_lock(hashtext('apex-ingles-105-v0.2'));\n`;
 sql+=ensure('fuente',{id:bankSourceId,titulo:content.source.title,organismo:'APEX',referencia_edicion:'v0.2 · fecha impresa 07/10/2026',url_origen:null,ruta_archivo:content.source.storagePath,sha256:content.source.sha256,paginas:65,estado:'revisado',contiene_soluciones:true,contexto_tutor_permitido:false});
 sql+=ensure('componente',{id:'ingles',nombre:'Inglés'});
 for(const [family,name] of Object.entries(familyNames))sql+=ensure('nucleo_tematico',{id:'apex-en-'+family,id_componente:'ingles',nombre:name,origen_clasificacion:'propuesta_apex'});
 const skillId=skill=>'apex-en-h-'+createHash('sha256').update(skill).digest('hex').slice(0,16);
 for(const skill of new Set(content.questions.map(q=>q.skill)))sql+=ensure('competencia',{id:skillId(skill),id_componente:'ingles',nombre:skill,origen_clasificacion:'propuesta_apex'});
 for(const b of content.blocks)sql+=ensure('bloque_preguntas',{id:b.id,id_fuente:bankSourceId,titulo:b.title,instrucciones:b.instructions,lectura:b.reading,ejemplo:b.example,opciones_compartidas:b.sharedOptions,formato:b.format,pagina_inicio:b.pageStart,pagina_fin:b.pageEnd,estado_revision:'revisada',revisada_por:null,revisada_en:null,version:2,codigo_original:b.code,familia_habilidad:b.family,nivel_pedagogico:b.level,dificultad_prevista:b.level,cantidad_preguntas:b.questionIds.length});
 for(const q of content.questions){
  const k=key.keys.find(k=>k.id===q.id);
  sql+=ensure('pregunta',{id:q.id,id_original:q.id,id_fuente:bankSourceId,id_nucleo:'apex-en-'+q.family,id_competencia:skillId(q.skill),enunciado:q.text,version:2,tipo:'seleccion_unica',procedencia:'generada',pagina_inicio:q.page,pagina_fin:q.page,estado_revision:'revisada',revisada_por:null,revisada_en:null,origen_generacion:{autor:'APEX',asistencia:'IA',version_banco:'0.2'},id_bloque:q.blockId,numero_original:q.number,pagina_clave:k.page,habilidad_descripcion:q.skill,justificacion_privada:k.justification,referencias_pedagogicas:q.references,nivel_pedagogico:q.level,dificultad_prevista:q.level});
  q.options.forEach((o,index)=>sql+=ensure('opcion_respuesta',{id:q.id+'-'+o.label,id_pregunta:q.id,texto:o.text,orden:index+1,es_correcta:o.label===k.answer?1:0,etiqueta_original:o.label}));
 }
 sql+=ensure('carga_banco',{id_fuente:bankSourceId,version:'0.2',checksum:createHash('sha256').update(JSON.stringify({content,key})).digest('hex'),aprobacion:content.approval,contenido_original:content,claves_originales:key},'id_fuente');
 // Activation is deliberately independent, so a later authorized toggle does not break import idempotence.
 for(const t of templates)sql+=ensure('plantilla_evaluacion',{id:t.id,id_fuente:bankSourceId,version:1,titulo:t.title+' · '+content.label,tipo:t.kind,nivel:t.level,cantidad:t.count,composicion:t.slots,politica_exposicion:'solo_no_vistas-v1'});
 sql+=`DO $$ BEGIN IF (SELECT count(*) FROM pregunta WHERE id_fuente='${bankSourceId}')<>105 OR (SELECT count(*) FROM bloque_preguntas WHERE id_fuente='${bankSourceId}')<>40 THEN RAISE EXCEPTION 'Unexpected bank counts'; END IF; END $$;\nCOMMIT;\n`;
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const content=JSON.parse(readFileSync(new URL('../content/apex-ingles-v0.2/revision.json',import.meta.url),'utf8'));
 const key=JSON.parse(readFileSync(new URL('../content/apex-ingles-v0.2/claves.servidor.json',import.meta.url),'utf8'));
 assert(createHash('sha256').update(readFileSync(new URL('../'+content.source.localPath,import.meta.url))).digest('hex')===content.source.sha256,'PDF changed');
 writeFileSync(new URL('../supabase/content/apex-ingles-105-v0.2.sql',import.meta.url),buildBankLoad(content,key));
 console.log('Prepared idempotent private import; all four templates disabled. No remote changes.');
}
