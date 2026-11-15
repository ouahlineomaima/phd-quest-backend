export interface Checkpoint {
  id: string; title: string; description?: string; mandatory: boolean; completed: boolean;
  validatedAt: Date | null; firstValidatedAt: Date | null; evidence: string;
}
export interface RoadmapLevel {
  levelNumber: number; year: number; title: string; description: string; objectives: string[];
  checkpoints: Checkpoint[]; status: 'current' | 'locked' | 'completed'; completedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}
