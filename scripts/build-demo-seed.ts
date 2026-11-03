// Reuse ONLY the existing, explicitly original demo content; never read server/data.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { seed } from '../server/seed';
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../server/migrations/001_domain.sql',import.meta.url),'utf8'));
seed(db);
const tables=['programa_academico','componente','programa_componente','competencia','nucleo_tematico','fuente','material_estudio','material_nucleo','pregunta','opcion_respuesta','evaluacion','evaluacion_componente','item_evaluacion'];
const quote=(value:unknown)=>value===null?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
let sql='-- OPTIONAL: original APEX demo content, NOT ICFES. Local/test projects only.\nBEGIN;\nSET LOCAL search_path TO apex_private, pg_catalog;\n';
sql+="DO $$ BEGIN IF EXISTS(SELECT 1 FROM evaluacion WHERE id='diagnostico-v1') THEN RAISE EXCEPTION 'Demo already present: do not reapply'; END IF; END $$;\n";
for(const table of tables)for(const row of db.prepare(`SELECT * FROM ${table}`).all())sql+=`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});\n`;
sql+="UPDATE pregunta SET procedencia='propia_demo',estado_revision='revisada' WHERE id_fuente='propia-v1';\nUPDATE material_estudio SET publicado=true WHERE id_fuente='propia-v1';\nUPDATE evaluacion SET publicada=true WHERE id='diagnostico-v1';\nCOMMIT;\n";
writeFileSync(new URL('../supabase/seed-demo.sql',import.meta.url),sql);
db.close();
