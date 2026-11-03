import {test,expect,type Page} from '@playwright/test';
import {navigateAdmin} from './admin-navigation';
async function login(page:Page,email:string){
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
}
async function capture(page:Page,view:string,width:number){
 await expect(page.getByTestId('admin-panel').getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`Docs/evidence/admin-redesign-${view}-${width}.png`});
}
for(const width of [1280,390]){
 test(`admin redesign: navigation, ID, authorized results, calendars and evidence (${width}px)`,async({page,context,request})=>{
  await page.setViewportSize({width,height:1000});await context.grantPermissions(['clipboard-read','clipboard-write']);
  const response=await request.post('http://127.0.0.1:54329/__test/admin/setup'),f=await response.json();
  const operations:string[]=[],audits:Record<string,string>[]=[];
  page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api')){const body=req.postDataJSON();operations.push(body.operation);if(body.operation==='admin_audit')audits.push(body.payload);}});
  await login(page,f.admin.email);const panel=page.getByTestId('admin-panel');
  await expect(panel.getByText(/Activo significa cuenta habilitada/)).toBeVisible();await capture(page,'inicio',width);
  await navigateAdmin(page,'Consultar');const search=panel.getByRole('textbox',{name:'Buscar en administración',exact:true});
  await search.fill(f.student.id);await expect(panel.getByRole('button',{name:`Gestionar ${f.student.name}`,exact:true})).toBeVisible();
  await panel.getByRole('button',{name:`Copiar ID de ${f.student.name}`,exact:true}).click();await expect(panel.getByText('ID copiado',{exact:true})).toBeVisible();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(f.student.id);await capture(page,'consultar-detalle',width);
  await panel.getByRole('button',{name:`Ver resultados de ${f.student.name}`,exact:true}).click();await expect(panel.getByText('Sin resultados registrados.',{exact:true})).toBeVisible();expect(operations).toContain('student_results');
  await panel.getByRole('button',{name:'Cerrar resultados',exact:true}).click();await search.fill(f.student.email);await expect(panel.getByRole('button',{name:`Gestionar ${f.student.name}`,exact:true})).toBeVisible();await capture(page,'consultar',width);
  await panel.getByRole('button',{name:'Profesores',exact:true}).click();await search.fill(f.teacher.id);await expect(panel.getByRole('button',{name:`Gestionar ${f.teacher.name}`,exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Todas las cuentas',exact:true}).click();await panel.getByLabel('Filtrar rol',{exact:true}).selectOption('administrador');await search.fill(f.admin.id);await expect(panel.getByRole('button',{name:`Gestionar ${f.admin.name}`,exact:true})).toBeVisible();
  await navigateAdmin(page,'Asignación y transición');await expect(panel.getByRole('button',{name:'Invitar profesor con cuenta existente',exact:true})).toBeVisible();await capture(page,'asignacion',width);
  await panel.getByRole('button',{name:'Consultar todas las cuentas y roles',exact:true}).click();await expect(panel.getByRole('button',{name:'Todas las cuentas',exact:true})).toBeEnabled();await expect(panel.getByLabel('Filtrar rol',{exact:true})).toHaveValue('');
  await navigateAdmin(page,'Salones');await expect(panel.getByText('Crear salón',{exact:true})).toBeVisible();await capture(page,'salones',width);
  await navigateAdmin(page,'Programas y componentes');await expect(panel.getByRole('heading',{name:'Organiza la oferta académica',exact:true})).toBeVisible();await capture(page,'catalogo',width);
  await navigateAdmin(page,'Auditoría');await panel.getByLabel('Entidad de auditoría',{exact:true}).selectOption('program');await panel.getByLabel('Acción de auditoría',{exact:true}).selectOption('guardar_catalogo');
  const from=panel.getByLabel('Desde',{exact:true}),to=panel.getByLabel('Hasta',{exact:true});await expect(from).toHaveAttribute('type','date');await expect(to).toHaveAttribute('type','date');
  await from.fill('2026-11-01');await to.fill('2026-11-02');await expect.poll(()=>audits.at(-1)).toMatchObject({entity:'program',action:'guardar_catalogo',fromDate:'2026-11-01',toDate:'2026-11-02'});
  await capture(page,'auditoria',width);await from.fill('2026-11-03');await expect(panel.getByRole('alert')).toContainText('Desde no puede ser posterior a Hasta');
  const count=audits.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();expect(audits.length).toBe(count);
  await panel.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(from).toHaveValue('');await expect(to).toHaveValue('');await expect(panel.getByLabel('Entidad de auditoría',{exact:true})).toHaveValue('');await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(operations.some(op=>op.startsWith('teacher_'))).toBeFalsy();
  await navigateAdmin(page,'Inicio');await expect(panel.getByRole('heading',{name:'Bienvenido al administrador',exact:true})).toBeVisible();
  if(width>=900){await expect(page.getByTestId('admin-navigation').getByRole('button',{name:'Inicio',exact:true})).toHaveAttribute('aria-selected','true');}
  await page.goBack();await expect(panel.getByRole('heading',{name:'Auditoría',exact:true})).toBeVisible();
  await navigateAdmin(page,'Editar perfil');await expect(page.getByRole('button',{name:'Guardar perfil',exact:true})).toBeVisible();await navigateAdmin(page,'Auditoría');await expect(panel.getByRole('heading',{name:'Auditoría',exact:true})).toBeVisible();
  await navigateAdmin(page,'Ayuda');await expect(page.getByText('¿Qué puedo probar?',{exact:true})).toBeVisible();await navigateAdmin(page,'Cerrar sesión');await page.getByRole('dialog').getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();await expect(page.getByTestId('admin-navigation')).toHaveCount(0);
 });

 test(`admin redesign: global pagination, delayed filters and background stability (${width}px)`,async({page,request})=>{
  await page.setViewportSize({width,height:900});const setup=await request.post('http://127.0.0.1:54329/__test/admin/setup'),f=await setup.json();await login(page,f.admin.email);
  let release!:()=>void,received!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{received=resolve;});
  const payloads:Record<string,unknown>[]=[];
  await page.route('**/rpc/apex_api',async route=>{
   const {operation,payload}=route.request().postDataJSON();
   if(operation==='admin_audit'&&payload.search==='fallo-controlado'){await route.fulfill({status:400,json:{message:'Fallo de auditoría simulado',code:'P0001'}});return;}
   if(operation==='admin_audit'&&payload.fromDate==='1900-01-01'&&payload.toDate==='1900-01-02'){await route.fulfill({json:{rows:[],total:0,page:0,pageSize:20}});return;}
   if(operation!=='admin_users'){await route.continue();return;}
   payloads.push(payload);if(payload.search==='demorada'){received();await gate;}
   const count=payload.search?1:21,start=payload.page*20,length=Math.min(20,count-start);
   const rows=Array.from({length:Math.max(0,length)},(_,i)=>({id:`synthetic-${payload.search||'page'}-${start+i}`,authId:null,name:`Cuenta ${payload.search||'paginada'} ${start+i}`,email:`page-${start+i}@example.test`,role:'estudiante',status:'activo',programId:null,program:null,semester:null,identityVerified:true,lastSignInAt:null,lastActivityAt:null,activeExams:0}));
   await route.fulfill({json:{rows,total:count,page:payload.page,pageSize:20}});
  });
  await navigateAdmin(page,'Consultar');const panel=page.getByTestId('admin-panel'),search=panel.getByRole('textbox',{name:'Buscar en administración',exact:true});
  await expect(panel.getByText('21 registros · Página 1',{exact:true})).toBeVisible();await panel.getByRole('button',{name:'Página siguiente',exact:true}).click();await expect(panel.getByText('21 registros · Página 2',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Página siguiente',exact:true})).toBeDisabled();expect(payloads.at(-1)?.page).toBe(1);
  await search.fill('demorada');await ready;await expect(panel.getByText('Cargando administración…',{exact:true})).toBeVisible();expect(payloads.at(-1)?.page).toBe(0);await search.fill('actual');await expect(panel.getByText('Cuenta actual 0',{exact:true})).toBeVisible();release();await expect(panel.getByText('Cuenta demorada 0',{exact:true})).toHaveCount(0);
  await navigateAdmin(page,'Salones');const reason=panel.getByRole('textbox',{name:'Motivo del cambio de salón',exact:true});await reason.fill('Borrador que se conserva durante actualización');await reason.focus();
  const before=await reason.evaluate(el=>{(window as any).__stableAdminInput=el;let p=el.parentElement;while(p&&p.scrollHeight<=p.clientHeight)p=p.parentElement;return p?.scrollTop??0;});
  const update=page.waitForResponse(res=>res.url().endsWith('/rpc/apex_api')&&res.request().postDataJSON().operation==='admin_groups');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await update;await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();
  await expect(reason).toBeFocused();await expect(reason).toHaveValue('Borrador que se conserva durante actualización');
  const after=await reason.evaluate(el=>{let p=el.parentElement;while(p&&p.scrollHeight<=p.clientHeight)p=p.parentElement;return {same:(window as any).__stableAdminInput===el,y:p?.scrollTop??0};});expect(after.same).toBeTruthy();expect(Math.abs(before-after.y)).toBeLessThan(3);
  await navigateAdmin(page,'Auditoría');const action=panel.getByLabel('Acción de auditoría',{exact:true});await action.selectOption('cambiar_rol');await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();await action.focus();await action.evaluate(el=>(window as any).__stableAdminSelect=el);
  const auditRefresh=page.waitForResponse(res=>res.url().endsWith('/rpc/apex_api')&&res.request().postDataJSON().operation==='admin_audit');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await auditRefresh;await expect(panel.getByRole('button',{name:'Actualizar administración',exact:true})).toBeEnabled();await expect(action).toBeFocused();await expect(action).toHaveValue('cambiar_rol');expect(await action.evaluate(el=>(window as any).__stableAdminSelect===el)).toBeTruthy();
  await search.fill('fallo-controlado');await expect(panel.getByRole('alert')).toContainText('Fallo de auditoría simulado');await search.fill('');await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByLabel('Desde',{exact:true}).fill('1900-01-01');await panel.getByLabel('Hasta',{exact:true}).fill('1900-01-02');await expect(panel.getByText('Sin acciones que coincidan con los filtros.',{exact:true})).toBeVisible();await expect(panel.getByText('0 registros · Página 1',{exact:true})).toBeVisible();
 });
}
