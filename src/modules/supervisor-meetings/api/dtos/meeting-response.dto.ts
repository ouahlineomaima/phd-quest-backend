import {MeetingRecord,SupervisorRecord,MeetingAction,CheckpointReference} from '../../persistence/interfaces/meeting.interface';
import {LinkedTaskState} from '../../../goals/persistence/interfaces/goal.interface';
import {GoalStatus} from '../../../goals/persistence/enums/goal.enums';
export type SupervisorResponse=Omit<SupervisorRecord,'_id'|'editVersion'>&{id:string;editVersion:string};
export type MissingSupervisor={id:string;name:string;missing:true;archivedAt:null};
export type LinkedMeetingTask=LinkedTaskState|{sourceId:string;weekId:string;taskId:string;title:string;status:null;date:string;missing:true};
export interface ActionResponse extends MeetingAction {meetingId:string;meetingVersion:string;linkedTasks:LinkedMeetingTask[];progress:{completed:number;total:number;linked:number;missing:number;percentage:number|null};}
export interface MeetingResponse extends Omit<MeetingRecord,'_id'|'editVersion'|'actions'> {id:string;editVersion:string;scheduledLocal:string;scheduledLabel:string;supervisors:(SupervisorResponse|MissingSupervisor)[];linkedGoals:{id:string;title:string;status:GoalStatus|null;missing:boolean}[];linkedCheckpoints:(CheckpointReference&{title:string;completed:boolean|null;missing:boolean;resolution:'resolved'|'missing'|'unverified'})[];actions:ActionResponse[];}
export interface MeetingListResponse{timezone:string;items:MeetingResponse[];}
