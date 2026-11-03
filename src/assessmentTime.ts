import type {Assignment,AttemptClock} from '../shared/contracts';

// Only presentation uses the monotonic device timer. PostgreSQL decides expiration.
export function remainingTime(clock:AttemptClock,sampledAt:number,monotonicNow:number):number|null {
 return clock.remainingMs===null?null:Math.max(0,clock.remainingMs-Math.max(0,monotonicNow-sampledAt));
}
export function formatTime(milliseconds:number):string {
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}
export function timeConditions(assignment?:Assignment):string {
 if(assignment?.kind==='diagnostico')return 'Sin límite de tiempo. No hay entrega automática.';
 if(assignment?.timePolicy==='anterior-sin-limite-v1')return 'Este intento conserva su política anterior, sin límite total.';
 if(assignment?.timePolicy==='total-apex-v1'&&assignment.durationSeconds){
  return `Tiempo total: ${assignment.durationSeconds===900?'15 minutos':'37 minutos y 30 segundos'}. Al vencer se entregan las respuestas confirmadas; las omisiones cuentan como no acertadas.`;
 }
 return 'El servidor confirmará la política temporal al abrir el intento.';
}
