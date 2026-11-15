import { WeeklyPlanRecord } from '../../persistence/interfaces/weekly-plan.interface';
import { WeeklyProgressDto } from '../../api/dtos/task-progress.dto';
export function weeklyProgress(plan: WeeklyPlanRecord, earnedXp: number): WeeklyProgressDto {
  const completed = plan.tasks.filter(task => task.status === 'completed');
  return { totalTasks: plan.tasks.length, completedTasks: completed.length,
    completionPercent: plan.tasks.length ? Math.round(100 * completed.length / plan.tasks.length) : 0,
    completedEstimatedMinutes: completed.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    actualRecordedMinutes: plan.tasks.reduce((sum, task) => sum + task.actualMinutes, 0),
    potentialXp: plan.tasks.reduce((sum, task) => sum + task.xpReward, 0), earnedXp };
}
