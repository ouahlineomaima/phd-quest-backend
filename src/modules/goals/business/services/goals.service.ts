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
 constructor(private readonly repository:GoalsRepository,private readonly clock:ApplicationClock,@InjectConnection() private readonly connection:Connection) {}
 list(filter:GoalFilterDto,session?:ClientSession,limit?:number) { return this.repository.list(filter,session,limit); }
 activeCount(session:ClientSession) { return this.repository.activeCount(session); }
 private async references(input:EditGoalDto,session:ClientSession) {
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
 create(input:CreateGoalDto) { return applicationWrite(this.connection, async session => { await this.references(input,session); return this.repository.insert({...input,description:input.description ?? ''},session); }); }
 edit(id:string,input:EditGoalDto) { return applicationWrite(this.connection, async session => {
  const record=await this.detail(id,session); if(record.status==='archived') throw new ConflictException('Archived goals are preserved and cannot be edited.');
  await this.references(input,session); return this.repository.update(id,{...input,description:input.description === null ? '' : input.description ?? record.description},session);
 }); }
 transition(id:string,action:'complete'|'reopen'|'archive') { return applicationWrite(this.connection, async session => {
  const record=await this.detail(id,session);const status=action==='complete'?'completed':action==='reopen'?'active':'archived';
  if(record.status===status) return this.repository.response(record);
  if(record.status==='archived') throw new ConflictException('Archived goals cannot be reopened or completed. Create a new goal to resume this work.');
  const now=this.clock.now();
  return this.repository.update(id,{status,completedAt:action==='complete'?now:action==='reopen'?null:record.completedAt,firstCompletedAt:action==='complete'?record.firstCompletedAt??now:record.firstCompletedAt},session);
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}); }
}
