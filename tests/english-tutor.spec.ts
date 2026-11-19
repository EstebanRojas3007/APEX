import {test,expect} from '@playwright/test';
import {englishTutorHandler} from '../supabase/functions/english-tutor/handler';
import {TutorError,type TutorTurn} from '../supabase/functions/english-tutor/service';
import type {Route} from '@playwright/test';

for(const outcome of ['reply','server-error','timeout'] as const)test(`Tutor espera 40 segundos sin reintentos: ${outcome}`,async({page,request})=>{
 const email=`english-timeout-${outcome}-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Timeout fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Hola, Timeout fixture',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tutor IA',exact:true}).click();
 await page.clock.install();await page.clock.pauseAt(new Date());
 let pending:Route|undefined,calls=0;
 await page.route('**/functions/v1/english-tutor',route=>{calls++;pending=route;});
 const field=page.getByRole('textbox',{name:'Mensaje para el tutor de inglés',exact:true});
 await field.fill('Practiquemos inglés');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
 await expect.poll(()=>calls).toBe(1);
 await page.clock.runFor(31000);
 await expect(page.getByText('El tutor está preparando tu respuesta…',{exact:true})).toBeVisible();
 if(outcome==='timeout'){
  await page.clock.runFor(8999);
  await expect(page.getByText('El tutor está preparando tu respuesta…',{exact:true})).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByRole('alert')).toHaveText('El tutor tardó demasiado. Tu mensaje se conserva; inténtalo de nuevo.');
  await expect(field).toHaveValue('Practiquemos inglés');
  await pending!.abort().catch(()=>{});
 }else{
  await pending!.fulfill({status:outcome==='reply'?200:503,json:outcome==='reply'?{reply:'Practice: I study English.'}:{message:'El tutor no está disponible temporalmente. Inténtalo de nuevo.'}});
  if(outcome==='reply'){
   await expect(page.getByText('Practice: I study English.',{exact:true})).toBeVisible();await expect(field).toHaveValue('');
  }else{
   await expect(page.getByRole('alert')).toHaveText('El tutor no está disponible temporalmente. Inténtalo de nuevo.');await expect(field).toHaveValue('Practiquemos inglés');
  }
 }
 await expect(page.getByText('El tutor está preparando tu respuesta…',{exact:true})).toHaveCount(0);
 await page.clock.runFor(45000);expect(calls).toBe(1);
});

for(const width of [1280,390])test(`Tutor general: envío, contexto, errores, memoria y aislamiento académico (${width}px)`,async({page,request,baseURL})=>{
 await page.setViewportSize({width,height:844});
 const email=`english-tutor-${width}-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'English tutor fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();const session=await signup.json();
 const headers={Authorization:`Bearer ${session.access_token}`,apikey:'local-test-only'};
 const academicState=async()=>{
  const summary=await request.post('http://127.0.0.1:54329/rest/v1/rpc/apex_api',{headers,data:{operation:'me',payload:{}}});
  const route=await request.post('http://127.0.0.1:54329/rest/v1/rpc/apex_my_route',{headers,data:{}});
  expect(summary.ok()).toBeTruthy();expect(route.ok()).toBeTruthy();
  const data=await summary.json();return {assignments:data.assignments,results:data.results,attempt:data.attempt,route:await route.json()};
 };
 let fail=false,forbidden=false,requests=0;
 const turns:TutorTurn[][]=[],domainCalls:string[]=[];
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api'))domainCalls.push(req.postDataJSON().operation);});
 const handle=englishTutorHandler({
  authorize:async token=>{expect(token).toMatch(/^.+\..+\..+$/);if(forbidden)throw new TutorError(403,'Cuenta fuera del piloto.');return {userId:session.user.id,sessionId:'test-session'};},
  generate:async history=>{requests++;turns.push(structuredClone(history));if(fail)throw Error('private provider failure');return 'El presente simple expresa hábitos. Ejemplo: I study English every day.';},
 },{pilotUserId:session.user.id,origins:[baseURL!]});
 await page.route('**/functions/v1/english-tutor',async route=>{
  const req=route.request();expect(Object.keys(req.postDataJSON())).toEqual(['message']);
  const response=await handle(new Request(req.url(),{method:'POST',headers:req.headers(),body:req.postData()}));
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Hola, English tutor fixture',{exact:true})).toBeVisible();
 const before=await academicState();domainCalls.length=0;
 await page.getByRole('button',{name:'Tutor IA',exact:true}).click();await expect(page.getByRole('heading',{name:'Tutor IA Inglés',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Refuerzo terminado',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Enviar mensaje',exact:true})).toBeDisabled();
 const field=page.getByRole('textbox',{name:'Mensaje para el tutor de inglés',exact:true});
 await field.fill('Explícame el presente simple');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
 await expect(page.getByText('El presente simple expresa hábitos. Ejemplo: I study English every day.',{exact:true})).toBeVisible();await expect(field).toHaveValue('');
 await page.getByRole('button',{name:'Inicio',exact:true}).click();await page.getByRole('button',{name:'Tutor IA',exact:true}).click();
 await expect(page.getByText('Explícame el presente simple',{exact:true})).toBeVisible();
 await field.fill('Dame otro ejemplo');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await expect(field).toHaveValue('');expect(turns[1]?.map(turn=>turn.role)).toEqual(['user','model','user']);
 fail=true;await field.fill('Practiquemos los pronombres');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
 await expect(page.getByText('El tutor no está disponible temporalmente. Inténtalo de nuevo.',{exact:true})).toBeVisible();await expect(field).toHaveValue('Practiquemos los pronombres');
 fail=false;await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await expect(field).toHaveValue('');
 forbidden=true;await field.fill('Una pregunta nueva');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
 await expect(page.getByText('El Tutor de inglés está habilitado únicamente para la cuenta piloto.',{exact:true})).toBeVisible();expect(requests).toBe(4);
 expect(domainCalls.every(operation=>['activity','me'].includes(operation))).toBeTruthy();expect(await academicState()).toEqual(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).last().click();
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByRole('button',{name:'Tutor IA',exact:true}).click();
 await expect(page.getByText('Explícame el presente simple',{exact:true})).toHaveCount(0);await expect(field).toHaveValue('');
});

test('el menú siempre abre el chat general después de Refuerzo o Ir al repaso',async({page,request})=>{
 const email=`english-navigation-${Date.now()}@example.test`;
 await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Navigation fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 const calls:string[]=[];
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api'))calls.push(req.postDataJSON().operation);});
 // Synthetic route/context responses exercise navigation only; no worker or provider.
 const section={id:'synthetic-section',title:'Práctica original',level:1,order:1,available:true,generationStatus:'ready',objective:'Present simple',explanation:'Original explanation',examples:[{prompt:'I study',response:'Study',explanation:'Original example'}],practice:[{prompt:'You study',response:'Study',explanation:'Original practice'}],references:[{sourceId:'source',fragmentId:'fragment',title:'Synthetic reference',page:1,text:'Synthetic text',sha256:'synthetic',edition:null,url:null}],prerequisites:[],version:1};
 await page.route('**/rest/v1/rpc/apex_my_route',route=>route.fulfill({json:{status:'ready',levels:[{level:1,available:true,status:'ready',sections:[section]}]}}));
 await page.route('**/rest/v1/rpc/apex_api',async route=>{
  const body=route.request().postDataJSON();
  if(body.operation==='me'){
   const response=await route.fetch(),summary=await response.json();summary.assignments=[{id:'synthetic-assignment',title:'Control sintético',version:1,kind:'control',status:'finalizado',attemptId:'synthetic-attempt',reviewRequired:true,canRetry:false}];await route.fulfill({response,json:summary});
  }else if(body.operation==='section'){
   await route.fulfill({json:section});
  }else if(['chat_open','chat_get'].includes(body.operation)){
   if(body.operation==='chat_open')expect(body.payload).toEqual(body.payload.kind==='review'?{kind:'review',attemptId:'synthetic-attempt'}:{kind:'section',sectionId:'synthetic-section'});
   await route.fulfill({json:{id:'synthetic-chat',kind:body.payload.kind??'section',status:'unavailable',messages:[],completedAt:null,canComplete:false}});
  }else await route.continue();
 });
 await page.goto('/#mi-ruta/1/1');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:'Refuerzo',exact:true}).click();await expect(page.getByText('Refuerzo de la sección',{exact:true})).toBeVisible();await expect.poll(()=>calls).toContain('chat_open');
 await page.getByRole('button',{name:'Tutor IA',exact:true}).click();await expect(page.getByRole('heading',{name:'Tutor IA Inglés',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Volver a la sección',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Diagnóstico',exact:true}).click();await page.getByRole('button',{name:'Ir al repaso',exact:true}).click();await expect(page.getByText('Repaso de la evaluación',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Refuerzo terminado',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Tutor IA',exact:true}).click();await expect(page.getByRole('heading',{name:'Tutor IA Inglés',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refuerzo terminado',exact:true})).toHaveCount(0);
 expect(calls).not.toContain('review_complete');
});
