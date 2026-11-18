import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { DailyActivityService } from '../../../daily-activity/business/services/daily-activity.service';
import { GamificationRepository } from '../../persistence/repositories/gamification.repository';
import { XpSource } from '../../persistence/enums/xp-source.enum';
import { GamificationSummaryDto } from '../../api/dtos/gamification-summary.dto';
import { playerProgress } from './player-level';
@Injectable()
export class GamificationService {
  constructor(
    private readonly repository: GamificationRepository,
    private readonly activity: DailyActivityService,
    private readonly clock: ApplicationClock,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  awardTask(
    input: {
      planId: string;
      weekId: string;
      taskId: string;
      title: string;
      amount: number;
      at: Date;
    },
    session: ClientSession,
  ) {
    if (!Number.isInteger(input.amount) || input.amount < 0 || input.amount > 1000)
      throw new Error('Invalid stored task reward');
    if (input.amount === 0) return Promise.resolve(0); // A zero reward creates activity, never a zero-value ledger entry.
    return this.repository.award(
      {
        sourceType: XpSource.TaskCompletion,
        sourceId: `${input.weekId}:${input.taskId}`,
        amount: input.amount,
        awardedAt: input.at,
        description: `Task completed: ${input.title}`,
        metadata: { planId: input.planId, weekId: input.weekId, taskId: input.taskId },
      },
      session,
    );
  }
  earnedForWeek(weekId: string, session: ClientSession) {
    return this.repository.total(session, weekId);
  }
  async summary(session?: ClientSession, at = this.clock.now()): Promise<GamificationSummaryDto> {
    if (!session)
      return this.connection.transaction((transaction) => this.summary(transaction, at), {
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
      });
    // MongoDB does not support parallel operations on a transaction's session.
    const totalXp = await this.repository.total(session);
    const activity = await this.activity.summary(at, session);
    const totalCompletedTasks = await this.repository.completedCount(session);
    return {
      ...playerProgress(totalXp),
      ...activity,
      totalCompletedTasks,
      timezone: this.clock.timezone,
      asOf: at.toISOString(),
    };
  }
}
