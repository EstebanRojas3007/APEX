import {test,expect,type Page} from '@playwright/test';
import type {RouteStatus,Section} from '../shared/contracts';

const routeURL='**/rest/v1/rpc/apex_my_route';
const names=['Básico','Intermedio','Intermedio-avanzado'];
const header=(page:Page,level:number)=>page.getByRole('button',{name:new RegExp(`^Nivel ${names[level-1]},`)});
const sections=(page:Page)=>page.getByRole('button',{name:/^Abrir sección /});
const section=(order:number):Section=>({
 id:`accordion-section-${order}`,level:2,order,title:`Título personalizado de la sección ${order} con texto para comprobar el ajuste`,
 skillId:'synthetic',skill:'Synthetic skill',version:4,generationStatus:'ready',
 objective:'Synthetic objective',explanation:'Synthetic explanation',reason:'Synthetic personalization',origin:'original_ai_apex',
 examples:[{prompt:'Example',response:'Response',explanation:'Explanation'}],
 practice:[{prompt:'Practice',response:'Response',explanation:'Explanation'}],
 references:[{fragmentId:'synthetic',sourceId:'synthetic',page:1,title:'Synthetic source',text:'Synthetic reference',sha256:'synthetic',edition:null,url:null}],
 prerequisites:order>1?[order-1]:[],startedAt:order===1?'2026-10-12T10:00:00Z':null,
 completedAt:order===1?'2026-10-12T10:01:00Z':null,available:order<=2,
});
function routeFixture():RouteStatus{
 return {status:'ready',message:'Ruta personalizada disponible',integrationConnected:true,validatedVersion:4,completedLessons:[],finalAvailable:false,
  levels:names.map((_,index)=>({level:index+1,available:index<2,status:'ready',error:null,version:4,
   completed:index===0?7:index===1?1:0,controlPassed:index===0,controlAvailable:index===0,
   sections:index===1?Array.from({length:7},(_,i)=>section(i+1)):[]}))};
}
async function login(page:Page,email:string){
 await page.goto('/');
 await page.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Prueba123+');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByText('Hola, Accordion fixture',{exact:true})).toBeVisible();
}

