// Tracking DTOs only. No questions, answer keys, route bodies or tutor messages.
export type TeacherGroup={id:string;code:string;name:string;componentId:string;component:string;status:'activo'|'inactivo';activeCount:number;membershipCount:number};
export type TrackingAttempt={id:string;assignmentId:string;chainId:string;resultAvailable:boolean;title:string;kind:'diagnostico'|'control'|'final';level:number|null;number:number|null;status:string;startedAt:number;completedAt:number|null;correct:number|null;total:number|null;passed:boolean|null;threshold:number|null;reviewRequired:boolean;reviewStatus:string|null;reviewCompletedAt:string|null;suspendedAt?:number|null;replacementId?:string|null;skills:{label:string;correct:number;total:number}[]};
export type TrackingAssessment={kind:'control'|'final';level:number|null;status:string;passed:boolean|null;correct:number|null;total:number|null;reviewRequired:boolean;activeRetry:boolean};
export type TrackingLevel={level:number;version:number|null;generationStatus:string;completed:number;sections:{order:number;status:'pending'|'completed'|'started'|'available';completedAt:string|null}[]};
export type TeacherActions={diagnostic:{state:'not_assigned'|'assigned'|'in_progress'|'completed';canAssign:boolean;reason:string};exams:(TrackingAttempt&{attemptId:string;serverNow:number;eligibleAt:number|null;canSuspend:boolean;reason:string|null;suspendedAt:number|null;replacementId:string|null;replacementStatus:string|null})[]};
export type TeacherActionResult={code:string;message:string;assigned?:number;replacementId?:string|null};
export type TrackingStudent={id:string;name:string;program:string;semester:number;diagnosticStatus:'pendiente'|'en progreso'|'completado';diagnostic:TrackingAttempt|null;currentLevel:number|null;journeyStage:JourneyStage;levels:TrackingLevel[];assessments:TrackingAssessment[];attempts:TrackingAttempt[];reviewRequired:boolean;lastSignInAt:string|null;lastActivityAt:string|null;teacherActions?:TeacherActions};
export type TeacherRoster={group:TeacherGroup;students:TrackingStudent[]};
export type JourneyStage='diagnostic_pending'|'level_1'|'level_2'|'level_3'|'final_passed';
export type SummaryCategory='diagnostic'|'control_1'|'control_2'|'control_3'|'final';
export type GroupSummary={
 group:TeacherGroup;updatedAt:string;population:number;
 diagnostic:{completed:number;inProgress:number;pending:number};
 stages:{id:JourneyStage;count:number}[];
 study:{level:number;withRoute:number;pending:number;completedSections:number}[];
 assessments:{key:Exclude<SummaryCategory,'diagnostic'>;withoutResult:number;passed:number;notPassed:number;undecided:number;activeAttempts:number;activeRetries:number}[];
 skills:{key:SummaryCategory;withResult:number;supportedStudents:number;fallbackStudents:number;groups:{key:string;label:string;students:number;skills:{id:string;label:string;correct:number;total:number;students:number}[]}[]}[];
 reviewPending:number;incompleteHistory:number;
};
