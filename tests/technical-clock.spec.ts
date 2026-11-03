import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const endpoint='http://127.0.0.1:54329';
const label='Prueba técnica del reloj — no afecta tu progreso';
test('Technical clock: isolated presentation, 900-second recovery, server result outside progress and withdrawal (390/1280px web)',async({page,request,browser})=>{
 // Synthetic credentials generated for this local Auth fixture only. No real account password.
 const password=randomUUID()+'123+',email=`technical-e2e-${Date.now()}@example.test`;
 const signup=await request.post(`${endpoint}/auth/v1/signup`,{data:{email,password,data:{}}});expect(signup.ok()).toBeTruthy();const auth=await signup.json();
 const action=async(action:string,extra:Record<string,unknown>={})=>{const r=await request.post(`${endpoint}/__test/technical-clock`,{headers:{Authorization:`Bearer ${auth.access_token}`},data:{email,action,...extra}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
 const login=async(p:Page,mail=email,name='Technical fixture')=>{await p.goto('/');await p.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(mail);await p.getByRole('textbox',{name:'Contraseña',exact:true}).fill(password);await p.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(p.getByText(`Hola, ${name}`,{exact:true})).toBeVisible();};
 try{
  const before=(await action('state')).evidence;await action('enable');await action('enable');
  const own=await (await request.post(`${endpoint}/rest/v1/rpc/apex_api`,{headers:{Authorization:`Bearer ${auth.access_token}`},data:{operation:'me',payload:{}}})).json();
  const otherEmail=`other-technical-${Date.now()}@example.test`;
  const other=await (await request.post(`${endpoint}/auth/v1/signup`,{data:{email:otherEmail,password,data:{name:'Other fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}})).json();
  const otherPage=await browser.newPage();try{
   await login(otherPage,otherEmail,'Other fixture');await expect(otherPage.getByText(label,{exact:true})).toHaveCount(0);await otherPage.getByRole('button',{name:'Diagnóstico',exact:true}).click();await expect(otherPage.getByRole('button',{name:'Preparar prueba técnica',exact:true})).toHaveCount(0);
   const denied=await request.post(`${endpoint}/rest/v1/rpc/apex_api`,{headers:{Authorization:`Bearer ${other.access_token}`},data:{operation:'start',payload:{assignmentId:own.technicalAssessment.id,confirmed:true}}});expect((await denied.json()).code).toBe('42501');
  }finally{await otherPage.close();}
  await page.setViewportSize({width:390,height:844});await login(page);
  await expect(page.getByText(label,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Preparar prueba técnica',exact:true}).click();
  expect((await action('state')).attempts).toHaveLength(0);await expect(page.getByRole('button',{name:'Entiendo las condiciones',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Entiendo las condiciones',exact:true}).click();await page.getByRole('button',{name:'Sí, iniciar prueba técnica',exact:true}).click();
  await expect(page.getByText('Pregunta 1 de 10',{exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: 1[45]:\d\d/);
  await expect(page.getByText(label,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Entregar prueba técnica',exact:true})).toBeVisible();
  await page.getByRole('radio').first().click();await page.getByRole('button',{name:'Confirmar respuesta',exact:true}).click();await expect(page.getByText('Respuesta confirmada por el servidor.',{exact:true})).toBeVisible();
  const initial=(await action('state')).attempts[0];expect(Number(initial.vence_en)-Number(initial.iniciado_en)).toBe(900000);
  await page.getByRole('timer').scrollIntoViewIfNeeded();await page.screenshot({path:'Docs/evidence/apex-technical-clock-390-web.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Volver al menú',exact:true}).click();await page.getByRole('button',{name:'Confirmar salida al menú',exact:true}).click();
  await action('advance',{ms:300000});await page.setViewportSize({width:1280,height:844});await page.getByRole('button',{name:'Retomar prueba técnica',exact:true}).click();
  await expect(page.getByText('1 de 10 respondidas',{exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveText(/Tiempo restante: (09|10):\d\d/);
  const resumed=(await action('state')).attempts[0];expect(resumed.id).toBe(initial.id);expect(resumed.vence_en).toBe(initial.vence_en);expect(Number(resumed.confirmed)).toBe(1);
  await page.screenshot({path:'Docs/evidence/apex-technical-clock-1280-web.png',fullPage:true});
  await page.getByRole('button',{name:'Volver al menú',exact:true}).click();await page.getByRole('button',{name:'Confirmar salida al menú',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();
  // No app RPC at expiry: exercise the existing processor, then inspect before logging back in.
  await action('advance',{ms:600000});await action('process');const closed=(await action('state')).attempts;
  expect(closed).toHaveLength(1);expect(closed[0].estado).toBe('finalizado');expect(closed[0].result.technical).toBe(true);expect(closed[0].result.submissionReason).toBe('tiempo_agotado');
  expect((await action('state')).evidence).toEqual(before);
  await login(page);await page.getByRole('button',{name:'Consultar resultado técnico',exact:true}).click();await expect(page.getByText(label,{exact:true})).toBeVisible();
  await expect(page.getByText('Resultado técnico conservado. No afecta tu progreso ni genera repaso.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ir al repaso',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mi progreso',exact:true}).click();await expect(page.getByText('Tu historia está por comenzar',{exact:true})).toBeVisible();await expect(page.getByText(label,{exact:true})).toHaveCount(0);
  await action('withdraw');await action('withdraw');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('La prueba técnica ha sido retirada. Su evidencia permanece guardada.',{exact:true})).toBeVisible();
  await expect(page.getByText('Tu historia está por comenzar',{exact:true})).toBeVisible(); // Withdrawal preserves the academic page.
  await page.getByRole('button',{name:'Inicio',exact:true}).click();
  await expect(page.getByRole('button',{name:'Consultar resultado técnico',exact:true})).toHaveCount(0);await expect(page.getByText(label,{exact:true})).toHaveCount(0);
  expect((await action('state')).attempts).toHaveLength(1);expect((await action('state')).evidence).toEqual(before);
 }finally{await action('reset-time');}
});
