import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {RouteStatus,Section,SectionLocation} from '../shared/contracts';
import {request} from './api';
import {generationMessages,hasSectionContent,levelLockMessage,levelNames} from './learning';
import {Button,Card,styles as s} from './ui';
export function LearningSection({location,onError,onBack,onChat}:{location:SectionLocation;onError:(error:unknown)=>void;onBack:()=>void;onChat:(sectionId:string)=>void}){
 const [route,setRoute]=useState<RouteStatus|null>(null),[section,setSection]=useState<Section|null>(null),[busy,setBusy]=useState(false),[showSolutions,setShowSolutions]=useState(false);
 const revision=useRef(0),mutating=useRef(false);
 useEffect(()=>{
  let alive=true,opened:string|null=null,inFlight=false;
  setRoute(null);setSection(null);setShowSolutions(false);
  const poll=async()=>{
   if(inFlight||mutating.current)return;inFlight=true;const version=revision.current;
   try{
    const current=await request<RouteStatus>('/route');
    let item=current.levels?.find(level=>level.level===location.level)?.sections.find(value=>value.order===location.order)??null;
    const level=current.levels?.find(value=>value.level===location.level);
    if(item&&level?.available&&item.available&&hasSectionContent(item)&&opened!==item.id){
     item=await request<Section>('/sections/open',undefined,'POST',{sectionId:item.id});opened=item.id;
    }
    if(alive&&version===revision.current){setRoute(current);setSection(item);}
   }catch(error){if(alive)onError(error);}finally{inFlight=false;}
  };
  void poll();const timer=setInterval(()=>void poll(),5000);return()=>{alive=false;clearInterval(timer);};
 },[location.level,location.order]);
 const level=route?.levels?.find(value=>value.level===location.level);
 const available=!!level?.available&&!!section?.available;
 const ready=!!section&&hasSectionContent(section);
 async function complete(){
  if(busy||!section||!available||!ready||section.completedAt)return;
  mutating.current=true;revision.current++;setBusy(true);
  try{setSection(await request<Section>('/sections/complete',undefined,'POST',{sectionId:section.id}));}
  catch(error){onError(error);}finally{mutating.current=false;setBusy(false);}
 }
 return <View style={s.stack}>
  <Button secondary disabled={busy} label="Volver a Mi ruta" onPress={onBack}/>
  <Text style={s.tag}>{levelNames[location.level-1]} · Sección {location.order}/7{section?` · v${section.version}`:''}</Text>
  <Text accessibilityRole="header" style={s.title}>{ready&&available?section!.title:`Sección ${location.order} de ${levelNames[location.level-1]}`}</Text>
  {!route&&<Card><Text style={s.text}>Consultando el estado de la sección…</Text></Card>}
  {route&&(!ready||!available)&&<Card>
   <Text accessibilityLiveRegion="polite" style={s.heading}>{level&&!level.available||section&&!section.available?'Sección bloqueada':'Contenido pendiente'}</Text>
   <Text style={s.text}>{level&&!level.available?levelLockMessage(location.level):section&&!section.available?'Completa las secciones previas requeridas antes de abrir esta sección.':'El contenido de esta sección aún no está disponible. Puedes regresar más adelante.'}</Text>
   {level?.available&&!ready&&<Text style={s.muted}>{generationMessages[level.status]}{level.error?` · ${level.error}`:''}</Text>}
   <Text style={s.muted}>La finalización y el Refuerzo estarán disponibles cuando exista contenido autorizado y se cumplan los requisitos.</Text>
  </Card>}
  {ready&&available&&section&&<>
   <Card><Text style={s.heading}>Objetivo</Text><Text style={s.text}>{section.objective}</Text><Text style={s.muted}>{section.skill} · Personalización: {section.reason}</Text><Text style={s.heading}>Explicación</Text><Text style={s.text}>{section.explanation}</Text><Text style={s.tag}>Contenido original generado por IA para APEX</Text></Card>
   <Card><Text style={s.heading}>Ejemplos originales</Text>{section.examples.map((example,index)=><View key={index} style={s.stack}><Text style={s.text}>{example.prompt}</Text><Text style={s.text}>{example.response}</Text><Text style={s.muted}>{example.explanation}</Text></View>)}</Card>
   <Card><Text style={s.heading}>Práctica formativa</Text>{section.practice.map((exercise,index)=><View key={index} style={s.stack}><Text style={s.text}>{index+1}. {exercise.prompt}</Text>{showSolutions&&<><Text style={s.text}>{exercise.response}</Text><Text style={s.muted}>{exercise.explanation}</Text></>}</View>)}<Button secondary label={showSolutions?'Ocultar orientación':'Ver orientación de la práctica'} onPress={()=>setShowSolutions(!showSolutions)}/></Card>
   <Card><Text style={s.heading}>Referencias autorizadas</Text>{section.references.map(ref=><Text key={ref.fragmentId} style={s.muted}>{ref.title} · página {ref.page}{ref.edition?` · ${ref.edition}`:''}</Text>)}<Text style={s.muted}>Estas fuentes respaldan la sección. Los ejemplos y la práctica son contenido original de APEX.</Text></Card>
   <Card><Text style={s.heading}>Refuerzo contextualizado</Text><Text style={s.text}>Consulta al tutor sobre el objetivo y la práctica de esta sección. Es opcional y depende del servicio y los materiales autorizados.</Text><Button secondary disabled={busy} label="Refuerzo" onPress={()=>onChat(section.id)}/></Card>
   <Card><Text style={s.text}>{section.completedAt?'Finalización declarada registrada.':'Marca la sección cuando hayas terminado la explicación y la práctica.'} El control comprueba el aprendizaje; esta declaración no acredita dominio.</Text><Button disabled={busy||!!section.completedAt} label={section.completedAt?'Sección terminada':'Marcar sección terminada'} onPress={()=>void complete()}/></Card>
  </>}
 </View>;
}
