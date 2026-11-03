export type Profile = { id: string; name: string; email: string; birthDate: string; program: string; semester: number; role?: 'estudiante'|'docente'|'administrador'; complete?: boolean };
export type Registration = Omit<Profile, 'id'> & { password: string; consent: boolean };
export type QuestionContext = { id:string;title:string;instructions:string;reading:string|null;example:string|null;sharedOptions:{label:string;text:string}[];format:'vocabulario_compartido'|'conversacion'|'cloze'|'lectura';pageStart:number;pageEnd:number };
export type Question = { id: string; questionId?:string;version?:number;level?:number|null;skill?:string|null;text: string; nucleus: string; competency: string; provenance?:string; originalNumber?:number|null;sourcePage?:number|null;sourceTitle?:string;classificationProposed?:boolean;context?:QuestionContext|null;options: { id: string; text: string;label?:string }[] };
export type TimePolicy='diagnostico-sin-limite-v1'|'anterior-sin-limite-v1'|'total-apex-v1';
export type AttemptClock={policy:TimePolicy;startedAt:number;durationSeconds:number|null;expiresAt:number|null;serverNow:number;remainingMs:number|null;expired:boolean;submissionReason:'manual'|'tiempo_agotado'|null};
export type Attempt = { id: string; title?:string;technical?:boolean;kind?:'diagnostico'|'control'|'final';status: string; questions: Question[]; answers: Record<string, string | null>; lastActivity: number;clock?:AttemptClock;result?:Result|null };
export type ClockResponse={attemptId:string;status:string;clock:AttemptClock;result:Result|null};
export type Breakdown = { label: string; correct: number; total: number; percentage: number };
export type Result = { attemptId: string; title?:string;technical?:boolean;correct: number; total: number; percentage: number; completedAt: number; rule: string; nuclei: Breakdown[]; competencies: Breakdown[];kind?:'diagnostico'|'control'|'final';level?:number|null;passed?:boolean|null;threshold?:number|null;reviewRequired?:boolean;advancementRule?:string;componentIds?:string[];submissionReason?:'manual'|'tiempo_agotado';timePolicy?:TimePolicy };
export type Assignment = { id:string;title:string;version:number;kind?:'diagnostico'|'control'|'final';count?:number;status:string|null;attemptId:string|null;canRetry?:boolean;reviewRequired?:boolean;restartAvailable?:boolean;retryPolicy?:'linked-review-v2'|'single-attempt-v1';componentIds?:string[];timePolicy?:TimePolicy;durationSeconds?:number|null;clock?:AttemptClock|null };
export type DiagnosticAvailability={code:'assigned'|'english_history'|'profile_pending'|'program_not_authorized'|'not_activated'|'template_unavailable'|'needs_transition';message:string};
export type TechnicalAssessment=Assignment & {technical:true;result:Result|null};
export type Summary = { profile: Profile; attempt: { id: string; status: string } | null; results: Result[]; assignments?:Assignment[];technicalAssessment?:TechnicalAssessment|null;diagnosticAvailability?:DiagnosticAvailability;primaryComponent?:string|null };
export type Material = { id: string; title: string; nucleus: string; body: string; source: string; edition?:string|null;version?:number;filePath?:string|null };
export type GenerationStatus='pending'|'running'|'ready'|'error'|'unavailable';
export type EducationalReference={fragmentId:string;sourceId:string;page:number;title:string;text:string;sha256:string;edition:string|null;url:string|null;origin?:'reference'};
export type OriginalExercise={prompt:string;response:string;explanation:string};
export type GeneratedSection={title:string;order:number;skillId:string;objective:string;explanation:string;examples:OriginalExercise[];practice:OriginalExercise[];references:{fragmentId:string;sourceId:string;page:number}[];reason:string;prerequisites:number[];origin:'original_ai_apex'};
export type Section=Omit<GeneratedSection,'references'> & {id:string;level:number;skill:string;version:number;generationStatus:'ready';references:EducationalReference[];startedAt:string|null;completedAt:string|null;available:boolean};
export type SectionLocation={level:number;order:number};
export type RouteStatus = {status:'pending'|'ready';message:string;integrationConnected:boolean;validatedVersion:number;completedLessons:string[];levels?:{level:number;available:boolean;status:GenerationStatus;error:string|null;version:number;completed:number;controlAvailable:boolean;controlPassed:boolean;sections:Section[]}[];finalAvailable?:boolean};
export type ContextChat={id:string;kind:'section'|'review';sectionId:string|null;attemptId:string|null;status:GenerationStatus;completedAt:string|null;retryAttemptId:string|null;canComplete:boolean;messages:{id:string;role:'user'|'assistant';text:string;createdAt:string}[]};
export type GeneratedLevel={contractVersion:2;kind:'sections';level:number;reason:string;agent:{provider:string;model:string;promptVersion:string};sections:GeneratedSection[]};
export type GeneratedChat={contractVersion:2;kind:'chat';text:string;references:{fragmentId:string;sourceId:string;page:number}[]};
// Server agent contract, shared types only; neither questions nor answer keys are inputs.
export type RouteAgentInput = {
 contractVersion:1; baseVersion:number;
 diagnosticBySkill:{skillId:string;skill:string;correct:number;total:number}[];
 catalog:{lessonVersionId:string;code:string;version:number;title:string;level:number;skillId:string;objective:string;prerequisites:string[]}[];
 progress:{completedLessons:{lessonVersionId:string;completedAt:string;ruleVersionId:string}[];assessmentResults:Result[]};
 rules:{ruleVersionId:string;version:number;allowedLevelTransitions:[number,number][];allowReinforcement:boolean}[];
};
export type RouteProposal = {
 contractVersion:1;contextId:string;baseVersion:number;ruleVersionId:string;reason:string;
 agent:{provider:string;model:string;promptVersion:string};
 steps:{lessonVersionId:string;order:number;prerequisites:string[];kind:'lesson'|'reinforcement';reason:string}[];
};
export function passwordChecks(password: string) {
  return [
    { label: 'Mínimo 8 caracteres', valid: password.length >= 8 },
    { label: 'Una letra mayúscula', valid: /[A-ZÁÉÍÓÚÑ]/.test(password) },
    { label: 'Al menos 3 dígitos', valid: (password.match(/[0-9]/g) ?? []).length >= 3 },
    { label: 'Un símbolo: * + - /', valid: /[*+\-/]/.test(password) },
  ];
}
export function validBirthDate(value: string) {
  const parsed = new Date(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10);
}
