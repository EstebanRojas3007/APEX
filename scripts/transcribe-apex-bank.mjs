// Editorial/import artifacts only. Never imported by Expo.
import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('../content/apex-ingles-v0.2/',import.meta.url);
const raw=JSON.parse(readFileSync(new URL('evidence/automatic-text.json',dir),'utf8'));
const clean=s=>s.split('\n').filter(l=>!/^APEX\s+\/|^BORRADOR v0\.2/.test(l.trim())).map(l=>l.trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
const pages=raw.text.map(p=>({...p,text:clean(p.text)}));
const compact=s=>s.replace(/\s+/g,' ').trim();
const keys=[];
for(const p of pages.slice(43,58)){
 const matches=[...p.text.matchAll(/^(\d{3}) · ([A-H]) \| ([\s\S]*?)(?=^\d{3} · |$(?![\s\S]))/gm)];
 for(const m of matches){
  const body=m[3],identity=body.match(/(APEX-EN-C([123])-\d{2,3}) · Bloque ([VDNGRIC]\d{2})/);
  if(!identity)throw Error('Missing key identity '+m[1]);
  const split=body.indexOf(identity[0]),refs=body.indexOf('F1:');
  keys.push({number:Number(m[1]),id:identity[1],level:Number(identity[2]),blockCode:identity[3],answer:m[2],skill:compact(body.slice(0,split)),justification:compact(body.slice(split+identity[0].length,refs)),references:compact(body.slice(refs)),page:p.page});
 }
}
if(keys.length!==105||new Set(keys.map(k=>k.id)).size!==105)throw Error('Expected 105 unique keys');
const families={V:'vocabulario',N:'avisos',D:'conversaciones',G:'gramatica',R:'lectura_literal',I:'lectura_inferencial',C:'uso_integrado'};
const formats={V:'vocabulario_compartido',N:'lectura',D:'conversacion',G:'cloze',R:'lectura',I:'lectura',C:'cloze'};
const blocks=[],questions=[];
function parseBlock(code,title,body,pageStart,pageEnd,instructions,reading=null,example=null,sharedOptions=[]){
 const ms=[...body.matchAll(/^(\d{3})\. ([\s\S]*?)(?=^\d{3}\. |$(?![\s\S]))/gm)];
 const related=keys.filter(k=>k.blockCode===code);
 if(ms.length!==related.length)throw Error(`Incomplete block ${code}: ${ms.length}/${related.length}`);
 const block={id:`apex-en-v0.2-${code}`,code,title,level:related[0].level,family:families[code[0]],format:formats[code[0]],version:2,pageStart,pageEnd,instructions,reading,example,sharedOptions,questionIds:related.map(k=>k.id)};
 blocks.push(block);
 for(const m of ms){
  const k=keys.find(k=>k.number===Number(m[1]));if(!k||k.blockCode!==code)throw Error('Question/key mismatch');
  const parts=[...m[2].matchAll(/^([A-H])\. ([\s\S]*?)(?=^[A-H]\. |$(?![\s\S]))/gm)];
  const options=sharedOptions.length?sharedOptions:parts.map(o=>({label:o[1],text:compact(o[2])}));
  const text=m[2].slice(0,parts[0]?.index??m[2].length).replace(/\n*Answer: _+\s*$/,'').trim();
  if(!options.some(o=>o.label===k.answer))throw Error('Missing correct option '+k.id);
  questions.push({id:k.id,number:k.number,version:2,level:k.level,blockId:block.id,family:block.family,text,page:pageEnd,skill:k.skill,references:k.references,options});
 }
}
for(let index=3;index<43;index++){
 const p=pages[index],t=p.text;
 if(t.includes('Nivel 1 · Avisos')){
  const instr='Cada aviso es independiente. Seleccione una sola respuesta para cada pregunta.';
  for(const m of t.matchAll(/^Bloque (N\d{2}) · ([^\n]+)\n([\s\S]*?)(?=^Bloque N|$(?![\s\S]))/gm)){
   const q=m[3].search(/^\d{3}\. /m);
   parseBlock(m[1],m[2],m[3].slice(q),p.page,p.page,instr,compact(m[3].slice(0,q)));
  }
  continue;
 }
 const header=t.match(/^Nivel [123] · ([^\n]+)\n\nBloque ([VDGRIC]\d{2}) \|[^\n]+\n\n([^\n]+)/);
 if(!header)throw Error('Unexpected page '+p.page);
 const [,title,code,instr]=header;
 const remaining=t.slice(header[0].length).trim();
 if(code[0]==='I'){
  const next=pages[++index],q=next.text.search(/^\d{3}\. /m);
  const reading=remaining.replace(/\n*You may return to this article while answering its questions\.$/,'').trim();
  const continuation=next.text.slice(next.text.indexOf('\n\n')+2,q).trim();
  parseBlock(code,title,next.text.slice(q),p.page,next.page,instr+'\n'+continuation+'\nYou may return to this article while answering its questions.',reading);
 }else{
  const first=remaining.search(/^\d{3}\. /m),before=remaining.slice(0,first).trim();
  let reading=null,example=null,sharedOptions=[],instructions=instr;
  if(code[0]==='V'){
   sharedOptions=[...before.slice(0,before.search(/Example 0:|Choose the word/)).matchAll(/\b([A-H])\s+([a-z]+)\b/g)].map(m=>({label:m[1],text:m[2]})).sort((a,b)=>a.label.localeCompare(b.label));
   if(sharedOptions.length!==8)throw Error('Shared table '+code);
   const additional=before.slice(before.search(/Example 0:|Choose the word/)).trim();
   if(additional.startsWith('Example 0:'))example=additional;else instructions+='\n'+additional;
  }else if(['G','R','C'].includes(code[0]))reading=before;
  parseBlock(code,title,remaining.slice(first),p.page,p.page,instructions,reading,example,sharedOptions);
 }
}
questions.sort((a,b)=>a.number-b.number);
if(questions.length!==105||blocks.length!==40)throw Error(`Invalid counts ${questions.length}/${blocks.length}`);
// Duplicate key tables independently corroborate each original ID, block and letter.
for(const k of keys){
 const row=new RegExp(`0*${k.number} / ${k.id}\\s+${k.blockCode}\\s+${k.answer}(?:\\s|$)`);
 if(!pages.slice(58,64).some(p=>row.test(p.text)))throw Error('Review-table disagreement '+k.id);
}
const content={schemaVersion:1,source:{id:'apex-ingles-105-v0.2',version:'0.2',title:'Banco de 105 preguntas originales · APEX / Inglés',localPath:raw.pdf,storagePath:'Ingles/apex/banco-preguntas/v0.2/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf',sha256:raw.sha256,pages:65,documentDate:'2026-10-07',storageVerified:false},
 label:'Práctica APEX alineada con Saber Pro',approval:{scope:'banco_interno',authority:'responsable del proyecto',basis:'Instrucción expresa del responsable en la solicitud de integración',recordedDate:'2026-10-06',teacherReview:false,icfesEndorsement:false},
 references:pages[64].links.map((url,i)=>({id:`F${i+1}`,url})),
 documentMetadata:{coverText:pages[0].text,pedagogyText:pages[1].text,originalAssessmentProposal:pages[2].text,referencesText:pages[64].text},
 visualVerification:{performedBy:'asistente',date:'2026-10-06',pages:[...Array(65)].map((_,i)=>i+1),method:'Cotejo de texto y páginas renderizadas review-01-04 a review-65-65; claves contrastadas además con tablas pp.59-64',teacherReview:false},blocks,questions};
writeFileSync(new URL('revision.json',dir),JSON.stringify(content,null,2)+'\n');
writeFileSync(new URL('claves.servidor.json',dir),JSON.stringify({sourceId:content.source.id,sourceSha256:raw.sha256,keys},null,2)+'\n');
console.log('105 questions, 40 whole blocks, 35 per level. Private editorial files; no remote changes.');
