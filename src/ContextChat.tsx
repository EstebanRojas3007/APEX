import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {ContextChat as Chat} from '../shared/contracts';
import {request} from './api';
import {Button,Card,Field,styles as s} from './ui';
export type ChatTarget={kind:'section';sectionId:string}|{kind:'review';attemptId:string};
export function ContextChat({target,onError,onCompleted}:{target:ChatTarget|null;onError:(error:unknown)=>void;onCompleted:()=>void}){
 const [chat,setChat]=useState<Chat|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<{key:string;text:string}|null>(null);
 useEffect(()=>{let alive=true;setChat(null);pending.current=null;setText('');if(!target)return;let id:string|undefined;
  void request<Chat>('/chat/open',undefined,'POST',target).then(value=>{if(alive){setChat(value);id=value.id;}}).catch(error=>{if(alive)onError(error);});
  const timer=setInterval(()=>{if(id)void request<Chat>('/chat/get',undefined,'POST',{sessionId:id}).then(value=>{if(alive)setChat(value);}).catch(error=>{if(alive)onError(error);});},3000);
  return()=>{alive=false;clearInterval(timer);};
 },[target]);
 async function action(fn:()=>Promise<void>){if(busy)return;setBusy(true);try{await fn();}catch(error){onError(error);}finally{setBusy(false);}}
 if(!target)return <Card><Text style={s.heading}>Tutor contextual</Text><Text style={s.text}>Abre «Refuerzo» desde una sección o «Ir al repaso» desde una evaluación reprobada. El tutor usa ese contexto y materiales autorizados.</Text><Text style={s.muted}>La disponibilidad depende del servicio IA configurado en servidor.</Text></Card>;
 return <View style={s.stack}><Text style={s.title}>{target.kind==='review'?'Repaso de la evaluación':'Refuerzo de la sección'}</Text><Card><Text style={s.text}>{target.kind==='review'?'Trabaja las preguntas incorrectas u omitidas y las habilidades que requieren refuerzo.':'Consulta el objetivo, contenido y práctica de esta sección.'}</Text><Text style={s.muted}>El tutor orienta el aprendizaje. Los resultados se conservan.</Text>{!chat&&<Text style={s.muted}>Recuperando conversación…</Text>}{chat&&<Text accessibilityLiveRegion="polite" style={s.notice}>{chat.status==='ready'?'Tutor disponible':chat.status==='pending'?'Respuesta pendiente del servicio IA':chat.status==='running'?'Preparando respuesta…':chat.status==='unavailable'?'Tutor no disponible; falta servicio o material autorizado.':'No se pudo validar la respuesta del tutor.'}</Text>}</Card>{chat?.messages.map(m=><Card key={m.id}><Text style={s.tag}>{m.role==='assistant'?'Tutor APEX':'Tú'}</Text><Text style={s.text}>{m.text}</Text></Card>)}{chat&&!chat.completedAt&&<Card><Field label="Mensaje para el tutor" value={text} multiline onChangeText={value=>{setText(value);if(pending.current?.text!==value.trim())pending.current=null;}}/><Button label="Enviar mensaje" disabled={busy||!text.trim()||chat.status==='pending'||chat.status==='running'} onPress={()=>void action(async()=>{
  const message=pending.current??{key:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,text:text.trim()};pending.current=message;
  setChat(await request<Chat>('/chat/send',undefined,'POST',{sessionId:chat.id,...message}));pending.current=null;setText('');
 })}/>{['unavailable','error'].includes(chat.status)&&<Button secondary disabled={busy} label="Reintentar conexión del tutor" onPress={()=>void action(async()=>{setChat(await request<Chat>('/chat/open',undefined,'POST',target));})}/>}</Card>}{chat?.kind==='review'&&<Card><Text style={s.text}>Al declarar el refuerzo terminado habilitas un nuevo intento de esta evaluación. La declaración no cambia tu nota ni acredita dominio.</Text><Button label={chat.completedAt?'Refuerzo terminado registrado':'Refuerzo terminado'} disabled={busy||!chat.canComplete} onPress={()=>void action(async()=>{setChat(await request<Chat>('/chat/complete',undefined,'POST',{sessionId:chat.id}));onCompleted();})}/>{!chat.completedAt&&!chat.canComplete&&<Text style={s.muted}>Completa un intercambio con el tutor disponible para registrar el repaso.</Text>}</Card>}</View>;
}
