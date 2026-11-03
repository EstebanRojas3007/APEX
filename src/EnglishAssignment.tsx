import {useState} from 'react';
import {Text} from 'react-native';
import {transitionDiagnostic} from './api';
import {Card,Button,Field,Confirm,styles as s,type Confirmation} from './ui';
export function EnglishAssignment({onError}:{onError:(error:unknown)=>void}){
 const [ids,setIds]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const selected=Array.from(new Set(ids.split(/[\s,;]+/).filter(Boolean)));
 return <Card><Text style={s.heading}>Transición al diagnóstico APEX</Text>
  <Text style={s.text}>Siete preguntas del banco APEX: 2 básicas, 2 intermedias y 3 intermedio-avanzadas. Requiere preparar y habilitar la transición en servidor.</Text>
  <Text style={s.muted}>Solo se asigna a estudiantes autorizados sin diagnóstico previo ni intentos de Inglés. Las asignaciones e intentos anteriores se conservan.</Text>
  <Field label="IDs de estudiantes para la transición" value={ids} onChangeText={setIds} multiline/>
  <Button disabled={busy||!selected.length} label="Preparar asignación del diagnóstico APEX" onPress={()=>setConfirmation({title:'Asignar diagnóstico APEX',body:`Se comprobarán ${selected.length} estudiantes. Se omitirán quienes ya tengan un diagnóstico o intentos de Inglés. Esta acción registra nuevas asignaciones en Supabase.`,confirmLabel:'Confirmar asignaciones nuevas',onConfirm:()=>{setBusy(true);void transitionDiagnostic(selected).then(result=>setNotice(`Asignaciones nuevas: ${result.assigned} de ${result.requested} destinatarios.`)).catch(onError).finally(()=>setBusy(false));}})}/>
  {!!notice&&<Text accessibilityLiveRegion="polite" style={s.text}>{notice}</Text>}
  <Confirm value={confirmation} onClose={()=>setConfirmation(null)}/>
 </Card>;
}
