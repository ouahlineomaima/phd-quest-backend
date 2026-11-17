import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ActionFieldsDto, MeetingFieldsDto, SupervisorFieldsDto } from '../../api/dtos/meeting.dto';
import { RECORD_ID } from '../../persistence/enums/meeting.enums';
import { validTaskReferences } from './meetings.service';
type Row = Record<string, any>;
function invalid():never {throw new BadRequestException('Invalid supervisor-meeting backup records, history or associations.');}
function shape(row:Row, fields:string[]) {if(!row||typeof row!=='object'||Array.isArray(row)||fields.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>!fields.includes(k)))invalid();}
function dto<T extends object>(row:Row, type:new()=>T) {if(validateSync(plainToInstance(type,row),{whitelist:true,forbidNonWhitelisted:true,forbidUnknownValues:true}).length)invalid();}
function instant(value:unknown,end?:string) {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value||(end&&value>end))invalid();}
function history(row:Row,end:string) {instant(row.createdAt,end);instant(row.updatedAt,end);if(row.createdAt>row.updatedAt)invalid();if(row.archivedAt!==undefined&&row.archivedAt!==null){instant(row.archivedAt,end);if(row.archivedAt<row.createdAt||row.archivedAt>row.updatedAt)invalid();}}
function unique(ids:unknown[]) {if(new Set(ids).size!==ids.length)invalid();}
export function validateMeetingBackup(data:Row,end:string) {
  const supervisors=data.supervisors??[],meetings=data.supervisorMeetings??[];
  for(const row of supervisors){
    shape(row,['id','name','role','institution','email','notes','archivedAt','createdAt','updatedAt']);history(row,end);
    const {id,archivedAt,createdAt,updatedAt,...input}=row;dto(input,SupervisorFieldsDto);
  }
  const supervisorIds=new Set(supervisors.map((s:Row)=>s.id)),actionIds=new Set<string>();
  for(const row of meetings){
    shape(row,['id','title','scheduledAt','plannedDurationMinutes','type','location','status','supervisorIds','notes','goalIds','checkpointRefs','documents','actions','archivedAt','createdAt','updatedAt']);history(row,end);instant(row.scheduledAt);
    const {id,status,actions,archivedAt,createdAt,updatedAt,...input}=row;dto(input,MeetingFieldsDto);
    if(!['scheduled','completed','cancelled'].includes(status)||!row.supervisorIds.length||row.supervisorIds.some((id:string)=>!supervisorIds.has(id)))invalid();
    shape(row.notes,['agenda','discussion','feedback','decisions']);
    if(!Array.isArray(actions)||actions.length>200)invalid();
    for(const action of actions){
      shape(action,['id','phase','title','description','dueDate','status','linkedTaskIds','createdAt','updatedAt']);history(action,end);
      if(typeof action.id!=='string'||!RECORD_ID.test(action.id)||actionIds.has(action.id)||action.createdAt<createdAt||action.updatedAt>updatedAt)invalid();actionIds.add(action.id);
      const {id,createdAt:_,updatedAt:__,...fields}=action;dto(fields,ActionFieldsDto);validTaskReferences(action.linkedTaskIds);
      if(action.dueDate!==null){const d=new Date(action.dueDate+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==action.dueDate)invalid();}
    }
    unique(row.checkpointRefs.map((r:Row)=>`${r.levelNumber}:${r.checkpointId}`));
    // Task, goal and checkpoint references can legitimately outlive replaced records.
    // Keep their stable identities; the read API explicitly exposes unavailable links.
  }
}
