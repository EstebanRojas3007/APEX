import {useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import type {Attempt,AttemptClock,ClockResponse,Result} from '../shared/contracts';
import {request,RequestError} from './api';
import {remainingTime} from './assessmentTime';

type Input={attempt:Attempt|null;enabled:boolean;online:boolean;busy:boolean;expiredFromServer:boolean;onResult:(result:Result)=>void;onError:(error:unknown)=>void};
export function useAssessmentClock(input:Input){
 const callbacks=useRef(input);callbacks.current=input;
 const sample=useRef<{id:string;source:AttemptClock|undefined;clock:AttemptClock|undefined;at:number}>({id:'',source:undefined,clock:undefined,at:0});
 if(input.attempt&&(sample.current.id!==input.attempt.id||sample.current.source!==input.attempt.clock)){
  sample.current={id:input.attempt.id,source:input.attempt.clock,clock:input.attempt.clock,at:performance.now()};
 }
 const [tick,setTick]=useState(0),[syncing,setSyncing]=useState(false);
 const [announcement,setAnnouncement]=useState('');
 const announced=useRef(new Set<string>());
 const kind=input.attempt?.kind,id=input.attempt?.id;
 const known=sample.current.clock;
 const timed=known?.policy==='total-apex-v1';
 const remaining=input.expiredFromServer?0:known?remainingTime(known,sample.current.at,performance.now()):null;
 const expired=input.expiredFromServer||!!known&&(known.expired||timed&&remaining===0);
 const missing=!!input.attempt&&!known&&kind!=='diagnostico';
 useEffect(()=>{announced.current.clear();setAnnouncement('');},[id]);
 useEffect(()=>{
  if(!input.enabled||!id)return;
  let alive=true,inFlight=false,foreground=AppState.currentState!=='background',lastPoll=performance.now();
  const poll=async()=>{
   const current=callbacks.current;
   if(!alive||inFlight||!foreground||!current.online||current.busy)return;
   inFlight=true;lastPoll=performance.now();
   try{
    const data=await request<ClockResponse>(`/attempts/${id}/clock`);
    if(!alive||callbacks.current.attempt?.id!==id)return;
    sample.current={...sample.current,clock:data.clock,at:performance.now()};
    setSyncing(false);setTick(value=>value+1);
    if(data.status==='finalizado'&&data.result)callbacks.current.onResult(data.result);
   }catch(error){
    if(alive&&error instanceof RequestError&&(error.status===401||error.status===403||error.status===0||error.details?.code==='ATTEMPT_SUSPENDED'))callbacks.current.onError(error);
   }finally{inFlight=false;}
  };
  const resume=()=>{
   if(sample.current.clock?.policy==='total-apex-v1'||missing)setSyncing(true);
   void poll();
  };
  const timer=setInterval(()=>{
   setTick(value=>value+1);
   const clock=sample.current.clock;
   const left=callbacks.current.expiredFromServer?0:clock?remainingTime(clock,sample.current.at,performance.now()):null;
   if(performance.now()-lastPoll>=(left===0?2000:15000))void poll();
  },1000);
  const subscription=AppState.addEventListener('change',state=>{foreground=state==='active';if(foreground)resume();});
  if(Platform.OS==='web')window.addEventListener('focus',resume);
  if(input.online)resume();
  return()=>{alive=false;clearInterval(timer);subscription.remove();if(Platform.OS==='web')window.removeEventListener('focus',resume);};
 },[id,input.enabled,input.online,input.expiredFromServer,missing]);
 useEffect(()=>{
  if(!input.enabled||!timed||remaining===null)return;
  const message=expired?'Tiempo agotado, procesando resultado':remaining<=60000?'Queda un minuto de evaluación.':remaining<=300000?'Quedan cinco minutos de evaluación.':'';
  if(message&&!announced.current.has(message)){announced.current.add(message);setAnnouncement(message);}
 },[tick,id,input.enabled,timed,expired]);
 return {clock:known,remainingMs:remaining,expired,blocked:expired||missing||syncing,announcement,
  elapsedMs:known?Math.max(0,known.serverNow-known.startedAt+performance.now()-sample.current.at):0};
}
