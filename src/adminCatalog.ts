import type {AdminCatalog,AdminChange} from '../shared/admin';
import {adminErrorMessage,RequestError} from './api';

export type CatalogFeedback={change:AdminChange;status:'pending'|'success'|'error'|'uncertain';message:string;refresh?:'checking'|'ready'|'error'|'mismatch';associationIndex?:number};
export const isCatalogChange=(change:AdminChange)=>['admin_catalog_save','admin_association_add','admin_association_remove'].includes(change.operation);
export class UnconfirmedCatalogReply extends Error {}
export function catalogReply(value:unknown):string{
 if(value&&typeof value==='object'&&'error' in value&&value.error){
  const error=value.error;
  if(typeof error==='object'&&'message' in error&&typeof error.message==='string')throw new RequestError(400,adminErrorMessage({message:error.message,code:'code' in error&&typeof error.code==='string'?error.code:undefined}));
 }
 if(!value||typeof value!=='object'||!('message' in value)||typeof value.message!=='string'||!value.message.trim())throw new UnconfirmedCatalogReply('La API no devolvió una confirmación válida. Comprueba el catálogo antes de repetir la operación.');
 return value.message;
}
export function catalogProjection(value:AdminCatalog):AdminCatalog{
 const entries=(items:unknown)=>Array.isArray(items)&&items.every(item=>item&&typeof item.id==='string'&&typeof item.name==='string');
 if(!value||!entries(value.programs)||!entries(value.components)||!Array.isArray(value.associations)||!value.associations.every(item=>item&&typeof item.programId==='string'&&typeof item.componentId==='string'))throw new Error('La consulta no devolvió un catálogo válido. Actualiza para comprobar sus datos.');
 return value;
}
export function associationCondition(association:AdminCatalog['associations'][number],checking:boolean,queryError:string){
 if(checking)return {state:'checking',message:'Comprobando condiciones de retirada…'} as const;
 if(queryError)return {state:'error',message:`Error al consultar las condiciones: ${queryError} Actualiza antes de retirar.`} as const;
 const impact=association.impact;
 if(!impact||typeof impact.canRemove!=='boolean'||typeof impact.reason!=='string'||!impact.reason.trim()||![impact.students,impact.memberships,impact.routes,impact.assignments,impact.activeExams].every(value=>Number.isInteger(value)&&value>=0))return {state:'error',message:'La consulta no devolvió las condiciones completas de esta asociación. Actualiza antes de retirar.'} as const;
 if(association.componentId==='ingles')return {state:'blocked',message:'Se conserva Inglés como componente principal del MVP; no se retira en esta entrega.'} as const;
 return impact.canRemove?{state:'allowed',message:impact.reason} as const:{state:'blocked',message:impact.reason} as const;
}
export function catalogReflectsChange(catalog:AdminCatalog,change:AdminChange){
 const payload=change.payload;
 if(change.operation==='admin_catalog_save')return (payload.entity==='program'?catalog.programs:catalog.components).some(item=>item.id===payload.id&&item.name===payload.name);
 const associated=catalog.associations.some(item=>item.programId===payload.programId&&item.componentId===payload.componentId);
 return change.operation==='admin_association_remove'?!associated:associated;
}
export function catalogSuccess(change:AdminChange,message:string){
 if(change.operation==='admin_catalog_save')return `${change.payload.entity==='program'?'Programa':'Componente'} «${change.payload.name}» (${change.payload.id}) guardado. ${message}`;
 return `Asociación ${change.payload.programId} / ${change.payload.componentId} ${change.operation==='admin_association_remove'?'retirada':'guardada'}. ${message}`;
}
