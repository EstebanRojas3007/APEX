import {test,expect} from '@playwright/test';
for(const width of [1280,390])test(`resumen salón: métricas, navegación, accesibilidad, errores y revocación (${width}px)`,async({page,request})=>{
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup',{data:{summary:true}});expect(setup.ok(),await setup.text()).toBeTruthy();const fixture=await setup.json();
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let authorization='';
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api'))authorization=req.headers().authorization??authorization;});
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(fixture.teacher.email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:`Abrir grupo ${fixture.group.code}`,exact:true}).click();await page.getByRole('button',{name:'Resumen del salón',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/grupos/${fixture.group.id}/resumen$`));
 await expect(page.getByRole('heading',{name:'Resumen del salón',exact:true})).toBeVisible();
 await expect(page.getByText('Inglés · 4 estudiantes incluidos',{exact:true})).toBeVisible();
 await expect(page.getByText('5 cupos reservados; 4 estudiantes elegibles actuales. Las reservas sin autorización vigente no aportan datos.',{exact:true})).toBeVisible();
 await expect(page.getByText('Completado: 2/4',{exact:true})).toBeVisible();await expect(page.getByText('En progreso: 1/4',{exact:true})).toBeVisible();await expect(page.getByText('Pendiente: 1/4',{exact:true})).toBeVisible();
 await expect(page.getByText('Secciones completadas: 7/7 · 100 %',{exact:true})).toBeVisible();
 await expect(page.getByText(/Secciones completadas: 3\/7/)).toBeVisible();
 await expect(page.getByText('Aprobación: 1/1 con decisión conocida · 100 %',{exact:true})).toBeVisible();
 await expect(page.getByText('1/2 estudiantes con resultado y desglose verificable.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Control 1 · Básico',exact:true}).click();await expect(page.getByRole('heading',{name:'Control 1 · Básico · habilidades',exact:true})).toBeVisible();
 await expect(page.getByText(/1 estudiantes · 5 preguntas evaluadas/).first()).toBeVisible();
 await page.getByRole('button',{name:'Examen final',exact:true}).click();await expect(page.getByText('Sin datos: nadie tiene un resultado finalizado para esta categoría.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Diagnóstico',exact:true}).click();
 // Mark screenshots explicitly; this banner exists only in the test document.
 await page.evaluate(()=>{const banner=document.createElement('div');banner.textContent='DATOS SINTÉTICOS · PRUEBA LOCAL AISLADA · SIN DATOS REALES';banner.style.cssText='padding:12px;background:#fff0c2;color:#493a00;font-weight:bold;text-align:center';document.body.prepend(banner);});
 await page.getByRole('button',{name:'Actualizar',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`Docs/evidence/teacher-summary-synthetic-${width}.png`,fullPage:true});
 await page.getByRole('heading',{name:'Diagnóstico',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`Docs/evidence/teacher-summary-diagnostic-synthetic-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Control 1 · Básico',exact:true}).click();
 await page.getByRole('heading',{name:'Control 1 · Básico · habilidades',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`Docs/evidence/teacher-summary-skills-synthetic-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Volver al salón',exact:true}).click();await expect(page.getByRole('textbox',{name:'Buscar estudiante',exact:true})).toBeVisible();
 await page.goBack();await expect(page.getByRole('heading',{name:'Resumen del salón',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByText('Inglés · 4 estudiantes incluidos',{exact:true})).toBeVisible();
 // Transient failure preserves the mounted summary; permission failures still clear it.
 let fail=true;
 const failureRoute=async(route:import('@playwright/test').Route)=>{
  if(fail&&route.request().postDataJSON().operation==='teacher_group_summary'){fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fallo sintético temporal'})});}else await route.continue();
 };
 await page.route('**/rpc/apex_api',failureRoute);await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByText(/No se pudo actualizar.*Fallo sintético temporal/)).toBeVisible();await expect(page.getByText('Inglés · 4 estudiantes incluidos',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByText(/No se pudo actualizar/)).toHaveCount(0);await page.unroute('**/rpc/apex_api',failureRoute);
 const revoked=await request.post('http://127.0.0.1:54329/__test/teacher/revoke-access',{headers:{Authorization:authorization},data:{groupId:fixture.group.id}});expect(revoked.ok()).toBeTruthy();
 await page.evaluate(()=>dispatchEvent(new Event('focus')));
 await expect(page.getByRole('alert').filter({hasText:'Grupo no asignado.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Desempeño por habilidad',exact:true})).toHaveCount(0);
 // A manually edited ID has the same server denial.
 await page.evaluate(id=>{history.pushState(null,'',`#profesor/grupos/${id}/resumen`);dispatchEvent(new PopStateEvent('popstate'));},fixture.otherGroup.id);
 await expect(page.getByRole('alert').filter({hasText:'Grupo no asignado.'})).toBeVisible();expect(errors).toEqual([]);
});

test('resumen salón: respuesta atrasada no cruza grupos, enlaces directos y salón vacío',async({page,request})=>{
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup',{data:{summary:true}});expect(setup.ok(),await setup.text()).toBeTruthy();const f=await setup.json();
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(f.teacher.email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByText('Selecciona tu grupo',{exact:true})).toBeVisible();
 let release!:()=>void,received!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),responseReady=new Promise<void>(resolve=>{received=resolve;});
 const delayed=async(route:import('@playwright/test').Route)=>{
  const body=route.request().postDataJSON();
  if(body.operation==='teacher_group_summary'&&body.payload.groupId===f.group.id){const response=await route.fetch();received();await gate;await route.fulfill({response});}else await route.continue();
 };
 await page.route('**/rpc/apex_api',delayed);
 const go=async(id:string)=>page.evaluate(groupId=>{history.pushState(null,'',`#profesor/grupos/${groupId}/resumen`);dispatchEvent(new PopStateEvent('popstate'));},id);
 await go(f.group.id);await responseReady;
 await expect(page.getByText('Cargando resumen del salón…',{exact:true})).toBeVisible();await go(f.emptyGroup.id);
 await expect(page.getByText('Salón sin estudiantes elegibles',{exact:true})).toBeVisible();release();
 await expect(page.getByText('Inglés · 0 estudiantes incluidos',{exact:true})).toBeVisible();await expect(page.getByText('Inglés · 4 estudiantes incluidos',{exact:true})).toHaveCount(0);
 await page.unroute('**/rpc/apex_api',delayed);
 // A restart intentionally requires login (existing memory-only Auth policy).
 await page.reload();await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(f.teacher.email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Salón sin estudiantes elegibles',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Volver al salón',exact:true}).click();await expect(page.getByText('Este grupo no tiene estudiantes activos disponibles para seguimiento.',{exact:true})).toBeVisible();
});
