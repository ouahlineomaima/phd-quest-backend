import type { Checkpoint, RoadmapLevel } from '../../persistence/interfaces/roadmap.interface';
import type { GoalResponse } from '../../../goals/api/dtos/goal-response.dto';
export type LinkedGoal = Pick<GoalResponse,'id'|'title'|'status'|'completedAt'|'progress'> & {contributionPercent:number};
export type CheckpointResponse = Checkpoint & {goalIds:string[];linkedGoals:LinkedGoal[];progress:{mode:'linked'|'manual';total:number;percentage:number|null}};
export type RoadmapResponse = Omit<RoadmapLevel,'checkpoints'> & {checkpoints:CheckpointResponse[]};
