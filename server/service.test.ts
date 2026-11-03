import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError,ApexService,policy } from './service';
import { makeServer } from './http';
import type { Registration } from '../shared/contracts';
const data=(email='demo@example.test'):Registration=>({name:'Estudiante Prueba',email,birthDate:'2000-02-29',program:'demo',semester:4,password:'Prueba123+',consent:true});
const rejects=(status:number)=>(error:unknown)=>error instanceof ApiError&&error.status===status;
function fixture() {let now=1000000;const service=new ApexService(':memory:',()=>now);const account=service.register(data());return {service,account,session:()=>service.session(account.token),advance:(ms:number)=>{now+=ms;}};}

test('registro valida contraseña, nacimiento y consentimiento; el cliente no concede roles',()=>{
 const service=new ApexService();try {
  assert.throws(()=>service.register({...data(),password:'abcd123+'}),rejects(400));
  assert.throws(()=>service.register({...data(),birthDate:'2025-02-29'}),rejects(400));
  assert.throws(()=>service.register({...data(),consent:false}),rejects(400));
  const account=service.register({...data(),role:'administrador'} as Registration);
  assert.equal(service.profile(account.profile.id).email,'demo@example.test');
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM estudiante').get()!.n,1);
  assert.throws(()=>service.register(data('DEMO@example.test')),rejects(409));
  assert(!JSON.stringify(account).includes('password'));
 }finally {service.db.close();}
});
test('alta local atómica: falla de perfil no deja identidad parcial',()=>{
 const service=new ApexService();try {service.db.exec("CREATE TRIGGER fail_profile BEFORE INSERT ON usuario BEGIN SELECT RAISE(ABORT,'test'); END;");assert.throws(()=>service.register(data()));assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM auth_identity').get()!.n,0);}finally{service.db.close();}
});
test('repetir inicio conserva intento único y no filtra claves ni explicaciones',()=>{
 const f=fixture();try {const first=f.service.start(f.session(),true),second=f.service.start(f.session(),true);assert.equal(first.id,second.id);assert.equal(first.questions.length,7);assert(!/correct|explicacion|password_hash/.test(JSON.stringify(first)));assert.throws(()=>f.service.start(f.session(),false),rejects(400));}finally{f.service.db.close();}
});
test('rechaza acceso a intentos ajenos, ítems externos y opciones de otra pregunta',()=>{
 const f=fixture();try {const attempt=f.service.start(f.session(),true),other=f.service.register(data('other@example.test'));const otherSession=f.service.session(other.token);assert.throws(()=>f.service.attempt(attempt.id,otherSession.user_id),rejects(404));assert.throws(()=>f.service.answer(otherSession,attempt.id,'item1','q1-o0'),rejects(404));assert.throws(()=>f.service.finish(otherSession,attempt.id),rejects(404));assert.throws(()=>f.service.answer(f.session(),attempt.id,'missing','q1-o0'),rejects(400));assert.throws(()=>f.service.answer(f.session(),attempt.id,'item1','q2-o0'),rejects(400));}finally{f.service.db.close();}
});
test('resultado incluye omisiones, finaliza atómicamente y es idempotente',()=>{
 const f=fixture();try {const attempt=f.service.start(f.session(),true);f.service.answer(f.session(),attempt.id,'item1','q1-o0');f.service.answer(f.session(),attempt.id,'item2',null);const result=f.service.finish(f.session(),attempt.id);assert.equal(result.correct,1);assert.equal(result.total,7);assert.equal(result.percentage,100/7);assert.equal(result.nuclei.reduce((sum,row)=>sum+row.total,0),7);assert.equal(result.competencies.reduce((sum,row)=>sum+row.total,0),7);assert.deepEqual(f.service.finish(f.session(),attempt.id),result);assert.throws(()=>f.service.answer(f.session(),attempt.id,'item1','q1-o1'),rejects(409));assert.throws(()=>f.service.start(f.session(),true),rejects(409));}finally{f.service.db.close();}
});
test('intento vacío produce 0/7 y no un porcentaje inventado',()=>{
 const f=fixture();try {assert.equal(f.service.summary(f.account.profile.id).results.length,0);const attempt=f.service.start(f.session(),true);const result=f.service.finish(f.session(),attempt.id);assert.equal(result.correct,0);assert.equal(result.percentage,0);assert.equal(result.total,7);}finally{f.service.db.close();}
});
test('restricciones SQLite rechazan respuestas cruzadas y cambios a instrumentos asignados',()=>{
 const f=fixture();try {
  const a=f.service.start(f.session(),true);
  assert.throws(()=>f.service.run('INSERT INTO respuesta VALUES (?,?,?,?)',a.id,'item1','q2-o0',1));
  assert.throws(()=>f.service.run("UPDATE pregunta SET enunciado='alterado' WHERE id='q1'"));
  assert.throws(()=>f.service.run("UPDATE opcion_respuesta SET es_correcta=0 WHERE id='q1-o0'"));
  f.service.answer(f.session(),a.id,'item1','q1-o0');f.service.finish(f.session(),a.id);
  assert.throws(()=>f.service.run('DELETE FROM respuesta WHERE id_intento=?',a.id));
 }finally{f.service.db.close();}
});
test('guardado reemplaza respuesta sin duplicarla; reinicio conserva cuenta e intento',()=>{
 const dir=mkdtempSync(join(tmpdir(),'apex-test-'));const path=join(dir,'test.sqlite');let service=new ApexService(path);
 try {const account=service.register(data());service.start(service.session(account.token),true);const a=service.summary(account.profile.id).attempt!;service.answer(service.session(account.token),a.id,'item1','q1-o1');service.answer(service.session(account.token),a.id,'item1','q1-o0');service.db.close();service=new ApexService(path);const resumed=service.login(data().email,data().password);assert.equal(service.start(service.session(resumed.token),true).id,a.id);assert.equal(service.attempt(a.id,account.profile.id).answers.item1,'q1-o0');assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM respuesta').get()!.n,1);}finally{service.db.close();for(const file of readdirSync(dir))unlinkSync(join(dir,file));rmdirSync(dir);}
});
test('servidor exige reautenticación a 90 segundos fuera de evaluación',()=>{
 const f=fixture();try {f.advance(policy.menuIdle);assert.throws(()=>f.session(),rejects(401));}finally{f.service.db.close();}
});
test('evaluación permite más de 90 segundos, bloquea a ocho minutos y conserva respuestas',()=>{
 const f=fixture();try {const a=f.service.start(f.session(),true);f.service.answer(f.session(),a.id,'item1','q1-o0');f.advance(90001);assert(f.session());f.advance(policy.examIdle-90001);assert.throws(()=>f.session(),rejects(401));const next=f.service.login(data().email,data().password);const resumed=f.service.start(f.service.session(next.token),true);assert.equal(resumed.id,a.id);assert.equal(resumed.answers.item1,'q1-o0');}finally{f.service.db.close();}
});
test('cinco fallos bloquean cuatro minutos, incluso usando contraseña correcta',()=>{
 const f=fixture();try {for(let i=0;i<5;i++)assert.throws(()=>f.service.login(data().email,'incorrecta'),rejects(i===4?429:401));assert.throws(()=>f.service.login(data().email,data().password),rejects(429));f.advance(policy.loginLock);assert(f.service.login(data().email,data().password).token);}finally{f.service.db.close();}
});
test('cambio de contraseña verifica identidad y revoca todas las sesiones',()=>{
 const f=fixture();try {assert.throws(()=>f.service.changePassword(f.session(),'incorrecta','Nueva456+'),rejects(401));f.service.changePassword(f.session(),data().password,'Nueva456+');assert.throws(()=>f.session(),rejects(401));assert.throws(()=>f.service.login(data().email,data().password),rejects(401));assert(f.service.login(data().email,'Nueva456+').token);}finally{f.service.db.close();}
});
test('tutor necesita consentimiento y solo usa resultados del propietario',()=>{
 const f=fixture();try {assert.throws(()=>f.service.tutor(f.account.profile.id,'hola',false),rejects(400));const output=f.service.tutor(f.account.profile.id,'hola',true);assert.equal(output.provider,'demo');assert(!JSON.stringify(output).includes(data().email));assert(output.text.includes('no es Gemini'));}finally{f.service.db.close();}
});
test('contrato HTTP: aislamiento, validación JSON, recuperación no simulada y CORS',async()=>{
 const service=new ApexService(),server=makeServer(service);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 try {assert.equal((await fetch(base+'/me')).status,401);assert.equal((await fetch(base+'/health',{headers:{Origin:'https://unknown.example'}})).status,403);assert.equal((await fetch(base+'/auth/register',{method:'POST',body:'[]'})).status,400);assert.equal((await fetch(base+'/auth/recovery',{method:'POST',body:'{}'})).status,503);const registration=await fetch(base+'/auth/register',{method:'POST',body:JSON.stringify(data())});assert.equal(registration.status,200);const {token}=await registration.json() as {token:string};const response=await fetch(base+'/me',{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));service.db.close();}
});
