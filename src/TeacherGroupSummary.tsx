import {useState} from 'react';
import {Text,View} from 'react-native';
import {Button,Card,colors,styles as s} from './ui';
import type {GroupSummary,SummaryCategory} from '../shared/teacher';

const levels=['Básico','Intermedio','Intermedio-avanzado'];
const categories:Record<SummaryCategory,string>={diagnostic:'Diagnóstico',control_1:'Control 1 · Básico',control_2:'Control 2 · Intermedio',control_3:'Control 3 · Intermedio-avanzado',final:'Examen final'};
const stageLabels={diagnostic_pending:'Diagnóstico pendiente',level_1:'Básico',level_2:'Intermedio',level_3:'Intermedio-avanzado',final_passed:'Final aprobado'};
const percent=(n:number,d:number)=>d?`${(100*n/d).toLocaleString('es-CO',{maximumFractionDigits:1})} %`:'Sin datos';
// Visible text is also the accessible summary. Bars are decorative so readers
// announce labels and exact fractions once; color is never the only encoding.
function Bars({rows,denominator}:{rows:{label:string;value:number;detail?:string}[];denominator:number}) {
 return <View style={{gap:14}}>{rows.map(row=><View key={row.label} style={{gap:5}}>
  <Text style={s.text}>{row.label}: {row.value}/{denominator}{row.detail?` · ${row.detail}`:''}</Text>
  <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{height:10,borderRadius:5,backgroundColor:'#E8EEF5',overflow:'hidden'}}>
   <View style={{height:10,borderRadius:5,width:`${denominator?Math.min(100,100*row.value/denominator):0}%`,backgroundColor:colors.primary}}/>
  </View>
 </View>)}</View>;
}

