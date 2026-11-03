import {test,expect} from '@playwright/test';
test('Five enabled templates with no active diagnostic show the precise assignment status after signup',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByRole('button',{name:'Crear una cuenta',exact:true}).click();
 await page.getByRole('textbox',{name:'Nombre',exact:true}).fill('Diagnostic status fixture');
 await page.getByLabel('Fecha de nacimiento',{exact:true}).fill('2000-01-31');
 await page.getByRole('button',{name:'Programa exclusivo de Inglés de prueba',exact:true}).click();
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(`diagnostic-status-${Date.now()}@example.test`);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('textbox',{name:'Confirmar contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Crear cuenta de estudiante',exact:true}).click();
 await expect(page.getByText('Hola, Diagnostic status fixture',{exact:true})).toBeVisible();
 await expect(page.getByText('El diagnóstico de Inglés aún no está activado. Solicita revisión al administrador.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Diagnóstico',exact:true}).click();
 await expect(page.getByText('El diagnóstico de Inglés aún no está activado. Solicita revisión al administrador.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Preparar diagnóstico',exact:true})).toHaveCount(0);
 await expect(page.getByText('No hay evaluaciones asignadas para tu programa.',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'Docs/evidence/diagnostic-not-activated-demo-mvp-390.png',fullPage:true});
});
