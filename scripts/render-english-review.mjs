// Local editorial view only. Never imported by Expo; scored answer keys stay in the private key file.
import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('../content/ingles-2018/',import.meta.url);
const c=JSON.parse(readFileSync(new URL('revision.json',dir),'utf8'));
let md=`# Transcripción para revisión humana · Inglés ICFES 2018\n\nEstado: cotejada visualmente por el asistente; **aprobación humana pendiente**. Ningún ítem publicado.\n\nFuente: ${c.source.title}. ICFES, ${c.source.edition}. [PDF local](../../${c.source.localPath}).\n\nSHA-256: \`${c.source.sha256}\`.\n\nLos archivos locales son insumos editoriales. La app obtiene preguntas exclusivamente de Supabase. Las respuestas de ejemplos 0 forman parte de las instrucciones originales y no se califican. Las claves de las 25 preguntas están separadas en \`claves.servidor.json\`; no se incluyen aquí. Este documento contiene el instrumento completo y tampoco se envía al tutor durante intentos.\n\n## Criterios de transcripción\n\n${c.notes.map(n=>'- '+n).join('\n')}\n`;
for(const b of c.blocks){
 md+=`\n## ${b.title} · PDF p. ${b.pageStart}${b.pageEnd!==b.pageStart?'–'+b.pageEnd:''}\n\n${b.instructions}\n`;
 if(b.reading)md+=`\n### Lectura · PDF p. ${b.readingPage}\n\n${b.reading}\n`;
 if(b.sharedOptions.length)md+=`\n### Opciones compartidas\n\n${b.sharedOptions.map(o=>`${o.label}. ${o.text}`).join('  \n')}\n`;
 if(b.example)md+=`\n### Ejemplo original · no calificable\n\n${b.example.replaceAll('\n','  \n')}\n`;
 for(const q of c.questions.filter(q=>q.blockId===b.id)){
  md+=`\n### Pregunta ${q.number} · PDF p. ${q.page}\n\n${q.text}\n`;
  if(b.sharedOptions.length)md+='\nUtiliza las opciones compartidas A–H del bloque.\n';
  else md+=`\n${q.options.map(o=>`${o.label}. ${o.text}`).join('  \n')}\n`;
 }
}
md+='\n## Selección propuesta para práctica\n\n'+c.proposedDiagnostic.join(', ')+'. Clasificación y justificación en [la guía de incorporación](../../Docs/INGLES_2018.md). No representa medición oficial ni nivel MCER.\n';
writeFileSync(new URL('REVISION.md',dir),md);
console.log('Updated editorial review, with no scored answer keys and no human approval.');
