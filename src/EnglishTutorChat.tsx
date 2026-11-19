import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {RequestError} from './api';
import {sendEnglishTutor} from './englishTutorApi';
import {colors} from './ui';
import {TutorMarkdown} from './TutorMarkdown';

type Message={role:'user'|'assistant';text:string};
export function useEnglishTutor(userId:string|null,onError:(error:unknown)=>void){
 const [messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef<AbortController|null>(null);
 useEffect(()=>{
  setMessages([]);setText('');setError('');setBusy(false);
  return()=>{inFlight.current?.abort();inFlight.current=null;};
 },[userId]);
 async function send(){
  const message=text.trim();if(!userId||inFlight.current||!message||text.length>2000)return;
  const controller=new AbortController();inFlight.current=controller;setBusy(true);setError('');
  try{
   const reply=await sendEnglishTutor(message,controller.signal);
   if(!controller.signal.aborted){setMessages(previous=>[...previous,{role:'user',text:message},{role:'assistant',text:reply}]);setText('');}
  }catch(err){
   if(!controller.signal.aborted){setError(err instanceof Error?err.message:'No se pudo contactar al tutor. Inténtalo de nuevo.');if(err instanceof RequestError&&err.status===401)onError(err);}
  }finally{
   if(inFlight.current===controller){inFlight.current=null;setBusy(false);if(controller.signal.aborted)setError('El tutor tardó demasiado. Tu mensaje se conserva; inténtalo de nuevo.');}
  }
 }
 return {messages,text,setText,busy,error,send};
}
export type EnglishTutorState=ReturnType<typeof useEnglishTutor>;

export function EnglishTutorChat({chat}:{chat:EnglishTutorState}){
 const {width}=useWindowDimensions(),desktop=width>=1000;
 const [info,setInfo]=useState(false),[keyboardInset,setKeyboardInset]=useState(0);
 const conversation=useRef<ScrollView>(null),followLatest=useRef(true);
 const infoButton=useRef<View>(null),closeButton=useRef<View>(null);
 const disabled=chat.busy||!chat.text.trim()||chat.text.length>2000;
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const viewport=window.visualViewport;
  const update=()=>setKeyboardInset(viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0);
  update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
  return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};
 },[]);
 function closeInfo(){
  setInfo(false);
  if(Platform.OS==='web')requestAnimationFrame(()=>infoButton.current?.focus());
 }
 function send(){followLatest.current=true;void chat.send();}
 return <View style={[v.layout,{paddingBottom:keyboardInset}]}>
  {desktop&&<View style={v.sidebar}>
   <Text accessibilityRole="header" style={v.sidebarTitle}>Mensajes</Text>
   <View accessible accessibilityState={{selected:true}} accessibilityLabel="Tutor IA Inglés, conversación seleccionada" style={v.selectedConversation}>
    <TutorAvatar/>
    <View style={v.shrink}><Text style={v.conversationTitle}>Tutor IA Inglés</Text><Text style={v.caption}>Práctica de inglés · Saber Pro</Text></View>
   </View>
  </View>}
  <View style={v.chat}>
   <View style={v.header}>
    <TutorAvatar/>
    <View style={v.shrink}><Text accessibilityRole="header" style={v.title}>Tutor IA Inglés</Text><Text style={v.caption}>Tu espacio para practicar inglés</Text></View>
    <Pressable ref={infoButton} accessibilityRole="button" accessibilityLabel="Información de Tutor IA Inglés" accessibilityHint="Abre la información del tutor y de la conversación" onPress={()=>setInfo(true)} style={({pressed})=>[v.iconButton,pressed&&v.pressed]}><Text style={v.infoIcon}>i</Text></Pressable>
   </View>
   <ScrollView ref={conversation} testID="tutor-conversation" style={v.history} contentContainerStyle={[v.historyContent,!chat.messages.length&&v.emptyHistory]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets scrollEventThrottle={16} onScroll={({nativeEvent:e})=>{followLatest.current=e.contentSize.height-e.layoutMeasurement.height-e.contentOffset.y<80;}} onContentSizeChange={()=>{if(followLatest.current)conversation.current?.scrollToEnd({animated:false});}}>
    {!chat.messages.length&&<View style={v.welcome}>
     <View style={v.welcomeAvatar}><Text style={v.welcomeSymbol}>✦</Text></View>
     <Text accessibilityRole="header" style={v.welcomeTitle}>¿Qué quieres practicar?</Text>
     <Text style={v.welcomeText}>Resuelve tus dudas de inglés y practica para Saber Pro.</Text>
    </View>}
    {chat.messages.map((message,index)=>{
     const assistant=message.role==='assistant';
     return <View key={index} style={[v.messageRow,!assistant&&v.userRow]}>
      {assistant&&<TutorAvatar small/>}
      <View style={[v.bubble,assistant?v.tutorBubble:v.userBubble]}>
       <Text style={[v.messageLabel,!assistant&&v.userLabel]}>{assistant?'Tutor IA Inglés':'Tú'}</Text>
       {assistant?<TutorMarkdown text={message.text}/>:<Text selectable style={v.userText}>{message.text}</Text>}
      </View>
     </View>;
    })}
   </ScrollView>
   <View style={v.composer}>
    {chat.busy&&<View style={v.status}><ActivityIndicator size="small" color={colors.primary}/><Text accessibilityLiveRegion="polite" style={v.statusText}>El tutor está preparando tu respuesta…</Text></View>}
    {!!chat.error&&<Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={v.error}>{chat.error}</Text>}
    <View style={v.inputRow}>
     <Pressable accessibilityRole="button" accessibilityLabel="Adjuntos no disponibles" accessibilityState={{disabled:true}} disabled style={[v.iconButton,v.attachment]}><View style={v.paperclip}><View style={v.paperclipInner}/></View></Pressable>
     <TextInput accessibilityLabel="Mensaje para el tutor de inglés" placeholder="Escribe tu mensaje…" placeholderTextColor={colors.muted} value={chat.text} multiline maxLength={2000} editable={!chat.busy} onChangeText={chat.setText} style={v.input}/>
     <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{disabled,busy:chat.busy}} disabled={disabled} onPress={send} style={({pressed})=>[v.send,disabled&&v.disabled,pressed&&v.pressed]}><Text style={v.sendIcon}>↑</Text></Pressable>
    </View>
    <View style={v.composerFooter}><Text style={v.footerText}>Conversación temporal</Text><Text style={v.footerText}>{chat.text.length}/2000 caracteres</Text></View>
   </View>
  </View>
  <Modal visible={info} transparent animationType="fade" onRequestClose={closeInfo} onShow={()=>{if(Platform.OS==='web')closeButton.current?.focus();}}>
   <View style={v.backdrop}>
    <View role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel="Información de Tutor IA Inglés" style={v.modal}>
     <View style={v.modalHeader}><Text accessibilityRole="header" style={v.modalTitle}>Acerca de tu tutor</Text><Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Cerrar información del tutor" onPress={closeInfo} style={({pressed})=>[v.iconButton,pressed&&v.pressed]}><Text style={v.closeIcon}>×</Text></Pressable></View>
     <ScrollView contentContainerStyle={v.modalContent} keyboardShouldPersistTaps="handled">
      <TutorAvatar/>
      <Text style={v.modalName}>Tutor IA Inglés</Text>
      <View style={v.details}><Text style={v.detail}><Text style={v.bold}>Proveedor: </Text>Groq</Text><Text selectable style={v.detail}><Text style={v.bold}>Modelo: </Text>openai/gpt-oss-120b</Text></View>
      <Text style={v.detail}>Resuelve dudas y practica inglés para Saber Pro, con explicaciones en español, ejemplos en inglés y ejercicios originales.</Text>
      <Text style={v.disclaimer}>Es una IA y puede cometer errores. Revisa sus respuestas.</Text>
      <Text style={v.detail}>La conversación es temporal y se borra de esta pantalla al cerrar sesión o recargar la app.</Text>
      <Text style={v.detail}>No modifica notas ni progreso, no completa repasos ni desbloquea evaluaciones.</Text>
     </ScrollView>
    </View>
   </View>
  </Modal>
 </View>;
}

