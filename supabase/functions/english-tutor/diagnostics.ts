export type TutorDiagnostic={
 stage:'configuration'|'auth'|'request'|'groq_request'|'groq_response';
 code:'CONFIG_MISSING'|'CONFIG_INVALID'|'AUTH_UNAVAILABLE'|'GROQ_REJECTED'|'GROQ_TIMEOUT'|'GROQ_NETWORK_ERROR'|'GROQ_INVALID_RESPONSE'|'UNEXPECTED_ERROR';
 duration_ms:number;
 groq_status?:number;
};

export function tutorDiagnostic(stage:TutorDiagnostic['stage'],code:TutorDiagnostic['code'],startedAt:number):TutorDiagnostic{
 return {stage,code,duration_ms:Math.max(0,Math.round(performance.now()-startedAt))};
}

// Explicit allowlist: never serialize exceptions, requests, config or provider bodies.
export function logTutorFailure({stage,code,duration_ms,groq_status}:TutorDiagnostic){
 console.error(JSON.stringify({stage,code,duration_ms,...(code==='GROQ_REJECTED'&&groq_status!==undefined?{groq_status}:{})}));
}
