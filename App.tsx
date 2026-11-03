import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { passwordChecks,validBirthDate,type Attempt,type Material,type Result,type SectionLocation,type Summary,type TechnicalAssessment } from './shared/contracts';
import {request,RequestError,type AuthResponse} from './src/api';
import {configured,supabase,watchAuthLinks} from './src/supabase';
import {TeacherInvitationAcceptance} from './src/TeacherInvitationAcceptance';
import type {TeacherInvitationLink} from './src/supabase';
import {StaffPanel} from './src/StaffPanel';
import {AdminNavigation,adminTitle,useAdminNavigation} from './src/AdminNavigation';
import {TeacherPanel} from './src/TeacherPanel';
import {QuestionDocument} from './src/QuestionDocument';
import {Button,Card,Check,Confirm,Field,colors,styles as s,type Confirmation} from './src/ui';
import BirthDateField from './src/BirthDateField';
import {LearningRoute} from './src/LearningRoute';
import {LearningSection} from './src/LearningSection';
import {ContextChat,type ChatTarget} from './src/ContextChat';
import {primaryAssignments,primaryResults} from './src/mvp';
import {formatTime,timeConditions} from './src/assessmentTime';
import {useAssessmentClock} from './src/useAssessmentClock';
import {TechnicalAssessmentCard} from './src/TechnicalAssessmentCard';

type Page='dashboard'|'assessment'|'exam'|'result'|'progress'|'study'|'section'|'tutor'|'profile'|'help';
const navigation:[Page,string,string][]=[['dashboard','◈','Inicio'],['study','▤','Mi ruta'],['assessment','▣','Diagnóstico'],['progress','↗','Mi progreso'],['tutor','✧','Tutor IA'],['profile','○','Editar perfil'],['help','?','Ayuda']];
type Auth=AuthResponse;
const blank={name:'',email:'',birthDate:'',semester:'1',program:'',password:'',confirm:'',consent:false};

