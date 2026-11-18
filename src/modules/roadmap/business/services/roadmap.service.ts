import {RoadmapStatus} from '../../persistence/enums/roadmap.enums';
import { AchievementsService } from '../../../achievements/business/services/achievements.service';
import type { RoadmapResponse } from '../../api/dtos/roadmap-response.dto';
import { GoalsService } from '../../../goals/business/services/goals.service';
import { goalContribution } from '../../../goals/business/services/goal-progress';
import { RoadmapLevel } from '../../persistence/interfaces/roadmap.interface';
import { applicationWrite } from '../../../../database/application-write';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { RoadmapRepository } from '../../persistence/repositories/roadmap.repository';
import { CheckpointUpdateDto } from '../../api/dtos/roadmap.dto';
@Injectable()
export class RoadmapService {
  constructor(private readonly repository: RoadmapRepository, private readonly clock: ApplicationClock, @InjectConnection() private readonly connection: Connection, private readonly goals: GoalsService, private readonly achievements:AchievementsService) {}
  async list(session?: ClientSession):Promise<RoadmapResponse[]> {
    if(!session)return this.connection.transaction(tx=>this.list(tx),{readConcern:{level:'snapshot'}});
    return this.withProgress(await this.repository.list(session),session);
  }
  async detail(number: number, session?: ClientSession):Promise<RoadmapResponse> {
    if(!session)return this.connection.transaction(tx=>this.detail(number,tx),{readConcern:{level:'snapshot'}});
    return (await this.withProgress([await this.record(number,session)],session))[0];
  }
  private async withProgress(levels:RoadmapLevel[],session:ClientSession):Promise<RoadmapResponse[]> {
    const ids=[...new Set(levels.flatMap(level=>level.checkpoints.flatMap(checkpoint=>checkpoint.goalIds??[])))];
    const goals=ids.length?await this.goals.byIds(ids,session):[],byId=new Map(goals.map(goal=>[goal.id,goal]));
    return levels.map(level=>({...level,checkpoints:level.checkpoints.map(checkpoint=>{
      const goalIds=checkpoint.goalIds??[];
      const linkedGoals=goalIds.map(id=>{const goal=byId.get(id);if(!goal)throw new ConflictException('A linked goal no longer exists. Correct the checkpoint links.');return goal;});
      const percentage=linkedGoals.length?Math.round(100*linkedGoals.reduce((sum,goal)=>sum+goalContribution(goal),0)/linkedGoals.length):null;
      return {...checkpoint,goalIds,linkedGoals:linkedGoals.map(goal=>({id:goal.id,title:goal.title,status:goal.status,completedAt:goal.completedAt,progress:goal.progress,contributionPercent:Math.round(100*goalContribution(goal))})),progress:{mode:goalIds.length?'linked' as const:'manual' as const,total:goalIds.length,percentage}};
    })}));
  }
  private async record(number: number, session?: ClientSession) {
    const level = await this.repository.find(number, session);
    if (!level) throw new NotFoundException('Research level not found.');
    return level;
  }
  checkpoint(number: number, id: string, input: CheckpointUpdateDto) {
    return applicationWrite(this.connection, async session => {
      const level = await this.record(number, session);
      if (level.status !== RoadmapStatus.Current) throw new ConflictException('Only the current research level can be corrected or validated. Completed levels are immutable.');
      const index = level.checkpoints.findIndex(checkpoint => checkpoint.id === id);
      if (index < 0) throw new NotFoundException('Checkpoint not found.');
      const checkpoint = level.checkpoints[index];
      const now = this.clock.now();
      const fields: Record<string, unknown> = {
        [`checkpoints.${index}.completed`]: input.completed,
        [`checkpoints.${index}.validatedAt`]: input.completed ? checkpoint.validatedAt ?? now : null,
        [`checkpoints.${index}.firstValidatedAt`]: input.completed ? checkpoint.firstValidatedAt ?? now : checkpoint.firstValidatedAt,
      };
      if (input.evidence !== undefined) fields[`checkpoints.${index}.evidence`] = input.evidence.trim();
      await this.repository.update(number, fields, session);
      await this.achievements.evaluateCurrent(session);
      return this.detail(number,session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
  linkGoals(number:number,id:string,goalIds:string[]) {
    return applicationWrite(this.connection,async session=>{
      const level=await this.record(number,session);
      if(level.status!==RoadmapStatus.Current)throw new ConflictException('Only the current research chapter can change checkpoint links.');
      const index=level.checkpoints.findIndex(checkpoint=>checkpoint.id===id);
      if(index<0)throw new NotFoundException('Checkpoint not found.');
      if(!Array.isArray(goalIds)||goalIds.length>100||new Set(goalIds).size!==goalIds.length||goalIds.some(goal=>typeof goal!=='string'||!/^[a-f0-9]{24}$/.test(goal)))throw new BadRequestException('Use up to 100 unique goal IDs.');
      if((await this.goals.byIds(goalIds,session)).length!==goalIds.length)throw new BadRequestException('Every linked goal must exist.');
      await this.repository.update(number,{[`checkpoints.${index}.goalIds`]:goalIds},session);
      return this.detail(number,session);
    });
  }
  async editYearTitle(year: number, title: string) {
    if (!Number.isInteger(year) || year < 1 || year > 3) throw new BadRequestException('Choose research year 1, 2 or 3.');
    return applicationWrite(this.connection, async session => {
      const anchor = (year - 1) * 4 + 1;
      await this.record(anchor, session);
      await this.repository.update(anchor, { yearTitle: title.trim() }, session);
      return this.list(session);
    });
  }
  async edit(number: number, description?: string, title?: string) {
    if (description === undefined && title === undefined) throw new BadRequestException('Provide a level title or description to update.');
    return applicationWrite(this.connection, async session => {
      await this.record(number, session);
      await this.repository.update(number, { ...(description !== undefined ? { description: description.trim() } : {}), ...(title !== undefined ? { title: title.trim() } : {}) }, session);
      return this.detail(number,session);
    });
  }
  complete(number: number) {
    return applicationWrite(this.connection, async session => {
      const level = await this.record(number, session);
      if (level.status === RoadmapStatus.Completed) return this.detail(number,session);
      if (level.status !== RoadmapStatus.Current || !level.checkpoints.filter(c => c.mandatory).every(c => c.completed)) throw new ConflictException('Validate all mandatory checkpoints on the current level before completing it.');
      await this.repository.update(number, { status: RoadmapStatus.Completed, completedAt: this.clock.now() }, session);
      await this.achievements.evaluateCurrent(session);
      if (number < 12) {
        // Older workspaces may already contain completed research chapters; preserve them.
        const next = number === 0 ? (await this.repository.list(session)).find(record => record.levelNumber > 0 && record.status !== RoadmapStatus.Completed) : await this.record(number + 1, session);
        if (!next) return this.detail(number,session);
        if (next.status !== RoadmapStatus.Locked) throw new ConflictException('The next research level is not locked.');
        await this.repository.update(next.levelNumber, { status: RoadmapStatus.Current }, session);
      }
      return this.detail(number,session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
}
