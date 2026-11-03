// Inspects locally exported bundles without printing environment values or content.
import {readFileSync,readdirSync,statSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const editorial=JSON.parse(readFileSync(new URL('content/apex-ingles-v0.2/revision.json',root),'utf8'));
const files=[];
function walk(url){for(const name of readdirSync(url)){const child=new URL(name,url);if(statSync(child).isDirectory())walk(new URL(name+'/',url));else files.push(child);}}
walk(new URL('dist/',root));walk(new URL('dist-android/',root));
const forbidden=['APEX_ADMIN_SUPABASE_SERVICE_KEY','SERVER_ONLY_SERVICE_ROLE_KEY','APEX_ADMIN_GMAIL_CLIENT_ID','APEX_ADMIN_GMAIL_CLIENT_SECRET','APEX_ADMIN_GMAIL_REFRESH_TOKEN','http://127.0.0.1:54329','http://localhost:8091/auth/invite','local-test-only','apex_invite_nonce','claves.servidor.json','justificacion_privada','claves_originales','es_correcta','APEX-EN-C1-01',...editorial.questions.map(q=>q.text),...editorial.blocks.filter(b=>b.reading).map(b=>b.reading)];
for(const file of files){
 if(file.pathname.endsWith('.pdf'))throw Error('A PDF was bundled into the client.');
 const bytes=readFileSync(file);
 if(forbidden.some(value=>bytes.includes(Buffer.from(value))))throw Error('Private content, server credential markers or test configuration found in an exported bundle. Inspect locally; content was not printed.');
}
console.log(`Checked ${files.length} exported files (web/Android): no private bank content, server credential markers or test configuration bundled.`);
