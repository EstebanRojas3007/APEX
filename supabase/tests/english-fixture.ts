// Synthetic testing content, NEVER an ICFES transcription or production seed.
import {sourceId,storagePath,officialUrl,selection} from '../../scripts/build-english-load.mjs';
export function englishFixture(){
 const blocks=[
  {id:sourceId+'-parte2',title:'Synthetic shared vocabulary',instructions:'TEST ONLY: select from the original shared set.',format:'vocabulario_compartido',pageStart:5,pageEnd:5,sharedOptions:'ABCDEFGH'.split('').map(label=>({label,text:'Synthetic word '+label})),reading:null,example:'Example zero is not scored.',visuallyChecked:true},
  {id:sourceId+'-parte3',title:'Synthetic conversations',instructions:'TEST ONLY: choose a response.',format:'conversacion',pageStart:6,pageEnd:6,sharedOptions:[],reading:null,example:'Example zero.',visuallyChecked:true},
  {id:sourceId+'-parte4',title:'Synthetic cloze',instructions:'TEST ONLY: choose for each numbered gap.',format:'cloze',pageStart:7,pageEnd:7,sharedOptions:[],reading:'Synthetic passage '+Array.from({length:8},(_,i)=>`(${i+11})`).join(' '),example:'Example zero.',visuallyChecked:true},
  {id:sourceId+'-parte5',title:'Synthetic reading',instructions:'TEST ONLY: read and answer.',format:'lectura',pageStart:8,pageEnd:9,sharedOptions:[],reading:'Synthetic reading paragraph.\n\nSecond paragraph for layout tests.',example:'Example zero.',visuallyChecked:true},
 ];
 const questions=Array.from({length:25},(_,index)=>{
  const number=index+1,b=blocks[number<=5?0:number<=10?1:number<=18?2:3]!;
  return {number,page:number<=5?5:number<=10?6:number<=18?7:9,blockId:b.id,text:'SYNTHETIC QUESTION '+number,options:number<=5?b.sharedOptions:'ABC'.split('').map(label=>({label,text:'Synthetic option '+label})),visuallyChecked:true};
 });
 return {content:{source:{id:sourceId,storagePath,url:officialUrl,sha256:'a'.repeat(64),pages:11},extractionStatus:'visually_checked_pending_human_review',blocks,questions},key:{sourceId,page:10,visuallyChecked:true,answers:Object.fromEntries(questions.map(q=>[q.number,'A']))},selection};
}
