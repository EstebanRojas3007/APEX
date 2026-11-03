import {test,expect,type Locator,type Page,type APIRequestContext} from '@playwright/test';
import type {TeacherRoster,TrackingAttempt,TrackingStudent} from '../shared/teacher';

const root=(locator:Locator)=>locator.evaluateHandle(el=>{let node=el.parentElement;while(node&&!['auto','scroll'].includes(getComputedStyle(node).overflowY))node=node.parentElement;return node!;});
const offset=async(locator:Locator)=>(await root(locator)).evaluate(el=>el.scrollTop);
const y=async(locator:Locator)=>(await locator.boundingBox())!.y;
const exam=(id:string,index=0):TrackingAttempt=>({id,assignmentId:`assignment-${id}`,chainId:`assignment-${id}`,title:`Diagnóstico de prueba ${index+1}`,kind:'diagnostico',level:null,number:1,status:'activo',startedAt:Date.now()-1900000,completedAt:null,resultAvailable:false,correct:null,total:null,passed:null,threshold:null,reviewRequired:false,reviewStatus:null,reviewCompletedAt:null,skills:[]});
async function login(page:Page,email:string){
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
}
async function fixture(page:Page,request:APIRequestContext,width:number){
 await page.clock.install();await page.setViewportSize({width,height:844});
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup',{data:{interventions:true}});expect(setup.ok()).toBeTruthy();const f=await setup.json();
 let student:TrackingStudent|undefined,reads=0,authorization='',failure=false;
 let waiting:{received:()=>void;gate:Promise<void>}|null=null;
 const operations:string[]=[],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api')){authorization=req.headers().authorization??authorization;operations.push(req.postDataJSON().operation);}});
 await page.route('**/rpc/apex_api',async route=>{
  const op=route.request().postDataJSON().operation;
  if(!['teacher_student','teacher_group'].includes(op)){await route.continue();return;}
  const response=await route.fetch();if(!response.ok()){await route.fulfill({response});return;}
  reads++;
  if(op==='teacher_group'){
   const data:TeacherRoster=await response.json();
   if(data.students.length){const source=data.students[0]!;data.students=[...Array.from({length:17},(_,i)=>({...source,id:`synthetic-${i}`,name:`Estudiante ${i+1} de los apellidos extensos para comprobar el listado móvil`})),source];data.group={...data.group,activeCount:18,membershipCount:18};}
   await route.fulfill({json:data});return;
  }
  if(!student){
   student=await response.json();student!.attempts=[exam('exam-1')];
   student!.teacherActions={diagnostic:{state:'in_progress',canAssign:false,reason:'Diagnóstico en progreso; se conserva la asignación.'},exams:Array.from({length:3},(_,i)=>({...exam(`exam-${i+1}`,i),attemptId:`exam-${i+1}`,canSuspend:true,serverNow:Date.now(),eligibleAt:Date.now()-1000,reason:null,suspendedAt:null,replacementId:null,replacementStatus:null}))};
  }
  const held=waiting;if(held){waiting=null;held.received();await held.gate;}
  if(failure){failure=false;await route.fulfill({status:503,json:{message:'Fallo transitorio de red de prueba'}});return;}
  await route.fulfill({json:student});
 });
 await login(page,f.teacher.email);await page.getByRole('button',{name:`Abrir grupo ${f.group.code}`,exact:true}).click();
 const search=page.getByRole('textbox',{name:'Buscar estudiante',exact:true}),header=page.getByRole('button',{name:f.alice.name,exact:true});
 await search.fill('estudiante');await header.click();
 const follow=page.getByRole('button',{name:`Ver seguimiento de ${f.alice.name}`,exact:true});await follow.scrollIntoViewIfNeeded();
 const roomOffset=await offset(follow);await follow.click();await expect(page.getByRole('button',{name:'Acciones del profesor',exact:true})).toBeVisible();
 const hold=()=>{let release!:()=>void,received!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{received=resolve;});waiting={received,gate};return {release,arrived};};
 const tick=async()=>{const count=reads;await page.mouse.move(4+(reads%5),4);await page.clock.runFor(30010);await expect.poll(()=>reads).toBeGreaterThan(count);};
 return {f,search,header,follow,roomOffset,model:()=>student!,hold,tick,reads:()=>reads,failNext:()=>{failure=true;},authorization:()=>authorization,operations,errors};
}

