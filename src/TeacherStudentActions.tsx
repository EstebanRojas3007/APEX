import {useRef,useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import type {TeacherActionResult,TeacherActions} from '../shared/teacher';
import {rpc,RequestError} from './api';
import {Button,Confirm,Field,colors,styles as s,type Confirmation} from './ui';
import {TeacherAnchor} from './useTeacherViewport';

const diagnosticLabels={not_assigned:'Sin diagnóstico asignado',assigned:'Asignado sin iniciar',in_progress:'En progreso',completed:'Finalizado'};
type Props={groupId:string;studentId:string;data:TeacherActions;message:string;messageIsError:boolean;busy:boolean;reasons:Record<string,string>;onReasonChange:(id:string,value:string)=>void;onBusyChange:(busy:boolean)=>void;onUpdated:(message:string,error?:boolean)=>void;onDenied:(error:unknown)=>void};
export function TeacherStudentActions({groupId,studentId,data,message,messageIsError,busy,reasons,onReasonChange,onBusyChange,onUpdated,onDenied}:Props){
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const inFlight=useRef(false);
 const current=useRef({data,reasons});current.current={data,reasons};
 async function act(operation:string,payload:Record<string,unknown>){
  if(inFlight.current||busy)return;
  inFlight.current=true;onBusyChange(true);
  try{
   const result=await rpc<TeacherActionResult>(operation,{groupId,studentId,...payload});
   onUpdated(result.message);
  }catch(err){
   if(err instanceof RequestError&&(err.status===401||err.status===403))onDenied(err);
   else onUpdated(err instanceof Error?err.message:'No se pudo completar la acción. Actualiza el seguimiento antes de reintentar.',true);
  }finally{inFlight.current=false;}
 }
 return <TeacherAnchor id="actions-form" style={s.card}>
  <Text accessibilityRole="header" style={s.heading}>Acciones disponibles</Text>
  {!!message&&<Text accessibilityRole={messageIsError?'alert':undefined} accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>}
  {busy&&<View style={s.row}><ActivityIndicator color={colors.primary}/><Text accessibilityLiveRegion="polite" style={s.text}>Procesando acción…</Text></View>}
  <Text style={s.heading}>Diagnóstico · {diagnosticLabels[data.diagnostic.state]}</Text>
  <Text style={s.text}>{data.diagnostic.reason}</Text>
  <Button label="Asignar diagnóstico de Inglés" disabled={busy||!data.diagnostic.canAssign} onPress={()=>void act('teacher_assign_diagnostic',{})}/>
  {data.exams.map(exam=><TeacherAnchor key={exam.attemptId} id={`actions-exam-${exam.attemptId}`} style={{gap:12,borderTopWidth:1,borderTopColor:colors.border,paddingTop:16}}>
   <Text accessibilityRole="header" style={s.heading}>{exam.title}</Text>
   <Text style={s.text}>{exam.status==='suspendido'?'Intento suspendido · sin calificación':'Examen en progreso'}</Text>
   <Text style={s.muted}>Inicio: {new Date(exam.startedAt).toLocaleString('es-CO')}</Text>
   {exam.status==='suspendido'?<Text style={s.notice}>{exam.replacementId?`Reemplazo ${exam.replacementStatus==='finalizado'?'finalizado':exam.replacementStatus==='suspendido'?'suspendido':'iniciado'}; se conserva el original.`:'Un reinicio autorizado pendiente. Su reloj empezará cuando el estudiante lo abra. No genera reprobación ni repaso.'}</Text>:<>
    {exam.reason&&<Text style={s.muted}>{exam.reason}</Text>}
    {!exam.canSuspend&&exam.eligibleAt!==null&&exam.serverNow<exam.eligibleAt&&<Text style={s.muted}>Umbral de recuperación: {new Date(exam.eligibleAt).toLocaleString('es-CO')}</Text>}
    <TeacherAnchor id={`actions-reason-${exam.attemptId}`}><Field label={`Motivo de suspensión de ${exam.title}`} multiline maxLength={1000} value={reasons[exam.attemptId]??''} editable={!busy} onChangeText={value=>onReasonChange(exam.attemptId,value)}/></TeacherAnchor>
    <Button label="Suspender y permitir reinicio" disabled={busy||!exam.canSuspend||!reasons[exam.attemptId]?.trim()} onPress={()=>setConfirmation({
     title:'¿Suspender y permitir reinicio?',
     body:'Se conservarán el intento, sus respuestas y su selección como historial, sin calificación, reprobación ni repaso por este incidente. Se autorizará un solo reemplazo. No empezará ni correrá su reloj hasta que el estudiante lo abra. Si el intento ya fue calificado, la suspensión será rechazada.',
     confirmLabel:'Confirmar suspensión',onConfirm:()=>{
      const latest=current.current.data.exams.find(item=>item.attemptId===exam.attemptId);
      if(!latest?.canSuspend){onUpdated(latest?.reason??'La acción ya no está disponible. Actualiza el seguimiento.',true);return;}
      void act('teacher_suspend_attempt',{attemptId:exam.attemptId,reason:current.current.reasons[exam.attemptId]?.trim(),confirmed:true});
     },
    })}/>
   </>}
  </TeacherAnchor>)}
  <Confirm value={confirmation} onClose={()=>setConfirmation(null)}/>
 </TeacherAnchor>;
}
