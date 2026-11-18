import type {
  GoalRecord,
  GoalProgress,
  LinkedTaskState,
} from '../../persistence/interfaces/goal.interface';
export type GoalResponse = Omit<GoalRecord, '_id'> & {
  id: string;
  linkedTaskIds: string[];
  linkedTasks: LinkedTaskState[];
  progress: GoalProgress;
};
