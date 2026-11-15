import { Types } from 'mongoose';
export interface GoalRecord {
 linkedTaskIds?: string[];
 _id: Types.ObjectId; title: string; description: string; type: 'weekly' | 'monthly' | 'research'; status: 'active' | 'completed' | 'archived';
 targetDate: string | null; relatedWeekId: string | null; relatedRoadmapLevel: number | null;
 completedAt: Date | null; firstCompletedAt: Date | null; createdAt: Date; updatedAt: Date;
}

export interface LinkedTaskState { sourceId: string; weekId: string; taskId: string; title: string; date: string; status: 'pending' | 'completed'; }
export interface GoalProgress { mode: 'linked' | 'manual'; completed: number; total: number; percentage: number | null; }
