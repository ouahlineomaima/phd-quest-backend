import { Schema } from 'mongoose';
import { ActivityEvent, DailyActivityRecord } from '../interfaces/daily-activity.interface';
export const DAILY_ACTIVITY_MODEL = 'DailyActivity';
const eventSchema = new Schema<ActivityEvent>(
  {
    eventId: { type: String, required: true },
    sourceId: { type: String, required: true },
    planId: { type: String, required: true },
    taskId: { type: String, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);
export const dailyActivitySchema = new Schema<DailyActivityRecord>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    taskCompletionCount: { type: Number, required: true, min: 1 },
    firstActivityAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    events: { type: [eventSchema], required: true },
  },
  { collection: 'daily_activity', autoCreate: false, autoIndex: false },
);
dailyActivitySchema.index({ date: 1 }, { unique: true, name: 'activity_date_unique' });
