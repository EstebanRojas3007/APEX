import {useEffect,useState} from 'react';
import {ActivityIndicator,Text,View,useWindowDimensions} from 'react-native';
import type {AdminOverview,AdminUser} from '../shared/admin';
import type {Result} from '../shared/contracts';
import {rpc} from './api';
import {copyAdminId} from './copyAdminId';
import type {AdminLocation} from './AdminNavigation';
import {Button,Card,colors,styles as s} from './ui';

export const adminDate=(value:string|number|null)=>value!==null?new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'Sin registro disponible';
export function AdminWelcome({overview,go}:{overview:AdminOverview;go:(location:AdminLocation)=>void}){
 return <View style={s.stack}>
  <View style={{backgroundColor:'#E8F0EE',borderRadius:18,padding:24,gap:12,borderLeftWidth:4,borderLeftColor:colors.accent}}><Text style={s.tag}>GESTIÓN ACADÉMICA · APEX</Text><Text accessibilityRole="header" style={s.title}>Bienvenido al administrador</Text><Text style={s.text}>Organiza las cuentas, acompaña la gestión de profesores y salones, y mantén los programas y componentes al día.</Text><Text style={s.muted}>Cada cambio conserva sus validaciones, confirmación e historial.</Text></View>
  <Text accessibilityRole="header" style={s.heading}>Estado de la comunidad</Text>
  <Text style={s.muted}>Cuentas por rol y estado registrado. Activo significa cuenta habilitada; no indica que esté conectada ahora.</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{([['Estudiantes',overview.students],['Profesores',overview.teachers],['Salones',overview.groups]] as const).map(([label,count])=>{
   const total=count.active+count.inactive,percentage=total?count.active/total*100:0;
   return <View key={label} style={{flex:1,minWidth:200}}><Card><Text style={s.label}>{label}</Text><Text style={{fontSize:38,lineHeight:44,fontWeight:'700',color:colors.primary}}>{count.active}</Text><Text style={s.text}>Activos: {count.active} · Inactivos: {count.inactive}</Text><View accessibilityLabel={`${label}: ${count.active} activos de ${total} registros`} style={{height:10,borderRadius:6,overflow:'hidden',backgroundColor:'#E2E8EF'}}><View style={{height:10,width:`${percentage}%`,backgroundColor:label==='Profesores'?colors.accent:colors.primary}}/></View><Text style={s.muted}>{total?`${Math.round(percentage)} % activos de ${total} registros`:'Sin registros'}</Text></Card></View>;
  })}</View>
  <Text accessibilityRole="header" style={s.heading}>Tus herramientas</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{([
   ['Consultar','Busca cuentas por nombre o ID, consulta sus detalles y gestiona su estado.','usuarios'],
   ['Asignación y transición','Propón el rol Profesor por invitación y organiza responsables e integrantes de salones.','profesores'],
   ['Programas y componentes','Crea o renombra entradas y revisa sus asociaciones autorizadas.','catalogo'],
   ['Auditoría','Consulta los cambios registrados por acción, entidad y fecha.','auditoria'],
  ] as const).map(([label,body,tab])=><View key={tab} style={{flex:1,minWidth:240}}><Card><Text style={s.heading}>{label}</Text><Text style={s.muted}>{body}</Text><Button secondary label={`Abrir ${label.toLowerCase()}`} onPress={()=>go({tab})}/></Card></View>)}</View>
 </View>;
}

export function AdminUserRow({user,busy,onManage,onResults}:{user:AdminUser;busy:boolean;onManage:()=>void;onResults:()=>void}){
 const {width}=useWindowDimensions(),wide=width>=1100;
 const [copy,setCopy]=useState<'idle'|'copied'|'error'>('idle');
 return <Card><View style={{flexDirection:wide?'row':'column',gap:20,alignItems:wide?'flex-start':undefined}}>
  <View style={{flex:1,gap:6,minWidth:0}}><Text accessibilityRole="header" style={s.heading}>{user.name||user.email}</Text><Text style={s.text}>{user.email} · {user.role} · {user.status}</Text>{user.program&&<Text style={s.muted}>{user.program} · Semestre {user.semester}</Text>}</View>
  <View style={{flex:1,gap:8,minWidth:0}}><Text style={s.label}>ID APEX</Text><Text selectable style={[s.muted,{fontSize:13}]}>{user.id}</Text><Button secondary label={`Copiar ID de ${user.name||user.email}`} onPress={()=>{void copyAdminId(user.id).then(()=>setCopy('copied')).catch(()=>setCopy('error'));}}/>{copy!=='idle'&&<Text accessibilityLiveRegion="polite" style={s.muted}>{copy==='copied'?'ID copiado':'No se pudo copiar. Puedes seleccionar el ID.'}</Text>}</View>
  <View style={{flex:1,gap:10,minWidth:0}}>{user.role==='estudiante'?<Button secondary label={`Ver resultados de ${user.name||user.email}`} onPress={onResults}/>:user.role==='docente'?<><Text style={s.label}>Salones / cursos</Text><Text style={s.muted}>Consulta los responsables en la pestaña Salones de Asignación y transición.</Text></>:null}<Button secondary label={`Gestionar ${user.name||user.email}`} disabled={busy} onPress={onManage}/></View>
 </View><View style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:12,gap:4}}><Text style={s.muted}>Último inicio de sesión: {adminDate(user.lastSignInAt)}</Text><Text style={s.muted}>Última actividad registrada: {adminDate(user.lastActivityAt)}</Text></View></Card>;
}

export function AdminStudentResults({user,revision,onError,onClose}:{user:AdminUser;revision:number;onError:(error:unknown)=>void;onClose:()=>void}){
 const [results,setResults]=useState<Result[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  let valid=true;setError('');
  void rpc<Result[]>('student_results',{studentId:user.id}).then(value=>{if(valid)setResults(value);}).catch(err=>{if(valid){setResults(null);setError(err instanceof Error?err.message:'No se pudieron consultar los resultados.');onError(err);}});
  return()=>{valid=false;};
 },[user.id,revision]);
 return <Card><Text accessibilityRole="header" style={s.heading}>Resultados · {user.name||user.email}</Text><Text style={s.muted}>Historial disponible para administración. No modifica evaluaciones ni respuestas.</Text>
  {error?<Text accessibilityRole="alert" style={s.notice}>{error}</Text>:results===null?<ActivityIndicator color={colors.primary}/>:!results.length?<Text style={s.text}>Sin resultados registrados.</Text>:results.map(result=><View key={result.attemptId} style={{gap:6,borderTopWidth:1,borderTopColor:colors.border,paddingTop:12}}><Text style={s.heading}>{result.title??(result.kind==='control'?'Control':result.kind==='final'?'Examen final':'Diagnóstico')}{result.technical?' · Prueba técnica':''}</Text><Text style={s.text}>{result.correct}/{result.total} aciertos · {result.percentage} %</Text><Text style={s.muted}>{adminDate(result.completedAt)}</Text>{result.nuclei.map(item=><Text key={item.label} style={s.muted}>{item.label}: {item.correct}/{item.total} · {item.percentage} %</Text>)}{result.competencies.map(item=><Text key={item.label} style={s.muted}>{item.label}: {item.correct}/{item.total} · {item.percentage} %</Text>)}</View>)}
  <Button secondary label="Cerrar resultados" onPress={onClose}/>
 </Card>;
}
