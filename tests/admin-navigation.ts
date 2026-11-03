import type {Page} from '@playwright/test';
export async function navigateAdmin(page:Page,name:string){
 const navigation=page.getByTestId('admin-navigation');
 await navigation.waitFor({state:'visible'});
 const menu=navigation.getByRole('button',{name:'Abrir menú',exact:true});
 if(await menu.isVisible())await menu.click();
 const label=name==='Usuarios'?'Consultar':name==='Profesores'||name==='Salones'?'Asignación y transición':name;
 await navigation.getByRole('button',{name:label,exact:true}).click();
 if(name==='Salones')await page.getByTestId('admin-panel').getByRole('button',{name:'Salones',exact:true}).click();
}