for(const width of [1280,390]){
 test(`docente: refrescos mantienen montaje, foco, motivo, posición y bloqueos (${width}px web)`,async({page,request})=>{
  const f=await fixture(page,request,width);
  await page.getByRole('button',{name:'Acciones del profesor',exact:true}).click();
  const history=page.getByRole('button',{name:'Acciones realizadas',exact:true});await history.click();
  const reason=page.getByRole('textbox',{name:'Motivo de suspensión de Diagnóstico de prueba 2',exact:true});
  await reason.fill('Motivo redactado durante una actualización automática.');await reason.evaluate(el=>el.scrollIntoView({block:'center'}));await reason.focus();
  await reason.evaluate(el=>{el.setAttribute('data-preserved-node','same-input');(el as HTMLTextAreaElement).setSelectionRange(7,16);});
  const held=f.hold();await f.tick();await held.arrived;
  await expect(reason).toBeFocused();await expect(reason).toHaveAttribute('data-preserved-node','same-input');await expect(page.getByText('Actualizando…',{exact:true})).toBeVisible();
  // A user scroll while the request waits must win over any old saved position.
  await (await root(reason)).evaluate(el=>{el.scrollTop+=70;});const userOffset=await offset(reason);
  held.release();await expect(page.getByText('Actualizando…',{exact:true})).toHaveCount(0);
  await expect.poll(async()=>Math.abs(await offset(reason)-userOffset)).toBeLessThan(5);
  await expect(reason).toBeFocused();expect(await reason.evaluate(el=>[(el as HTMLTextAreaElement).selectionStart,(el as HTMLTextAreaElement).selectionEnd])).toEqual([7,16]);
  await expect(history).toHaveAttribute('aria-expanded','true');

  // New server eligibility and taller text above the field update in place.
  const item=f.model().teacherActions!.exams[1]!;item.canSuspend=false;item.reason='Impedimento actualizado por el servidor. '.repeat(8);
  const beforeY=await y(reason);await reason.press('End');await f.tick();
  await expect(page.getByText(item.reason,{exact:true})).toBeVisible();
  await expect.poll(async()=>Math.abs(await y(reason)-beforeY)).toBeLessThan(5);
  await expect(reason).toBeFocused();await expect(reason).toHaveAttribute('data-preserved-node','same-input');
  await expect(page.getByTestId('teacher-anchor-actions-exam-exam-2').getByRole('button',{name:'Suspender y permitir reinicio',exact:true})).toBeDisabled();
  await expect(reason).toHaveValue('Motivo redactado durante una actualización automática.');

  f.failNext();await reason.press('End');await f.tick();
  await expect(page.getByText(/No se pudo actualizar.*Fallo transitorio/)).toBeVisible();await expect(reason).toBeFocused();await expect(reason).toHaveAttribute('data-preserved-node','same-input');
  await expect(history).toHaveAttribute('aria-expanded','true');
  // Recover via the existing focus revalidation, without rebuilding the screen.
  item.canSuspend=true;item.reason=null;await page.evaluate(()=>dispatchEvent(new Event('focus')));
  await expect(page.getByText(/No se pudo actualizar/)).toHaveCount(0);
  const suspend=page.getByTestId('teacher-anchor-actions-exam-exam-2').getByRole('button',{name:'Suspender y permitir reinicio',exact:true});
  await expect(suspend).toBeEnabled();await suspend.click();await expect(page.getByRole('dialog')).toBeVisible();
  item.canSuspend=false;item.reason='El intento ya no permite esta acción.';await f.tick();
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Confirmar suspensión',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:item.reason})).toBeVisible();expect(f.operations.filter(op=>op==='teacher_suspend_attempt')).toHaveLength(0);

  await reason.evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:`test-results/teacher-actions-refresh-${width}-web.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const revoked=await request.post('http://127.0.0.1:54329/__test/teacher/revoke',{headers:{Authorization:f.authorization()},data:{groupId:f.f.group.id,studentId:f.f.alice.id}});expect(revoked.ok()).toBeTruthy();
  await page.evaluate(()=>dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({hasText:'Estudiante no asignado.'})).toBeVisible();await expect(reason).toHaveCount(0);await expect(history).toHaveCount(0);
  expect(f.errors).toEqual([]);
 });

 test(`docente: Acciones, evidencia parcial y regreso conservan cada vista (${width}px web)`,async({page,request})=>{
  const f=await fixture(page,request,width);
  const section=page.getByTestId('teacher-anchor-student-level-2-section-4');await section.evaluate(el=>el.scrollIntoView({block:'start'}));const sectionY=await y(section);
  f.model().program='Programa con nombre largo que aumenta la altura del perfil. '.repeat(20);await f.tick();
  await expect(page.getByTestId('teacher-anchor-student-profile')).toContainText(f.model().program.trim());await expect.poll(async()=>Math.abs(await y(section)-sectionY)).toBeLessThan(5);
  const button=page.getByRole('button',{name:'Acciones del profesor',exact:true});await button.scrollIntoViewIfNeeded();const detailOffset=await offset(button);
  await button.click();await expect(page).toHaveURL(new RegExp(`/estudiantes/${f.f.alice.id}/acciones$`));
  await expect(page.getByRole('heading',{name:'Acciones del profesor',exact:true})).toBeVisible();await expect(page.getByText(f.f.alice.name,{exact:true})).toBeVisible();
  const history=page.getByRole('button',{name:'Acciones realizadas',exact:true});await expect(history).toHaveAttribute('aria-expanded','false');
  const before=f.reads();await history.focus();await page.keyboard.press('Enter');await expect(history).toHaveAttribute('aria-expanded','true');
  await expect(page.getByText('Historial de acciones no disponible en esta versión',{exact:true})).toBeVisible();
  await page.keyboard.press('Space');await expect(history).toHaveAttribute('aria-expanded','false');expect(f.reads()).toBe(before);
  await expect(page.getByText('Historial de acciones no disponible en esta versión',{exact:true})).toHaveCount(0);
  // An exam status alone is never presented as an action log.
  f.model().attempts=[{...exam('without-audit-date'),status:'suspendido'}];
  await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();await history.click();
  await expect(page.getByText(/^Suspensión registrada:/)).toHaveCount(0);
  f.model().attempts=[{...exam('original-recorded'),status:'suspendido',suspendedAt:Date.UTC(2026,9,25,12),replacementId:'replacement-recorded'}];
  await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
  await expect(page.getByText('Intento original: original-recorded',{exact:true})).toBeVisible();await expect(page.getByText('Reemplazo vinculado: replacement-recorded',{exact:true})).toBeVisible();
  await expect(page.getByText(/No incluye autor ni motivo/)).toBeVisible();
  const reason=page.getByRole('textbox',{name:'Motivo de suspensión de Diagnóstico de prueba 3',exact:true});await reason.fill('Borrador de la vista de acciones');await reason.evaluate(el=>el.scrollIntoView({block:'center'}));
  const actionsOffset=await offset(reason);expect(actionsOffset).toBeGreaterThan(100);
  await page.goBack();await expect(button).toBeVisible();await expect.poll(async()=>Math.abs(await offset(button)-detailOffset)).toBeLessThan(5);
  await expect(page.getByRole('heading',{name:'Acciones disponibles',exact:true})).toHaveCount(0);
  await page.goForward();await expect(history).toHaveAttribute('aria-expanded','true');await expect(reason).toHaveValue('Borrador de la vista de acciones');
  await expect.poll(async()=>Math.abs(await offset(reason)-actionsOffset)).toBeLessThan(5);
  await page.getByRole('button',{name:'Volver al seguimiento',exact:true}).click();await expect(button).toBeVisible();await expect.poll(async()=>Math.abs(await offset(button)-detailOffset)).toBeLessThan(5);
  await page.getByRole('button',{name:'Volver al grupo',exact:true}).click();
  await expect(f.search).toHaveValue('estudiante');await expect(f.header).toHaveAttribute('aria-expanded','true');await expect.poll(async()=>Math.abs(await offset(f.follow)-f.roomOffset)).toBeLessThan(5);
  // A change in content height above the visible row keeps that row in place.
  await f.header.focus();const headerY=await y(f.header);await f.tick();await expect.poll(async()=>Math.abs(await y(f.header)-headerY)).toBeLessThan(5);await expect(f.header).toBeFocused();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await login(page,f.f.teacher.email);await page.getByRole('button',{name:`Abrir grupo ${f.f.group.code}`,exact:true}).click();await expect(f.search).toHaveValue('');await expect(f.header).toHaveAttribute('aria-expanded','false');
  expect(f.errors).toEqual([]);
 });
}
