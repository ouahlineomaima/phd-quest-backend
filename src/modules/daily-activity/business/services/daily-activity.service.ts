import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { DailyActivityRepository } from '../../persistence/repositories/daily-activity.repository';
import { ActivityEvent } from '../../persistence/interfaces/daily-activity.interface';
import { ActivitySummaryDto } from '../../api/dtos/activity-summary.dto';
import { streaks } from './streaks';
@Injectable()
export class DailyActivityService {
  constructor(
    private readonly repository: DailyActivityRepository,
    private readonly clock: ApplicationClock,
  ) {}
  record(event: ActivityEvent, session: ClientSession) {
    return this.repository.record(this.clock.dateAt(event.occurredAt), event, session);
  }
  async summary(at: Date, session: ClientSession): Promise<ActivitySummaryDto> {
    const history = await this.repository.history(session),
      date = this.clock.dateAt(at);
    const today = history.find((item) => item.date === date);
    return {
      ...streaks(
        history.map((item) => item.date),
        date,
      ),
      todayActivity: {
        date,
        taskCompletionCount: today?.taskCompletionCount ?? 0,
        firstActivityAt: today?.firstActivityAt.toISOString() ?? null,
        lastActivityAt: today?.lastActivityAt.toISOString() ?? null,
      },
    };
  }
}
