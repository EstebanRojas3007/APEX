import {test,expect} from '@playwright/test';
test('shared options, gap numbering and long readings on a narrow screen (synthetic fixture)',async({page,request})=>{
 const email=`layout-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Layout fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();
 await page.route('**/rest/v1/rpc/apex_api',async route=>{
  if(route.request().postDataJSON().operation!=='start'){await route.continue();return;}
  const response=await route.fetch(),attempt=await response.json();
  for(let index=0;index<3;index++){
   const q=attempt.questions[index];q.originalNumber=[1,11,21][index];q.sourcePage=[5,7,9][index];q.sourceTitle='SYNTHETIC SOURCE FOR UI TEST';
   q.context={id:`fixture-${index}`,title:['Shared vocabulary','Numbered cloze','Long reading'][index],instructions:'SYNTHETIC INSTRUCTIONS — not ICFES content',example:'Example zero is not scored.',pageStart:[5,7,8][index],pageEnd:[5,7,9][index],format:['vocabulario_compartido','cloze','lectura'][index],reading:index===1?'Synthetic text with gaps (11), (12), (13), (14), (15), (16), (17), (18).':index===2?'First synthetic paragraph.\n\n'+('A long synthetic paragraph for mobile rendering. '.repeat(40)):null,sharedOptions:index===0?'ABCDEFGH'.split('').map(label=>({label,text:'Synthetic choice '+label})):[]};
   if(index===0)q.options='ABCDEFGH'.split('').map(label=>({id:'fixture-'+label,label,text:'Synthetic choice '+label}));
  }
  await route.fulfill({response,json:attempt});
 });
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:'Conocer mi punto de partida',exact:true}).click();
 await page.getByRole('button',{name:'Preparar diagnóstico',exact:true}).click();
 await page.getByRole('button',{name:'Entiendo las condiciones',exact:true}).click();
 await page.getByRole('button',{name:'Sí, iniciar diagnóstico',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByText('OPCIONES COMPARTIDAS DEL DOCUMENTO',{exact:true})).toBeVisible();
 await expect(page.getByRole('radio',{name:'H. Synthetic choice H',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();
 await expect(page.getByText('Pregunta original 11 · PDF p. 7',{exact:true})).toBeVisible();
 await expect(page.getByText(/Responde solo el espacio \(11\)/)).toBeVisible();
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();
 await expect(page.getByText(/First synthetic paragraph/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'Docs/evidence/english-reading-mobile-fixture.png',fullPage:true});
});
