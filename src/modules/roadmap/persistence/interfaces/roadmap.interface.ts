export interface Checkpoint {
  goalIds?: string[];
  id: string; title: string; description?: string; mandatory: boolean; completed: boolean;
  validatedAt: Date | null; firstValidatedAt: Date | null; evidence: string;
}
export interface RoadmapLevel {
  yearTitle?: string;
  levelNumber: number; year: number | null; title: string; description: string; objectives: string[];
  checkpoints: Checkpoint[]; status: 'current' | 'locked' | 'completed'; completedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}
