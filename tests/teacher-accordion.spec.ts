import {test,expect,type Locator} from '@playwright/test';
import type {TeacherRoster,TrackingStudent} from '../shared/teacher';

// Browser-only synthetic roster; the existing integration tests cover real authorization.
for(const width of [1280,390,320])test(`salón desplegable: teclado, IDs, búsqueda, regreso y revalidación (${width}px web)`,async({page,request})=>{
 await page.setViewportSize({width,height:844});
 const setup=await request.post('http://127.0.0.1:54329/__test/teacher/setup');expect(setup.ok()).toBeTruthy();const fixture=await setup.json();
 const otherGroup={...fixture.group,id:'accordion-other-group',code:'ACCORDION-B',name:'Otro salón sintético'};
 const duplicate='Estudiante con nombre repetido';
 let data:TeacherRoster|undefined;
 const operations:string[]=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/rpc/apex_api',async route=>{
  const {operation,payload}=route.request().postDataJSON();operations.push(operation);
  if(operation==='teacher_groups'){
   await route.fulfill({json:[fixture.group,otherGroup]});
  }else if(operation==='teacher_group'){
   if(!data){
    const response=await route.fetch(),source:TeacherRoster=await response.json();
    const students:TrackingStudent[]=Array.from({length:18},(_,index)=>({...source.students[0]!,id:`accordion-student-${index}`,name:index<2?duplicate:`Estudiante ${index+1} Ángela María de los Apellidos Largos para comprobar el ajuste en pantallas pequeñas`,program:'Ingeniería de sistemas · DATOS SINTÉTICOS',semester:index+1,reviewRequired:true}));
    data={group:{...source.group,activeCount:18,membershipCount:18},students};
   }
   await route.fulfill({json:payload.groupId===otherGroup.id?{...data,group:{...otherGroup,activeCount:data.students.length,membershipCount:data.students.length}}:data});
  }else if(operation==='teacher_student'){
   await route.fulfill({json:data!.students.find(student=>student.id===payload.studentId)});
  }else await route.continue();
 });
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(fixture.teacher.email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:`Abrir grupo ${fixture.group.code}`,exact:true}).click();
 const headers=()=>page.locator('[role="button"][aria-expanded]');
 const tracking=()=>page.getByRole('button',{name:/^Ver seguimiento de /});
 const search=page.getByRole('textbox',{name:'Buscar estudiante',exact:true});
 const duplicates=page.getByRole('button',{name:duplicate,exact:true});
 const row=(header:Locator)=>header.locator('..');
 const scrollOffset=()=>search.evaluate(el=>{let parent=el.parentElement;while(parent&& !['auto','scroll'].includes(getComputedStyle(parent).overflowY))parent=parent.parentElement;return parent?.scrollTop??0;});
 await expect(headers()).toHaveCount(18);
 expect(await headers().evaluateAll(elements=>elements.every(el=>el.getAttribute('aria-expanded')==='false'))).toBeTruthy();
 await expect(tracking()).toHaveCount(0);
 await expect(page.getByText(/18 estudiantes activos/)).toBeVisible();
 await page.screenshot({path:`test-results/teacher-accordion-closed-${width}.png`,fullPage:true});

 // Isolate requests caused by toggling from existing activity/polling timers.
 await page.clock.install();await page.clock.pauseAt(new Date());const before=operations.length;
 await duplicates.nth(0).focus();await page.keyboard.press('Enter');
 await expect(duplicates.nth(0)).toBeFocused();await expect(duplicates.nth(0)).toHaveAttribute('aria-expanded','true');
 await expect(row(duplicates.nth(0))).toContainText('Semestre 1');
 await expect(row(duplicates.nth(0))).toContainText('Diagnóstico pendiente · Nivel actual: Pendiente');
 await expect(row(duplicates.nth(0))).toContainText('Básico: 0/7');
 await expect(row(duplicates.nth(0))).toContainText('Control · Básico: Pendiente');
 await expect(row(duplicates.nth(0))).toContainText('Examen final: Pendiente');
 await expect(row(duplicates.nth(0))).toContainText('Repaso obligatorio pendiente');
 await expect(duplicates.nth(0).getByText('▲',{exact:true})).toHaveCount(1);
 await expect(page).toHaveURL(new RegExp(`/grupos/${fixture.group.id}$`));
 await page.keyboard.press('Space');await expect(tracking()).toHaveCount(0);
 await expect(duplicates.nth(0).getByText('▼',{exact:true})).toHaveCount(1);
 await page.keyboard.press('Tab');await expect(duplicates.nth(1)).toBeFocused();
 await page.keyboard.press('Enter');await expect(row(duplicates.nth(1))).toContainText('Semestre 2');
 await expect(duplicates.nth(0)).toHaveAttribute('aria-expanded','false');
 await duplicates.nth(0).click({position:{x:8,y:8}});
 await expect(duplicates.nth(1)).toHaveAttribute('aria-expanded','false');await expect(tracking()).toHaveCount(1);
 expect(operations.length).toBe(before);await page.clock.resume();

 await search.fill('sin coincidencias');await expect(headers()).toHaveCount(0);await expect(tracking()).toHaveCount(0);
 await expect(page.getByText('Sin estudiantes que coincidan con la búsqueda.',{exact:true})).toBeVisible();
 await search.fill('repetido');await expect(headers()).toHaveCount(2);
 await expect(duplicates.nth(0)).toHaveAttribute('aria-expanded','true');
 await expect(page.getByText(/18 estudiantes activos/)).toBeVisible();
 await search.fill('ingenieria');await expect(headers()).toHaveCount(18);
 // The server order is retained; opening a row does not sort the roster.
 expect(await headers().allTextContents()).toEqual(data!.students.map(student=>`${student.name}${student.id==='accordion-student-0'?'▲':'▼'}`));
 const last=data!.students.at(-1)!;
 const lastHeader=page.getByRole('button',{name:last.name,exact:true});
 await lastHeader.click();await expect(lastHeader).toHaveAttribute('aria-expanded','true');
 await expect(duplicates.nth(0)).toHaveAttribute('aria-expanded','false');
 await lastHeader.evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:`test-results/teacher-accordion-header-${width}.png`,fullPage:true});
 const follow=page.getByRole('button',{name:`Ver seguimiento de ${last.name}`,exact:true});
 await follow.scrollIntoViewIfNeeded();await expect.poll(scrollOffset).toBeGreaterThan(100);
 const savedOffset=await scrollOffset();
 await page.screenshot({path:`test-results/teacher-accordion-${width}.png`,fullPage:true});
 const followBounds=await follow.boundingBox();expect(followBounds!.width).toBeLessThan(width);expect(followBounds!.height).toBeGreaterThanOrEqual(48);
 await follow.click();await expect(page).toHaveURL(new RegExp(`/estudiantes/${last.id}$`));
 await expect(page.getByText('Progreso por nivel',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Volver al grupo',exact:true}).click();
 await expect(search).toHaveValue('ingenieria');await expect(lastHeader).toHaveAttribute('aria-expanded','true');
 await expect.poll(async()=>Math.abs(await scrollOffset()-savedOffset)).toBeLessThan(5);
 // Browser back/forward also restores the same room state and offset.
 await page.goBack();await expect(page.getByText('Progreso por nivel',{exact:true})).toBeVisible();
 await page.goBack();await expect(search).toHaveValue('ingenieria');
 await expect(lastHeader).toHaveAttribute('aria-expanded','true');
 await expect.poll(async()=>Math.abs(await scrollOffset()-savedOffset)).toBeLessThan(5);
 await page.goForward();await expect(page.getByText('Progreso por nivel',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Volver al grupo',exact:true}).click();
 await expect(lastHeader).toHaveAttribute('aria-expanded','true');
 await expect.poll(async()=>Math.abs(await scrollOffset()-savedOffset)).toBeLessThan(5);

 for(const header of await headers().all()){
  const bounds=await header.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(48);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 // Reordering and renaming retain expansion by ID; removal clears it even if re-added.
 data!.students.reverse();last.name='Nombre actualizado';
 await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 await expect(page.getByRole('button',{name:last.name,exact:true})).toHaveAttribute('aria-expanded','true');
 data!.students=data!.students.filter(student=>student.id!==last.id);
 await page.evaluate(()=>dispatchEvent(new Event('focus')));
 await expect(headers()).toHaveCount(17);
 await expect(page.getByRole('button',{name:last.name,exact:true})).toHaveCount(0);await expect(tracking()).toHaveCount(0);
 data!.students.push(last);
 await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
 await expect(page.getByRole('button',{name:last.name,exact:true})).toHaveAttribute('aria-expanded','false');

 await page.getByRole('button',{name:last.name,exact:true}).click();
 // A direct group change also clears state, without visiting the group selector.
 await page.evaluate(id=>{history.pushState(null,'',`#profesor/grupos/${id}`);dispatchEvent(new PopStateEvent('popstate'));},otherGroup.id);
 await expect(search).toHaveValue('');await expect(tracking()).toHaveCount(0);
 await page.getByRole('button',{name:last.name,exact:true}).click();await search.fill('actualizado');
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(fixture.teacher.email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:`Abrir grupo ${otherGroup.code}`,exact:true}).click();
 await expect(search).toHaveValue('');await expect(tracking()).toHaveCount(0);
 expect(errors).toEqual([]);
});
