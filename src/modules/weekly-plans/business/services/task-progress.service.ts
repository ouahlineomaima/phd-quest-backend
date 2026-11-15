import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, isObjectIdOrHexString, mongo } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ApplicationClock } from '../../../../common/application-clock';
import { GamificationService } from '../../../gamification/business/services/gamification.service';
import { DailyActivityService } from '../../../daily-activity/business/services/daily-activity.service';
import { WeeklyPlansRepository } from '../../persistence/repositories/weekly-plans.repository';
import { TaskStatus } from '../../persistence/enums/task.enums';
import { WeeklyPlanRecord } from '../../persistence/interfaces/weekly-plan.interface';
import { ProgressSnapshotDto, TaskMutationDto } from '../../api/dtos/task-progress.dto';
import { weeklyProgress } from './weekly-progress';

@Injectable()
export class TaskProgressService {
  constructor(private readonly plans: WeeklyPlansRepository, private readonly gamification: GamificationService, private readonly activity: DailyActivityService, private readonly clock: ApplicationClock, @InjectConnection() private readonly connection: Connection) {}
  private validateIds(planId: string, taskId?: string) {
    if (!isObjectIdOrHexString(planId) || (taskId !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(taskId))) throw new BadRequestException('Invalid plan or task identifier');
  }
  private async snapshot(plan: WeeklyPlanRecord, session: ClientSession, at: Date): Promise<ProgressSnapshotDto> {
    const earned = await this.gamification.earnedForWeek(plan.weekId, session);
    const gamification = await this.gamification.summary(session, at);
    return { plan: this.plans.toResponse(plan), weeklyProgress: weeklyProgress(plan, earned), gamification };
  }
  async read(planId: string): Promise<ProgressSnapshotDto> {
    this.validateIds(planId);
    return this.connection.transaction(async session => {
      const plan = await this.plans.recordById(planId, session);
      if (!plan) throw new NotFoundException();
      return this.snapshot(plan, session, this.clock.now());
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  }
  async change(planId: string, taskId: string, action: 'complete' | 'reopen', actualMinutes?: number): Promise<TaskMutationDto> {
    this.validateIds(planId, taskId);
    // Validate here too: orchestration may be called outside an HTTP controller.
    if (actualMinutes !== undefined && (!Number.isInteger(actualMinutes) || actualMinutes < 0 || actualMinutes > 1440)) throw new BadRequestException('Actual minutes must be an integer from 0 to 1440');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.connection.transaction(async session => {
          let plan = await this.plans.recordById(planId, session);
          if (!plan) throw new NotFoundException();
          const task = plan.tasks.find(item => item.id === taskId);
          if (!task) throw new NotFoundException();
          const at = this.clock.now(), next = action === 'complete' ? TaskStatus.Completed : TaskStatus.Pending;
          if (task.status === next) return { changed: false, xpAwarded: 0, ...await this.snapshot(plan, session, at) };
          if (![TaskStatus.Pending, TaskStatus.Completed].includes(task.status)) throw new ConflictException('Task state does not allow this transition');
          let xpAwarded = 0;
          const first = task.firstCompletedAt ?? (task.status === TaskStatus.Completed ? task.completedAt ?? at : null);
          plan = await this.plans.transition(planId, taskId, task.status, {
            status: next, completedAt: action === 'complete' ? at : null,
            firstCompletedAt: first ?? (action === 'complete' ? at : null),
            actualMinutes: action === 'complete' ? actualMinutes ?? task.actualMinutes : task.actualMinutes,
          }, session);
          if (!plan) throw new ConflictException('Task changed. Refresh and retry.');
          if (action === 'complete') {
            // The first marker covers zero-XP tasks and grandfathered completions. The ledger's unique key is the final reward guard.
            if (!first) xpAwarded = await this.gamification.awardTask({ planId, weekId: plan.weekId, taskId, title: task.title, amount: task.xpReward, at }, session);
            await this.activity.record({ eventId: randomUUID(), sourceId: `${plan.weekId}:${taskId}`, planId, taskId, occurredAt: at }, session);
          }
          return { changed: true, xpAwarded, ...await this.snapshot(plan, session, at) };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10000 });
      } catch (error) {
        // Driver retries transient transactions/uncertain commits. An upsert can instead fail on a shared date/source unique key: abort, then retry from a fresh snapshot.
        const key = error instanceof mongo.MongoServerError ? error.keyPattern : undefined;
        if (attempt < 2 && error instanceof mongo.MongoServerError && error.code === 11000 && key && (key.date || (key.sourceType && key.sourceId))) continue;
        throw error;
      }
    }
  }
}
