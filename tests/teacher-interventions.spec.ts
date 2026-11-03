import {test,expect,type Page} from '@playwright/test';

async function login(page:Page,email:string){
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
}
for(const width of [1280,390])test(`acciones docentes: asignación, suspensión, confirmación, reemplazo y revocación (${width}px web)`,async({page,context,request})=>{
 await page.setViewportSize({width,height:900});
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup',{data:{interventions:true}});expect(setup.ok()).toBeTruthy();const fixture=await setup.json();
 let authorization='',assignmentCalls=0,suspensionCalls=0;
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api')){authorization=req.headers().authorization??authorization;const op=req.postDataJSON().operation;if(op==='teacher_assign_diagnostic')assignmentCalls++;if(op==='teacher_suspend_attempt')suspensionCalls++;}});
 await login(page,fixture.teacher.email);
 await page.getByRole('button',{name:`Abrir grupo ${fixture.group.code}`,exact:true}).click();
 const header=page.getByRole('button',{name:fixture.alice.name,exact:true});await expect(header).toHaveAttribute('aria-expanded','false');await header.click();
 await page.getByRole('button',{name:`Ver seguimiento de ${fixture.alice.name}`,exact:true}).click();
 await page.getByRole('button',{name:'Acciones del profesor',exact:true}).click();
 await expect(page.getByText('Diagnóstico · Sin diagnóstico asignado',{exact:true})).toBeVisible();
 let release!:()=>void,received!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),responseReady=new Promise<void>(resolve=>{received=resolve;});
 const hold=async(route:import('@playwright/test').Route)=>{
  if(route.request().postDataJSON().operation==='teacher_assign_diagnostic'){const response=await route.fetch();received();await gate;await route.fulfill({response});}else await route.continue();
 };
 await page.route('**/rpc/apex_api',hold);
 const assign=page.getByRole('button',{name:'Asignar diagnóstico de Inglés',exact:true});await assign.click();await responseReady;
 await expect(assign).toBeDisabled();await expect(page.getByText('Procesando acción…',{exact:true})).toBeVisible();
 // Permission polling keeps running during a delayed mutation response. Its
 // eventual completion must survive the action component being re-mounted.
 await page.clock.install();await page.clock.runFor(30010);
 await expect(assign).toBeDisabled();await expect(page.getByText('Procesando acción…',{exact:true})).toBeVisible();
 expect(assignmentCalls).toBe(1);release();
 await expect(page.getByText('Diagnóstico · Asignado sin iniciar',{exact:true})).toBeVisible();await expect(assign).toBeDisabled();
 await expect(page.getByText('Diagnóstico de Inglés asignado sin iniciar un intento.',{exact:true})).toBeVisible();await page.unroute('**/rpc/apex_api',hold);

 const student=await context.newPage();await login(student,fixture.alice.email);
 await student.getByRole('button',{name:'Diagnóstico',exact:true}).click();await student.getByText('Inglés · MVP',{exact:true}).locator('..').getByRole('button',{name:'Preparar diagnóstico',exact:true}).click();
 await student.getByRole('button',{name:'Entiendo las condiciones',exact:true}).click();await student.getByRole('button',{name:'Sí, iniciar diagnóstico',exact:true}).click();
 await expect(student.getByText('Pregunta 1 de 7',{exact:true})).toBeVisible();
 await page.bringToFront();await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 await expect(page.getByText('Diagnóstico · En progreso',{exact:true})).toBeVisible();await expect(page.getByText('Examen en progreso',{exact:true})).toBeVisible();
 const suspend=page.getByRole('button',{name:'Suspender y permitir reinicio',exact:true});await expect(suspend).toBeDisabled();
 const advance=await request.post('http://127.0.0.1:54329/__test/teacher/intervention-time',{headers:{Authorization:authorization},data:{advanceMs:1800000}});expect(advance.ok()).toBeTruthy();
 await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 const reason=page.getByRole('textbox',{name:/^Motivo de suspensión de /});await expect(reason).toBeVisible();await expect(suspend).toBeDisabled();
 await reason.fill('Conexión interrumpida; el profesor verificó el incidente.');
 await page.getByText('Examen en progreso',{exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`test-results/teacher-interventions-ready-${width}-web.png`,fullPage:true});
 await suspend.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog')).toContainText('sin calificación, reprobación ni repaso');
 await page.getByRole('dialog').getByRole('button',{name:'Volver',exact:true}).click();expect(suspensionCalls).toBe(0);
 let fail=true;
 const failure=async(route:import('@playwright/test').Route)=>{
  if(fail&&route.request().postDataJSON().operation==='teacher_suspend_attempt'){fail=false;await route.fulfill({status:503,json:{message:'Fallo temporal de prueba; vuelve a intentar.'}});}else await route.continue();
 };
 await page.route('**/rpc/apex_api',failure);
 await suspend.click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar suspensión',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Fallo temporal de prueba'})).toBeVisible();await expect(reason).toHaveValue('Conexión interrumpida; el profesor verificó el incidente.');
 await suspend.click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar suspensión',exact:true}).click();
 await expect(page.getByText('Intento suspendido · sin calificación',{exact:true})).toBeVisible();
 await expect(page.getByText(/Un reinicio autorizado pendiente/)).toBeVisible();
 await page.getByRole('button',{name:'Acciones realizadas',exact:true}).click();
 await expect(page.getByText('Historial de acciones no disponible en esta versión',{exact:true})).toBeVisible();
 await expect(page.getByText(/^Suspensión registrada:/)).toBeVisible();
 await expect(page.getByText('Examen en progreso',{exact:true})).toHaveCount(0);await expect(suspend).toHaveCount(0);
 await page.getByText('Acciones del profesor',{exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`test-results/teacher-interventions-${width}-web.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.unroute('**/rpc/apex_api',failure);
 // A late response on the student's still-open screen is rejected, then reloads its menu.
 await student.bringToFront();await student.getByRole('button',{name:'Recuperar respuestas del servidor',exact:true}).click();
 await expect(student.getByRole('button',{name:'Preparar reinicio autorizado',exact:true})).toBeVisible();
 await student.getByRole('button',{name:'Preparar reinicio autorizado',exact:true}).click();await student.getByRole('button',{name:'Entiendo las condiciones',exact:true}).click();
 await student.getByRole('button',{name:'Sí, iniciar diagnóstico',exact:true}).click();await expect(student.getByText('Pregunta 1 de 7',{exact:true})).toBeVisible();
 await student.close();await page.bringToFront();await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 await expect(page.getByText('Reemplazo iniciado; se conserva el original.',{exact:true})).toBeVisible();
 // Revocation is enforced on the action even if its button was already rendered.
 const revoked=await request.post('http://127.0.0.1:54329/__test/teacher/revoke',{headers:{Authorization:authorization},data:{groupId:fixture.group.id,studentId:fixture.alice.id}});expect(revoked.ok()).toBeTruthy();
 await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Estudiante no asignado.'})).toBeVisible();await expect(page.getByText('Acciones del profesor',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Volver al seguimiento',exact:true}).click();
 await page.getByRole('button',{name:'Volver al grupo',exact:true}).click();await expect(page.getByText('Este grupo no tiene estudiantes activos disponibles para seguimiento.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
