import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AttemptClock} from '../shared/contracts';
import {formatTime,remainingTime,timeConditions} from './assessmentTime';
const clock:AttemptClock={policy:'total-apex-v1',startedAt:100000,expiresAt:1000000,durationSeconds:900,serverNow:100000,remainingMs:900000,expired:false,submissionReason:null};
test('Clock display uses the server remainder and monotonic elapsed time, independently of Date',()=>{
 assert.equal(remainingTime(clock,500,1500),899000);
 assert.equal(remainingTime(clock,500,900501),0);
 assert.equal(remainingTime({...clock,remainingMs:12000,serverNow:-5000000},500,1500),11000);
 assert.equal(remainingTime({...clock,remainingMs:null,expiresAt:null,policy:'diagnostico-sin-limite-v1'},0,1800001),null);
 assert.equal(formatTime(900000),'15:00');assert.equal(formatTime(2250000),'37:30');assert.equal(formatTime(1),'00:01');assert.equal(formatTime(0),'00:00');
});
test('Conditions describe the assigned server policy, including historical untimed attempts',()=>{
 const assignment={id:'a',title:'Control',version:2,status:'activo',attemptId:'i',kind:'control' as const};
 assert.match(timeConditions({...assignment,timePolicy:'anterior-sin-limite-v1',durationSeconds:null}),/política anterior, sin límite total/);
 assert.match(timeConditions({...assignment,timePolicy:'total-apex-v1',durationSeconds:900}),/15 minutos/);
 assert.match(timeConditions({...assignment,kind:'final',timePolicy:'total-apex-v1',durationSeconds:2250}),/37 minutos y 30 segundos/);
 assert.match(timeConditions({...assignment,kind:'diagnostico'}),/No hay entrega automática/);
});
