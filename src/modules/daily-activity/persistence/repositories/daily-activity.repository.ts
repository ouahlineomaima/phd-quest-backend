import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { DAILY_ACTIVITY_MODEL } from '../models/daily-activity.model';
import { ActivityEvent, DailyActivityRecord } from '../interfaces/daily-activity.interface';
@Injectable()
export class DailyActivityRepository implements OnModuleInit {
  constructor(
    @InjectModel(DAILY_ACTIVITY_MODEL) private readonly model: Model<DailyActivityRecord>,
  ) {}
  async onModuleInit() {
    await this.model.createCollection();
    await this.model.collection.createIndex(
      { date: 1 },
      { unique: true, name: 'activity_date_unique' },
    );
  }
  async record(date: string, event: ActivityEvent, session: ClientSession) {
    await this.model
      .updateOne(
        { date },
        {
          $setOnInsert: { date },
          $inc: { taskCompletionCount: 1 },
          $min: { firstActivityAt: event.occurredAt },
          $max: { lastActivityAt: event.occurredAt },
          $push: { events: event },
        },
        { upsert: true, session, setDefaultsOnInsert: false, runValidators: true },
      )
      .exec();
  }
  history(session: ClientSession) {
    return this.model
      .find({ taskCompletionCount: { $gt: 0 } })
      .select('date taskCompletionCount firstActivityAt lastActivityAt')
      .sort({ date: 1 })
      .session(session)
      .lean()
      .exec();
  }
}
