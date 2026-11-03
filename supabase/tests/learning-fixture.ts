// Isolated tests ONLY. No client/worker imports; never used as production content.
export function generatedFixture(j:any){
 const ref=j.input.references[0],skill=j.input.skills[0].id;
 return {contractVersion:2,kind:'sections',level:j.input.level,reason:'Synthetic route using server diagnostic and progress',agent:{provider:'test-only',model:'fixture',promptVersion:'2'},sections:Array.from({length:7},(_,i)=>({title:'Synthetic section '+(i+1),order:i+1,skillId:skill,objective:'Synthetic objective',explanation:'Synthetic original explanation',examples:[{prompt:`Original synthetic example ${i}`,response:'Example response',explanation:'Example explanation'}],practice:[{prompt:`Original synthetic practice ${i}`,response:'Practice response',explanation:'Practice explanation'}],references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:ref.page}],reason:'Synthetic individual reason based on skill results',prerequisites:i?[i]:[],origin:'original_ai_apex'}))};
}
export const educationalFixtureSQL=`INSERT INTO apex_private.fuente(id,titulo,organismo,ruta_archivo,sha256,paginas,estado) VALUES('learning-doc','Synthetic educational source','TEST','test-learning.pdf',repeat('c',64),3,'revisado');
 INSERT INTO apex_private.material_estudio(id,id_fuente,titulo,contenido,version,publicado) VALUES('learning-material','learning-doc','TEST','Synthetic authorized material',1,true);
 INSERT INTO apex_private.material_nucleo VALUES('learning-material','apex-en-avisos');
 INSERT INTO apex_private.fragmento_documental(id_fuente,pagina,ordinal,texto,metodo_extraccion,version_extractor,revisado,uso_contexto,tipo_contenido) VALUES('learning-doc',1,1,'Synthetic educational text. Not an assessment.','test','1',true,true,'documental');`;
