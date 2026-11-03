// Local-only extraction manifest. Never uploads files, inserts questions, or publishes content.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{pdf:{type:'string'},title:{type:'string'},url:{type:'string'},edition:{type:'string'},out:{type:'string'},extract:{type:'boolean',default:false}}});
if(!values.pdf||!values.title||!values.url||!values.out)throw Error('Usage: node scripts/prepare-pdf.mjs --pdf FILE --title TITLE --url HTTPS_URL --out manifest.json [--edition EDITION] [--extract]');
const url=new URL(values.url);if(url.protocol!=='https:')throw Error('Source URL must use HTTPS. Copy the actual ICFES PDF URL; do not guess.');
const bytes=readFileSync(values.pdf);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Input is not a PDF.');
const sha256=createHash('sha256').update(bytes).digest('hex');
let fragments=[],pages=null,extractor=null;
if(values.extract){
 // Poppler must be installed separately. Array arguments avoid shell interpolation.
 const info=execFileSync('pdfinfo',[values.pdf],{encoding:'utf8'});
 pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);if(!pages)throw Error('Cannot determine PDF page count.');
 const text=execFileSync('pdftotext',['-layout','-enc','UTF-8',values.pdf,'-'],{encoding:'utf8',maxBuffer:50*1024*1024});
 const pageText=text.split('\f');if(pageText.at(-1)?.trim()==='')pageText.pop();
 if(pageText.length!==pages)throw Error('Extraction page count mismatch; review manually.');
 extractor='poppler-pdftotext';
 fragments=pageText.flatMap((text,index)=>text.trim()?[{pagina:index+1,ordinal:1,texto:text.trim(),revisado:false,uso_contexto:false}]:[]);
}
const manifest={schemaVersion:1,source:{titulo:values.title,organismo:'ICFES',referencia_edicion:values.edition??null,url_origen:url.href,ruta_archivo:`fuentes/${sha256}.pdf`,sha256,paginas:pages,estado:values.extract?'extraido':'pendiente'},extractor,fragments,questions:[],reviewRequired:true};
writeFileSync(values.out,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(`Prepared ${values.out}. Local manifest only; ${fragments.length} unreviewed page fragments; no questions created.`);
