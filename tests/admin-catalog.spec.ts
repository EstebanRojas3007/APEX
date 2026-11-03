import {test,expect,type Page} from '@playwright/test';
import {navigateAdmin} from './admin-navigation';
import type {AdminCatalog} from '../shared/admin';

const isolatedCatalog=():AdminCatalog=>({programs:[{id:'empty-local',name:'Programa vacío local'}],components:[{id:'rc',name:'Razonamiento cuantitativo'},{id:'ingles',name:'Inglés'}],associations:[{programId:'empty-local',componentId:'rc',impact:{students:0,memberships:0,routes:0,assignments:0,activeExams:0,canRemove:true,reason:'Asociación sin perfiles afectados; su retirada no borra historial ni publica módulos.'}},{programId:'empty-local',componentId:'ingles',impact:{students:0,memberships:0,routes:0,assignments:0,activeExams:0,canRemove:false,reason:'Se conserva Inglés como componente principal del MVP; no se retira en esta entrega.'}}]});
const confirm=async(page:Page)=>page.getByRole('dialog').getByRole('button',{name:'Confirmar operación',exact:true}).click();

async function openCatalog(page:Page,request:import('@playwright/test').APIRequestContext){
 const setup=await request.post('http://127.0.0.1:54329/__test/admin/setup'),fixture=await setup.json();
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(fixture.admin.email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await navigateAdmin(page,'Programas y componentes');
 await expect(page.getByTestId('admin-panel').getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();
 return page.getByTestId('admin-panel');
}

for(const width of [1280,390])test(`catalog: real local save, response, refreshed choices and visible feedback (${width}px)`,async({page,request})=>{
 await page.setViewportSize({width,height:900});const panel=await openCatalog(page,request),id=`local-catalog-${width}-${Date.now()}`,name=`Programa aislado ${width}`;
 const writes:unknown[]=[];page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api')&&req.postDataJSON().operation==='admin_catalog_save')writes.push(req.postDataJSON());});
 await panel.getByRole('textbox',{name:'ID de catálogo',exact:true}).fill(id);await panel.getByRole('textbox',{name:'Nombre de catálogo',exact:true}).fill(name);await panel.getByRole('textbox',{name:'Motivo del cambio de catálogo',exact:true}).fill('Crear exclusivamente en PGlite local');
 await panel.getByRole('button',{name:'Revisar catálogo',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(id);await expect(page.getByRole('dialog')).toContainText(name);expect(writes).toHaveLength(0);const response=page.waitForResponse(res=>res.url().endsWith('/rpc/apex_api')&&res.request().postDataJSON().operation==='admin_catalog_save');await confirm(page);
 const saved=await response;expect(saved.status()).toBe(200);const result=await saved.json();
 await expect(panel.getByRole('button',{name:`Editar ${name} (${id})`,exact:true})).toHaveCount(1);await expect(panel.getByRole('button',{name,exact:true})).toHaveCount(1);
 expect(writes).toEqual([{operation:'admin_catalog_save',payload:{entity:'program',id,name,reason:'Crear exclusivamente en PGlite local',confirmed:true}}]);
 await expect(panel.getByTestId('catalog-save-feedback')).toBeInViewport();await expect(panel.getByTestId('catalog-save-feedback')).toContainText('guardado');await expect(panel.getByTestId('catalog-save-feedback')).toContainText(result.message);await expect(panel.getByTestId('catalog-save-feedback')).toContainText('Listado, selectores y asociaciones actualizados');
 await page.screenshot({path:`Docs/evidence/admin-catalog-save-${width}.png`});
});

test('catalog: eligible association explains its own missing reason and preserves English',async({page,request})=>{
 await page.route('**/rpc/apex_api',async route=>{if(route.request().postDataJSON().operation!=='admin_catalog'){await route.continue();return;}
  const catalog=isolatedCatalog();catalog.associations[1]!.impact.canRemove=true;await route.fulfill({json:catalog});
 });
 const panel=await openCatalog(page,request),remove=panel.getByRole('button',{name:'Retirar asociación empty-local / rc',exact:true});await expect(remove).toBeDisabled();
 const oldReason=panel.getByRole('textbox',{name:'Motivo del cambio de catálogo',exact:true});await oldReason.fill('Diagnóstico del bloqueo por motivo compartido');
 await expect(remove).toBeDisabled();await expect(panel.getByTestId('catalog-association-empty-local-rc')).toContainText('Escribe el motivo');
 await panel.getByRole('textbox',{name:'Motivo de asociación o retirada',exact:true}).fill('Motivo explícito de retirada');await expect(remove).toBeEnabled();await expect(panel.getByRole('button',{name:'Retirar asociación empty-local / ingles',exact:true})).toBeDisabled();
});

test('catalog: rejected save preserves draft, explains the error and prevents concurrent writes',async({page,request})=>{
 let writes=0,release!:()=>void,received!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{received=resolve;});
 await page.route('**/rpc/apex_api',async route=>{
  if(route.request().postDataJSON().operation!=='admin_catalog_save'){await route.continue();return;}
  writes++;received();await gate;await route.fulfill({status:400,json:{code:'P0001',message:'Rechazo de catálogo simulado para comprobar el formulario.'}});
 });
 const panel=await openCatalog(page,request),id=panel.getByRole('textbox',{name:'ID de catálogo',exact:true}),name=panel.getByRole('textbox',{name:'Nombre de catálogo',exact:true}),reason=panel.getByRole('textbox',{name:'Motivo del cambio de catálogo',exact:true});
 await id.fill('ID NO válido');await name.fill('Borrador conservado');await reason.fill('Motivo que se conserva');await expect(panel.getByRole('button',{name:'Revisar catálogo',exact:true})).toBeDisabled();await expect(panel.getByRole('alert')).toContainText('El ID debe tener');expect(writes).toBe(0);
 await id.fill('rejected-local');await panel.getByRole('button',{name:'Revisar catálogo',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Volver',exact:true}).click();expect(writes).toBe(0);
 await panel.getByRole('button',{name:'Revisar catálogo',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar operación',exact:true}).evaluate(el=>{(el as HTMLElement).click();(el as HTMLElement).click();});await ready;expect(writes).toBe(1);await expect(panel.getByTestId('catalog-save-feedback')).toContainText('Guardando');await expect(panel.getByRole('button',{name:'Revisar catálogo',exact:true})).toBeDisabled();release();
 await expect(panel.getByTestId('catalog-save-feedback').getByRole('alert')).toContainText('Rechazo de catálogo simulado');await expect(panel.getByTestId('catalog-save-feedback')).toBeInViewport();await expect(id).toHaveValue('rejected-local');await expect(name).toHaveValue('Borrador conservado');await expect(reason).toHaveValue('Motivo que se conserva');await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();expect(writes).toBe(1);
 await page.screenshot({path:'Docs/evidence/admin-catalog-error.png'});
});

test('catalog: actual local association withdrawal and server rule rejection update the visible conditions',async({page,request})=>{
 let authorization='';page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api'))authorization=req.headers().authorization??authorization;});
 const panel=await openCatalog(page,request),programId=`local-assoc-${Date.now()}`;
 const call=async(operation:string,payload:Record<string,unknown>)=>{const response=await request.post('http://127.0.0.1:54329/rest/v1/rpc/apex_api',{headers:{Authorization:authorization},data:{operation,payload:{...payload,reason:'Fixture de asociación aislado',confirmed:true}}});expect(response.ok()).toBeTruthy();return response.json();};
 await call('admin_catalog_save',{entity:'program',id:programId,name:'Programa de retirada local'});await call('admin_association_add',{programId,componentId:'rc'});await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();
 const reason=panel.getByRole('textbox',{name:'Motivo de asociación o retirada',exact:true});await reason.fill('Retirada autorizada exclusivamente en base temporal');
 const remove=panel.getByRole('button',{name:`Retirar asociación ${programId} / rc`,exact:true});await expect(remove).toBeEnabled();await expect(panel.getByRole('button',{name:'Retirar asociación demo / ingles',exact:true})).toBeDisabled();await expect(panel.getByRole('button',{name:'Retirar asociación demo / rc',exact:true})).toBeDisabled();await expect(panel.getByTestId('catalog-association-demo-rc')).toContainText('perfiles vinculados');
 await remove.click();await expect(page.getByRole('dialog')).toContainText(programId);await confirm(page);await expect(remove).toHaveCount(0);await expect(panel.getByTestId('catalog-association-feedback')).toContainText('retirada');await expect(panel.getByTestId('catalog-association-feedback')).toContainText('Listado, selectores y asociaciones actualizados');await expect(panel.getByTestId('catalog-association-feedback')).toBeInViewport();await expect(reason).toHaveValue('Retirada autorizada exclusivamente en base temporal');
 expect((await call('admin_catalog',{})).associations.some((a:AdminCatalog['associations'][number])=>a.programId===programId&&a.componentId==='rc')).toBeFalsy();
 const catalog:AdminCatalog=await call('admin_catalog',{});await panel.getByRole('button',{name:'Programa de retirada local',exact:true}).click();await panel.getByRole('button',{name:catalog.components.find(c=>c.id==='rc')!.name,exact:true}).click();await panel.getByRole('button',{name:'Revisar asociación',exact:true}).click();await confirm(page);await expect(remove).toBeEnabled();await expect(panel.getByTestId('catalog-association-feedback')).toContainText('guardada');
 // Deliver a deliberately stale permitted projection; the actual SQL must still reject withdrawal.
 let first=true;await page.route('**/rpc/apex_api',async route=>{if(route.request().postDataJSON().operation!=='admin_catalog'||!first){await route.continue();return;}first=false;const response=await route.fetch(),catalog:AdminCatalog=await response.json();const association=catalog.associations.find(a=>a.programId==='demo'&&a.componentId==='rc')!;association.impact={students:0,memberships:0,routes:0,assignments:0,activeExams:0,canRemove:true,reason:'Proyección anterior simulada'};await route.fulfill({response,json:catalog});});
 await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();const denied=panel.getByRole('button',{name:'Retirar asociación demo / rc',exact:true});await expect(denied).toBeEnabled();await denied.click();await confirm(page);await expect(panel.getByTestId('catalog-association-feedback').getByRole('alert')).toContainText('perfiles vinculados');await expect(denied).toBeDisabled();await expect(panel.getByTestId('catalog-association-demo-rc')).toContainText('Retirada bloqueada');
});

test('catalog: checking, query error, incomplete impact, refreshed permissions and stale review stay distinct',async({page,request})=>{
 let catalog=isolatedCatalog(),mode:'ok'|'hold'|'error'|'incomplete'='ok',release!:()=>void,received!:()=>void,writes=0;let gate:Promise<void>,ready:Promise<void>;
 const blocked='Hay perfiles vinculados. Bloqueo real representado por el fixture.';catalog.associations[0]!.impact.canRemove=false;catalog.associations[0]!.impact.reason=blocked;
 await page.route('**/rpc/apex_api',async route=>{
  const operation=route.request().postDataJSON().operation;if(operation==='admin_association_remove'){writes++;await route.fulfill({json:{message:'No debería enviarse esta operación'}});return;}if(operation!=='admin_catalog'){await route.continue();return;}
  if(mode==='hold'){received();await gate;}
  if(mode==='error'){await route.fulfill({status:500,json:{message:'Consulta simulada inaccesible'}});return;}
  const response=structuredClone(catalog);if(mode==='incomplete')delete (response.associations[0]!.impact as any).canRemove;await route.fulfill({json:response});
 });
 const panel=await openCatalog(page,request),row=panel.getByTestId('catalog-association-empty-local-rc'),remove=panel.getByRole('button',{name:'Retirar asociación empty-local / rc',exact:true});await panel.getByRole('textbox',{name:'Motivo de asociación o retirada',exact:true}).fill('Motivo de actualización de condiciones');await expect(row).toContainText(`Retirada bloqueada: ${blocked}`);await expect(remove).toBeDisabled();
 mode='hold';gate=new Promise<void>(resolve=>{release=resolve;});ready=new Promise<void>(resolve=>{received=resolve;});await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await ready;await expect(row).toContainText('Comprobando condiciones');await expect(remove).toBeDisabled();catalog.associations[0]!.impact.canRemove=true;catalog.associations[0]!.impact.reason='Sin perfiles vinculados, comprobado por la consulta';mode='ok';release();await expect(remove).toBeEnabled();
 mode='error';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(row.getByRole('alert')).toContainText('Error al consultar las condiciones');await expect(remove).toBeDisabled();
 mode='incomplete';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(row.getByRole('alert')).toContainText('condiciones completas');await expect(remove).toBeDisabled();
 mode='ok';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(remove).toBeEnabled();await remove.click();catalog.associations[0]!.impact.canRemove=false;catalog.associations[0]!.impact.reason=blocked;
 const refresh=page.waitForResponse(res=>res.url().endsWith('/rpc/apex_api')&&res.request().postDataJSON().operation==='admin_catalog');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refresh;await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();await confirm(page);await expect(panel.getByTestId('catalog-association-feedback').getByRole('alert')).toContainText(blocked);expect(writes).toBe(0);
 await page.screenshot({path:'Docs/evidence/admin-catalog-blocked.png'});
});

for(const response of [null,{error:{code:'P0001',message:'Rechazo incluido en una respuesta 200'}}])test(`catalog: malformed or rejected response never announces success (${response===null?'null':'error'})`,async({page,request})=>{
 await page.route('**/rpc/apex_api',async route=>{if(route.request().postDataJSON().operation==='admin_catalog_save')await route.fulfill({json:response});else await route.continue();});
 const panel=await openCatalog(page,request);await panel.getByRole('textbox',{name:'ID de catálogo',exact:true}).fill('unconfirmed-local');await panel.getByRole('textbox',{name:'Nombre de catálogo',exact:true}).fill('Programa sin confirmación');await panel.getByRole('textbox',{name:'Motivo del cambio de catálogo',exact:true}).fill('Respuesta inválida simulada');await panel.getByRole('button',{name:'Revisar catálogo',exact:true}).click();await confirm(page);
 await expect(panel.getByTestId('catalog-save-feedback').getByRole('alert')).toContainText(response===null?'confirmación válida':'Rechazo incluido');await expect(panel.getByTestId('catalog-save-feedback')).not.toContainText('guardado');await expect(panel.getByRole('textbox',{name:'ID de catálogo',exact:true})).toHaveValue('unconfirmed-local');
});

test('catalog: confirmed write followed by read error or stale snapshot does not claim refreshed data',async({page,request})=>{
 const catalog=isolatedCatalog();let saved=false,reads:'error'|'stale'|'ready'='error',writes=0;
 await page.route('**/rpc/apex_api',async route=>{const {operation,payload}=route.request().postDataJSON();if(operation==='admin_catalog_save'){writes++;saved=true;catalog.programs.push({id:payload.id,name:payload.name});await route.fulfill({json:{message:'Catálogo actualizado en el fixture'}});return;}if(operation!=='admin_catalog'){await route.continue();return;}if(saved&&reads==='error'){await route.fulfill({status:500,json:{message:'Lectura posterior simulada inaccesible'}});return;}const value=structuredClone(catalog);if(saved&&reads==='stale')value.programs=value.programs.filter(p=>p.id!=='refresh-local');await route.fulfill({json:value});});
 const panel=await openCatalog(page,request);await panel.getByRole('textbox',{name:'ID de catálogo',exact:true}).fill('refresh-local');await panel.getByRole('textbox',{name:'Nombre de catálogo',exact:true}).fill('Programa que requiere refresco');await panel.getByRole('textbox',{name:'Motivo del cambio de catálogo',exact:true}).fill('Distinguir escritura y lectura');await panel.getByRole('button',{name:'Revisar catálogo',exact:true}).click();await confirm(page);
 const feedback=panel.getByTestId('catalog-save-feedback');await expect(feedback).toContainText('operación fue confirmada, pero no se pudo actualizar');await expect(panel.getByRole('button',{name:'Revisar catálogo',exact:true})).toBeDisabled();expect(writes).toBe(1);
 reads='stale';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(feedback).toContainText('consulta todavía no refleja el cambio');await expect(panel.getByRole('button',{name:'Revisar catálogo',exact:true})).toBeDisabled();
 reads='ready';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(feedback).toContainText('Listado, selectores y asociaciones actualizados');await expect(panel.getByRole('button',{name:'Programa que requiere refresco',exact:true})).toHaveCount(1);expect(writes).toBe(1);
 catalog.programs.find(p=>p.id==='refresh-local')!.name='Cambio posterior de otra consulta';await panel.getByRole('button',{name:'Comprobar condiciones de asociaciones',exact:true}).click();await expect(panel.getByRole('button',{name:'Cambio posterior de otra consulta',exact:true})).toHaveCount(1);await expect(panel.getByRole('button',{name:'Revisar catálogo',exact:true})).toBeEnabled();expect(writes).toBe(1);
});
