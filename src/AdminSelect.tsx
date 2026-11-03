import {useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {Button,styles as s,colors} from './ui';
export type AdminSelectProps={label:string;value:string;items:readonly (readonly [string,string])[];onChange:(value:string)=>void;disabled?:boolean};
export default function AdminSelect({label,value,items,onChange,disabled}:AdminSelectProps){
 const [open,setOpen]=useState(false);
 return <View style={{gap:7,flex:1,minWidth:160}}><Text style={s.label}>{label}</Text><Button secondary label={`${label}: ${items.find(([id])=>id===value)?.[1]??'Todos'} ▾`} expanded={open} disabled={disabled} onPress={()=>setOpen(true)}/>
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={{flex:1,padding:24,justifyContent:'center',backgroundColor:'#15263CB3'}}><View accessibilityViewIsModal style={[s.card,{maxHeight:'80%'}]}><Text style={s.heading}>{label}</Text><ScrollView keyboardShouldPersistTaps="handled">{items.map(([id,name])=><Pressable key={id} accessibilityRole="radio" accessibilityState={{checked:value===id}} onPress={()=>{onChange(id);setOpen(false);}} style={{padding:15,minHeight:48,backgroundColor:value===id?'#EDF3F8':'#fff',borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.text}>{value===id?'●  ':'○  '}{name}</Text></Pressable>)}</ScrollView><Button secondary label="Cerrar opciones" onPress={()=>setOpen(false)}/></View></View></Modal>
 </View>;
}