function AppContent() {
  const {width}=useWindowDimensions(); const wide=width>=900;
  const [auth,setAuth]=useState<Auth|null>(null),[authPage,setAuthPage]=useState<'login'|'register'|'recovery'|'reset'|'invite'|'help'>('login');
  const [invitationLink,setInvitationLink]=useState<TeacherInvitationLink|null>(null);
  const [form,setForm]=useState(blank),[showPassword,setShowPassword]=useState(false);
  const [page,setPage]=useState<Page>('dashboard'),[summary,setSummary]=useState<Summary|null>(null);
  const [attempt,setAttempt]=useState<Attempt|null>(null),[index,setIndex]=useState(0),[selected,setSelected]=useState<string|null>(null),[saved,setSaved]=useState('');
  const [result,setResult]=useState<Result|null>(null),[materials,setMaterials]=useState<Material[]>([]);
  const [serverExpired,setServerExpired]=useState(false),acceptedResult=useRef<string|null>(null);
  const [chatTarget,setChatTarget]=useState<ChatTarget|null>(null);
  const [sectionLocation,setSectionLocation]=useState<SectionLocation|null>(null);
  const [routeExpandedLevel,setRouteExpandedLevel]=useState<number|null|undefined>(undefined);
  const mainScroll=useRef<ScrollView>(null),routeScrollY=useRef(0),restoreRouteScroll=useRef(false),leavingRoute=useRef(false);
  const mainScrollY=useRef(0);
  const adminNavigation=useAdminNavigation(summary?.profile.role==='administrador'?summary.profile.id:null,page==='dashboard'&&summary?.profile.role==='administrador',()=>mainScroll.current?.scrollTo({y:0,animated:false}));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(true),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [idle,setIdle]=useState(0);
  const [programs,setPrograms]=useState<{id:string;name:string}[]>([]);
  const [profile,setProfile]=useState({name:'',semester:'1',program:''}),[profileConsent,setProfileConsent]=useState(false),[currentPassword,setCurrentPassword]=useState(''),[nextPassword,setNextPassword]=useState('');
  const lastActivity=useRef(Date.now()),lastSent=useRef(Date.now()),foreground=useRef(true),activityInFlight=useRef(false),busyRef=useRef(false);
  const touch=()=>{lastActivity.current=Date.now();};
  const clearSession=()=>{acceptedResult.current=null;setServerExpired(false);setAuth(null);setSummary(null);setAttempt(null);setMaterials([]);setChatTarget(null);setSectionLocation(null);setRouteExpandedLevel(undefined);routeScrollY.current=0;restoreRouteScroll.current=false;setConfirmation(null);setResult(null);setCurrentPassword('');setNextPassword('');setPage('dashboard');setAuthPage('login');setForm(blank);if(Platform.OS==='web'&&(window.location.hash.startsWith('#mi-ruta/')||window.location.hash.startsWith('#profesor')||window.location.hash.startsWith('#administracion')))window.history.replaceState(null,'',window.location.pathname+window.location.search);};
  function fail(err:unknown) {
    const message=err instanceof Error?err.message:'No se pudo completar la operación.';
    if(err instanceof RequestError&&err.details?.code==='ATTEMPT_SUSPENDED'){
      setAttempt(null);setSelected(null);setConfirmation(null);setServerExpired(false);setPage('assessment');setError(message);
      void load().catch(fail);return;
    }
    if(err instanceof RequestError&&(err.details?.code==='TECHNICAL_ACCESS_REVOKED'||err.status===403&&page==='exam'&&attempt?.technical)){
      setSummary(previous=>previous?{...previous,technicalAssessment:null}:previous);
      setAttempt(previous=>previous?.technical?null:previous);setResult(previous=>previous?.technical?null:previous);
      if(page==='exam'&&attempt?.technical||page==='result'&&result?.technical){setConfirmation(null);setServerExpired(false);setPage('dashboard');}
      else setConfirmation(previous=>previous&&/prueba técnica/i.test(previous.title)?null:previous);
      setError(message);return;
    }
    if(err instanceof RequestError&&err.details?.code==='ATTEMPT_EXPIRED'){
      setServerExpired(true);setSaved('La última selección no se guardó: terminó el plazo.');setConfirmation(null);
      if(err.details.result)void acceptResult(err.details.result);else setError(message);
      return;
    }
    if(err instanceof RequestError) {if(err.status===0)setOnline(false);if(err.status===401 && auth)clearSession();}
    setError(message);
  }
  async function perform(operation:()=>Promise<void>) {
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError('');
    try {await operation();} catch(err) {fail(err);} finally {busyRef.current=false;setBusy(false);}
  }
  async function load(token=auth?.token) {if(!token)return;const data=await request<Summary>('/me',token);setSummary(data);setProfile({name:data.profile.name,semester:String(data.profile.semester),program:data.profile.program});setProfileConsent(false);}
  async function acceptResult(data:Result){
    const alreadyAccepted=acceptedResult.current===data.attemptId;
    acceptedResult.current=data.attemptId;setResult(data);setAttempt(null);setConfirmation(null);setError('');setPage('result');touch();
    if(alreadyAccepted)return;
    // Auto grading does not renew Auth. Enter menu explicitly after receiving a real result.
    try{await request('/activity',auth?.token,'POST',{scope:'menu'});await load();}catch(err){fail(err);}
  }
  const assessmentTime=useAssessmentClock({attempt,enabled:page==='exam',online,busy,expiredFromServer:serverExpired,onResult:data=>void acceptResult(data),onError:fail});
  // Only an explicitly assigned technical assessment is polled. Reads do not renew activity.
  // During an exam the existing clock polling already enforces withdrawal.
  useEffect(()=>{
    if(!auth||!summary?.technicalAssessment||!online||page==='exam')return;
    let alive=true,inFlight=false;const refresh=async()=>{
      if(!alive||inFlight||!foreground.current)return;inFlight=true;
      try{const data=await request<TechnicalAssessment>('/technical-assessment',auth.token);if(alive)setSummary(previous=>previous?{...previous,technicalAssessment:data}:previous);}catch(err){if(alive)fail(err);}finally{inFlight=false;}
    };
    const timer=setInterval(()=>void refresh(),15000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
    if(Platform.OS==='web')window.addEventListener('focus',refresh);
    void refresh();return()=>{alive=false;clearInterval(timer);subscription.remove();if(Platform.OS==='web')window.removeEventListener('focus',refresh);};
  },[auth?.token,summary?.technicalAssessment?.id,online,page]);
  async function signedIn(value:Auth) {if(value.invitationRequired){setForm(blank);setAuthPage('invite');return;}if(value.confirmationRequired){setAuthPage('login');setForm(blank);setError('Revisa tu correo y confirma la cuenta. Tus datos de registro están guardados. Luego inicia sesión para acceder a tu diagnóstico.');return;}setAuth(value);setForm(blank);setError('');setPage('dashboard');touch();lastSent.current=Date.now();await load(value.token);if(Platform.OS==='web'&&value.profile.role==='estudiante'){const match=window.location.hash.match(/^#mi-ruta\/([1-3])\/([1-7])$/);if(match){setSectionLocation({level:Number(match[1]),order:Number(match[2])});setRouteExpandedLevel(Number(match[1]));setPage('section');}}}
  useEffect(()=>{
    let alive=true;const check=()=>request<{programs:{id:string;name:string}[]}>('/catalog').then(data=>{if(alive){setOnline(true);setPrograms(data.programs);}}).catch(()=>{if(alive)setOnline(false);});
    void check();const timer=setInterval(check,5000);return()=>{alive=false;clearInterval(timer);};
  },[]);
  useEffect(()=>{
    const recovery=()=>{setAuth(null);setForm(blank);setAuthPage('reset');setError('Enlace validado. Establece tu nueva contraseña.');};
    const listener=supabase?.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recovery();});
    const unwatch=watchAuthLinks(recovery,fail,link=>{setInvitationLink(link);setError('Inicia sesión con la cuenta destinataria para revisar y aceptar la invitación.');});
    return()=>{listener?.data.subscription.unsubscribe();unwatch();};
  },[]);
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{foreground.current=state==='active';});
    if(Platform.OS==='web') {window.addEventListener('keydown',touch);window.addEventListener('pointerdown',touch);window.addEventListener('mousemove',touch);}
    return()=>{subscription.remove();if(Platform.OS==='web'){window.removeEventListener('keydown',touch);window.removeEventListener('pointerdown',touch);window.removeEventListener('mousemove',touch);}};
  },[]);
  useEffect(()=>{
    if(!auth)return;
    const timer=setInterval(()=>{
      const elapsed=Date.now()-lastActivity.current;setIdle(elapsed);
      if(elapsed>=(page==='exam'?480000:90000)) {void request('/auth/logout',auth.token,'POST').catch(()=>{});clearSession();setError('Sesión bloqueada por inactividad. Ingresa de nuevo; tus respuestas confirmadas se conservan.');return;}
      if(foreground.current && online && !activityInFlight.current && lastActivity.current>lastSent.current && Date.now()-lastSent.current>=10000) {
        activityInFlight.current=true;const sent=lastActivity.current;
        void request('/activity',auth.token,'POST',{}).then(()=>{lastSent.current=sent;}).catch(fail).finally(()=>{activityInFlight.current=false;});
      }
    },1000);return()=>clearInterval(timer);
  },[auth,page,online]);
  useEffect(()=>{setSelected(attempt?.answers[attempt.questions[index]?.id??'']??null);setSaved('');},[index,attempt?.id]);
  useEffect(()=>{
    if(!['exam','section','tutor'].includes(page))return;
    const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(page==='section')backToRoute();else if(page==='tutor'&&chatTarget?.kind==='section'&&sectionLocation)navigate('section');else if(page==='exam')navigate('dashboard');else return false;return true;});
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    if(Platform.OS==='web'&&page==='exam')window.addEventListener('beforeunload',prevent);
    return()=>{sub.remove();if(Platform.OS==='web')window.removeEventListener('beforeunload',prevent);};
  },[page,auth,busy,chatTarget,sectionLocation]);
  useEffect(()=>{
    if(Platform.OS!=='web'||!auth)return;
    const pop=(event:PopStateEvent)=>{
      const location=event.state?.apexSection as SectionLocation|undefined;
      if(location&&Number.isInteger(location.level)&&location.level>=1&&location.level<=3&&Number.isInteger(location.order)&&location.order>=1&&location.order<=7){setSectionLocation(location);navigate('section');}
      else if(page==='section'||page==='tutor'&&chatTarget?.kind==='section')navigate('study');
    };
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[auth,page,busy,chatTarget]);

  function navigate(target:Page,location?:SectionLocation) {
    if(busy)return;
    if(summary?.profile.role&&summary.profile.role!=='estudiante'&&!['dashboard','profile','help'].includes(target))return;
    const go=()=>void perform(async()=>{
      if(!auth)return;
      await request('/activity',auth.token,'POST',{scope:'menu'});touch();
      if(target==='study'){
        setMaterials(await request<Material[]>('/materials',auth.token));
        const returning=page==='section'||page==='tutor'&&chatTarget?.kind==='section';
        if(!returning&&page!=='study'){setRouteExpandedLevel(undefined);routeScrollY.current=0;}
        leavingRoute.current=false;
        restoreRouteScroll.current=returning;
      }
      if(['dashboard','progress','assessment','profile'].includes(target))await load();
      if(target==='section'&&location){
        if(page==='study'){
          // Web may deliver its last scroll event after this ScrollView is unmounted.
          if(Platform.OS==='web')routeScrollY.current=mainScroll.current?.getScrollableNode()?.scrollTop??routeScrollY.current;
          leavingRoute.current=true;
        }
        setSectionLocation(location);
        if(Platform.OS==='web')window.history.pushState({apexSection:location},'',`#mi-ruta/${location.level}/${location.order}`);
      }else if(Platform.OS==='web'&&target!=='section'&&target!=='tutor'&&window.location.hash.startsWith('#mi-ruta/'))window.history.replaceState(null,'',window.location.pathname+window.location.search);
      setPage(target);
    });
    if(page==='exam')setConfirmation({title:'¿Volver al menú?',body:'Se conservan las respuestas confirmadas. La selección que aún no hayas guardado se perderá. Podrás retomar el mismo intento. El reloj de un control o examen final sigue avanzando.',confirmLabel:'Confirmar salida al menú',onConfirm:go});else go();
  }
  function backToRoute(){if(busy)return;if(Platform.OS==='web'&&window.history.state?.apexSection)window.history.back();else navigate('study');}
  function restoreRoutePosition(){
    if(!restoreRouteScroll.current)return;
    requestAnimationFrame(()=>{
      if(!restoreRouteScroll.current)return;
      mainScroll.current?.scrollTo({y:routeScrollY.current,animated:false});
      restoreRouteScroll.current=false;
    });
  }
  function begin(assignmentId?:string) {
    const assignment=summary?.technicalAssessment&&summary.technicalAssessment.id===assignmentId?summary.technicalAssessment:summary?.assignments?.find(a=>a.id===assignmentId);
    if(assignment&&'technical' in assignment&&assignment.technical){setConfirmation({title:assignment.title,body:'10 preguntas del banco · 15 minutos · Un único intento. No afecta tu progreso ni reemplaza tu diagnóstico. Necesitas conexión para confirmar respuestas. Se mantienen el bloqueo a los 8 minutos de inactividad y la recuperación del mismo intento.',confirmLabel:'Entiendo las condiciones',onConfirm:()=>setConfirmation({title:'¿Iniciar la prueba técnica?',body:'El reloj comienza al crear el intento y no se reinicia al retomar. Cerrar la app no pausa el plazo. Al vencer, el servidor entrega las respuestas confirmadas. El resultado se conserva como evidencia técnica.',confirmLabel:'Sí, iniciar prueba técnica',onConfirm:()=>start(assignmentId)})});return;}
    const kind=assignment?.kind==='control'?'control':assignment?.kind==='final'?'examen final':'diagnóstico';
    setConfirmation({title:'Antes de empezar',body:`${assignment?.count??7} preguntas del instrumento asignado. ${timeConditions(assignment)} Bloqueo de sesión a los 8 minutos de inactividad. ${assignment?.retryPolicy==='linked-review-v2'?'Un nuevo intento después de reprobar requiere completar el repaso vinculado.':'Esta evaluación conserva un único intento.'} Necesitas conexión para confirmar respuestas.`,confirmLabel:'Entiendo las condiciones',onConfirm:()=>setConfirmation({title:`¿Iniciar el ${kind}?`,body:'El tiempo comienza al crear el intento. Volver al menú, cerrar sesión o perder conexión no pausa el reloj. Puedes volver a preguntas anteriores y retomar las respuestas confirmadas. El resultado es un porcentaje de aciertos, no un puntaje oficial.',confirmLabel:`Sí, iniciar ${kind}`,onConfirm:()=>start(assignmentId)})});
  }
  function start(assignmentId?:string) {void perform(async()=>{const assigned=assignmentId??primaryAssignments(summary).find(a=>a.status!=='finalizado')?.id;if(!assigned)throw Error('No tienes un diagnóstico pendiente.');const previous=summary?.technicalAssessment?.id===assigned?summary.technicalAssessment:summary?.assignments?.find(a=>a.id===assigned);const data=await request<Attempt>('/attempts/start',auth!.token,'POST',{confirmed:true,assignmentId:assigned,...(previous?.status==='activo'&&previous.attemptId?{resumeAttemptId:previous.attemptId}:{})});if(data.status==='finalizado'){if(data.result)await acceptResult(data.result);else{await load();setPage('progress');}return;}acceptedResult.current=null;setServerExpired(false);setAttempt(data);setIndex(0);setSelected(data.answers[data.questions[0]!.id]??null);setSaved('');touch();setPage('exam');});}
  function logout() {setConfirmation({title:'¿Cerrar sesión?',body:'Tus resultados y respuestas confirmadas quedarán guardados en Supabase.',confirmLabel:'Cerrar sesión',onConfirm:()=>void perform(async()=>{await request('/auth/logout',auth!.token,'POST');clearSession();})});}
  const title=summary?.profile.role==='administrador'&&page==='dashboard'?adminTitle(adminNavigation.location):navigation.find(n=>n[0]===page)?.[2]??(page==='exam'?'Evaluación en curso':page==='section'?'Mi ruta · Sección':'Tu resultado');
  const disabled=busy||!online;
  const examDisabled=disabled||serverExpired||assessmentTime.blocked;
  const currentAssignments=primaryAssignments(summary),currentResults=primaryResults(summary);
  const lastResult=currentResults.at(-1);
  const pending=currentAssignments.find(a=>a.status!=='finalizado');
  const displayedAssignments=[...currentAssignments,...(summary?.assignments??[]).filter(item=>!currentAssignments.includes(item))];
  const student=(summary?.profile.role??'estudiante')==='estudiante';
  const administrator=(summary?.profile.role??auth?.profile.role)==='administrador';
  const technicalCard=student&&summary?.technicalAssessment?<TechnicalAssessmentCard assessment={summary.technicalAssessment} disabled={disabled} onBegin={()=>begin(summary.technicalAssessment!.id)} onResume={()=>start(summary.technicalAssessment!.id)}/>:null;
  const availableNavigation=student?navigation:navigation.filter(([id])=>['dashboard','profile','help'].includes(id));
  const activeNavigation=page==='section'?'study':page;
  const openChat=(target:ChatTarget)=>{setChatTarget(target);navigate('tutor');};

  const help=<View style={s.stack}><Text style={s.tag}>ESTAMOS PARA ACOMPAÑARTE</Text><Text style={s.title}>Un paso a la vez</Text><Card><Text style={s.heading}>¿Qué puedo probar?</Text><Text style={s.text}>Crea una cuenta de prueba, completa el diagnóstico, consulta tu resultado y estudia los materiales. APEX te ayuda a preparar tu aprendizaje.</Text><Text style={s.heading}>¿Es una prueba oficial?</Text><Text style={s.text}>No. El banco de prueba opcional usa preguntas propias identificadas como demostración. No se calcula un puntaje oficial ICFES.</Text><Text style={s.heading}>¿Qué pasa si pierdo la conexión?</Text><Text style={s.text}>Se bloquean las nuevas respuestas. Al reconectar, recupera el mismo intento. Solo las respuestas confirmadas por el servidor están guardadas.</Text><Text style={s.heading}>¿Por qué se bloquea mi sesión?</Text><Text style={s.text}>Fuera de la evaluación, tras 90 segundos de inactividad. En todas las evaluaciones se avisa a los 5 minutos, inicia una cuenta atrás a los 7 y se bloquea a los 8. El bloqueo de sesión no pausa el reloj ni impide la entrega automática. Leer sin tocar la pantalla no se interpreta como fraude.</Text><Text style={s.heading}>Datos de demostración</Text><Text style={s.text}>Usa información ficticia. Los perfiles y resultados se conservan en tu proyecto Supabase. Auth gestiona el acceso y la recuperación por correo. El tutor IA y la eliminación de cuenta están pendientes.</Text></Card></View>;

  const authView=<View style={{flex:1,justifyContent:'center',padding:wide?48:20,backgroundColor:'#E9EEF4'}}><View style={{width:'100%',maxWidth:1060,alignSelf:'center',flexDirection:wide?'row':'column',borderRadius:22,overflow:'hidden',backgroundColor:'#fff'}}>
    <View style={{flex:wide?0.85:undefined,backgroundColor:colors.primary,padding:wide?44:24,gap:22,justifyContent:'center'}}><Text style={{color:'#DCEAE4',fontSize:17,fontWeight:'700',letterSpacing:4}}>◈ APEX</Text><Text style={{color:'#fff',fontSize:wide?40:28,fontWeight:'700',lineHeight:wide?49:36}}>Tu próximo paso{wide?'\n':' '}empieza aquí.</Text><Text style={{color:'#E4ECF5',fontSize:17,lineHeight:28}}>Conoce tus fortalezas. Encuentra qué practicar. Avanza a tu ritmo.</Text>{wide&&<View style={{gap:20,marginTop:24}}>{['01   Descubre tu punto de partida','02   Estudia con intención','03   Observa tu progreso'].map(t=><Text key={t} style={{color:'#fff',fontSize:15}}>{t}</Text>)}</View>}<Text style={{color:'#DCEAE4',fontSize:12,marginTop:12}}>PREPARACIÓN SABER PRO · APEX</Text></View>
    <View style={{flex:1,padding:wide?40:24,gap:20}}>
      {authPage==='invite'?<TeacherInvitationAcceptance onAccepted={async()=>{await supabase?.auth.signOut();clearSession();setError('Invitación aceptada. Inicia sesión para acceder como Profesor.');}} onClose={()=>{setAuthPage('login');void supabase?.auth.signOut();}}/>:authPage==='help'?help:<><Text style={s.tag}>BIENVENIDO A APEX</Text><Text accessibilityRole="header" style={s.title}>{authPage==='register'?'Crea tu cuenta':authPage==='recovery'?'Recupera tu acceso':authPage==='reset'?'Nueva contraseña':'Retoma tu aprendizaje'}</Text><Text style={s.muted}>{authPage==='register'?'Registro de estudiante con Supabase Auth.':authPage==='recovery'?'Te enviaremos un enlace para recuperar tu acceso.':authPage==='reset'?'El enlace de correo verifica tu identidad.':'Ingresa con tu cuenta.'}</Text>
      {authPage==='register'&&<><Field label="Nombre" value={form.name} onChangeText={name=>setForm({...form,name})}/><BirthDateField value={form.birthDate} onChange={birthDate=>setForm({...form,birthDate})}/><Text style={s.muted}>Carrera</Text>{programs.map(p=><Button key={p.id} secondary={form.program!==p.id} label={p.name} onPress={()=>setForm({...form,program:p.id})}/>)}{!programs.length&&<Text style={s.notice}>Aún no hay programas configurados.</Text>}<Field label="Semestre" value={form.semester} keyboardType="number-pad" onChangeText={semester=>setForm({...form,semester})}/></>}
      {authPage!=='reset'&&<Field label="Correo electrónico" value={form.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onChangeText={email=>setForm({...form,email})}/>}
      {authPage!=='recovery'&&<><Field label="Contraseña" value={form.password} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete={authPage==='register'?'new-password':'current-password'} onChangeText={password=>setForm({...form,password})}/><Button secondary label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} onPress={()=>setShowPassword(!showPassword)}/></>}
      {(authPage==='register'||authPage==='reset')&&<><View>{passwordChecks(form.password).map(rule=><Text key={rule.label} style={[s.muted,{color:rule.valid?colors.accent:colors.muted}]}>{rule.valid?'✓':'○'} {rule.label}</Text>)}</View><Field label="Confirmar contraseña" secureTextEntry={!showPassword} value={form.confirm} onChangeText={confirm=>setForm({...form,confirm})}/>{authPage==='register'&&<Check label="Acepto guardar mi perfil y resultados para usar APEX. Aviso apex-v1; no se envían datos a IA externa en esta entrega." value={form.consent} onChange={consent=>setForm({...form,consent})}/>}</>}
      <Button disabled={disabled} label={busy?'Procesando…':authPage==='register'?'Crear cuenta de estudiante':authPage==='recovery'?'Enviar enlace de recuperación':authPage==='reset'?'Guardar nueva contraseña':'Iniciar sesión'} onPress={()=>void perform(async()=>{
        if(authPage==='recovery'){await request('/auth/recovery',undefined,'POST',{email:form.email});setError('Si existe una cuenta con ese correo, recibirás un enlace de recuperación.');return;}
        if(authPage==='reset'){if(form.password!==form.confirm)throw Error('Las contraseñas no coinciden.');const result=await request<{invitationRequired?:boolean}>('/auth/reset-password',undefined,'POST',{password:form.password});if(result.invitationRequired){setForm(blank);setAuthPage('invite');setError('Acceso configurado. Revisa y acepta la invitación para recibir el rol Profesor.');return;}clearSession();setError('Contraseña actualizada. Inicia sesión.');return;}
        if(authPage==='register') {
          if(form.password!==form.confirm)throw Error('Las contraseñas no coinciden.');
          if(!validBirthDate(form.birthDate))throw Error('Revisa la fecha de nacimiento. Usa AAAA-MM-DD.');
          if(!form.consent||!form.program)throw Error('Selecciona tu programa y acepta el aviso.');
          await signedIn(await request<Auth>('/auth/register',undefined,'POST',{...form,semester:Number(form.semester)}));
        }else await signedIn(await request<Auth>('/auth/login',undefined,'POST',{email:form.email,password:form.password}));
      })}/></>}
      <View style={s.row}>{authPage!=='login'&&<Button secondary label="Volver al acceso" onPress={()=>{setAuthPage('login');setError('');}}/>}{authPage==='login'&&<><Button secondary label="Crear una cuenta" onPress={()=>{setAuthPage('register');setError('');}}/><Button secondary label="Olvidé mi contraseña" onPress={()=>{setAuthPage('recovery');setError('');}}/></>}<Button secondary label={authPage==='help'?'Iniciar sesión':'Ayuda y privacidad'} onPress={()=>setAuthPage(authPage==='help'?'login':'help')}/></View>
    </View></View></View>;

  const showResult=(value:Result)=><View style={s.stack}><Card><Text style={s.tag}>EVALUACIÓN COMPLETADA</Text><Text style={s.title}>{value.technical?value.title:'Tu resultado'}</Text><Text style={{fontSize:52,fontWeight:'700',color:colors.primary}}>{Math.round(value.percentage)} %</Text><Text style={s.text}>{value.correct} {value.correct===1?'acierto':'aciertos'} de {value.total} preguntas</Text><Text style={s.muted}>Las preguntas sin responder cuentan en el total. Regla: {value.rule}. No es un puntaje oficial ICFES ni una clasificación de nivel.</Text></Card>{!value.technical&&([['Por núcleo temático',value.nuclei],['Por competencia',value.competencies]] as const).map(([heading,rows])=><Card key={heading}><Text style={s.heading}>{heading}</Text>{rows.map(row=><View key={row.label} style={{gap:8}}><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.text}>{row.label}</Text><Text style={s.muted}>{row.correct}/{row.total} · {Math.round(row.percentage)} %</Text></View><View style={{height:8,borderRadius:8,backgroundColor:'#E7EEF1'}}><View style={{width:`${row.percentage}%`,height:8,borderRadius:8,backgroundColor:colors.accent}}/></View></View>)}</Card>)}</View>;

  let content:React.ReactNode;
  if(page==='dashboard') content=<View style={s.stack}>
    <Text style={s.tag}>TU ESPACIO DE APRENDIZAJE</Text><Text style={s.title}>Hola, {summary?.profile.name??auth?.profile.name}</Text>
    <Text style={s.text}>Cada paso cuenta. Hoy puedes descubrir por dónde seguir.</Text>
    {technicalCard}
    {summary?.profile.complete===false&&<Card><Text style={s.notice}>{validBirthDate(summary.profile.birthDate)?'Tu cuenta anterior requiere revisar sus datos guardados y aceptar el aviso de uso de datos.':'Faltan datos válidos del registro. Solicita revisión de tu cuenta para habilitar el diagnóstico.'}</Text><Button secondary label="Revisar perfil guardado" onPress={()=>navigate('profile')}/></Card>}
    <Card><Text style={s.tag}>INGLÉS · COMPONENTE MVP</Text>
      <Text style={s.heading}>{pending?pending.title:lastResult?'Ya conoces tu punto de partida':'Aún no hay diagnóstico asignado'}</Text>
      <Text style={s.text}>{pending?`${pending.count??7} preguntas para practicar. Consulta las instrucciones y lecturas del instrumento.`:lastResult?'Tus resultados se conservan. Las evaluaciones nuevas aparecerán al ser revisadas y asignadas.':summary?.diagnosticAvailability?.message??'Solicita al administrador revisar la activación del diagnóstico y su asignación a tu cuenta.'}</Text>
      <Button label={pending?(pending.restartAvailable?'Preparar reinicio autorizado':pending.status?'Retomar el mismo intento':pending.kind==='control'||pending.kind==='final'?'Ver evaluación asignada':'Conocer mi punto de partida'):'Ver mi progreso'} disabled={disabled} onPress={()=>navigate(pending?'assessment':'progress')}/>
      <Text style={s.muted}>Práctica APEX alineada con Saber Pro</Text>
      <Text style={s.muted}>El diagnóstico de demostración conserva sus preguntas, resultados e historial.</Text>
    </Card>
    <View style={{flexDirection:wide?'row':'column',gap:16}}>{[[summary?.primaryComponent==='ingles'?'Evaluaciones de Inglés completadas':'Evaluaciones completadas',String(currentResults.length)],['Último resultado',lastResult?`${lastResult.correct}/${lastResult.total}`:'Sin resultados'],['Componente del MVP','Inglés']].map(([label,value])=><View key={label} style={[s.card,{flex:1}]}><Text style={s.muted}>{label}</Text><Text style={s.heading}>{value}</Text></View>)}</View>
    <Card><Text style={s.heading}>Tu siguiente paso</Text><Text style={s.text}>Consulta tus evaluaciones pendientes y los materiales publicados para tu programa.</Text><View style={s.row}><Button secondary label="Explorar materiales" onPress={()=>navigate('study')}/><Button secondary label="Consultar estado del tutor IA" onPress={()=>navigate('tutor')}/></View></Card>
  </View>;
  else if(page==='assessment')content=<View style={s.stack}><Text style={s.title}>Mis evaluaciones</Text>{technicalCard}<Card><Text style={s.text}>Diagnóstico: 7 preguntas, sin límite. Controles: 10, tiempo total de 15 minutos, se aprueban con 7 aciertos. Final: 25, tiempo total de 37 minutos y 30 segundos, se aprueba con 22. Puedes retroceder y recuperar respuestas confirmadas.</Text><Text style={s.notice}>Aviso a los 5 minutos de inactividad, cuenta atrás a los 7 y bloqueo a los 8. El resultado no es un puntaje oficial ICFES.</Text>{summary?.diagnosticAvailability&&summary.diagnosticAvailability.code!=='assigned'&&<Text accessibilityLiveRegion="polite" style={s.notice}>{summary.diagnosticAvailability.message}</Text>}{!summary?.assignments?.length&&!summary?.diagnosticAvailability&&<Text style={s.text}>No hay evaluaciones asignadas. Solicita al administrador revisar la activación del diagnóstico, la autorización de Inglés para tu programa y la asignación de tu cuenta.</Text>}{displayedAssignments.map(a=><View key={a.id} style={{gap:10}}><Text style={s.heading}>{a.title} · v{a.version}</Text>{summary?.primaryComponent&&<Text style={s.tag}>{a.componentIds?.includes(summary.primaryComponent)?'Inglés · MVP':'Otros componentes · Historial conservado'}</Text>}<Text style={s.muted}>{a.count??7} preguntas · {timeConditions(a)} · {a.restartAvailable?'Reinicio autorizado sin repaso':a.retryPolicy==='linked-review-v2'?'Repetición tras repaso vinculado':'Intento único'}</Text>{a.restartAvailable&&<Text style={s.notice}>Reinicio autorizado por suspensión técnica. Se conserva el intento anterior sin calificación ni repaso por el incidente. El reloj empieza al abrir el reemplazo.</Text>}{a.status==='finalizado'?<><Button label="Consultar resultado" onPress={()=>{const r=summary?.results.find(r=>r.attemptId===a.attemptId);if(r){setResult(r);setPage('result');}}}/>{a.canRetry?<Button label="Preparar nuevo intento" disabled={disabled} onPress={()=>begin(a.id)}/>:a.reviewRequired&&a.attemptId&&<Button label="Ir al repaso" disabled={disabled} onPress={()=>openChat({kind:'review',attemptId:a.attemptId!})}/>}</>:<Button disabled={disabled} label={a.restartAvailable?'Preparar reinicio autorizado':a.status?'Retomar el mismo intento':a.kind==='control'?'Preparar control':a.kind==='final'?'Preparar examen final':'Preparar diagnóstico'} onPress={()=>a.status==='activo'?start(a.id):begin(a.id)}/>}</View>)}</Card><Text style={s.muted}>Completar siete secciones habilita su control. Aprobarlo habilita el siguiente nivel. Las asignaciones históricas se conservan.</Text></View>;
  else if(page==='exam'&&attempt) {
    const question=attempt.questions[index]!;const savedOption=attempt.answers[question.id]??null;const dirty=selected!==savedOption;
    content=<View style={s.stack}><Text style={s.tag}>{attempt.title??'Diagnóstico'}</Text><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.title}>Pregunta {index+1} de {attempt.questions.length}</Text></View><View style={{gap:6}}><Text accessibilityRole="timer" accessibilityLiveRegion="none" aria-live="off" accessibilityLabel={assessmentTime.remainingMs!==null?`Tiempo restante: ${formatTime(assessmentTime.remainingMs)}`:'Evaluación sin límite de tiempo'} style={s.heading}>{assessmentTime.remainingMs!==null?`Tiempo restante: ${formatTime(assessmentTime.remainingMs)}`:assessmentTime.clock?.policy==='anterior-sin-limite-v1'?'Política anterior: sin límite total':attempt.kind==='diagnostico'?'Sin límite de tiempo':'Consultando tiempo del servidor…'}</Text>{(serverExpired||assessmentTime.expired)&&<Text accessibilityRole="alert" style={s.notice}>Tiempo agotado, procesando resultado</Text>}{assessmentTime.announcement&&!assessmentTime.expired&&<Text accessibilityLiveRegion="polite" style={s.notice}>{assessmentTime.announcement}</Text>}{assessmentTime.clock?.policy==='total-apex-v1'&&<Text style={s.muted}>El reloj sigue avanzando al salir o perder conexión. Solo cuentan las respuestas confirmadas por el servidor.</Text>}</View>{idle>=300000&&<Text accessibilityRole="alert" style={s.notice}>{idle>=420000?`Bloqueo por inactividad en ${Math.max(0,Math.ceil((480000-idle)/1000))} segundos.`:'Llevas cinco minutos sin interactuar. Puedes seguir trabajando; toca o usa el teclado para mantener tu sesión.'}</Text>}
    <QuestionDocument question={question}/><Card>{question.originalNumber!=null&&<Text style={s.tag}>Pregunta original {question.originalNumber} · PDF p. {question.sourcePage}</Text>}<Text style={s.muted}>{question.nucleus} · {question.competency}</Text>{question.classificationProposed&&<Text style={s.muted}>Clasificación pedagógica propuesta por APEX.</Text>}<Text accessibilityRole="header" style={s.heading}>{question.text}</Text>{question.options.map((option,j)=><Pressable key={option.id} accessibilityRole="radio" accessibilityState={{checked:selected===option.id,disabled:examDisabled}} aria-checked={selected===option.id} aria-disabled={examDisabled} accessibilityLabel={`${option.label??String.fromCharCode(65+j)}. ${option.text}`} disabled={examDisabled} onPress={()=>{setSelected(option.id);setSaved('Selección pendiente de guardar.');}} style={{minHeight:58,flexDirection:'row',gap:16,alignItems:'center',padding:16,borderRadius:12,borderWidth:2,borderColor:selected===option.id?colors.primary:colors.border,backgroundColor:selected===option.id?'#EDF3F8':'#fff'}}><Text style={{color:colors.primary,fontWeight:'700'}}>{option.label??String.fromCharCode(65+j)}</Text><Text style={[s.text,{flex:1}]}>{option.text}</Text><Text style={s.muted}>{selected===option.id?'Seleccionada':''}</Text></Pressable>)}<View style={s.row}><Button label="Confirmar respuesta" disabled={examDisabled||selected===null} onPress={()=>void perform(async()=>{await request(`/attempts/${attempt.id}/answers`,auth!.token,'PUT',{item:question.id,option:selected});setAttempt({...attempt,answers:{...attempt.answers,[question.id]:selected}});setSaved('Respuesta confirmada por el servidor.');})}/><Button secondary label="Dejar sin respuesta" disabled={examDisabled} onPress={()=>void perform(async()=>{await request(`/attempts/${attempt.id}/answers`,auth!.token,'PUT',{item:question.id,option:null});setAttempt({...attempt,answers:{...attempt.answers,[question.id]:null}});setSelected(null);setSaved('Omisión confirmada por el servidor.');})}/></View><Text accessibilityLiveRegion="polite" style={s.muted}>{saved||(savedOption?'Respuesta confirmada por el servidor.':'Sin respuesta confirmada.')}</Text></Card>
    <View style={s.row}><Button secondary label="Anterior" disabled={examDisabled||index===0||dirty} onPress={()=>setIndex(index-1)}/><Button label="Siguiente" disabled={examDisabled||index===attempt.questions.length-1||dirty} onPress={()=>setIndex(index+1)}/><Text style={s.muted}>{Object.values(attempt.answers).filter(Boolean).length} de {attempt.questions.length} respondidas</Text></View>{dirty&&<Text style={s.notice}>Confirma tu selección o déjala sin respuesta antes de cambiar de pregunta.</Text>}<View style={s.row}>{attempt.questions.map((q,i)=><Button key={q.id} secondary={i!==index} disabled={examDisabled||dirty} label={`${i+1}${attempt.answers[q.id]?' ✓':''}`} onPress={()=>setIndex(i)}/>)}</View><Button label={attempt.technical?'Entregar prueba técnica':attempt.kind==='control'?'Finalizar control':attempt.kind==='final'?'Finalizar examen final':'Finalizar diagnóstico'} disabled={examDisabled||dirty} onPress={()=>setConfirmation({title:'¿Entregar tus respuestas?',body:`Has respondido ${Object.values(attempt.answers).filter(Boolean).length} de ${attempt.questions.length} preguntas. Las demás contarán como no acertadas. Después de finalizar no podrás cambiar las respuestas.`,confirmLabel:'Finalizar y ver resultado',onConfirm:()=>void perform(async()=>{const data=await request<Result>(`/attempts/${attempt.id}/finish`,auth!.token,'POST');await acceptResult(data);})})}/><Button secondary label="Volver al menú" disabled={busy} onPress={()=>navigate('dashboard')}/>{online&&<Button secondary label="Recuperar respuestas del servidor" disabled={busy} onPress={()=>void perform(async()=>{const data=await request<Attempt>(`/attempts/${attempt.id}`,auth!.token);if(data.status==='finalizado'){if(data.result)await acceptResult(data.result);else{await load();setAttempt(null);setPage('progress');}return;}setServerExpired(!!data.clock?.expired);setAttempt(data);setSelected(data.answers[question.id]??null);setSaved('Respuestas recuperadas del servidor.');})}/>}</View>;
  } else if(page==='result'&&result)content=<View style={s.stack}>{showResult(result)}{result.submissionReason==='tiempo_agotado'&&<Text accessibilityLiveRegion="polite" style={s.notice}>Entrega automática por tiempo agotado. Se calificaron las respuestas confirmadas; las omisiones cuentan como no acertadas.</Text>}{result.kind==='diagnostico'&&<Text style={s.text}>El diagnóstico orienta tu ruta y no tiene umbral de aprobación.</Text>}{!result.technical&&result.passed!=null&&<Card><Text style={s.heading}>{result.passed?'Evaluación aprobada':'Evaluación reprobada'}</Text><Text style={s.text}>Se requieren al menos {result.threshold} aciertos. Tu resultado queda guardado.</Text>{result.reviewRequired&&<Button label="Ir al repaso" onPress={()=>openChat({kind:'review',attemptId:result.attemptId})}/>}</Card>}{result.technical?<><Text style={s.notice}>Resultado técnico conservado. No afecta tu progreso ni genera repaso.</Text><Button label="Volver al inicio" onPress={()=>navigate('dashboard')}/></>:<View style={s.row}><Button label="Continuar con mi ruta" onPress={()=>navigate('study')}/><Button secondary label="Ver mi progreso" onPress={()=>navigate('progress')}/></View>}</View>;
  else if(page==='progress')content=<View style={s.stack}><Text style={s.tag}>APRENDE DE TU RECORRIDO</Text><Text style={s.title}>Mi progreso</Text>{lastResult?<><Text style={s.muted}>Evaluaciones completadas: {currentResults.length}. Se necesitan nuevas evaluaciones comparables para mostrar evolución.</Text>{showResult(lastResult)}</>:<Card><Text style={s.heading}>Tu historia está por comenzar</Text><Text style={s.text}>Todavía no hay resultados. Completa el diagnóstico para ver tus aciertos por núcleo y competencia.</Text><Button label="Ir al diagnóstico" onPress={()=>navigate('assessment')}/></Card>}{!!summary?.results.length&&<Card><Text style={s.heading}>Historial</Text>{summary?.results.map(r=><Text key={r.attemptId} style={s.text}>{new Date(r.completedAt).toLocaleDateString('es-CO')} · {summary?.assignments?.find(a=>a.attemptId===r.attemptId)?.title??'Diagnóstico'} · {r.correct}/{r.total} aciertos</Text>)}</Card>}</View>;
  else if(page==='study')content=<View style={s.stack}><LearningRoute onError={fail} onAssessments={()=>navigate('assessment')} onOpen={location=>navigate('section',location)} expandedLevel={routeExpandedLevel} onExpandedLevelChange={setRouteExpandedLevel} onReady={restoreRoutePosition}/><Text style={s.heading}>Materiales disponibles</Text>{!materials.length&&<Text style={s.muted}>No hay materiales publicados para tu programa.</Text>}{materials.map(m=><Card key={m.id}><Text style={s.tag}>{m.nucleus.toUpperCase()}</Text><Text style={s.heading}>{m.title}</Text><Text style={s.text}>{m.body}</Text><Text style={s.muted}>Fuente: {m.source} · v{m.version??1}</Text></Card>)}</View>;
  else if(page==='section'&&sectionLocation)content=<LearningSection location={sectionLocation} onError={fail} onBack={backToRoute} onChat={sectionId=>openChat({kind:'section',sectionId})}/>;
  else if(page==='tutor')content=<View style={s.stack}>{chatTarget?.kind==='section'&&sectionLocation&&<Button secondary label="Volver a la sección" onPress={()=>navigate('section')}/>}<ContextChat target={chatTarget} onError={fail} onCompleted={()=>{void perform(async()=>{await load();setPage('assessment');});}}/></View>;
  else if(page==='profile')content=<View style={s.stack}><Text style={s.title}>Editar perfil</Text><Card><Text style={s.muted}>{summary?.profile.email} · {summary?.profile.role}</Text><Text style={s.text}>Puedes actualizar tu nombre, semestre y carrera.</Text><Field label="Nombre" value={profile.name} onChangeText={name=>setProfile({...profile,name})}/><Text style={s.muted}>Fecha de nacimiento: {summary?.profile.birthDate||'No guardada'} · Solo lectura</Text>
    {student&&<><Field label="Semestre" value={profile.semester} keyboardType="number-pad" onChangeText={semester=>setProfile({...profile,semester})}/><Text style={s.muted}>Carrera</Text>{programs.map(p=><Button key={p.id} secondary={profile.program!==p.id} label={p.name} onPress={()=>setProfile({...profile,program:p.id})}/>)}</>}{summary?.profile.complete===false&&validBirthDate(summary.profile.birthDate)&&<Check label="Acepto guardar mi perfil y resultados para usar APEX. Aviso apex-v1." value={profileConsent} onChange={setProfileConsent}/>}<Button disabled={disabled} label="Guardar perfil" onPress={()=>void perform(async()=>{await request('/me',auth!.token,'PUT',student?{...profile,semester:Number(profile.semester)}:{name:profile.name});if(profileConsent)await request('/profile/consent',auth!.token,'POST',{consent:true});await load();setPage('dashboard');setError('Perfil guardado.');})}/><Button secondary disabled={busy} label="Cancelar edición" onPress={()=>navigate('dashboard')}/></Card><Card><Text style={s.heading}>Cambiar contraseña</Text><Field label="Contraseña actual" value={currentPassword} secureTextEntry onChangeText={setCurrentPassword}/><Field label="Nueva contraseña" value={nextPassword} secureTextEntry onChangeText={setNextPassword}/>{passwordChecks(nextPassword).map(rule=><Text style={s.muted} key={rule.label}>{rule.valid?'✓':'○'} {rule.label}</Text>)}<Button disabled={disabled} label="Cambiar contraseña y cerrar sesiones" onPress={()=>void perform(async()=>{await request('/auth/password',auth!.token,'POST',{current:currentPassword,next:nextPassword});clearSession();setError('Contraseña actualizada. Ingresa con tu nueva contraseña.');})}/></Card></View>;
  else content=help;

  if(summary?.profile.role==='docente'&&page==='dashboard')content=<TeacherPanel key={summary.profile.id} name={summary.profile.name} scrollRef={mainScroll} onError={fail} getScrollY={()=>Platform.OS==='web'?mainScroll.current?.getScrollableNode()?.scrollTop??mainScrollY.current:mainScrollY.current} onNavigate={(y=0)=>mainScroll.current?.scrollTo({y,animated:false})}/>;
  if(summary?.profile.role==='administrador'&&page==='dashboard')content=<StaffPanel key={summary.profile.id+JSON.stringify(adminNavigation.location)} role="administrador" onError={fail} location={adminNavigation.location} go={adminNavigation.go}/>;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}} onTouchStart={touch}>
    {!configured&&<View style={{padding:16}}><Text accessibilityRole="alert" style={s.text}>Configura Supabase en .env siguiendo Docs/SUPABASE.md. La aplicación no utiliza el servidor SQLite anterior.</Text></View>}
    {!online&&configured&&<View style={{backgroundColor:'#FFF0D8',padding:14}}><Text accessibilityRole="alert" style={s.text}>Sin conexión con Supabase. Las respuestas confirmadas se conservan; las nuevas respuestas están bloqueadas.</Text></View>}
    {!!error&&<View style={{backgroundColor:'#FCEDEB',padding:14,flexDirection:'row',alignItems:'center',gap:16}}><Text accessibilityRole="alert" style={[s.text,{flex:1}]}>{error}</Text><Button secondary label="Cerrar aviso" onPress={()=>setError('')}/></View>}
    {auth?<View style={{flex:1,flexDirection:wide?'row':'column'}}>
      {administrator?<AdminNavigation wide={wide} location={adminNavigation.location} active={page==='dashboard'} disabled={busy} name={summary?.profile.name??auth.profile.name} onNavigate={next=>{adminNavigation.go(next);if(page!=='dashboard')navigate('dashboard');}} onCommon={navigate} onLogout={logout}/>:<View style={{width:wide?242:undefined,backgroundColor:colors.sidebar,padding:wide?22:12,gap:wide?24:10}}><Text style={{color:'#fff',fontSize:26,fontWeight:'700',letterSpacing:4}}>◈ APEX</Text>{wide&&<><Text style={{color:'#CAD9E8',fontSize:13}}>Tu próximo paso</Text><View style={{borderTopWidth:1,borderTopColor:'#5B6C7E',paddingTop:22,gap:6}}><Text style={{color:'#fff',fontSize:16,fontWeight:'600'}}>{summary?.profile.name??auth.profile.name}</Text><Text style={{color:'#CAD9E8',fontSize:13}}>{summary?.profile.role??'estudiante'}</Text></View></>}
      <ScrollView horizontal={!wide} style={wide?{flex:1}:undefined} contentContainerStyle={{gap:6}}>{availableNavigation.map(([id,icon,label])=><Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:activeNavigation===id,disabled:busy}} aria-selected={activeNavigation===id} aria-disabled={busy} disabled={busy} onPress={()=>navigate(id)} style={{padding:13,minHeight:46,borderRadius:9,backgroundColor:activeNavigation===id?colors.primary:'transparent',flexDirection:'row',gap:14}}><Text style={{color:'#DCE7F2',fontSize:18}}>{icon}</Text><Text style={{color:'#fff',fontSize:14,fontWeight:activeNavigation===id?'700':'400'}}>{label}</Text></Pressable>)}</ScrollView><Button secondary disabled={busy} label="Cerrar sesión" onPress={logout}/></View>}
      <View style={{flex:1}}><View style={{paddingHorizontal:wide?36:20,paddingVertical:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={s.muted}>APEX / {title}</Text><Text style={s.tag}>APEX</Text></View><ScrollView ref={mainScroll} key={`${page}-${page==='exam'?index:''}`} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={event=>{mainScrollY.current=event.nativeEvent.contentOffset.y;if(page==='study'&&!restoreRouteScroll.current&&!leavingRoute.current)routeScrollY.current=event.nativeEvent.contentOffset.y;}} contentContainerStyle={{padding:wide?36:20,paddingBottom:60}}><View style={{width:'100%',maxWidth:1080,alignSelf:'center'}}>{invitationLink&&<TeacherInvitationAcceptance key={invitationLink.id+invitationLink.token+auth.profile.id} link={invitationLink} onAccepted={async()=>{await load();setInvitationLink(null);setPage('dashboard');setError('Invitación aceptada. Ya puedes acceder como Profesor.');}} onClose={()=>setInvitationLink(null)}/>}
{!summary?<Card><Text style={s.text}>Cargando tu perfil…</Text><Button label="Reintentar carga" disabled={busy} onPress={()=>void perform(()=>load())}/></Card>:content}</View></ScrollView></View>
    </View>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1}}>{authView}</ScrollView>}
    {busy&&<View style={{position:'absolute',bottom:18,alignSelf:'center',backgroundColor:colors.primary,borderRadius:20,padding:12,flexDirection:'row',gap:10}}><ActivityIndicator color="#fff"/><Text accessibilityLiveRegion="polite" style={{color:'#fff'}}>Procesando…</Text></View>}
    <Confirm value={confirmation} onClose={()=>setConfirmation(null)}/>
  </SafeAreaView>;
}
export default function App(){return <SafeAreaProvider><AppContent/></SafeAreaProvider>;}
