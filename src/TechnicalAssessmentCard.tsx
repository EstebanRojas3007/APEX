import React from 'react';
import {Text} from 'react-native';
import type {TechnicalAssessment} from '../shared/contracts';
import {Button,Card,styles as s} from './ui';

export function TechnicalAssessmentCard({assessment,disabled,onBegin,onResume}:{assessment:TechnicalAssessment;disabled:boolean;onBegin:()=>void;onResume:()=>void}){
 return <Card><Text style={s.tag}>VERIFICACIÓN TÉCNICA</Text><Text accessibilityRole="header" style={s.heading}>{assessment.title}</Text>
  <Text style={s.text}>10 preguntas · 15 minutos · Un único intento recuperable. El plazo continúa aunque cierres la app. Las respuestas confirmadas se entregan automáticamente al vencer.</Text>
  <Text style={s.muted}>Este resultado es evidencia técnica. No genera progreso, aprobaciones ni repasos.</Text>
  <Button disabled={disabled} label={assessment.status==='finalizado'?'Consultar resultado técnico':assessment.status==='activo'?'Retomar prueba técnica':'Preparar prueba técnica'} onPress={assessment.status?onResume:onBegin}/>
 </Card>;
}
