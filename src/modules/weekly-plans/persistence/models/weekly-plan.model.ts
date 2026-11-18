import { Schema } from 'mongoose';
import { Priority, TaskStatus } from '../enums/task.enums';
import { StoredTask, WeeklyPlanRecord } from '../interfaces/weekly-plan.interface';

export const WEEKLY_PLAN_MODEL = 'WeeklyPlan';
const taskSchema = new Schema<StoredTask>(
  {
    id: { type: String, required: true, match: /^[a-z0-9][a-z0-9_-]{0,63}$/ },
    date: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, maxlength: 2000 },
    estimatedMinutes: { type: Number, required: true, min: 1, max: 1440 },
    xpReward: { type: Number, required: true, min: 0, max: 1000 },
    priority: { type: String, required: true, enum: Object.values(Priority) },
    isOptional: { type: Boolean, required: true },
    deliverable: { type: String, required: true, maxlength: 500 },
    actualMinutes: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: Object.values(TaskStatus), default: TaskStatus.Pending },
    completedAt: { type: Date, default: null },
    firstCompletedAt: { type: Date, default: null },
    // Embedded tasks have stable application IDs, not independent Mongoose versions.
    // Disabling the unused version key also keeps transaction rollback from writing
    // an unknown __v field into a strict embedded schema.
  },
  { _id: false, versionKey: false, strict: 'throw' },
);

export const weeklyPlanSchema = new Schema<WeeklyPlanRecord>(
  {
    schemaVersion: { type: Number, required: true, enum: [1] },
    weekId: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    objectives: { type: [String], required: true },
    tasks: { type: [taskSchema], required: true },
    notes: { type: String, maxlength: 5000 },
  },
  {
    collection: 'weekly_plans',
    timestamps: true,
    strict: 'throw',
    autoCreate: false,
    autoIndex: false,
  },
);
weeklyPlanSchema.index({ weekId: 1 }, { unique: true, name: 'weekly_plan_week_unique' });