function TutorAvatar({small=false}:{small?:boolean}){
 return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={[v.avatar,small&&v.smallAvatar]}><Text style={[v.avatarSymbol,small&&{fontSize:18}]}>✦</Text></View>;
}

const v=StyleSheet.create({
 layout:{flex:1,minHeight:0,minWidth:0,flexDirection:'row',backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:20,overflow:'hidden'},
 sidebar:{width:245,paddingVertical:26,paddingHorizontal:16,borderRightWidth:1,borderRightColor:colors.border,gap:24},
 sidebarTitle:{fontSize:22,fontWeight:'700',color:colors.text,paddingHorizontal:8},
 selectedConversation:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#EBF2FF',borderWidth:1,borderColor:'#D3E1FA',borderRadius:12,padding:12},
 conversationTitle:{fontSize:14,fontWeight:'700',color:'#264775',marginBottom:5},
 shrink:{flex:1,minWidth:0},caption:{fontSize:12,lineHeight:18,color:colors.muted},
 chat:{flex:1,minWidth:0,minHeight:0},header:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderBottomWidth:1,borderBottomColor:colors.border},
 title:{fontSize:18,lineHeight:26,fontWeight:'700',color:colors.text},
 avatar:{width:40,height:40,borderRadius:14,backgroundColor:'#E8EEFD',alignItems:'center',justifyContent:'center',flexShrink:0},
 avatarSymbol:{fontSize:25,color:'#4167B1'},smallAvatar:{width:30,height:30,borderRadius:10,marginTop:3},
 iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,flexShrink:0},
 infoIcon:{borderWidth:1.5,borderColor:colors.muted,color:colors.muted,borderRadius:10,width:20,height:20,textAlign:'center',lineHeight:18,fontSize:14,fontWeight:'700'},
 history:{flex:1,minHeight:0,backgroundColor:'#F5F7FB'},historyContent:{padding:18,gap:22},emptyHistory:{flexGrow:1,justifyContent:'center'},
 welcome:{alignItems:'center',paddingVertical:24,paddingHorizontal:12,gap:12,maxWidth:460,alignSelf:'center'},
 welcomeAvatar:{width:64,height:64,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#E8EEFD',marginBottom:6},
 welcomeSymbol:{fontSize:37,color:'#4167B1'},welcomeTitle:{fontSize:22,lineHeight:30,fontWeight:'700',textAlign:'center',color:colors.text},
 welcomeText:{fontSize:15,lineHeight:24,color:colors.muted,textAlign:'center'},
 messageRow:{flexDirection:'row',alignItems:'flex-start',gap:8,maxWidth:760,width:'100%',alignSelf:'center'},userRow:{justifyContent:'flex-end'},
 bubble:{minWidth:0,maxWidth:'88%',padding:16,gap:8,borderRadius:17,flexShrink:1},
 tutorBubble:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E4E9F1',borderTopLeftRadius:4},
 userBubble:{backgroundColor:'#365FAD',borderBottomRightRadius:4},
 messageLabel:{fontSize:11,lineHeight:16,fontWeight:'600',color:colors.muted},userLabel:{color:'#E0EAFF'},userText:{fontSize:15,lineHeight:25,color:'#fff',flexShrink:1},
 composer:{padding:12,borderTopWidth:1,borderTopColor:colors.border,gap:10,backgroundColor:'#fff'},
 inputRow:{flexDirection:'row',alignItems:'flex-end',borderWidth:1,borderColor:'#B9C6DA',borderRadius:15,padding:5,gap:2},
 input:{flex:1,minWidth:0,minHeight:44,maxHeight:120,paddingHorizontal:6,paddingVertical:12,fontSize:15,lineHeight:22,color:colors.text,textAlignVertical:'top',borderRadius:6},
 attachment:{opacity:0.4},paperclip:{width:14,height:24,borderWidth:2,borderColor:colors.muted,borderRadius:8,transform:[{rotate:'38deg'}]},
 paperclipInner:{width:6,height:16,borderWidth:1.5,borderTopWidth:0,borderColor:colors.muted,borderRadius:4,position:'absolute',top:1,left:2},
 send:{width:44,height:44,borderRadius:11,backgroundColor:'#365FAD',alignItems:'center',justifyContent:'center'},sendIcon:{fontSize:27,lineHeight:32,fontWeight:'600',color:'#fff'},
 disabled:{opacity:0.45},pressed:{opacity:0.65},composerFooter:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:4,paddingHorizontal:3},
 footerText:{fontSize:11,lineHeight:17,color:colors.muted},status:{flexDirection:'row',gap:8,alignItems:'center'},statusText:{fontSize:12,lineHeight:19,color:colors.primary,flex:1},
 error:{fontSize:13,lineHeight:20,color:'#91372D',backgroundColor:'#FFF1EF',borderRadius:8,padding:10},
 backdrop:{flex:1,backgroundColor:'#16283E99',padding:20,justifyContent:'center',alignItems:'center'},
 modal:{width:'100%',maxWidth:480,maxHeight:'90%',backgroundColor:'#fff',borderRadius:20,overflow:'hidden',flexShrink:1},
 modalHeader:{flexDirection:'row',alignItems:'center',gap:8,paddingLeft:24,paddingRight:12,paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border},
 modalTitle:{flex:1,fontSize:19,lineHeight:27,fontWeight:'700',color:colors.text},closeIcon:{fontSize:28,color:colors.muted},
 modalContent:{padding:24,gap:16},modalName:{fontSize:22,lineHeight:30,fontWeight:'700',color:colors.text},
 details:{padding:14,borderRadius:10,backgroundColor:'#F3F6FC',gap:8},detail:{fontSize:15,lineHeight:24,color:colors.text},bold:{fontWeight:'700'},
 disclaimer:{fontSize:15,lineHeight:24,color:'#395781',padding:14,borderRadius:10,backgroundColor:'#EBF2FF'},
});
