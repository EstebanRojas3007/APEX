import {useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import type {RouteStatus,SectionLocation} from '../shared/contracts';
import {request} from './api';
import {generationMessages,hasSectionContent,levelLockMessage,levelNames} from './learning';
import {Button,Card,colors,styles as s} from './ui';

type Props={
 onError:(error:unknown)=>void;
 onAssessments:()=>void;
 onOpen:(location:SectionLocation)=>void;
 expandedLevel:number|null|undefined;
 onExpandedLevelChange:(level:number|null)=>void;
 onReady:()=>void;
};

export function LearningRoute({onError,onAssessments,onOpen,expandedLevel,onExpandedLevelChange,onReady}:Props){
 const [route,setRoute]=useState<RouteStatus|null>(null),[busy,setBusy]=useState(false);
 const [focusedLevel,setFocusedLevel]=useState<number|null>(null);
 const {width}=useWindowDimensions();
 const panelPadding=width<600?16:24;
 const refresh=async()=>setRoute(await request<RouteStatus>('/route'));
 useEffect(()=>{
  let alive=true,inFlight=false;
  const poll=async()=>{
   if(inFlight)return;
   inFlight=true;
   try{const value=await request<RouteStatus>('/route');if(alive)setRoute(value);}
   catch(error){if(alive)onError(error);}
   finally{inFlight=false;}
  };
  void poll();const timer=setInterval(()=>void poll(),5000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!route||expandedLevel!==undefined)return;
  // The RPC exposes availability and passed controls, rather than a current-level field.
  const available=route.levels?.filter(level=>level.available)??[];
  onExpandedLevelChange((available.find(level=>!level.controlPassed)??available.at(-1))?.level??null);
 },[route,expandedLevel,onExpandedLevelChange]);
 async function retry(level:number){if(busy)return;setBusy(true);try{await request('/route/retry',undefined,'POST',{level});await refresh();}catch(error){onError(error);}finally{setBusy(false);}}

 return <View style={s.stack} onLayout={()=>{if(route&&expandedLevel!==undefined)onReady();}}>
  <Text accessibilityRole="header" style={s.title}>Mi ruta</Text>
  <Text style={s.text}>Tres niveles, siete secciones por nivel. Despliega un nivel y selecciona una sección para consultar su contenido o su estado.</Text>
  {!route&&<Text style={s.muted}>Consultando tu ruta…</Text>}
  {route&&<Text accessibilityLiveRegion="polite" style={s.heading}>{route.message}</Text>}
  {route?.levels?.map(level=>{
   const name=levelNames[level.level-1],expanded=expandedLevel===level.level;
   const status=!level.available?'Nivel bloqueado':level.controlPassed?'Control aprobado':level.controlAvailable?'Control habilitado':generationMessages[level.status];
   return <View key={level.level} style={[s.card,a.level]}>
    <Pressable
     accessibilityRole="button"
     accessibilityLabel={`Nivel ${name}, ${level.completed}/7 secciones terminadas, ${status}`}
     accessibilityHint={`${expanded?'Contraer':'Desplegar'} el resumen del nivel.`}
     accessibilityState={{expanded}}
     aria-expanded={expanded}
     focusable
     onFocus={()=>setFocusedLevel(level.level)}
     onBlur={()=>setFocusedLevel(null)}
     onPress={()=>onExpandedLevelChange(expanded?null:level.level)}
     style={({pressed})=>[a.header,{padding:panelPadding},pressed&&a.pressed,focusedLevel===level.level&&a.focused]}
    >
     <View style={a.headerText}>
      <Text style={s.heading}>{name}</Text>
      <Text style={s.muted}>{level.completed}/7 secciones terminadas</Text>
      <Text style={[s.muted,{color:level.controlPassed?colors.accent:colors.muted}]}>{status}</Text>
     </View>
     <Text accessible={false} aria-hidden style={a.arrow}>{expanded?'⌃':'⌄'}</Text>
    </Pressable>
    {expanded&&<View style={[a.panel,{padding:panelPadding}]}>
     {!level.available&&<Text style={s.notice}>{levelLockMessage(level.level)}</Text>}
     {level.error&&<Text style={s.notice}>{level.error}</Text>}
     {level.available&&level.status!=='ready'&&<Button secondary disabled={busy||level.status==='running'} label={level.status==='pending'?'Preparar generación':'Reintentar generación'} onPress={()=>void retry(level.level)}/>}
     <View>
      {Array.from({length:7},(_,index)=>{
       const order=index+1,item=level.sections.find(section=>section.order===order);
       const title=item?.title?.trim()||'Contenido pendiente';
       const allowed=level.available&&(!item||item.available);
       const ready=!!item&&hasSectionContent(item);
       const state=!allowed?'Sección bloqueada':item?.completedAt?'Terminada':!ready?'Contenido pendiente':item.startedAt?'En curso':'Disponible';
       return <Pressable key={order}
        accessibilityRole="button"
        accessibilityLabel={`Abrir sección ${order} de ${name}`}
        accessibilityHint={`${title}. ${state}. ${allowed&&ready?'Consultar contenido.':'Consultar estado y requisitos.'}`}
        accessibilityState={{disabled:busy}}
        aria-disabled={busy}
        disabled={busy}
        onPress={()=>onOpen({level:level.level,order})}
        style={({pressed})=>[a.section,pressed&&a.pressed,busy&&{opacity:0.55}]}
       >
        <Text style={[s.text,a.number]}>{order}.</Text>
        <View style={a.sectionText}>
         <Text style={[s.text,a.sectionTitle]}>{title}</Text>
         <Text style={[s.muted,item?.completedAt&&allowed&&{color:colors.accent}]}>{state}</Text>
         {level.available&&item&&!item.available&&<Text style={s.muted}>Completa las secciones previas requeridas.</Text>}
        </View>
        <Text style={a.access}>{allowed&&ready?'Abrir':'Ver estado'}</Text>
       </Pressable>;
      })}
     </View>
     <View style={{gap:8}}>
      <Text style={s.heading}>Control del nivel</Text>
      <Text style={s.muted}>{level.controlPassed?'Control aprobado':level.available&&level.controlAvailable?'Control habilitado':'Control bloqueado'} · 10 preguntas · mínimo 7 aciertos.</Text>
      {!level.controlPassed&&!(level.available&&level.controlAvailable)&&<Text style={s.muted}>{level.available?'El control se habilita al terminar las siete secciones.':'El control requiere habilitar este nivel y terminar sus siete secciones.'}</Text>}
      {level.available&&level.controlAvailable&&<Button disabled={busy} label="Ver controles" onPress={onAssessments}/>}
     </View>
    </View>}
   </View>;
  })}
  {route&&<Card>
   <Text style={s.heading}>Examen final</Text>
   <Text style={s.text}>{route.finalAvailable?'Examen final habilitado':'Examen final bloqueado'}</Text>
   <Text style={s.muted}>25 preguntas · mínimo 22 aciertos.</Text>
   {!route.finalAvailable&&<Text style={s.muted}>Aprueba el control de Intermedio-avanzado para habilitar el examen final.</Text>}
   {route.finalAvailable&&<Button disabled={busy} label="Ver examen final" onPress={onAssessments}/>}
  </Card>}
 </View>;
}

const a=StyleSheet.create({
 level:{padding:0,gap:0},
 header:{minHeight:80,flexDirection:'row',alignItems:'center',gap:12,borderRadius:18,borderWidth:2,borderColor:'transparent'},
 headerText:{flex:1,minWidth:0,gap:3},
 arrow:{fontSize:28,fontWeight:'600',color:colors.primary},
 focused:{borderColor:colors.primary},
 pressed:{backgroundColor:'#EDF2F7'},
 panel:{borderTopWidth:1,borderTopColor:colors.border,gap:16},
 section:{minHeight:64,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:colors.border},
 number:{width:22,color:colors.primary,fontWeight:'600'},
 sectionText:{flex:1,minWidth:0},
 sectionTitle:{fontWeight:'600'},
 access:{color:colors.primary,fontSize:14,fontWeight:'600',maxWidth:66,textAlign:'right'},
});
