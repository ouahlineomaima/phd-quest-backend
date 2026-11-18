import {TaskStatus} from '../../../weekly-plans/persistence/enums/task.enums';
import { GoalStatus, GoalType } from '../../persistence/enums/goal.enums';
import { GoalProgress, LinkedTaskState } from '../../persistence/interfaces/goal.interface';
export function goalProgress(tasks: LinkedTaskState[]): GoalProgress {
  const total = tasks.length, completed = tasks.filter(task => task.status === TaskStatus.Completed).length;
  return { mode: total ? 'linked' : 'manual', total, completed, percentage: total ? Math.round(100 * completed / total) : null };
}
export function goalContribution(goal: { progress: GoalProgress; status: string; completedAt: unknown }): number {
  if (goal.progress.mode === 'linked') return goal.progress.completed / goal.progress.total;
  return goal.status === GoalStatus.Completed || (goal.status === GoalStatus.Archived && goal.completedAt != null) ? 1 : 0;
}
