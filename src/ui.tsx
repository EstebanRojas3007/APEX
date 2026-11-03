import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
export const colors={primary:'#3D5A80',soft:'#5B7FA5',accent:'#337255',background:'#F5F7FA',text:'#26394C',muted:'#596979',border:'#DCE2EA',sidebar:'#2C3E50'};
export const styles=StyleSheet.create({
  text:{fontSize:16,lineHeight:25,color:colors.text},muted:{fontSize:14,lineHeight:22,color:colors.muted},
  title:{fontSize:30,fontWeight:'700',color:colors.text,lineHeight:38},heading:{fontSize:21,fontWeight:'700',color:colors.text,lineHeight:29},
  card:{backgroundColor:'#fff',borderRadius:18,padding:24,borderWidth:1,borderColor:colors.border,gap:16},
  row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},stack:{gap:20},
  button:{minHeight:48,paddingHorizontal:20,paddingVertical:12,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  buttonText:{color:'#fff',fontSize:15,fontWeight:'600',textAlign:'center'},
  input:{minHeight:48,borderWidth:1,borderColor:'#8998A7',borderRadius:10,paddingHorizontal:14,paddingVertical:11,fontSize:16,color:colors.text,backgroundColor:'#fff'},
  label:{fontSize:14,fontWeight:'600',color:colors.text,marginBottom:7},
  tag:{color:colors.accent,fontSize:12,fontWeight:'700',letterSpacing:1.1},
  notice:{padding:14,borderRadius:10,backgroundColor:'#EDF3F8',color:colors.primary,fontSize:14,lineHeight:22},
});
export function Button({label,onPress,secondary=false,disabled=false,expanded}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;expanded?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled,...(expanded===undefined?{}:{expanded})}} aria-expanded={expanded} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,secondary&&{backgroundColor:'#EDF2F7',borderWidth:1,borderColor:colors.border},(disabled||pressed)&&{opacity:0.55}]}><Text style={[styles.buttonText,secondary&&{color:colors.primary}]}>{label}</Text></Pressable>;
}
export function Field({label,...props}:TextInputProps&{label:string}) {return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[styles.input,props.style]}/></View>;}
export function Card({children}:{children:React.ReactNode}) {return <View style={styles.card}>{children}</View>;}
export function Check({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}) {return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:value}} aria-checked={value} onPress={()=>onChange(!value)} style={{flexDirection:'row',gap:12,paddingVertical:8,minHeight:48,alignItems:'center'}}><Text style={{fontSize:23,color:colors.primary}}>{value?'☑':'☐'}</Text><Text style={[styles.muted,{flex:1}]}>{label}</Text></Pressable>;}
export type Confirmation={title:string;body:string;confirmLabel:string;onConfirm:()=>void};
export function Confirm({value,onClose}:{value:Confirmation|null;onClose:()=>void}) {if(!value)return null;return <Modal visible={!!value} transparent animationType="fade" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#15263CB3',alignItems:'center',justifyContent:'center',padding:24}}><View accessibilityViewIsModal aria-modal={true} style={[styles.card,{maxWidth:480,width:'100%'}]}><Text accessibilityRole="header" style={styles.heading}>{value?.title}</Text><Text style={styles.text}>{value?.body}</Text><Button label={value?.confirmLabel??'Confirmar'} onPress={()=>{const callback=value?.onConfirm;onClose();callback?.();}}/><Button label="Volver" secondary onPress={onClose}/></View></View></Modal>;}
