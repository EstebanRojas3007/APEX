import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {templates,bankSourceId} from './build-apex-bank-load.mjs';
const root=new URL('../',import.meta.url);
const content=JSON.parse(readFileSync(new URL('content/apex-ingles-v0.2/revision.json',root),'utf8'));
const slot=(family,level,size,blocks)=>({family,level,difficulty:level,size,blocks});
export const learningTemplates=[{id:'apex-ingles-diagnostico-v2',title:'Diagnóstico APEX · Inglés',kind:'diagnostico',level:null,count:7,slots:[slot('avisos',1,1,2),slot('conversaciones',2,2,1),slot('uso_integrado',3,3,1)]},...templates.map(t=>({...t,id:t.id.replace('-v1','-v2')}))];
for(const t of learningTemplates){
 if(t.slots.reduce((n,s)=>n+s.size*s.blocks,0)!==t.count)throw Error('Invalid total');
 for(const s of t.slots){
  const available=content.blocks.filter(b=>b.level===s.level&&b.family===s.family&&b.questionIds.length===s.size);
  if(available.length<s.blocks)throw Error('No whole-block composition: '+t.id);
 }
}
const lit=s=>`'${String(s).replaceAll("'","''")}'`;
let sql="-- Explicit preparation only: disabled v2 templates, no assignments or cutover.\nBEGIN;\nSET LOCAL search_path TO apex_private,pg_catalog;\nSELECT pg_advisory_xact_lock(hashtext('apex-learning-v2'));\n";
for(const t of learningTemplates){
 const row={id:t.id,id_fuente:bankSourceId,version:2,titulo:t.title,tipo:t.kind,nivel:t.level,cantidad:t.count,composicion:t.slots,politica_exposicion:'no_vistas_lru_bloques-v2'};
 sql+=`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM plantilla_evaluacion WHERE id=${lit(t.id)}) THEN\nINSERT INTO plantilla_evaluacion(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(v=>v===null?'NULL':typeof v==='number'?v:lit(typeof v==='object'?JSON.stringify(v):v)).join(',')});\nELSIF NOT EXISTS(SELECT 1 FROM plantilla_evaluacion p WHERE id=${lit(t.id)} AND to_jsonb(p) @> ${lit(JSON.stringify(row))}::jsonb) THEN RAISE EXCEPTION 'Conflicting v2 template'; END IF; END $$;\n`;
}
sql+='COMMIT;\n';
// Preserve all prior publication checks; add the new diagnostic kind in a new migration.
const previous=readFileSync(new URL('supabase/migrations/202610060001_apex_english_bank.sql',root),'utf8');
const start=previous.indexOf('CREATE OR REPLACE FUNCTION validar_publicacion()');
const end=previous.indexOf('CREATE OR REPLACE FUNCTION validar_bloques_publicacion()',start);
let validator=previous.slice(start,end).replace("CASE pl.tipo WHEN 'control' THEN 'cuestionario' ELSE 'simulacro' END","CASE pl.tipo WHEN 'control' THEN 'cuestionario' WHEN 'final' THEN 'simulacro' ELSE 'diagnostico' END");
if(start<0||end<0||validator===previous.slice(start,end))throw Error('Publication source mismatch');
const publication=new URL('supabase/migrations/202610110003_learning_publication.sql',root);
const publicationSQL='-- Prepared from the immutable v0.2 validator. All integrity checks retained.\nBEGIN;\nSET LOCAL search_path TO apex_private,pg_catalog;\n'+validator+'COMMIT;\n';
// This migration is now reported applied. Verify it; never overwrite an existing copy.
if(existsSync(publication)){
 if(readFileSync(publication,'utf8')!==publicationSQL)throw Error('Publication migration differs. Preserve the applied file and create an additive correction.');
}else writeFileSync(publication,publicationSQL);
writeFileSync(new URL('supabase/content/apex-learning-v2-templates.sql',root),sql);
console.log('Prepared five disabled templates. Diagnostic: two complete notice blocks + one conversation block + one integrated-use block = 2+2+3. No remote operations.');
