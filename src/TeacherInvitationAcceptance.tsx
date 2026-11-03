import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {AdminInvitation} from '../shared/admin';
import {supabase,type TeacherInvitationLink} from './supabase';
import {adminErrorMessage} from './api';
import {Button,Card,styles as s} from './ui';

export function TeacherInvitationAcceptance({link,onAccepted,onClose}:{link?:TeacherInvitationLink|null;onAccepted:()=>Promise<void>;onClose:()=>void}){
 const [invitation,setInvitation]=useState<AdminInvitation|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const sending=useRef(false),alive=useRef(true);
 const args={invitation_id:link?.id??null,invitation_token:link?.token??null};
 useEffect(()=>{alive.current=true;let valid=true;
  void supabase?.rpc('apex_teacher_invitation_review',args).then(({data,error})=>{if(valid){if(error)setError(adminErrorMessage(error));else setInvitation(data);}});
  return()=>{valid=false;alive.current=false;};
 },[link?.id,link?.token]);
 async function accept(){
  if(sending.current||!supabase)return;sending.current=true;setBusy(true);setError('');
  try{const {error}=await supabase.rpc('apex_accept_teacher_invitation_v2',args);if(error)throw new Error(adminErrorMessage(error));if(alive.current)await onAccepted();}
  catch(err){if(alive.current)setError(err instanceof Error?err.message:typeof err==='object'&&err&&'message' in err?String(err.message):'No se pudo aceptar la invitación.');}
  finally{sending.current=false;if(alive.current)setBusy(false);}
 }
 return <Card><Text accessibilityRole="header" style={s.heading}>Aceptar invitación de Profesor</Text>
  {invitation&&<View style={{gap:8}}><Text style={s.text}>Destinatario: {invitation.name} · {invitation.email}</Text><Text style={s.text}>Rol actual: Estudiante · Rol propuesto: Profesor</Text><Text style={s.text}>Motivo: {invitation.reason}</Text><Text style={s.muted}>Vence: {new Date(invitation.expiresAt).toLocaleString('es-CO')} · Estado: {invitation.status}</Text><Text style={s.text}>Al aceptar, recibirás el rol Profesor. Se conservan tu perfil y tu historial.</Text></View>}
  {!!error&&<Text accessibilityRole="alert" style={s.notice}>{error}</Text>}
  <Button label="Aceptar rol Profesor" disabled={busy||!invitation||invitation.status!=='sent'} onPress={()=>void accept()}/>
  <Button secondary label="Volver sin aceptar" disabled={busy} onPress={onClose}/>
 </Card>;
}
