import { RoadmapStatus } from '../enums/roadmap.enums';
export interface Checkpoint {
  checkpointIdentity?: string;
  goalIds?: string[];
  id: string;
  title: string;
  description?: string;
  mandatory: boolean;
  completed: boolean;
  validatedAt: Date | null;
  firstValidatedAt: Date | null;
  evidence: string;
}
export interface RoadmapLevel {
  yearTitle?: string;
  levelNumber: number;
  year: number | null;
  title: string;
  description: string;
  objectives: string[];
  checkpoints: Checkpoint[];
  status: RoadmapStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