for(const width of [1280,390,320])test(`Route accordion: keyboard, no requests, locked summary and return position (${width}px web)`,async({page,request})=>{
 await page.setViewportSize({width,height:844});
 const email=`accordion-e2e-${width}-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Accordion fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});
 expect(signup.ok()).toBeTruthy();
 const data=routeFixture(),errors:string[]=[],operations:string[]=[];
 let reads=0;
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',req=>{if(req.url().endsWith('/rpc/apex_api'))operations.push(req.postDataJSON().operation);});
 await page.route(routeURL,async route=>{reads++;await route.fulfill({json:data});});
 await login(page,email);await page.getByRole('button',{name:'Mi ruta',exact:true}).click();
 await expect(header(page,2)).toHaveAttribute('aria-expanded','true');
 await expect(header(page,1)).toHaveAttribute('aria-expanded','false');
 await expect(sections(page)).toHaveCount(7);
 await expect(header(page,2)).toHaveAccessibleName(/1\/7 secciones terminadas, Contenido disponible/);
 await expect(page.getByText('Terminada',{exact:true})).toBeVisible();
 await expect(page.getByText('Disponible',{exact:true})).toBeVisible();
 await expect(page.getByText('Sección bloqueada',{exact:true})).toHaveCount(5);
 await expect(page.getByRole('button',{name:'Ver controles',exact:true})).toHaveCount(0);
 await expect(page.getByText('Examen final bloqueado',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ver examen final',exact:true})).toHaveCount(0);

 // Freeze the existing polling/activity timers to isolate requests caused by toggling.
 await page.clock.install();await page.clock.pauseAt(new Date());
 const readsBefore=reads,operationsBefore=operations.length;
 await header(page,2).focus();await page.keyboard.press('Enter');
 await expect(header(page,2)).toBeFocused();await expect(header(page,2)).toHaveAttribute('aria-expanded','false');
 await expect(sections(page)).toHaveCount(0);
 await page.keyboard.press('Space');await expect(header(page,2)).toHaveAttribute('aria-expanded','true');
 // Press the otherwise empty edge of the header, beyond the text and arrow.
 await header(page,3).click({position:{x:8,y:8}});
 await expect(header(page,3)).toHaveAttribute('aria-expanded','true');
 await expect(header(page,2)).toHaveAttribute('aria-expanded','false');
 await expect(sections(page)).toHaveCount(7);
 await expect(page.getByText('Contenido pendiente',{exact:true})).toHaveCount(7);
 await expect(page.getByText('Aprueba el control de Intermedio para habilitar este nivel.',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:/generación|Ver controles/})).toHaveCount(0);
 expect(reads).toBe(readsBefore);expect(operations.length).toBe(operationsBefore);
 await page.clock.resume();

 const locked=page.getByRole('button',{name:'Abrir sección 7 de Intermedio-avanzado',exact:true});
 await locked.scrollIntoViewIfNeeded();
 const scrollOffset=()=>locked.evaluate(el=>{let parent=el.parentElement;while(parent&&getComputedStyle(parent).overflowY!=='auto'&&getComputedStyle(parent).overflowY!=='scroll')parent=parent.parentElement;return parent?.scrollTop??0;});
 await expect.poll(scrollOffset).toBeGreaterThan(100);
 const previousOffset=await scrollOffset();
 await locked.click();await expect(page).toHaveURL(/#mi-ruta\/3\/7$/);
 await expect(page.getByText('Sección bloqueada',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Marcar sección terminada|Refuerzo/})).toHaveCount(0);
 await page.getByRole('button',{name:'Volver a Mi ruta',exact:true}).click();
 await expect(header(page,3)).toHaveAttribute('aria-expanded','true');
 await expect.poll(async()=>Math.abs(await scrollOffset()-previousOffset)).toBeLessThan(5);
 await page.goForward();await expect(page).toHaveURL(/#mi-ruta\/3\/7$/);
 await expect(page.getByText('Sección bloqueada',{exact:true})).toBeVisible();
 await page.goBack();await expect(header(page,3)).toHaveAttribute('aria-expanded','true');

 await header(page,2).click();
 for(const row of await sections(page).all()){
  const bounds=await row.boundingBox();expect(bounds?.height).toBeGreaterThanOrEqual(48);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:`test-results/route-accordion-${width}.png`,fullPage:true});

 // A refreshed route changes states, while preserving the selected accordion panel.
 data.levels![1]!.completed=7;data.levels![1]!.controlAvailable=true;
 await expect(header(page,2)).toHaveAccessibleName(/7\/7 secciones terminadas, Control habilitado/,{timeout:10000});
 await expect(header(page,2)).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('button',{name:'Ver controles',exact:true})).toBeEnabled();
 await header(page,2).click();
 data.finalAvailable=true;
 await expect(page.getByRole('button',{name:'Ver examen final',exact:true})).toBeEnabled({timeout:10000});
 await expect(sections(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Ver examen final',exact:true}).click();
 await expect(page.getByText('Mis evaluaciones',{exact:true})).toBeVisible();
 expect(operations.filter(operation=>/^(route_retry|section|section_complete|start|chat_.*)$/.test(operation))).toEqual([]);
 expect(errors).toEqual([]);
});

test('Route loading/error, unavailable initial level and generation states stay explicit',async({page,request})=>{
 const email=`accordion-e2e-states-${Date.now()}@example.test`;
 const signup=await request.post('http://127.0.0.1:54329/auth/v1/signup',{data:{email,password:'Prueba123+',data:{name:'Accordion fixture',birthDate:'2000-01-01',program:'demo',semester:1,consent:true}}});expect(signup.ok()).toBeTruthy();
 const data=routeFixture();data.levels!.forEach(level=>{level.available=false;level.controlAvailable=false;level.controlPassed=false;level.completed=0;level.sections=[];});
 let fail=true,release:()=>void=()=>{};
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 await page.route(routeURL,async route=>{await waiting;await route.fulfill(fail?{status:503,json:{message:'Error de ruta de prueba'}}:{json:data});});
 await login(page,email);await page.getByRole('button',{name:'Mi ruta',exact:true}).click();
 await expect(page.getByText('Consultando tu ruta…',{exact:true})).toBeVisible();release();
 await expect(page.getByRole('alert')).toContainText('Error de ruta de prueba');
 fail=false;await expect(header(page,1)).toBeVisible({timeout:10000});
 for(let level=1;level<=3;level++)await expect(header(page,level)).toHaveAttribute('aria-expanded','false');
 await header(page,1).click();await expect(page.getByText('Completa el diagnóstico para habilitar Básico.',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:/generación|Ver controles|Ver examen final/})).toHaveCount(0);
 data.levels![0]!.available=true;data.levels![0]!.status='running';
 await expect(header(page,1)).toHaveAccessibleName(/Generando contenido/,{timeout:10000});
 await expect(page.getByRole('button',{name:'Reintentar generación',exact:true})).toBeDisabled();
 data.levels![0]!.status='error';data.levels![0]!.error='Error de generación de prueba';
 await expect(page.getByText('Error de generación de prueba',{exact:true})).toBeVisible({timeout:10000});
 await expect(page.getByRole('button',{name:'Reintentar generación',exact:true})).toBeEnabled();
 await header(page,1).click();await expect(sections(page)).toHaveCount(0);
 data.levels![0]!.status='pending';data.levels![0]!.error=null;
 await expect(header(page,1)).toHaveAccessibleName(/Generación pendiente/,{timeout:10000});
 await expect(header(page,1)).toHaveAttribute('aria-expanded','false');
 await header(page,1).click();await expect(page.getByRole('button',{name:'Preparar generación',exact:true})).toBeEnabled();
});
