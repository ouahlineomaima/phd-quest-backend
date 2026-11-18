export { RECORD_ID, TASK_REFERENCE } from '../../../../common/identifiers';
export enum SupervisorRole { Primary='primary', CoSupervisor='co_supervisor', Other='other' }
export enum MeetingType { InPerson='in_person', Online='online', Hybrid='hybrid' }
export enum MeetingStatus { Scheduled='scheduled', Completed='completed', Cancelled='cancelled' }
export enum MeetingActionPhase { PreMeeting='pre_meeting', PostMeeting='post_meeting' }
export enum MeetingActionStatus { Pending='pending', InProgress='in_progress', Completed='completed' }
export const SUPERVISOR_ROLES=Object.values(SupervisorRole);
export const MEETING_TYPES=Object.values(MeetingType);
export const MEETING_STATUSES=Object.values(MeetingStatus);
export const ACTION_PHASES=Object.values(MeetingActionPhase);
export const ACTION_STATUSES=Object.values(MeetingActionStatus);
