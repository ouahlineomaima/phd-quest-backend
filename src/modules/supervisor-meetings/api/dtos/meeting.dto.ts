import { CHECKPOINT_IDENTITY } from '../../../../common/identifiers';
import { SupervisorRole, MeetingType, MeetingStatus, MeetingActionPhase, MeetingActionStatus } from '../../persistence/enums/meeting.enums';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ACTION_PHASES, ACTION_STATUSES, MEETING_STATUSES, MEETING_TYPES, SUPERVISOR_ROLES, TASK_REFERENCE, RECORD_ID } from '../../persistence/enums/meeting.enums';
const trim = ({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value;
export class SupervisorFieldsDto {
  @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/\S/) @MaxLength(160) @Transform(trim) name?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsIn(SUPERVISOR_ROLES) role?: SupervisorRole;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(300) @Transform(trim) institution?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(254) @ValidateIf((_,v)=>v!=='') @IsEmail() @Transform(trim) email?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(5000) notes?: string;
}
export class CreateSupervisorDto extends SupervisorFieldsDto {}
export class NotesDto {
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(10000) agenda?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(10000) discussion?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(10000) feedback?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(10000) decisions?: string;
}
export class CheckpointRefDto {
  @IsInt() @Min(0) @Max(12) levelNumber!: number;
  @IsString() @MaxLength(100) @Matches(/^[a-z0-9][a-z0-9_-]*$/) checkpointId!: string;
  @ValidateIf((_,v)=>v!==undefined) @Matches(CHECKPOINT_IDENTITY) checkpointIdentity?:string;
}
export class DocumentLinkDto {
  @IsString() @Matches(/\S/) @MaxLength(160) @Transform(trim) label!: string;
  @IsString() @MaxLength(2048) @IsUrl({protocols:['http','https'],require_protocol:true,require_tld:false,disallow_auth:true}) url!: string;
}
export class MeetingFieldsDto {
  @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/\S/) @MaxLength(160) @Transform(trim) title?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsISO8601({strict:true,strictSeparator:true}) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) scheduledAt?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) scheduledLocal?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) plannedDurationMinutes?: number|null;
  @ValidateIf((_,v)=>v!==undefined) @IsIn(MEETING_TYPES) type?: MeetingType;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(1000) location?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ArrayUnique() @Matches(RECORD_ID,{each:true}) supervisorIds?: string[];
  @ValidateIf((_,v)=>v!==undefined) @IsObject() @ValidateNested() @Type(()=>NotesDto) notes?: NotesDto;
  @ValidateIf((_,v)=>v!==undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique() @Matches(RECORD_ID,{each:true}) goalIds?: string[];
  @ValidateIf((_,v)=>v!==undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique((r:CheckpointRefDto)=>r && `${r.levelNumber}:${r.checkpointId}`) @ValidateNested({each:true}) @Type(()=>CheckpointRefDto) checkpointRefs?: CheckpointRefDto[];
  @ValidateIf((_,v)=>v!==undefined) @IsArray() @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(()=>DocumentLinkDto) documents?: DocumentLinkDto[];
}
export class CreateMeetingDto extends MeetingFieldsDto {}
export class ActionFieldsDto {
  @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/\S/) @MaxLength(160) @Transform(trim) title?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(5000) description?: string;
  @ValidateIf((_,v)=>v!==undefined) @IsIn(ACTION_PHASES) phase?: MeetingActionPhase;
  @ValidateIf((_,v)=>v!==undefined) @IsIn(ACTION_STATUSES) status?: MeetingActionStatus;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string|null;
  @ValidateIf((_,v)=>v!==undefined) @IsArray() @ArrayMaxSize(200) @ArrayUnique() @Matches(TASK_REFERENCE,{each:true}) linkedTaskIds?: string[];
}
export class MeetingStatusDto { @IsIn(MEETING_STATUSES) status!: MeetingStatus; }
export class MeetingFilterDto {
  @IsOptional() @IsIn(MEETING_STATUSES) status?: MeetingStatus;
  @IsOptional() @Matches(RECORD_ID) supervisorId?: string;
  @IsOptional() @IsIn(['active','archived','all']) archived?: string;
}
export class SupervisorFilterDto { @IsOptional() @IsIn(['active','archived','all']) archived?: string; }
export class ActionFilterDto extends SupervisorFilterDto {
  @IsOptional() @IsIn(ACTION_PHASES) phase?: MeetingActionPhase;
  @IsOptional() @IsIn([...ACTION_STATUSES,'open']) status?: MeetingActionStatus|'open';
  @IsOptional() @Matches(RECORD_ID) meetingId?: string;
  @IsOptional() @IsIn(['all','overdue','today','undated']) due?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string;
}
