import { applicationWrite } from '../../../../database/application-write';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { GamificationService } from '../../../gamification/business/services/gamification.service';
import { GamificationSummaryDto } from '../../../gamification/api/dtos/gamification-summary.dto';
import { AchievementsRepository } from '../../persistence/repositories/achievements.repository';
@Injectable()
export class AchievementsService {
 constructor(private readonly repository:AchievementsRepository,private readonly gamification:GamificationService,private readonly clock:ApplicationClock,@InjectConnection() private readonly connection:Connection) {}
 async evaluate(session:ClientSession,summary:GamificationSummaryDto) {
  const facts=await this.repository.evidence(session);
  const conditions:Record<string,boolean>={first_task:facts.distinctTasks>=1,hundred_xp:summary.totalXp>=100,seven_day_streak:summary.longestStreak>=7,first_plan:facts.plan,ten_tasks:facts.distinctTasks>=10,first_checkpoint:facts.checkpoint,first_level:facts.level,first_goal:facts.goal};
  const codes=Object.keys(conditions).filter(code=>conditions[code]);
  if(codes.length)await this.repository.unlock(codes,this.clock.now(),session);
  return this.repository.list(session);
 }
 read() { return applicationWrite(this.connection, async session=>this.evaluate(session,await this.gamification.summary(session)),{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}); }
}
