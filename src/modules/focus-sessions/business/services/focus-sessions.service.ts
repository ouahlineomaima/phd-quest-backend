import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { applicationWrite } from '../../../../database/application-write';
import { calendarOrdinal } from '../../../../common/calendar';
import { sundayWeek } from '../../../dashboard/business/services/sunday-week';
import { FocusSessionsRepository } from '../../persistence/repositories/focus-sessions.repository';
import { SaveFocusSessionDto } from '../../api/dtos/focus-session.dto';
import { validateFocus } from './focus-validation';
@Injectable()
export class FocusSessionsService {
  constructor(private readonly repository:FocusSessionsRepository,private readonly clock:ApplicationClock,@InjectConnection() private readonly connection:Connection) {}
  save(input:SaveFocusSessionDto){const fields=validateFocus(input,this.clock.now());return applicationWrite(this.connection,async session=>{
    const existing=await this.repository.find(fields.sessionId,session);
    if(existing){if(Object.entries(fields).some(([key,value])=>JSON.stringify((existing as any)[key])!==JSON.stringify(value)))throw new ConflictException('This session ID was already saved with different contents.');return existing;}
    const task=fields.taskRef?await this.repository.task(fields.taskRef,session):null;
    if(fields.taskRef&&!task)throw new BadRequestException('The selected weekly task no longer exists. The original session remains recoverable locally; restore the task before retrying, or discard the session.');
    return this.repository.insert({...fields,taskTitle:task?.title??null,appliedAt:null,appliedMinutes:0},session);
  });}
  history(page=1,limit=20){return this.connection.transaction(session=>this.repository.history(page,limit,session),{readConcern:{level:'snapshot'}});}
  summary(){return this.connection.transaction(async session=>{const today=this.clock.dateAt(this.clock.now()),week=sundayWeek(today),days=await this.repository.days(this.clock.timezone,session);const seconds=(test:(date:string)=>boolean)=>days.filter(day=>test(day._id)).reduce((sum,day)=>sum+day.seconds,0);return {timezone:this.clock.timezone,today,weekId:week.weekId,todayMinutes:Math.floor(seconds(date=>date===today)/60),weekMinutes:Math.floor(seconds(date=>date>=week.startDate&&date<=week.endDate)/60),overallMinutes:Math.floor(seconds(()=>true)/60),sessionCount:days.reduce((sum,day)=>sum+day.count,0),completedCountdowns:days.reduce((sum,day)=>sum+day.countdowns,0)};},{readConcern:{level:'snapshot'}});}
  taskTimes(weekId:string){if(calendarOrdinal(weekId)===null)throw new BadRequestException('Use a valid week date.');return this.connection.transaction(async session=>Object.fromEntries((await this.repository.applied(weekId,session)).map(row=>[row._id,row.minutes])),{readConcern:{level:'snapshot'}});}
  preview(id:string){return this.connection.transaction(async session=>{const record=await this.repository.find(id,session);if(!record)throw new NotFoundException('Focus session not found.');const task=record.taskRef?await this.repository.task(record.taskRef,session):null;const totals=record.taskRef?await this.repository.applied(record.taskRef.split(':')[0],session):[];return {session:record,task:task?{title:task.title,status:task.status,manualActualMinutes:task.actualMinutes,appliedFocusMinutes:totals.find(row=>row._id===record.taskRef)?.minutes??0}:null,proposedMinutes:Math.floor(record.focusedSeconds/60)};},{readConcern:{level:'snapshot'}});}
  apply(id:string){return applicationWrite(this.connection,async session=>{const record=await this.repository.find(id,session);if(!record)throw new NotFoundException('Focus session not found.');if(record.appliedAt)return record;
    const minutes=Math.floor(record.focusedSeconds/60);if(!record.taskRef||minutes<1)throw new BadRequestException('Link a task and record at least one full minute before applying time.');
    if(!await this.repository.task(record.taskRef,session))throw new ConflictException('The historical task is no longer available. Focus time remains saved separately.');
    return this.repository.apply(id,minutes,this.clock.now(),session);
  });}
}
