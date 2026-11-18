import { GoalStatus, GoalType } from '../../persistence/enums/goal.enums';
import { AchievementsService } from '../../../achievements/business/services/achievements.service';
import type { GoalResponse } from '../../api/dtos/goal-response.dto';
import { goalProgress } from './goal-progress';
import { applicationWrite } from '../../../../database/application-write';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { calendarOrdinal } from '../../../../common/calendar';
import { GoalsRepository } from '../../persistence/repositories/goals.repository';
import { CreateGoalDto, EditGoalDto, GoalFilterDto } from '../../api/dtos/goal.dto';
@Injectable()
export class GoalsService {
 constructor(private readonly repository:GoalsRepository,private readonly clock:ApplicationClock,@InjectConnection() private readonly connection:Connection,private readonly achievements:AchievementsService) {}
 async list(filter:GoalFilterDto,session?:ClientSession,limit?:number):Promise<GoalResponse[]> {
  if(!session)return this.connection.transaction(tx=>this.list(filter,tx,limit),{readConcern:{level:'snapshot'}});
  return this.withProgress(await this.repository.list(filter,session,limit),session);
 }
 async byIds(ids:string[],session:ClientSession):Promise<GoalResponse[]> { return ids.length ? this.withProgress(await this.repository.byIds(ids,session),session) : []; }
 private async withProgress(records:Awaited<ReturnType<GoalsRepository['list']>>,session:ClientSession):Promise<GoalResponse[]> {
  const sources=[...new Set(records.flatMap(record=>record.linkedTaskIds??[]))];
  const tasks=await this.repository.taskStates(sources,session),bySource=new Map(tasks.map(task=>[task.sourceId,task]));
  return records.map(record=>{
   const linkedTaskIds=record.linkedTaskIds??[];
   const linkedTasks=linkedTaskIds.map(source=>{const task=bySource.get(source);if(!task)throw new ConflictException('A linked task no longer exists. Correct the goal links before continuing.');return task;});
   return {...record,linkedTaskIds,linkedTasks,progress:goalProgress(linkedTasks)};
  });
 }
 private async response(record:Awaited<ReturnType<GoalsRepository['insert']>>,session:ClientSession) { return (await this.withProgress([record],session))[0]; }
 activeCount(session:ClientSession) { return this.repository.activeCount(session); }
 private async references(input:EditGoalDto,session:ClientSession) {
  if(input.linkedTaskIds!==undefined){
   const ids=input.linkedTaskIds;
   if(!Array.isArray(ids)||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^\d{4}-\d{2}-\d{2}:[a-z0-9][a-z0-9_-]{0,63}$/.test(id)))throw new BadRequestException('Use up to 200 unique weekId:taskId links.');
   if((await this.repository.taskStates(ids,session)).length!==ids.length)throw new BadRequestException('Every linked task must exist in its referenced weekly plan.');
  }
  if (input.targetDate != null && calendarOrdinal(input.targetDate) === null) throw new BadRequestException('Target date must be a real YYYY-MM-DD calendar date.');
  if (input.relatedWeekId != null) {
   const ordinal = calendarOrdinal(input.relatedWeekId);
   if (ordinal === null || ordinal % 7 !== 0 || !await this.repository.weekExists(input.relatedWeekId,session)) throw new BadRequestException('Related week must be an existing Sunday-start weekly plan.');
  }
  if (input.relatedRoadmapLevel != null && !await this.repository.levelExists(input.relatedRoadmapLevel,session)) throw new BadRequestException('Related research level does not exist.');
 }
 private async detail(id:string,session:ClientSession) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new BadRequestException('Invalid goal ID.');
  const record=await this.repository.find(id,session); if (!record) throw new NotFoundException('Goal not found.'); return record;
 }
 create(input:CreateGoalDto) { return applicationWrite(this.connection, async session => { await this.references(input,session); return this.response(await this.repository.insert({...input,description:input.description ?? ''},session),session); }); }
 edit(id:string,input:EditGoalDto) { return applicationWrite(this.connection, async session => {
  const record=await this.detail(id,session); if(record.status===GoalStatus.Archived) throw new ConflictException('Archived goals are preserved and cannot be edited.');
  await this.references(input,session); return this.response(await this.repository.update(id,{...input,description:input.description === null ? '' : input.description ?? record.description},session),session);
 }); }
 transition(id:string,action:'complete'|'reopen'|'archive') { return applicationWrite(this.connection, async session => {
  const record=await this.detail(id,session);const status=action==='complete'?GoalStatus.Completed:action==='reopen'?GoalStatus.Active:GoalStatus.Archived;
  if(record.status===status) return this.response(this.repository.response(record),session);
  if(record.status===GoalStatus.Archived) throw new ConflictException('Archived goals cannot be reopened or completed. Create a new goal to resume this work.');
  const now=this.clock.now();
  const updated=await this.repository.update(id,{status,completedAt:action==='complete'?now:action==='reopen'?null:record.completedAt,firstCompletedAt:action==='complete'?record.firstCompletedAt??now:record.firstCompletedAt},session);await this.achievements.evaluateCurrent(session);return this.response(updated,session);
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}); }
}
