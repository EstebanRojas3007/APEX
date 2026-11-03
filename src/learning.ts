import type {GenerationStatus,Section} from '../shared/contracts';
export const levelNames=['Básico','Intermedio','Intermedio-avanzado'];
export const generationMessages:Record<GenerationStatus,string>={pending:'Generación pendiente',running:'Generando contenido…',ready:'Contenido disponible',error:'Error de generación',unavailable:'Servicio o materiales pendientes'};
export const levelLockMessage=(level:number)=>level===1?'Completa el diagnóstico para habilitar Básico.':`Aprueba el control de ${levelNames[level-2]} para habilitar este nivel.`;
export function hasSectionContent(section:Section):boolean{
 const text=(value:unknown)=>typeof value==='string'&&value.trim().length>0;
 const exercises=(items:Section['examples'])=>Array.isArray(items)&&items.length>0&&items.every(item=>item&&text(item.prompt)&&text(item.response)&&text(item.explanation));
 return section.generationStatus==='ready'&&text(section.title)&&text(section.objective)&&text(section.explanation)
  &&exercises(section.examples)&&exercises(section.practice)&&Array.isArray(section.references)&&section.references.length>0
  &&section.references.every(ref=>ref&&text(ref.title)&&Number.isInteger(ref.page)&&ref.page>0);
}
