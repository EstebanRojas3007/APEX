import type {Summary} from '../shared/contracts';
export const primaryAssignments=(summary:Summary|null)=>(summary?.assignments??[]).filter(item=>!summary?.primaryComponent||item.componentIds?.includes(summary.primaryComponent));
export const primaryResults=(summary:Summary|null)=>(summary?.results??[]).filter(item=>!summary?.primaryComponent||item.componentIds?.includes(summary.primaryComponent));
