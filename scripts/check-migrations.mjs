import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../supabase/',import.meta.url);
const expected='9874990a15c0b0a42f4c7bb9d9f7c9150aa48407fb3842944288d66154825214';
const applied=JSON.parse(readFileSync(new URL('applied-baseline.json',root),'utf8')).sha256;
for(const name of readdirSync(new URL('migrations/',root)).sort()) {
 const sha=createHash('sha256').update(readFileSync(new URL(`migrations/${name}`,root))).digest('hex');
 if(name==='202609280001_initial_private.sql'&&sha!==expected)throw Error('Initial migration changed; stop and investigate.');
 if(applied[name]&&sha!==applied[name])throw Error(`Applied migration changed: ${name}`);
 console.log(`${name} SHA256 ${sha}`);
}
console.log(`Local Supabase project link present: ${existsSync(new URL('.temp/project-ref',root))}`);
if(createHash('sha256').update(readFileSync(new URL('seed-demo.sql',root))).digest('hex')!==applied['seed-demo.sql'])throw Error('Applied demo seed changed.');
console.log('Protected baseline hashes preserved. Owner additionally reports learning migrations 001–004 applied; do not regenerate or replay them. No remote query performed. Inspect pending additions 005/006, 202610120001 and 202610120002. Clock scheduler configuration, academic activation and technical enablement are separate explicit steps; see Docs/RELOJES_EVALUACIONES.md and Docs/PRUEBA_TECNICA_RELOJ.md.');