export function TeacherGroupSummary({data}:{data:GroupSummary}) {
 const [category,setCategory]=useState<SummaryCategory>('diagnostic');
 const skills=data.skills.find(item=>item.key===category);
 const n=data.population;
 return <View style={s.stack}>
  <Card><Text style={s.tag}>SEGUIMIENTO DOCENTE · SOLO CONSULTA</Text>
   <Text accessibilityRole="header" style={s.title}>Resumen del salón</Text>
   <Text style={s.heading}>{data.group.name} · {data.group.code}</Text>
   <Text style={s.text}>{data.group.component} · {n} estudiantes incluidos</Text>
   <Text style={s.muted}>Actualizado: {new Date(data.updatedAt).toLocaleString('es-CO')}</Text>
   {data.group.membershipCount!==n&&<Text style={s.notice}>{data.group.membershipCount} cupos reservados; {n} estudiantes elegibles actuales. Las reservas sin autorización vigente no aportan datos.</Text>}
   <Text style={s.muted}>Describe a los integrantes actuales. Puede incluir resultados previos a su ingreso al grupo; no representa resultados obtenidos durante esta clase.</Text>
  </Card>
  {!n?<Card><Text accessibilityRole="header" style={s.heading}>Salón sin estudiantes elegibles</Text><Text style={s.text}>No hay población para calcular indicadores. Los cupos reservados pueden diferir de los estudiantes incluidos.</Text></Card>:<>
   {!!data.incompleteHistory&&<Text accessibilityRole="alert" style={s.notice}>Información histórica insuficiente: {data.incompleteHistory} estudiantes tienen intentos finalizados sin un resultado registrado. Esos intentos no se cuentan como resultados.</Text>}
   <Card><Text accessibilityRole="header" style={s.heading}>Diagnóstico</Text>
    <Bars denominator={n} rows={[{label:'Completado',value:data.diagnostic.completed},{label:'En progreso',value:data.diagnostic.inProgress},{label:'Pendiente',value:data.diagnostic.pending}]}/>
    <Text style={s.muted}>Un estudiante por estado, sobre {n} integrantes actuales. Solo un intento finalizado con resultado cuenta como completado. El diagnóstico no tiene aprobado ni reprobado.</Text>
   </Card>
   <Card><Text accessibilityRole="header" style={s.heading}>Etapa actual del recorrido</Text>
    <Bars denominator={n} rows={data.stages.map(stage=>({label:stageLabels[stage.id],value:stage.count}))}/>
    <Text style={s.muted}>Etapa derivada del diagnóstico terminado y las decisiones de avance del servidor. No expresa nivel de dominio del inglés ni nivel MCER.</Text>
   </Card>
   <Card><Text accessibilityRole="header" style={s.heading}>Avance de estudio por nivel</Text>
    {data.study.map(level=><View key={level.level} style={{gap:10}}>
     <Text style={s.heading}>{levels[level.level-1]}</Text>
     <Text style={s.text}>{level.withRoute}/{n} estudiantes con ruta disponible · {level.pending}/{n} con ruta pendiente de generación.</Text>
     {level.withRoute?<><Bars denominator={7*level.withRoute} rows={[{label:'Secciones completadas',value:level.completedSections,detail:percent(level.completedSections,7*level.withRoute)}]}/><Text style={s.muted}>Denominador: 7 secciones previstas × {level.withRoute} estudiantes con ruta = {7*level.withRoute}. Se usa la versión más reciente de cada ruta.</Text></>:<Text style={s.notice}>Ruta pendiente de generación. Sin contenido disponible para calcular avance.</Text>}
    </View>)}
    <Text style={s.muted}>Las rutas pendientes no aportan lecciones ni ceros al porcentaje. Completar secciones registra estudio; no equivale a demostrar dominio.</Text>
   </Card>
   <Text accessibilityRole="header" style={s.heading}>Controles y examen final</Text>
   {data.assessments.map(item=>{
    const known=item.passed+item.notPassed;
    return <Card key={item.key}><Text accessibilityRole="header" style={s.heading}>{categories[item.key]}</Text>
     <Bars denominator={n} rows={[{label:'Sin resultado finalizado',value:item.withoutResult},{label:'Aprobado',value:item.passed},{label:'No aprobado',value:item.notPassed},{label:'Resultado sin decisión de aprobación',value:item.undecided}]}/>
     <Text style={s.text}>Aprobación: {known?`${item.passed}/${known} con decisión conocida · ${percent(item.passed,known)}`:'Sin datos · ninguna decisión conocida.'}</Text>
     <Text style={s.muted}>Umbral vigente: {item.key==='final'?'22/25':'7/10'}. La aprobación procede de la decisión guardada, sin recalcular decisiones históricas ausentes.</Text>
     <Text style={s.muted}>{item.activeAttempts} estudiantes con intento activo; {item.activeRetries} con reintento activo y resultado anterior conservado.</Text>
    </Card>;
   })}
   <Text style={s.muted}>Cada categoría utiliza el último resultado finalizado por estudiante y tipo/nivel. Desempate por fecha de finalización e ID descendentes. Un reintento activo conserva la nota anterior. Los ausentes no cuentan como reprobados.</Text>
   <Card><Text accessibilityRole="header" style={s.heading}>Desempeño por habilidad</Text>
    <Text style={s.muted}>Selecciona una categoría. No se promedian pruebas de distinto tipo.</Text>
    <View style={s.row}>{(Object.keys(categories) as SummaryCategory[]).map(key=><View key={key} accessibilityState={{selected:category===key}} aria-selected={category===key}><Button label={`${category===key?'✓ ':''}${categories[key]}`} secondary={category!==key} onPress={()=>setCategory(key)}/></View>)}</View>
    <Text accessibilityRole="header" style={s.heading}>{categories[category]} · habilidades</Text>
    {!skills?.withResult?<Text style={s.notice}>Sin datos: nadie tiene un resultado finalizado para esta categoría.</Text>:<>
     <Text style={s.text}>{skills.supportedStudents}/{skills.withResult} estudiantes con resultado y desglose verificable.</Text>
     {skills.withResult>skills.supportedStudents&&<Text style={s.notice}>Información histórica insuficiente para {skills.withResult-skills.supportedStudents} estudiantes: sin desglose verificable, identificadores estables o reglas compatibles.</Text>}
     {!!skills.fallbackStudents&&<Text style={s.notice}>Se utiliza un resultado compatible anterior para {skills.fallbackStudents} estudiantes cuyo resultado más reciente no permite un desglose fiable.</Text>}
     {skills.groups.map(group=><View key={group.key} style={{gap:12}}>
      <Text style={s.muted}>Serie compatible: {group.label} · {group.students} estudiantes. Las versiones o políticas diferentes se muestran separadas.</Text>
      {group.skills.map(skill=><View key={skill.id} style={{gap:4}}><Bars denominator={skill.total} rows={[{label:skill.label,value:skill.correct,detail:percent(skill.correct,skill.total)}]}/><Text style={s.muted}>{skill.students} estudiantes · {skill.total} preguntas evaluadas</Text></View>)}
     </View>)}
    </>}
    <Text style={s.muted}>Aciertos acumulados / preguntas evaluadas por habilidad. Se usa un resultado por estudiante: el último finalizado compatible. Las omitidas registradas por el calificador cuentan en el denominador. Solo se incluyen desgloses contrastados con el banco inmutable y el resultado guardado.</Text>
    <Text style={s.notice}>Valores descriptivos de la práctica APEX. Sin equivalencia con puntajes oficiales del ICFES.</Text>
   </Card>
   <Card><Text accessibilityRole="header" style={s.heading}>Repaso obligatorio pendiente</Text>
    <Bars denominator={n} rows={[{label:'Estudiantes con repaso pendiente',value:data.reviewPending}]}/>
    <Text style={s.muted}>Estado vigente de cada cadena de evaluación y repaso; cada estudiante cuenta una vez. Los fallos resueltos y el refuerzo opcional de sección no generan esta alerta.</Text>
   </Card>
  </>}
 </View>;
}
