import {test,expect,type Page,type APIRequestContext} from '@playwright/test';

const endpoint='http://127.0.0.1:54329';
async function fixture(request:APIRequestContext){
 const email=`clock-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
 const signup=await request.post(`${endpoint}/auth/v1/signup`,{data:{email,password:'Prueba123+',data:{name:'Clock fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();const auth=await signup.json();
 const action=async(action:string,extra:Record<string,unknown>={})=>{
  const response=await request.post(`${endpoint}/__test/assessment-clock`,{headers:{Authorization:`Bearer ${auth.access_token}`},data:{email,action,...extra}});
  expect(response.ok(),await response.text()).toBeTruthy();return response.json();
 };
 return {email,action};
}
async function login(page:Page,email:string){
 await page.goto('/');await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Hola, Clock fixture',{exact:true})).toBeVisible();
}
async function begin(page:Page,kind:'control'|'examen final'|'diagnóstico'){
 await page.getByRole('button',{name:'Diagnóstico',exact:true}).click();
 await page.getByRole('button',{name:kind==='control'?'Preparar control':kind==='examen final'?'Preparar examen final':'Preparar diagnóstico',exact:true}).click();
}
async function confirm(page:Page,kind:string){
 await page.getByRole('button',{name:'Entiendo las condiciones',exact:true}).click();await page.getByRole('button',{name:`Sí, iniciar ${kind}`,exact:true}).click();
}
for(const width of [1280,390])test(`Timed control: persisted recovery, pending answers, offline deadline and confirmed server grade (${width}px web)`,async({page,request})=>{
 const {email,action}=await fixture(request);
 try{
  await action('prepare');await page.setViewportSize({width,height:844});await login(page,email);
  const starts:any[]=[];page.on('response',async response=>{if(response.url().endsWith('/rpc/apex_api')&&response.request().postDataJSON()?.operation==='start')starts.push(await response.json());});
  await begin(page,'control');await expect(page.getByText(/Tiempo total: 15 minutos/).last()).toBeVisible();
  expect((await action('state')).attempts.filter((a:any)=>a.estado==='activo')).toHaveLength(0);
  await confirm(page,'control');await expect(page.getByText('Pregunta 1 de 10',{exact:true})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: 1[45]:\d\d/);
  await expect(page.getByRole('timer')).toHaveAttribute('aria-live','off');
  await page.screenshot({path:`Docs/evidence/apex-clock-active-${width}-web.png`,fullPage:true});
  await page.getByRole('radio').first().click();await page.getByRole('button',{name:'Confirmar respuesta',exact:true}).click();
  await expect(page.getByText('Respuesta confirmada por el servidor.',{exact:true})).toBeVisible();
  const initial=starts[0];expect(initial.clock.expiresAt-initial.clock.startedAt).toBe(900000);
  await page.getByRole('button',{name:'Volver al menú',exact:true}).click();await page.getByRole('button',{name:'Confirmar salida al menú',exact:true}).click();
  await action('advance',{ms:300000});
  await page.getByRole('button',{name:'Diagnóstico',exact:true}).click();await page.getByRole('button',{name:'Retomar el mismo intento',exact:true}).click();
  await expect(page.getByText('1 de 10 respondidas',{exact:true})).toBeVisible();await expect.poll(()=>starts.length).toBe(2);
  expect(starts[1].id).toBe(initial.id);expect(starts[1].questions).toEqual(initial.questions);expect(starts[1].answers).toEqual({[initial.questions[0].id]:initial.questions[0].options[0].id});
  expect(starts[1].clock.expiresAt).toBe(initial.clock.expiresAt);expect(starts[1].clock.remainingMs).toBeLessThanOrEqual(600000);
  await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: (09|10):\d\d/);
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('radio').first().click();
  await expect(page.getByText('Selección pendiente de guardar.',{exact:true})).toBeVisible();
  // Advancing Date alone cannot renew the countdown derived from performance.now().
  await page.clock.install();await page.clock.pauseAt(new Date());
  const before=await page.getByRole('timer').textContent();await page.clock.setSystemTime(new Date(Date.now()+3600000));
  await expect(page.getByRole('timer')).toHaveText(before!);await page.clock.setSystemTime(new Date());
  await action('hold');await action('advance',{ms:610000});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Tiempo agotado, procesando resultado',{exact:true})).toBeVisible();
  await page.getByText('Tiempo agotado, procesando resultado',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`Docs/evidence/apex-clock-pending-${width}-web.png`,fullPage:true});
  await expect(page.getByRole('button',{name:'Confirmar respuesta',exact:true})).toBeDisabled();
  await expect(page.getByText(/aciertos de 10 preguntas/)).toHaveCount(0);
  await page.route(`${endpoint}/**`,route=>route.abort());await page.clock.runFor(5000);
  await expect(page.getByText(/Sin conexión con Supabase/)).toBeVisible();
  // Execute the actual SQL processor as the fixture DB owner, without an app grading RPC.
  await action('release');expect((await action('process')).report.processed).toBe(1);
  const state=(await action('state')).attempts.find((a:any)=>a.id===initial.id);
  expect(state.confirmed).toBe(1);expect(state.result.total).toBe(10);expect(state.result.submissionReason).toBe('tiempo_agotado');
  await page.unroute(`${endpoint}/**`);await page.clock.runFor(5000);
  await expect(page.getByText(/aciertos? de 10 preguntas/)).toBeVisible();
  await expect(page.getByText(/Entrega automática por tiempo agotado/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`Docs/evidence/apex-clock-control-${width}-web.png`,fullPage:true});
 }finally{await action('reset');}
});

test('Final has 37:30 total and permits a manual server result before expiration (web)',async({page,request})=>{
 const {email,action}=await fixture(request);
 try{
  await action('prepare',{final:true});await login(page,email);await begin(page,'examen final');
  await expect(page.getByText(/Tiempo total: 37 minutos y 30 segundos/).last()).toBeVisible();await confirm(page,'examen final');
  await expect(page.getByText('Pregunta 1 de 25',{exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: 37:[23]\d/);
  const active=(await action('state')).attempts.find((a:any)=>a.estado==='activo');expect(active.vence_en-active.iniciado_en).toBe(2250000);
  await page.getByRole('button',{name:'Finalizar examen final',exact:true}).click();await page.getByRole('button',{name:'Finalizar y ver resultado',exact:true}).click();
  await expect(page.getByText('0 aciertos de 25 preguntas',{exact:true})).toBeVisible();await expect(page.getByText('Evaluación reprobada',{exact:true})).toBeVisible();
  await expect(page.getByText(/al menos 22 aciertos/)).toBeVisible();await expect(page.getByRole('button',{name:'Ir al repaso',exact:true})).toBeVisible();
 }finally{await action('reset');}
});

test('Late confirmation with a stale positive client clock is rejected and shows pending, then a real grade (web)',async({page,request})=>{
 const {email,action}=await fixture(request);
 try{
  await action('prepare');await login(page,email);await begin(page,'control');await confirm(page,'control');
  await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: 1[45]:\d\d/);
  await page.getByRole('radio').first().click();
  await page.clock.install();await page.clock.pauseAt(new Date());
  await action('hold');await action('advance',{ms:900000});
  // No focus event/clock refresh: the UI still has time, but PostgreSQL rejects this answer.
  await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: 1[45]:\d\d/);
  await page.getByRole('button',{name:'Confirmar respuesta',exact:true}).click();
  await expect(page.getByText('Tiempo agotado, procesando resultado',{exact:true})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('Tiempo restante: 00:00');
  await expect(page.getByRole('button',{name:'Confirmar respuesta',exact:true})).toBeDisabled();
  await expect(page.getByText('La última selección no se guardó: terminó el plazo.',{exact:true})).toBeVisible();
  const active=(await action('state')).attempts.find((a:any)=>a.estado==='activo');expect(active.confirmed).toBe(0);expect(active.result).toBeNull();
  await action('release');expect((await action('process')).report.processed).toBe(1);
  await page.clock.runFor(3000);await expect(page.getByText('0 aciertos de 10 preguntas',{exact:true})).toBeVisible();
 }finally{await action('reset');}
});

test('Diagnostic stays untimed after 30 minutes; eight-minute inactivity requires login and recovery (web simulation)',async({page,request})=>{
 const {email,action}=await fixture(request);
 try{
  await login(page,email);await begin(page,'diagnóstico');await confirm(page,'diagnóstico');
  await expect(page.getByText('Sin límite de tiempo',{exact:true})).toBeVisible();
  await page.getByRole('radio').first().click();await page.getByRole('button',{name:'Confirmar respuesta',exact:true}).click();
  const active=(await action('state')).attempts.find((a:any)=>a.estado==='activo');expect(active.vence_en).toBeNull();
  await page.clock.install();await page.clock.pauseAt(new Date());await page.clock.runFor(300001);
  await expect(page.getByText(/Llevas cinco minutos sin interactuar/)).toBeVisible();
  await page.clock.runFor(120000);await expect(page.getByText(/Bloqueo por inactividad en/)).toBeVisible();
  await page.clock.runFor(60000);await expect(page.getByText(/Sesión bloqueada por inactividad/)).toBeVisible();
  await action('advance',{ms:1800001});expect((await action('process')).report.failed).toBe(0);
  const unchanged=(await action('state')).attempts.find((a:any)=>a.id===active.id);expect(unchanged.estado).toBe('activo');expect(unchanged.result).toBeNull();
  await page.clock.resume();await login(page,email);await page.getByRole('button',{name:'Retomar el mismo intento',exact:true}).click();
  await expect(page.getByText('Mis evaluaciones',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Retomar el mismo intento',exact:true}).click();
  await expect(page.getByText('Sin límite de tiempo',{exact:true})).toBeVisible();await expect(page.getByText('1 de 7 respondidas',{exact:true})).toBeVisible();
  expect((await action('state')).attempts.find((a:any)=>a.estado==='activo').id).toBe(active.id);
 }finally{await action('reset');}
});
