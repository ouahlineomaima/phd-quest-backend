import { Types } from 'mongoose';
import { Priority, TaskStatus } from '../enums/task.enums';

export interface TaskInput {
  id: string; date: string; title: string; description?: string;
  estimatedMinutes: number; xpReward: number; priority: Priority; isOptional: boolean; deliverable: string;
}
export interface WeeklyPlanInput {
  schemaVersion: 1; weekId: string; startDate: string; endDate: string;
  title: string; objectives: string[]; tasks: TaskInput[]; notes?: string;
}
export interface StoredTask extends TaskInput { actualMinutes: number; status: TaskStatus; completedAt: Date | null; }
export interface WeeklyPlanRecord extends Omit<WeeklyPlanInput, 'tasks'> {
  _id: Types.ObjectId; tasks: StoredTask[]; createdAt: Date; updatedAt: Date;
}
