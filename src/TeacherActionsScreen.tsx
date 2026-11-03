import {Pressable,Text,View} from 'react-native';
import type {TrackingStudent} from '../shared/teacher';
import {Card,colors,styles as s} from './ui';
import {TeacherAnchor} from './useTeacherViewport';

export function TeacherActionsScreen({student,expanded,onExpandedChange,children}:{student:TrackingStudent;expanded:boolean;onExpandedChange:(value:boolean)=>void;children:React.ReactNode}){
 // These are fields backed by the intervention record in the authorized
 // tracking projection, not a history inferred from an exam's status.
 const evidence=student.attempts.filter(attempt=>typeof attempt.suspendedAt==='number');
 return <View style={s.stack}>
  <TeacherAnchor id="actions-student"><Text accessibilityRole="header" style={s.title}>Acciones del profesor</Text><Text style={s.heading}>{student.name||'Estudiante'}</Text></TeacherAnchor>
  <TeacherAnchor id="actions-history"><View style={[s.card,{padding:0,gap:0,overflow:'hidden'}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Acciones realizadas" accessibilityState={{expanded}} aria-expanded={expanded} focusable
    onPress={()=>onExpandedChange(!expanded)} style={({pressed})=>({minHeight:64,padding:16,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:pressed?'#EDF2F7':'#fff'})}>
    <Text style={[s.heading,{flex:1,minWidth:0}]}>Acciones realizadas</Text><Text accessible={false} aria-hidden style={{color:colors.primary}}>{expanded?'▲':'▼'}</Text>
   </Pressable>
   {expanded&&<View style={{padding:16,gap:16,borderTopWidth:1,borderTopColor:colors.border}}>
    <Text style={s.text}>Historial de acciones no disponible en esta versión</Text>
    {!!evidence.length&&<><Text style={s.muted}>Evidencia disponible en el seguimiento: suspensiones registradas. No incluye autor ni motivo y no representa un historial completo.</Text>
     {evidence.map(attempt=><View key={attempt.id} style={{gap:8}}><Text style={s.heading}>{attempt.title}</Text><Text style={s.text}>Suspensión registrada: {new Date(attempt.suspendedAt!).toLocaleString('es-CO')}</Text><Text selectable style={s.muted}>Intento original: {attempt.id}</Text>{attempt.replacementId&&<Text selectable style={s.muted}>Reemplazo vinculado: {attempt.replacementId}</Text>}</View>)}
    </>}
   </View>}
  </View></TeacherAnchor>
  <TeacherAnchor id="actions-available">{children??<Card><Text style={s.text}>No hay datos de acciones disponibles en esta versión.</Text></Card>}</TeacherAnchor>
 </View>;
}
