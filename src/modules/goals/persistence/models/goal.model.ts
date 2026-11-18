import { GoalStatus, GoalType } from '../enums/goal.enums';
import { Schema } from 'mongoose';
import { GoalRecord } from '../interfaces/goal.interface';
export const GOAL_MODEL = 'Goal';
export const goalSchema = new Schema<GoalRecord>(
  {
    linkedTaskIds: { type: [String], default: undefined },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 2000 },
    type: { type: String, required: true, enum: Object.values(GoalType) },
    status: { type: String, default: GoalStatus.Active, enum: Object.values(GoalStatus) },
    targetDate: { type: String, default: null },
    relatedWeekId: { type: String, default: null },
    relatedRoadmapLevel: { type: Number, default: null, min: 0, max: 12 },
    completedAt: { type: Date, default: null },
    firstCompletedAt: { type: Date, default: null },
  },
  { collection: 'goals', timestamps: true, autoIndex: false, autoCreate: false },
);
