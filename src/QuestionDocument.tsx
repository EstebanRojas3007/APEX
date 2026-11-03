import {Text,View} from 'react-native';
import type {Question} from '../shared/contracts';
import {Card,styles as s} from './ui';

// A single React Native component serves web and Android. Plain text preserves paragraph breaks,
// avoids HTML injection and lets the outer assessment ScrollView handle long readings on phones.
export function QuestionDocument({question}:{question:Question}) {
 const context=question.context;
 if(!context)return null;
 return <Card><Text accessibilityRole="header" style={s.heading}>{context.title}</Text>
  <Text style={s.muted}>{question.sourceTitle} · PDF p. {context.pageStart}{context.pageEnd!==context.pageStart?`–${context.pageEnd}`:''}</Text>
  <Text selectable style={s.text}>{context.instructions}</Text>
  <Text style={s.muted}>Consulta el contexto completo mientras respondes las preguntas asignadas. Los ejemplos no se califican.</Text>
  {!!context.reading&&<View style={{gap:8}}><Text style={s.tag}>LECTURA COMPARTIDA</Text><Text selectable style={s.text}>{context.reading}</Text></View>}
  {!!context.example&&<View style={{gap:8}}><Text style={s.tag}>EJEMPLO DEL DOCUMENTO · NO CALIFICABLE</Text><Text selectable style={s.text}>{context.example}</Text></View>}
  {context.sharedOptions.length>0&&<View style={{gap:6}}><Text style={s.tag}>OPCIONES COMPARTIDAS DEL DOCUMENTO</Text>{context.sharedOptions.map(o=><Text key={o.label} selectable style={s.text}>{o.label}. {o.text}</Text>)}</View>}
  {context.format==='cloze'&&<Text style={s.notice}>Responde solo el espacio ({question.originalNumber}) de esta pregunta. La lectura conserva la numeración original.</Text>}
 </Card>;
}
