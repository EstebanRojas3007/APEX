import {useEffect,useRef,useState,type RefObject} from 'react';
import {ActivityIndicator,AppState,BackHandler,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {rpc,RequestError} from './api';
import {Button,Card,Field,colors,styles as s} from './ui';
import type {TeacherGroup,TeacherRoster,TrackingStudent,TrackingAssessment,GroupSummary} from '../shared/teacher';
import {TeacherGroupSummary} from './TeacherGroupSummary';
import {TeacherStudentActions} from './TeacherStudentActions';
import {TeacherActionsScreen} from './TeacherActionsScreen';
import {TeacherAnchor,useTeacherViewport} from './useTeacherViewport';

type Location={groupId?:string;studentId?:string;summary?:boolean;actions?:boolean};
const viewKey=(location:Location)=>JSON.stringify([location.groupId,location.studentId,!!location.summary,!!location.actions]);
function readLocation():Location {
 if(Platform.OS!=='web')return {};
 const match=window.location.hash.match(/^#profesor\/grupos\/([^/]+)(?:\/estudiantes\/([^/]+)(\/acciones)?|\/(resumen))?$/);
 try{return match?{groupId:decodeURIComponent(match[1]!),studentId:match[2]?decodeURIComponent(match[2]):undefined,actions:!!match[3],summary:!!match[4]}:{};}catch{return {};}
}
const levelName=(level:number)=>['Básico','Intermedio','Avanzado'][level-1]??`Nivel ${level}`;
const date=(value:string|number|null)=>value?new Date(value).toLocaleString('es-CO'):'Pendiente · sin registro disponible';
const statuses:Record<string,string>={pendiente:'Pendiente',activo:'Activo',finalizado:'Finalizado',suspendido:'Suspendido sin calificación',pending:'Pendiente',running:'Pendiente',unavailable:'Pendiente',error:'Pendiente',ready:'Disponible',completed:'Completada',started:'Iniciada',available:'Disponible'};
const status=(value:string)=>statuses[value]??value;
function Assessment({item}:{item:TrackingAssessment}) {
 return <Text style={s.text}>{item.kind==='final'?'Examen final':`Control · ${levelName(item.level!)}`}: {status(item.status)}{item.passed===null?(item.status==='finalizado'?' · Aprobación pendiente':''):item.passed?' · Aprobado':' · No aprobado'}{item.correct===null?'':` · ${item.correct}/${item.total}`}{item.reviewRequired?' · Repaso obligatorio pendiente':''}{item.activeRetry?' · Reintento activo; se conserva el resultado finalizado':''}</Text>;
}
function StudentDetail({student,actions}:{student:TrackingStudent;actions:React.ReactNode}) {
 return <View style={s.stack}>
  <TeacherAnchor id="student-profile" style={s.card}><Text accessibilityRole="header" style={s.title}>{student.name||'Estudiante'}</Text><Text style={s.muted}>{student.program} · Semestre {student.semester}</Text><Text style={s.text}>Nivel actual: {student.currentLevel?levelName(student.currentLevel):'Pendiente'}</Text><Text style={s.text}>Último inicio de sesión: {date(student.lastSignInAt)}</Text><Text style={s.text}>Última actividad registrada: {date(student.lastActivityAt)}</Text><Text style={s.muted}>Estas fechas son registros históricos; no indican presencia en línea. La actividad corresponde a eventos registrados por APEX.</Text></TeacherAnchor>
  <TeacherAnchor id="student-diagnostic" style={s.card}><Text accessibilityRole="header" style={s.heading}>Diagnóstico · {student.diagnosticStatus}</Text>{student.diagnostic?<><Text style={s.text}>{student.diagnostic.correct}/{student.diagnostic.total} aciertos · {date(student.diagnostic.completedAt)}</Text><Text style={s.muted}>Desglose por habilidad disponible</Text>{student.diagnostic.skills.length?student.diagnostic.skills.map((skill,index)=><Text key={index} style={s.text}>{skill.label}: {skill.correct}/{skill.total}</Text>):<Text style={s.text}>Pendiente · sin desglose registrado.</Text>}</>:<Text style={s.text}>Resultado pendiente.</Text>}</TeacherAnchor>
  {actions}
  <Text accessibilityRole="header" style={s.heading}>Progreso por nivel</Text><Text style={s.muted}>La finalización de secciones registra avance, sin estimar dominio. El contenido individual pendiente requiere generación y validación.</Text>
  {student.levels.map(level=><TeacherAnchor key={level.level} id={`student-level-${level.level}`} style={s.card}><Text style={s.heading}>{levelName(level.level)} · {level.completed}/7 secciones completadas</Text><Text style={s.muted}>Contenido: {status(level.generationStatus)}{level.version?` · Versión ${level.version}`:''}</Text>{level.sections.map(section=><TeacherAnchor key={section.order} id={`student-level-${level.level}-section-${section.order}`} style={s.row}><Text style={s.text}>Sección {section.order} · {status(section.status)}</Text>{section.completedAt&&<Text style={s.muted}>{date(section.completedAt)}</Text>}</TeacherAnchor>)}</TeacherAnchor>)}
  <TeacherAnchor id="student-assessments" style={s.card}><Text accessibilityRole="header" style={s.heading}>Controles y examen final</Text>{student.assessments.map((item,index)=><Assessment key={index} item={item}/>)}</TeacherAnchor>
  <TeacherAnchor id="student-reviews" style={s.card}><Text accessibilityRole="header" style={s.heading}>Repasos</Text><Text style={s.text}>{student.reviewRequired?'Repaso obligatorio pendiente':'Sin repasos obligatorios pendientes registrados.'}</Text>{student.attempts.filter(a=>a.passed===false).map(a=><Text key={a.id} style={s.text}>{a.title}: {a.reviewCompletedAt?`Repaso completado · ${date(a.reviewCompletedAt)}`:'Repaso pendiente'}{a.reviewStatus&&` · ${status(a.reviewStatus)}`}</Text>)}</TeacherAnchor>
  <Text accessibilityRole="header" style={s.heading}>Resultados e historial de intentos</Text>{student.attempts.length?student.attempts.map(a=><TeacherAnchor key={a.id} id={`student-attempt-${a.id}`} style={s.card}><Text style={s.heading}>{a.title}{a.number?` · Intento ${a.number}`:''}</Text><Text style={s.text}>{status(a.status)}{a.level?` · ${levelName(a.level)}`:''}</Text><Text style={s.muted}>Inicio: {date(a.startedAt)} · {a.status==='suspendido'?`Suspensión: ${date(a.suspendedAt??null)}`:`Finalización: ${date(a.completedAt)}`}</Text><Text style={s.text}>{a.status==='suspendido'?'Sin calificación por suspensión técnica':a.correct===null?'Resultado pendiente':`${a.correct}/${a.total} aciertos`}{a.passed===null?'':a.passed?' · Aprobado':' · No aprobado'}{a.threshold===null?'':` · Umbral ${a.threshold}`}</Text></TeacherAnchor>):<Card><Text style={s.text}>Sin intentos académicos registrados para este componente.</Text></Card>}
 </View>;
}
export function TeacherPanel({name,onError,onNavigate,getScrollY,scrollRef}:{name:string;onError:(error:unknown)=>void;onNavigate:(y?:number)=>void;getScrollY:()=>number;scrollRef:RefObject<ScrollView|null>}) {
 const [location,setLocation]=useState<Location>(readLocation),[revision,setRevision]=useState(0),[search,setSearch]=useState('');
 const [expandedStudentId,setExpandedStudentId]=useState<string|null>(null),[focusedStudentId,setFocusedStudentId]=useState<string|null>(null);
 const [groups,setGroups]=useState<TeacherGroup[]|null>(null),[roster,setRoster]=useState<TeacherRoster|null>(null),[student,setStudent]=useState<TrackingStudent|null>(null);
 const [summary,setSummary]=useState<GroupSummary|null>(null),[dataScope,setDataScope]=useState(''),[dataKey,setDataKey]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[warning,setWarning]=useState('');
 const [actionMessage,setActionMessage]=useState(''),[actionBusy,setActionBusy]=useState(false),[actionError,setActionError]=useState(false);
 const [actionReasons,setActionReasons]=useState<Record<string,string>>({}),[historyExpanded,setHistoryExpanded]=useState(false);
 const panelAlive=useRef(true),onErrorRef=useRef(onError),actionScope=useRef('');onErrorRef.current=onError;
 const sourceKey=JSON.stringify([location.groupId,location.studentId,!!location.summary]);
 const scopeKey=JSON.stringify([location.groupId,location.studentId]);actionScope.current=scopeKey;
 const requestKey=JSON.stringify([sourceKey,!!location.actions,revision]);
 const pending=loading||dataKey!==requestKey;
 const ready=dataScope===sourceKey&&!!(groups||roster||student||summary);
 const readyRef=useRef(ready);readyRef.current=ready;
 const viewport=useTeacherViewport({view:viewKey(location),ready,scrollRef,getScrollY,scrollTo:onNavigate});
 const currentViewport=useRef(viewport);currentViewport.current=viewport;
 const lastStudent=useRef(location.studentId);
 useEffect(()=>{panelAlive.current=true;return()=>{panelAlive.current=false;};},[]);
 const acceptsActionResult=()=>panelAlive.current&&actionScope.current===scopeKey;
 const clearStudentState=()=>{setActionMessage('');setActionError(false);setActionBusy(false);setActionReasons({});setHistoryExpanded(false);};
 const clearData=()=>{setGroups(null);setRoster(null);setStudent(null);setSummary(null);setDataScope('');};
 const removeAccess=(err:unknown)=>{
  clearData();clearStudentState();viewport.reset();setExpandedStudentId(null);setFocusedStudentId(null);setSearch('');setWarning('');
  setError(err instanceof Error?err.message:'Acceso no disponible.');
  if(err instanceof RequestError&&err.status===401)onErrorRef.current(err);
 };
 const move=(next:Location)=>{
  viewport.save();
  if(next.groupId!==location.groupId){
   viewport.reset();setSearch('');setExpandedStudentId(null);setFocusedStudentId(null);clearStudentState();lastStudent.current=next.studentId;
  }else if(next.studentId&&next.studentId!==lastStudent.current){
   viewport.reset(viewKey({groupId:next.groupId}));clearStudentState();lastStudent.current=next.studentId;
  }else if(!next.studentId)setActionBusy(false);
  viewport.navigate(viewKey(next));setLocation(next);setError('');setWarning('');
 };
 const go=(next:Location)=>{
  move(next);
  if(Platform.OS==='web')window.history.pushState(null,'',next.groupId?`#profesor/grupos/${encodeURIComponent(next.groupId)}${next.summary?'/resumen':next.studentId?`/estudiantes/${encodeURIComponent(next.studentId)}${next.actions?'/acciones':''}`:''}`:'#profesor');
 };
 const back=()=>go(location.actions?{groupId:location.groupId,studentId:location.studentId}:location.studentId||location.summary?{groupId:location.groupId}:{});
 useEffect(()=>{
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(!location.groupId)return false;back();return true;});
  const pop=()=>move(readLocation());if(Platform.OS==='web')window.addEventListener('popstate',pop);
  return()=>{subscription.remove();if(Platform.OS==='web')window.removeEventListener('popstate',pop);};
 },[location.groupId,location.studentId,location.summary,location.actions]);
 useEffect(()=>{
  let valid=true;setLoading(true);setError('');setDataKey(requestKey);
  const payload={groupId:location.groupId,studentId:location.studentId};
  const work=location.summary?rpc<GroupSummary>('teacher_group_summary',{groupId:location.groupId}):location.studentId?rpc<TrackingStudent>('teacher_student',payload):location.groupId?rpc<TeacherRoster>('teacher_group',{groupId:location.groupId}):rpc<TeacherGroup[]>('teacher_groups');
  void work.then(async value=>{
   if(!valid)return;
   const snapshot=await currentViewport.current.capture();if(!valid)return;
   currentViewport.current.preserve(snapshot);
   // Same-source updates replace props, never the mounted view or its keys.
   setGroups(null);setRoster(null);setStudent(null);setSummary(null);
   if(location.summary)setSummary(value as GroupSummary);
   else if(location.studentId)setStudent(value as TrackingStudent);
   else if(location.groupId){const next=value as TeacherRoster;setRoster(next);setExpandedStudentId(id=>next.students.some(item=>item.id===id)?id:null);}
   else setGroups(value as TeacherGroup[]);
   setDataScope(sourceKey);setWarning('');
  }).catch(async err=>{
   if(!valid)return;
   const transient=err instanceof RequestError&&(err.status===0||err.status>=500)||err instanceof TypeError;
   if(transient&&readyRef.current){
    const snapshot=await currentViewport.current.capture();if(!valid)return;
    currentViewport.current.preserve(snapshot);setWarning(`No se pudo actualizar. Se conservan los datos. ${err instanceof Error?err.message:''}`);
   }else removeAccess(err);
  }).finally(()=>{if(valid)setLoading(false);});
  return()=>{valid=false;};
 },[sourceKey,location.actions,revision]);
 const refresh=()=>setRevision(n=>n+1);
 useEffect(()=>{
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  const timer=setInterval(refresh,30000);if(Platform.OS==='web')window.addEventListener('focus',refresh);
  return()=>{clearInterval(timer);subscription.remove();if(Platform.OS==='web')window.removeEventListener('focus',refresh);};
 },[]);
 const studentActions=student?.teacherActions&&location.groupId?<TeacherStudentActions
  key={`${location.groupId}:${student.id}`} groupId={location.groupId} studentId={student.id} data={student.teacherActions}
  message={actionMessage} messageIsError={actionError} busy={actionBusy} reasons={actionReasons}
  onReasonChange={(id,value)=>setActionReasons(previous=>({...previous,[id]:value}))}
  onBusyChange={busy=>{if(acceptsActionResult()){setActionBusy(busy);if(busy){setActionMessage('');setActionError(false);}}}}
  onUpdated={(message,failed)=>{if(acceptsActionResult()){setActionBusy(false);setActionMessage(message);setActionError(!!failed);refresh();}}}
  onDenied={err=>{if(acceptsActionResult())removeAccess(err);}}
 />:null;
 const query=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const students=roster?.students.filter(item=>`${item.name} ${item.program}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query))??[];
 return <viewport.Provider value={viewport.register}><View style={s.stack} testID="teacher-panel">
  <View style={s.row}>{location.groupId&&<Button secondary label={location.actions?'Volver al seguimiento':location.summary?'Volver al salón':location.studentId?'Volver al grupo':'Volver a mis grupos'} onPress={back}/>}<Button secondary label={location.summary?'Actualizar':'Actualizar seguimiento'} disabled={pending||actionBusy} onPress={refresh}/></View>
  <View style={{minHeight:22}}><Text accessibilityLiveRegion="polite" style={s.muted}>{warning||(ready&&pending?'Actualizando…':'')}</Text></View>
  {!ready?pending?<Card><ActivityIndicator color={colors.primary}/><Text accessibilityLiveRegion="polite" style={s.text}>Cargando {location.summary?'resumen del salón':location.studentId?'estudiante':location.groupId?'grupo':'tus grupos'}…</Text></Card>:<Card><Text accessibilityRole="alert" style={s.text}>{error||'No se pudo cargar el seguimiento.'}</Text><Button label="Reintentar" onPress={refresh}/></Card>:location.actions&&student?<TeacherActionsScreen student={student} expanded={historyExpanded} onExpandedChange={setHistoryExpanded}>{studentActions}</TeacherActionsScreen>:summary?<TeacherGroupSummary key={summary.group.id} data={summary}/>:student?<StudentDetail student={student} actions={<TeacherAnchor id="student-actions-button"><Button label="Acciones del profesor" onPress={()=>go({groupId:location.groupId,studentId:student.id,actions:true})}/></TeacherAnchor>}/>:roster?<>
   <Text accessibilityRole="header" style={s.title}>{roster.group.name} · {roster.group.code}</Text><Text style={s.muted}>{roster.group.component} · {roster.group.activeCount} estudiantes activos · {roster.group.status}</Text>
   {roster.group.membershipCount!==roster.group.activeCount&&<Text style={s.notice}>{roster.group.membershipCount} membresías activas. Solo se muestran estudiantes activos con el componente autorizado.</Text>}
   <Button label="Resumen del salón" onPress={()=>go({groupId:roster.group.id,summary:true})}/>
   <Field label="Buscar estudiante" placeholder="Nombre o programa académico" value={search} onChangeText={setSearch}/>
   <View>
    {!students.length?<Card><Text style={s.text}>{query?'Sin estudiantes que coincidan con la búsqueda.':'Este grupo no tiene estudiantes activos disponibles para seguimiento.'}</Text></Card>:<View style={[s.card,a.list]}>{students.map(item=>{
     const expanded=expandedStudentId===item.id;
     return <TeacherAnchor key={item.id} id={`student-row-${item.id}`} style={a.student}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.name||'Estudiante'} accessibilityHint={`${expanded?'Contraer':'Desplegar'} información del estudiante.`} accessibilityState={{expanded}} aria-expanded={expanded} focusable
       onFocus={()=>setFocusedStudentId(item.id)} onBlur={()=>setFocusedStudentId(null)} onPress={()=>setExpandedStudentId(id=>id===item.id?null:item.id)}
       style={({pressed})=>[a.header,pressed&&a.pressed,focusedStudentId===item.id&&a.focused]}>
       <Text style={[s.heading,a.name]}>{item.name||'Estudiante'}</Text><Text accessible={false} aria-hidden style={a.arrow}>{expanded?'▲':'▼'}</Text>
      </Pressable>
      {expanded&&<View style={a.content}>
       <Text style={s.muted}>{item.program} · Semestre {item.semester}</Text><Text style={s.text}>Diagnóstico {item.diagnosticStatus} · Nivel actual: {item.currentLevel?levelName(item.currentLevel):'Pendiente'}</Text><Text style={s.text}>{item.levels.map(level=>`${levelName(level.level)}: ${level.completed}/7`).join(' · ')}</Text>{item.assessments.map((a,index)=><Assessment key={index} item={a}/>)}{item.reviewRequired&&<Text style={s.notice}>Repaso obligatorio pendiente</Text>}<Button label={`Ver seguimiento de ${item.name||'estudiante'}`} onPress={()=>go({groupId:roster.group.id,studentId:item.id})}/>
      </View>}
     </TeacherAnchor>;
    })}</View>}
   </View>
  </>:<>
   <Text accessibilityRole="header" style={s.title}>Bienvenido, profesor {name}</Text><Text style={s.heading}>Selecciona tu grupo</Text><Text style={s.muted}>Consulta el avance individual de tus estudiantes en Inglés.</Text>
   {!groups?.length?<Card><Text style={s.heading}>Aún no tienes grupos asignados</Text><Text style={s.text}>La administración debe asignarte un grupo para habilitar el seguimiento.</Text></Card>:<View style={[s.row,{alignItems:'stretch'}]}>{groups.map(group=><Pressable key={group.id} accessibilityRole="button" accessibilityLabel={`Abrir grupo ${group.code}`} onPress={()=>go({groupId:group.id})} style={({pressed})=>[s.card,{flexGrow:1,flexBasis:260,borderColor:colors.primary,opacity:pressed?0.7:1}]}><Text style={s.tag}>{group.component} · {group.status}</Text><Text style={s.title}>{group.code}</Text><Text style={s.heading}>{group.name}</Text><Text style={s.text}>{group.activeCount} estudiantes activos</Text><Text style={{color:colors.primary,fontWeight:'700'}}>Abrir grupo →</Text></Pressable>)}</View>}
  </>}
 </View></viewport.Provider>;
}

const a=StyleSheet.create({
 list:{padding:0,gap:0,overflow:'hidden'},
 student:{borderBottomWidth:1,borderBottomColor:colors.border},
 header:{minHeight:64,padding:16,flexDirection:'row',alignItems:'center',gap:12,borderWidth:2,borderColor:'transparent'},
 name:{flex:1,minWidth:0,flexShrink:1},
 arrow:{fontSize:16,color:colors.primary},
 focused:{borderColor:colors.primary},
 pressed:{backgroundColor:'#EDF2F7'},
 content:{padding:16,gap:16,borderTopWidth:1,borderTopColor:colors.border},
});
