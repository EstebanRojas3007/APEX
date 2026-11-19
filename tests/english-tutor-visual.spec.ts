import {test,expect,type Page} from '@playwright/test';

async function composerInViewport(page:Page,bottom?:number){
 const field=await page.getByRole('textbox',{name:'Mensaje para el tutor de inglés',exact:true}).boundingBox();
 expect(field).not.toBeNull();expect(field!.y).toBeGreaterThan(0);
 expect(field!.y+field!.height).toBeLessThanOrEqual(bottom??page.viewportSize()!.height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
}

for(const width of [1440,1024,390])test(`Presentación del tutor: Markdown, modal y compositor (${width}px)`,async({page,request})=>{
 await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const email=`tutor-visual-${width}-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Estudiante de prueba',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Hola, Estudiante de prueba',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tutor IA',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tutor IA Inglés',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Mensajes',exact:true})).toHaveCount(width>=1000?1:0);
 await expect(page.getByText('¿Qué quieres practicar?',{exact:true})).toBeVisible();
 await expect(page.getByText('El tutor está preparando tu respuesta…',{exact:true})).toHaveCount(0);
 const send=page.getByRole('button',{name:'Enviar mensaje',exact:true});await expect(send).toBeDisabled();
 const attachment=page.getByRole('button',{name:'Adjuntos no disponibles',exact:true});await expect(attachment).toBeDisabled();
 expect(await page.locator('input[type=file]').count()).toBe(0);
 await composerInViewport(page);
 await page.screenshot({path:`Docs/evidence/tutor-${width}-bienvenida.png`,fullPage:true});

 const info=page.getByRole('button',{name:'Información de Tutor IA Inglés',exact:true});await info.click();
 const dialog=page.getByRole('dialog',{name:'Información de Tutor IA Inglés',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByText('Groq',{exact:false})).toBeVisible();
 await expect(dialog.getByText('openai/gpt-oss-120b',{exact:false})).toBeVisible();
 await expect(dialog.getByText(/Es una IA y puede cometer errores/)).toBeVisible();
 await expect(dialog.getByText(/cerrar sesión o recargar/)).toBeVisible();
 await expect(dialog.getByText(/No modifica notas ni progreso/)).toBeVisible();
 const close=dialog.getByRole('button',{name:'Cerrar información del tutor',exact:true});
 await expect(close).toBeFocused();await page.keyboard.press('Tab');
 expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBeTruthy();
 await page.screenshot({path:`Docs/evidence/tutor-${width}-informacion.png`,fullPage:true});
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(info).toBeFocused();

 // Synthetic server reply for visual verification only; the production hook/API are exercised unchanged.
 const reply='### El presente simple\n\nUsamos el **presente simple** para expresar *hábitos y rutinas*.\n\n- **I study English** every day.\n- She *reads* in the morning.\n\n1. Identifica el sujeto.\n2. Usa la forma correcta del verbo.\n\n¿Quieres practicar con un ejemplo?';
 const field=page.getByRole('textbox',{name:'Mensaje para el tutor de inglés',exact:true});
 let calls=0;
 await page.route('**/functions/v1/english-tutor',async route=>{
  calls++;expect(route.request().postDataJSON()).toEqual({message:'Explícame el presente simple'});
  await route.fulfill({json:{reply}});
 });
 await field.fill('Explícame el presente simple');await send.click();
 const history=page.getByTestId('tutor-conversation');
 await expect(history.getByRole('heading',{name:'El presente simple',exact:true})).toBeVisible();
 await expect(field).toHaveValue('');expect(calls).toBe(1);
 await expect(history).not.toContainText('**');await expect(history).not.toContainText('###');
 await expect(history.getByText('presente simple',{exact:true})).toHaveCSS('font-weight','700');
 await expect(history.getByText('hábitos y rutinas',{exact:true})).toHaveCSS('font-style','italic');
 await expect(page.getByText('¿Qué quieres practicar?',{exact:true})).toHaveCount(0);
 await composerInViewport(page);
 await page.screenshot({path:`Docs/evidence/tutor-${width}-conversacion.png`,fullPage:true});

 // Long replies, nested emphasis/lists, literal HTML and uninterrupted strings must remain safe and scrollable.
 const longReply='## Práctica de lectura\n\n'+('Un párrafo de prueba para comprobar la lectura y el desplazamiento. '.repeat(9)+'\n\n').repeat(12)+'- **Una frase con *énfasis* combinado**\n  - Una lista anidada\n\n<script>window.__tutorInjected=true</script>\n\n'+ 'x'.repeat(350);
 await page.unroute('**/functions/v1/english-tutor');
 await page.route('**/functions/v1/english-tutor',route=>route.fulfill({json:{reply:longReply}}));
 await field.fill('Una lectura larga');await send.click();await expect(field).toHaveValue('');
 await expect(history.getByText('<script>window.__tutorInjected=true</script>',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>('__tutorInjected' in window))).toBeFalsy();
 expect(await history.evaluate(node=>node.scrollHeight>node.clientHeight)).toBeTruthy();
 expect(await history.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBeTruthy();
 await composerInViewport(page);
 if(width===390){
  await page.setViewportSize({width:320,height:720});await composerInViewport(page);
  await page.setViewportSize({width:390,height:900});
  await field.focus();
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport!,'height',{configurable:true,value:innerHeight-280});window.visualViewport!.dispatchEvent(new Event('resize'));});
  await expect.poll(async()=>{const box=await field.boundingBox();return box!.y+box!.height;}).toBeLessThanOrEqual(620);
  await composerInViewport(page,620);
  await page.screenshot({path:'Docs/evidence/tutor-390-teclado-simulado.png',fullPage:true});
 }
 expect(errors).toEqual([]);
});
