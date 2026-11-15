import { Types } from 'mongoose';
export interface GoalRecord {
 _id: Types.ObjectId; title: string; description: string; type: 'weekly' | 'monthly' | 'research'; status: 'active' | 'completed' | 'archived';
 targetDate: string | null; relatedWeekId: string | null; relatedRoadmapLevel: number | null;
 completedAt: Date | null; firstCompletedAt: Date | null; createdAt: Date; updatedAt: Date;
}
