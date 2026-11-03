// Native Android verification against isolated PostgreSQL and simulated Auth only.
import {_android} from 'playwright';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

mkdirSync('test-results',{recursive:true});mkdirSync('Docs/evidence',{recursive:true});
const children=[];
const env={...process.env,CI:'1',EXPO_OFFLINE:'1',REACT_NATIVE_PACKAGER_HOSTNAME:'127.0.0.1',EXPO_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-only',EXPO_PUBLIC_AUTH_REDIRECT_URL:'exp://127.0.0.1:8092/--/auth/recovery'};
function start(args,log){
 const fd=openSync(`test-results/${log}`,'w');
 const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore',fd,fd]});children.push(child);return child;
}
async function ready(url){
 for(let n=0;n<90;n++){
  if(children.some(c=>c.exitCode!==null))throw Error('Un servidor de prueba terminó; consulta test-results/android-*.log.');
  try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}
  await delay(1000);
 }
 throw Error(`Servidor local no disponible: ${url}`);
}
async function fixture(path,data){
 const response=await fetch(`http://127.0.0.1:54329${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;
}
let device;
async function waitFor(selector,timeout=30000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  try{await device.wait(selector,{timeout:1000});const {bounds}=await device.info(selector);if(bounds.width>0&&bounds.height>0)return;}catch{}
  await delay(500);
 }
 throw Error(`Tiempo agotado en Android: ${JSON.stringify(selector)}`);
}
async function find(selector,axis='vertical'){
 for(let n=0;n<8;n++){
  try{await device.wait(selector,{timeout:1000});return;}catch{}
  const {bounds:b}=await device.info({clazz:axis==='horizontal'?'android.widget.HorizontalScrollView':'android.widget.ScrollView'});
  const from=axis==='horizontal'?{x:b.x+b.width*0.85,y:b.y+b.height/2}:{x:b.x+b.width/2,y:b.y+b.height*0.8};
  const to=axis==='horizontal'?{x:b.x+b.width*0.15,y:from.y}:{x:from.x,y:b.y+b.height*0.35};
  await device.input.swipe(from,[to],60);
  await delay(300);
 }
 throw Error(`Elemento Android no encontrado: ${JSON.stringify(selector,(_key,value)=>value instanceof RegExp?String(value):value)}`);
}
async function tap(desc,axis){await find({desc},axis);await device.tap({desc},{timeout:5000});}
async function fill(desc,value){
 await find({desc});await device.tap({desc});await delay(500);
 assert.match(value,/^[A-Za-z0-9 @+._-]+$/); // Controlled ASCII fixture values, shell-quoted below.
 await device.shell('input keycombination 113 29');
 await device.shell(`input text '${value.replaceAll(' ','%s')}'`);await delay(500);
 await device.shell('input keyevent 4');await delay(300);
}
async function visible(text){await find({text});}
async function openApp(){
 const result=(await device.shell('am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:8092 -n host.exp.exponent/.LauncherActivity')).toString();
 assert.match(result,/Status: ok|Starting: Intent/,result);
 console.log('Android: actividad de Expo Go iniciada.');
}
async function signup(email,name){
 console.log('Android: completando formulario de registro.');
 await tap('Crear una cuenta');
 await fill('Nombre',name);await tap('Seleccionar fecha de nacimiento');
 await waitFor({res:'android:id/button1'});await device.tap({res:'android:id/button1'},{timeout:5000});
 console.log('Android: calendario confirmado.');
 await tap('Programa de demostración');await fill('Semestre','4');
 await fill('Correo electrónico',email);await fill('Contraseña','Prueba123+');await fill('Confirmar contraseña','Prueba123+');
 await tap(/.*Acepto guardar mi perfil y resultados para usar APEX.*/);
 await tap('Crear cuenta de estudiante');
}
async function login(email){await fill('Correo electrónico',email);await fill('Contraseña','Prueba123+');await tap('Iniciar sesión');}
async function startDiagnostic(){
 await tap('Conocer mi punto de partida');await tap('Preparar diagnóstico');
 await tap('Entiendo las condiciones');await tap('Sí, iniciar diagnóstico');await visible('Pregunta 1 de 7');
}
async function pause(){await tap('Volver al menú');await tap('Confirmar salida al menú');}
try{
 start(['node_modules/tsx/dist/cli.mjs','supabase/tests/http-fixture.ts'],'android-fixture.log');
 start(['node_modules/expo/bin/cli','start','--port','8092','--host','lan'],'android-metro.log');
 console.log('Android: preparando PostgreSQL y Metro locales.');
 await Promise.all([ready('http://127.0.0.1:54329/health'),ready('http://127.0.0.1:8092/status')]);
 console.log('Android: servidores disponibles; conectando al emulador.');
 const devices=await _android.devices();
 device=devices.find(d=>d.serial()===(process.env.APEX_ANDROID_SERIAL??'emulator-5554'));
 assert.ok(device,'Inicia un emulador con Expo Go 57; APEX_ANDROID_SERIAL selecciona el dispositivo.');
 device.setDefaultTimeout(15000);
 const adb=process.env.APEX_ADB??`${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
 for(const port of [54329,8092])assert.equal(spawnSync(adb,['-s',device.serial(),'reverse',`tcp:${port}`,`tcp:${port}`],{windowsHide:true}).status,0);
 await device.shell('am force-stop host.exp.exponent');
 await openApp();
 console.log('Android: abriendo APEX con servidores locales.');
 // Close Expo Go's initial developer menu manually before running this native check.
 await waitFor({text:'Retoma tu aprendizaje'},60000);
 const email=`android-profile-${Date.now()}@example.test`;
 await signup(email,'Perfil Android');await visible('Hola, Perfil Android');
 console.log('Android: registro inmediato y perfil persistido.');
 const original=await fixture('/__test/profile',{email});
 assert.equal(original.birthDate,'2000-01-01');assert.equal(original.semester,4);assert.equal(original.complete,true);
 await startDiagnostic();await tap('A. $17.000');await tap('Confirmar respuesta');await visible('Respuesta confirmada por el servidor.');
 await pause();await tap('Editar perfil','horizontal');
 assert.equal((await device.info({desc:'Nombre'})).text,'Perfil Android');
 assert.equal((await device.info({desc:'Semestre'})).text,'4');
 await visible('Fecha de nacimiento: 2000-01-01 · Solo lectura');
 await fill('Nombre','Perfil Android editado');await fill('Semestre','6');await tap('Otra carrera de prueba');
 writeFileSync('Docs/evidence/profile-edit-android.png',await device.screenshot());
 await tap('Guardar perfil');await visible('Hola, Perfil Android editado');
 const edited=await fixture('/__test/profile',{email});
 assert.equal(edited.program,'fixture-other');assert.equal(edited.semester,6);assert.equal(edited.birthDate,original.birthDate);assert.equal(edited.role,'estudiante');
 await device.shell('am force-stop host.exp.exponent');await openApp();
 await waitFor({text:'Retoma tu aprendizaje'});await login(email);await visible('Hola, Perfil Android editado');
 await tap('Diagnóstico','horizontal');await tap('Retomar el mismo intento');await visible('1 de 7 respondidas');
 await tap('Finalizar diagnóstico');await tap('Finalizar y ver resultado');await visible('1 acierto de 7 preguntas');
 await tap('Mi progreso','horizontal');await visible('Historial');
 writeFileSync('Docs/evidence/profile-history-android.png',await device.screenshot());
 console.log('Android: edición, reinicio, nuevo login, mismo intento e historial conservados.');
 await device.shell('am force-stop host.exp.exponent');await openApp();await waitFor({text:'Retoma tu aprendizaje'});
 const pendingEmail=`confirm-android-${Date.now()}@example.test`;
 await signup(pendingEmail,'Correo Android');await visible(/.*Revisa tu correo y confirma la cuenta.*/);
 assert.equal((await fixture('/__test/profile',{email:pendingEmail})).complete,true);
 const confirmed=await fixture('/__test/confirm',{email:pendingEmail});
 await device.shell(`am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8092/--/auth/recovery#access_token=${confirmed.access_token}&refresh_token=${confirmed.refresh_token}&type=signup&expires_in=3600&token_type=bearer' -p host.exp.exponent`);
 await device.shell('am force-stop host.exp.exponent');await openApp();await waitFor({text:'Retoma tu aprendizaje'});
 await login(pendingEmail);await visible('Hola, Correo Android');await startDiagnostic();
 writeFileSync('Docs/evidence/profile-confirmed-android.png',await device.screenshot());
 console.log('Android: confirmación simulada, nuevo inicio de sesión y diagnóstico sin repetir perfil.');
 writeFileSync('test-results/android-profile-result.json',JSON.stringify({passed:true,device:device.serial(),auth:'simulated',database:'local PGlite',native:'Expo Go 57',checks:['registration','email confirmation link','restart/login','diagnostic','profile editing','immutable birthday','saved answer','history']},null,2));
}catch(error){
 if(device)writeFileSync('test-results/android-profile-failure.png',await device.screenshot().catch(()=>Buffer.alloc(0)));
 throw error;
}finally{
 if(device)await device.close();
 for(const child of children)if(child.pid){
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');
 }
}
