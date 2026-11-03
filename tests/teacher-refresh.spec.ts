import {test,expect,type Locator} from '@playwright/test';
import type {TrackingAttempt,TrackingStudent} from '../shared/teacher';

const exam:TrackingAttempt={id:'refresh-exam',assignmentId:'refresh-assignment',chainId:'refresh-assignment',resultAvailable:false,title:'Diagnóstico de prueba de actualización',kind:'diagnostico',level:null,number:1,status:'activo',startedAt:Date.now()-1900000,completedAt:null,correct:null,total:null,passed:null,threshold:null,reviewRequired:false,reviewStatus:null,reviewCompletedAt:null,skills:[]};
const scrollTop=(element:Locator)=>element.evaluate(el=>{let parent=el.parentElement;while(parent&&!['auto','scroll'].includes(getComputedStyle(parent).overflowY))parent=parent.parentElement;return parent?.scrollTop??0;});

test('docente: conserva el mismo campo y foco al refrescar automáticamente',async({page,request})=>{
 await page.clock.install();
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup',{data:{interventions:true}}),f=await setup.json();
 let hold=false,release!:()=>void,received!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{received=resolve;});
 await page.route('**/rpc/apex_api',async route=>{
  if(route.request().postDataJSON().operation!=='teacher_student'){await route.continue();return;}
  const response=await route.fetch(),data:TrackingStudent=await response.json();
  data.attempts=[exam];data.teacherActions={diagnostic:{state:'in_progress',canAssign:false,reason:'Diagnóstico en progreso'},exams:[{...exam,attemptId:exam.id,serverNow:Date.now(),eligibleAt:Date.now()-1000,canSuspend:true,reason:null,suspendedAt:null,replacementId:null,replacementStatus:null}]};
  if(hold){received();await gate;}
  await route.fulfill({json:data});
 });
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(f.teacher.email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:`Abrir grupo ${f.group.code}`,exact:true}).click();await page.getByRole('button',{name:f.alice.name,exact:true}).click();await page.getByRole('button',{name:`Ver seguimiento de ${f.alice.name}`,exact:true}).click();
 await page.getByRole('button',{name:'Acciones del profesor',exact:true}).click();
 const reason=page.getByRole('textbox',{name:/^Motivo de suspensión de /});await reason.fill('Motivo conservado mientras llega una actualización');await reason.focus();
 await reason.evaluate(el=>{(el as HTMLElement).dataset.refreshIdentity='original';});
 const before=await scrollTop(reason);hold=true;
 await page.clock.runFor(30010);await ready;
 const mounted=await reason.count();
 console.log(JSON.stringify({reproduction:'automatic-refresh',beforeScroll:before,reasonMountedWhilePending:mounted,focusedWhilePending:await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))}));
 release();
 await expect(reason).toHaveCount(1);await expect(reason).toHaveAttribute('data-refresh-identity','original');await expect(reason).toBeFocused();
 await expect.poll(async()=>Math.abs(await scrollTop(reason)-before)).toBeLessThan(5);
});
