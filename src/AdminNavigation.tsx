import {useEffect,useRef,useState} from 'react';
import {BackHandler,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import type {AdminTab} from '../shared/admin';
import {Button,colors} from './ui';

export type AdminLocation={tab:AdminTab;groupId?:string;directory?:'all'};
export const adminSections=[['inicio','◈','Inicio'],['usuarios','⌕','Consultar'],['profesores','⇄','Asignación y transición'],['catalogo','▤','Programas y componentes'],['auditoria','▥','Auditoría']] as const;
export const adminSection=(location:AdminLocation)=>location.tab==='salones'?'profesores':location.tab;
export const adminTitle=(location:AdminLocation)=>adminSections.find(([id])=>id===adminSection(location))?.[2]??'Inicio';
function readLocation():AdminLocation{
 if(Platform.OS!=='web')return {tab:'inicio'};
 const match=window.location.hash.match(/^#administracion\/([^/]+)(?:\/([^/]+))?$/);
 if(!match||!['inicio','usuarios','profesores','salones','catalogo','auditoria'].includes(match[1]!))return {tab:'inicio'};
 try{return {tab:match[1] as AdminTab,...(match[1]==='salones'&&match[2]?{groupId:decodeURIComponent(match[2])}:{}),...(match[1]==='usuarios'&&match[2]==='todos'?{directory:'all' as const}:{})};}catch{return {tab:'inicio'};}
}
export function useAdminNavigation(owner:string|null,enabled:boolean,onNavigate:()=>void){
 const [location,setLocation]=useState<AdminLocation>(readLocation);
 const onNavigateRef=useRef(onNavigate);onNavigateRef.current=onNavigate;
 useEffect(()=>{setLocation(readLocation());},[owner]);
 function go(next:AdminLocation){
  setLocation(next);onNavigateRef.current();
  if(Platform.OS==='web')window.history.pushState(null,'',`#administracion/${next.tab}${next.groupId?`/${encodeURIComponent(next.groupId)}`:next.directory==='all'?'/todos':''}`);
 }
 useEffect(()=>{
  if(!enabled)return;
  const pop=()=>{setLocation(readLocation());onNavigateRef.current();};
  if(Platform.OS==='web'){window.addEventListener('popstate',pop);window.addEventListener('hashchange',pop);}
  const back=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(location.groupId){go({tab:'salones'});return true;}
   if(location.tab!=='inicio'){go({tab:'inicio'});return true;}
   return false;
  });
  return()=>{back.remove();if(Platform.OS==='web'){window.removeEventListener('popstate',pop);window.removeEventListener('hashchange',pop);}};
 },[enabled,location]);
 return {location,go};
}

export function AdminNavigation({wide,location,active,disabled,onNavigate,onCommon,onLogout,name}:{wide:boolean;location:AdminLocation;active:boolean;disabled:boolean;onNavigate:(location:AdminLocation)=>void;onCommon:(page:'profile'|'help')=>void;onLogout:()=>void;name:string}){
 const [open,setOpen]=useState(false);
 return <View style={{width:wide?252:undefined,backgroundColor:colors.sidebar,padding:wide?22:12,gap:wide?22:10}} testID="admin-navigation">
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Text style={{color:'#fff',fontSize:26,fontWeight:'700',letterSpacing:4}}>◈ APEX</Text>{!wide&&<Button secondary expanded={open} label={open?'Cerrar menú':'Abrir menú'} onPress={()=>setOpen(!open)}/>}</View>
  {wide&&<View style={{gap:6,borderBottomWidth:1,borderBottomColor:'#536779',paddingBottom:20}}><Text style={{color:'#fff',fontWeight:'600',fontSize:16}}>{name}</Text><Text style={{color:'#CAD9E8',fontSize:13}}>Administración</Text></View>}
  {!wide&&!open&&<Text style={{color:'#DCE7F2',fontSize:14}}>{active?adminTitle(location):'Opciones de cuenta'}</Text>}
  {(wide||open)&&<><ScrollView style={wide?{flex:1}: {maxHeight:360}} contentContainerStyle={{gap:6}} keyboardShouldPersistTaps="handled">
   {adminSections.map(([id,icon,label])=><Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:active&&adminSection(location)===id,disabled}} aria-selected={active&&adminSection(location)===id} disabled={disabled} onPress={()=>{onNavigate({tab:id});setOpen(false);}} style={{padding:13,minHeight:48,borderRadius:9,backgroundColor:active&&adminSection(location)===id?colors.primary:'transparent',flexDirection:'row',gap:12,alignItems:'center'}}><Text style={{color:'#DCE7F2',fontSize:18,width:22}}>{icon}</Text><Text style={{color:'#fff',fontSize:14,flex:1,lineHeight:21,fontWeight:active&&adminSection(location)===id?'700':'400'}}>{label}</Text></Pressable>)}
   <View style={{borderTopWidth:1,borderTopColor:'#536779',marginTop:12,paddingTop:12,gap:6}}>{(['profile','help'] as const).map(id=><Pressable key={id} accessibilityRole="button" accessibilityLabel={id==='profile'?'Editar perfil':'Ayuda'} disabled={disabled} onPress={()=>{onCommon(id);setOpen(false);}} style={{padding:13,minHeight:46}}><Text style={{color:'#DCE7F2',fontSize:14}}>{id==='profile'?'○   Editar perfil':'?   Ayuda'}</Text></Pressable>)}</View>
  </ScrollView><Button secondary disabled={disabled} label="Cerrar sesión" onPress={onLogout}/></>}
 </View>;
}
