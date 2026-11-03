import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { passwordChecks, validBirthDate, type Profile, type Registration, type Attempt, type Result, type Breakdown, type Material } from '../shared/contracts';
import { seed } from './seed';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function demand(condition: unknown, status: number, message: string): asserts condition { if (!condition) throw new ApiError(status,message); }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Session = { user_id: string; token_hash: string; last_activity: number; scope: 'menu'|'exam' };
type AttemptRow = { id: string; estado: string; id_evaluacion: string; ultima_actividad: number };
type Identity = { id: string; salt: string; password_hash: string };
export const policy = { menuIdle: 90_000, examIdle: 480_000, loginWindow: 900_000, loginLock: 240_000 };

export class ApexService {
  db: DatabaseSync;
  constructor(path = ':memory:', private now: () => number = Date.now) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    for (const name of ['001_domain.sql','002_local_auth.sql']) this.db.exec(readFileSync(new URL(`./migrations/${name}`,import.meta.url),'utf8'));
    seed(this.db);
    this.db.exec(readFileSync(new URL('./migrations/003_local_integrity.sql',import.meta.url),'utf8'));
  }
  one<T>(sql: string,...args: SQLInputValue[]) { return this.db.prepare(sql).get(...args) as T | undefined; }
  all<T>(sql: string,...args: SQLInputValue[]) { return this.db.prepare(sql).all(...args) as T[]; }
  run(sql: string,...args: SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  validateProfile(data: Omit<Registration,'password'|'consent'>) {
    demand(typeof data.name==='string' && data.name.trim().length>=2 && data.name.length<=100,400,'Escribe tu nombre (2 a 100 caracteres).');
    demand(typeof data.email==='string' && data.email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),400,'Revisa el correo electrónico.');
    demand(typeof data.birthDate==='string' && validBirthDate(data.birthDate),400,'Usa una fecha de nacimiento válida: AAAA-MM-DD.');
    demand(data.program==='demo',400,'Selecciona el programa de demostración.');
    demand(Number.isInteger(data.semester) && data.semester>=1 && data.semester<=20,400,'El semestre de demostración debe estar entre 1 y 20.');
  }
  validatePassword(password: string) {
    demand(typeof password==='string' && password.length<=128 && passwordChecks(password).every(rule=>rule.valid),400,'La contraseña debe cumplir todos los requisitos (máximo 128 caracteres).');
  }
  register(data: Registration) {
    this.validateProfile(data); this.validatePassword(data.password);
    demand(data.consent===true,400,'Debes aceptar el aviso de uso local de datos.');
    const email=data.email.trim().toLowerCase();
    demand(!this.one('SELECT id FROM auth_identity WHERE email=?',email),409,'Ya existe una cuenta con ese correo. Inicia sesión.');
    const id=randomUUID(), salt=randomBytes(16).toString('hex');
    const hash=scryptSync(data.password,salt,64).toString('hex');
    return this.transaction(()=>{
      this.run('INSERT INTO auth_identity VALUES (?,?,?,?)',id,email,salt,hash);
      this.run('INSERT INTO usuario VALUES (?,?,?,?,?,?,?)',id,'local-demo',id,data.name.trim(),email,data.birthDate,'activo');
      this.run('INSERT INTO estudiante VALUES (?,?,?)',id,data.program,data.semester);
      this.run('INSERT INTO consentimiento VALUES (?,?,?,?,?,NULL)',randomUUID(),id,'demostracion-local','local-v1',this.now());
      this.run('INSERT INTO asignacion_evaluacion VALUES (?,?,?)',randomUUID(),id,'diagnostico-v1');
      return this.issueSession(id);
    });
  }
  private verifyPassword(identity: Identity|undefined, password: string) {
    const hash=scryptSync(password,identity?.salt ?? 'apex-dummy-salt',64);
    return !!identity && timingSafeEqual(hash,Buffer.from(identity.password_hash,'hex'));
  }
  private checkCredentials(email: string,password: string) {
    demand(typeof email==='string' && typeof password==='string' && email.length<=254 && password.length<=128,400,'Credenciales inválidas.');
    email=email.trim().toLowerCase();
    const at=this.now();
    const throttle=this.one<{failures:number;window_start:number;locked_until:number}>('SELECT * FROM auth_throttle WHERE email=?',email);
    demand(!throttle || throttle.locked_until<=at,429,'Acceso bloqueado temporalmente. Espera cuatro minutos desde el bloqueo.');
    const identity=this.one<Identity>('SELECT * FROM auth_identity WHERE email=?',email);
    if(!this.verifyPassword(identity,password)) {
      const count=throttle && at-throttle.window_start<policy.loginWindow && !throttle.locked_until ? throttle.failures+1 : 1;
      const start=count===1 ? at : throttle!.window_start;
      this.run('INSERT INTO auth_throttle VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET failures=excluded.failures,window_start=excluded.window_start,locked_until=excluded.locked_until',email,count,start,count>=5?at+policy.loginLock:0);
      throw new ApiError(count>=5?429:401,count>=5?'Cinco intentos fallidos. Acceso bloqueado por cuatro minutos.':'Correo o contraseña incorrectos.');
    }
    demand(this.one('SELECT id FROM usuario WHERE id=? AND estado=?',identity!.id,'activo'),403,'La cuenta no está habilitada.');
    this.run('DELETE FROM auth_throttle WHERE email=?',email);
    return identity!;
  }
  login(email: string,password: string) { return this.issueSession(this.checkCredentials(email,password).id); }
  private issueSession(id: string) {
    const token=randomBytes(32).toString('hex');
    this.run('INSERT INTO auth_session VALUES (?,?,?,?)',digest(token),id,this.now(),'menu');
    return { token, profile:this.profile(id) };
  }
  session(token: string): Session {
    const session=this.one<Session>('SELECT s.* FROM auth_session s JOIN usuario u ON u.id=s.user_id WHERE token_hash=? AND u.estado=?',digest(token),'activo');
    demand(session,401,'Inicia sesión para continuar.');
    if(this.now()-session.last_activity >= (session.scope==='exam'?policy.examIdle:policy.menuIdle)) {
      this.run('DELETE FROM auth_session WHERE token_hash=?',session.token_hash);
      throw new ApiError(401,'Sesión bloqueada por inactividad. Vuelve a ingresar; tus respuestas confirmadas se conservan.');
    }
    return session;
  }
  activity(session: Session, scope?: 'menu'|'exam') {
    if(scope==='exam') demand(this.one("SELECT i.id FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=? AND i.estado='activo'",session.user_id),409,'No hay una evaluación activa.');
    this.run('UPDATE auth_session SET last_activity=?,scope=? WHERE token_hash=?',this.now(),scope??session.scope,session.token_hash);
    if((scope??session.scope)==='exam') this.run("UPDATE intento SET ultima_actividad=? WHERE estado='activo' AND id_asignacion IN (SELECT id FROM asignacion_evaluacion WHERE id_estudiante=?)",this.now(),session.user_id);
  }
  logout(session: Session) { this.run('DELETE FROM auth_session WHERE token_hash=?',session.token_hash); }
  profile(id: string): Profile {
    const row=this.one<Profile>('SELECT u.id,u.nombre AS name,u.correo AS email,u.fecha_nacimiento AS birthDate,e.id_programa AS program,e.semestre AS semester FROM usuario u JOIN estudiante e ON e.id_usuario=u.id WHERE u.id=?',id);
    demand(row,409,'Perfil pendiente. Contacta al responsable de la demostración.'); return row;
  }
  updateProfile(id: string,data: Omit<Registration,'password'|'consent'>) {
    const old=this.profile(id); this.validateProfile({...data,email:old.email});
    this.transaction(()=>{this.run('UPDATE usuario SET nombre=?,fecha_nacimiento=? WHERE id=?',data.name.trim(),data.birthDate,id);this.run('UPDATE estudiante SET semestre=? WHERE id_usuario=?',data.semester,id);});
    return this.profile(id);
  }
  changePassword(session: Session,current: string,next: string) {
    this.validatePassword(next);
    this.checkCredentials(this.profile(session.user_id).email,current);
    const salt=randomBytes(16).toString('hex');
    const hash=scryptSync(next,salt,64).toString('hex');
    this.transaction(()=>{ this.run('UPDATE auth_identity SET salt=?,password_hash=? WHERE id=?',salt,hash,session.user_id); this.run('DELETE FROM auth_session WHERE user_id=?',session.user_id); });
  }
  private owned(id: string,user: string) {
    const row=this.one<AttemptRow>('SELECT i.*,a.id_evaluacion FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=? AND a.id_estudiante=?',id,user);
    demand(row,404,'No se encontró el intento para tu cuenta.'); return row;
  }
  start(session: Session,confirmed: boolean): Attempt {
    demand(confirmed===true,400,'Confirma las condiciones antes de iniciar.');
    const assignment=this.one<{id:string}>("SELECT a.id FROM asignacion_evaluacion a JOIN estudiante e ON e.id_usuario=a.id_estudiante JOIN programa_componente pc ON pc.id_programa=e.id_programa JOIN evaluacion_componente ec ON ec.id_componente=pc.id_componente AND ec.id_evaluacion=a.id_evaluacion WHERE a.id_estudiante=? AND a.id_evaluacion='diagnostico-v1'",session.user_id);
    demand(assignment,403,'No tienes esta evaluación asignada.');
    this.run("INSERT INTO intento VALUES (?,?, 'activo',?,?,NULL) ON CONFLICT(id_asignacion) DO NOTHING",randomUUID(),assignment.id,this.now(),this.now());
    const attempt=this.one<{id:string;estado:string}>('SELECT id,estado FROM intento WHERE id_asignacion=?',assignment.id)!;
    demand(attempt.estado==='activo',409,'Ya finalizaste esta evaluación. Consulta tu resultado.');
    this.activity(session,'exam');
    return this.attempt(attempt.id,session.user_id);
  }
  attempt(id: string,user: string): Attempt {
    const row=this.owned(id,user);
    const questions=this.all<{id:string;text:string;nucleus:string;competency:string;question:string}>('SELECT it.id,p.enunciado AS text,n.nombre AS nucleus,c.nombre AS competency,p.id AS question FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia WHERE it.id_evaluacion=? ORDER BY it.orden',row.id_evaluacion);
    return {id,status:row.estado,lastActivity:row.ultima_actividad,questions:questions.map(({question,...q})=>({...q,options:this.all<{id:string;text:string}>('SELECT id,texto AS text FROM opcion_respuesta WHERE id_pregunta=? ORDER BY orden',question)})),answers:Object.fromEntries(this.all<{id_item:string;id_opcion:string|null}>('SELECT id_item,id_opcion FROM respuesta WHERE id_intento=?',id).map(r=>[r.id_item,r.id_opcion]))};
  }
  answer(session: Session,id: string,item: string,option: string|null) {
    demand(typeof item==='string' && (typeof option==='string' || option===null),400,'Indica una pregunta y una opción válida o nula.');
    const row=this.owned(id,session.user_id);
    demand(session.scope==='exam',409,'Retoma la evaluación antes de responder.');
    demand(row.estado==='activo',409,'El intento ya está finalizado.');
    demand(this.now()-row.ultima_actividad<policy.examIdle,409,'Retoma el intento tras el bloqueo por inactividad.');
    const question=this.one<{id_pregunta:string}>('SELECT id_pregunta FROM item_evaluacion WHERE id=? AND id_evaluacion=?',item,row.id_evaluacion);
    demand(question,400,'La pregunta no pertenece a esta evaluación.');
    demand(option===null || (typeof option==='string' && this.one('SELECT id FROM opcion_respuesta WHERE id=? AND id_pregunta=?',option,question.id_pregunta)),400,'La opción no pertenece a la pregunta.');
    this.run('INSERT INTO respuesta VALUES (?,?,?,?) ON CONFLICT(id_intento,id_item) DO UPDATE SET id_opcion=excluded.id_opcion,guardada_en=excluded.guardada_en',id,item,option,this.now());
    this.activity(session); return {savedAt:this.now(),option};
  }
  finish(session: Session,id: string): Result {
    const row=this.owned(id,session.user_id);
    if(row.estado==='finalizado') return this.result(id,session.user_id);
    demand(session.scope==='exam' && this.now()-row.ultima_actividad<policy.examIdle,409,'Retoma la evaluación antes de finalizar.');
    this.transaction(()=>{
      const score=this.one<{total:number;correct:number}>('SELECT COUNT(*) AS total, SUM(CASE WHEN o.es_correcta=1 THEN 1 ELSE 0 END) AS correct FROM item_evaluacion it LEFT JOIN respuesta r ON r.id_item=it.id AND r.id_intento=? LEFT JOIN opcion_respuesta o ON o.id=r.id_opcion WHERE it.id_evaluacion=?',id,row.id_evaluacion)!;
      this.run('INSERT INTO resultado VALUES (?,?,?,?,?)',id,this.now(),score.correct,score.total,'aciertos-v1');
      this.run("UPDATE intento SET estado='finalizado',finalizado_en=? WHERE id=?",this.now(),id);
      this.activity(session,'menu');
    });
    return this.result(id,session.user_id);
  }
  result(id: string,user: string): Result {
    this.owned(id,user);
    const row=this.one<Omit<Result,'nuclei'|'competencies'>>('SELECT id_intento AS attemptId,aciertos AS correct,total_preguntas AS total,porcentaje AS percentage,calculado_en AS completedAt,version_regla AS rule FROM v_historial_academico WHERE id_intento=? AND id_estudiante=?',id,user);
    demand(row,409,'La evaluación todavía no tiene resultado.');
    const breakdown=(view: string)=>this.all<Breakdown>(`SELECT etiqueta AS label,aciertos AS correct,total,100.0*aciertos/total AS percentage FROM ${view} WHERE id_intento=? AND id_estudiante=?`,id,user);
    return {...row,nuclei:breakdown('v_progreso_nucleo'),competencies:breakdown('v_progreso_competencia')};
  }
  summary(user: string) {
    const attempt=this.one<{id:string;status:string}>('SELECT i.id,i.estado AS status FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=?',user)??null;
    const results=this.all<{id_intento:string}>('SELECT id_intento FROM v_historial_academico WHERE id_estudiante=? ORDER BY calculado_en',user).map(r=>this.result(r.id_intento,user));
    return {profile:this.profile(user),attempt,results};
  }
  materials(user: string): Material[] {
    return this.all<Material>('SELECT m.id,m.titulo AS title,m.contenido AS body,n.nombre AS nucleus,f.titulo AS source FROM material_estudio m JOIN fuente f ON f.id=m.id_fuente JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo JOIN programa_componente pc ON pc.id_componente=n.id_componente JOIN estudiante e ON e.id_programa=pc.id_programa WHERE e.id_usuario=?',user);
  }
  tutor(user: string,message: string,consent: boolean) {
    demand(consent===true,400,'Autoriza el uso de tus métricas para esta consulta de demostración.');
    demand(typeof message==='string' && message.trim().length>0 && message.length<=1000,400,'Escribe una consulta de hasta 1.000 caracteres.');
    const result=this.summary(user).results.at(-1);
    const weakest=result?.nuclei.toSorted((a,b)=>a.percentage-b.percentage)[0];
    const material=this.materials(user).find(m=>m.nucleus===weakest?.label)??this.materials(user)[0]!;
    return {provider:'demo',text:`Respuesta de demostración por reglas; no es Gemini. ${weakest?`Tu resultado guardado en ${weakest.label} es ${weakest.correct}/${weakest.total}. `:'Completa el diagnóstico para orientar el estudio. '}Te propongo leer «${material.title}», resolver su ejemplo y explicar cada operación con tus palabras. Esta versión no interpreta libremente tu mensaje.`,materialId:material.id,source:material.source};
  }
}
