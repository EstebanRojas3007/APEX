import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
if(existsSync(new URL('../supabase/migrations/202609280001_initial_private.sql',import.meta.url))) {
  throw new Error('La migración inicial ya existe y debe conservarse. Crea una migración aditiva; consulta Docs/SUPABASE.md.');
}
const source=readFileSync(new URL('../server/migrations/001_domain.sql',import.meta.url),'utf8');
const tables=[...source.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match=>match[1]);
const views=[...source.matchAll(/CREATE VIEW IF NOT EXISTS (\w+)/g)].map(match=>match[1]);
let sql='-- Preparación PostgreSQL 15+/Supabase. No aplicada ni conectada.\n-- Esquema privado: no exponer claves ni habilitar acceso cliente antes de implementar operaciones autorizadas.\nBEGIN;\nCREATE SCHEMA IF NOT EXISTS apex_private;\nREVOKE ALL ON SCHEMA apex_private FROM PUBLIC, anon, authenticated;\nSET LOCAL search_path TO apex_private, pg_catalog;\n';
sql+=source.replace(/CREATE VIEW IF NOT EXISTS (\w+) AS/g,'CREATE OR REPLACE VIEW $1 WITH (security_invoker = true) AS');
for(const table of tables)sql+=`\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE ${table} FROM PUBLIC, anon, authenticated;\n`;
for(const view of views)sql+=`\nREVOKE ALL ON TABLE ${view} FROM PUBLIC, anon, authenticated;\n`;
sql+='\nCOMMIT;\n';
const directory=new URL('../supabase/migrations/',import.meta.url);mkdirSync(directory,{recursive:true});
writeFileSync(new URL('202609280001_initial_private.sql',directory),sql,{flag:'wx'});
console.log(`Preparadas ${tables.length} tablas y ${views.length} vistas privadas; no se conectó ninguna base.`);
