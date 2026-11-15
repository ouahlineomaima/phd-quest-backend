import { WeeklyPlanInput, TaskInput } from '../../persistence/interfaces/weekly-plan.interface';
import { TaskStatus } from '../../persistence/enums/task.enums';

export interface SavedTaskDto extends TaskInput { status: TaskStatus; actualMinutes: number; completedAt: string | null; firstCompletedAt: string | null; }
export interface WeeklyPlanResponseDto extends Omit<WeeklyPlanInput, 'tasks'> {
  id: string; tasks: SavedTaskDto[]; createdAt: string; updatedAt: string;
}
export interface WeekSummaryDto {
  id: string; weekId: string; startDate: string; endDate: string; title: string;
  taskCount: number; estimatedMinutes: number; potentialXp: number; createdAt: string; updatedAt: string;
}
export interface WorkloadDto { taskCount: number; estimatedMinutes: number; potentialXp: number; }
export interface ImportPreviewDto {
  plan: WeeklyPlanInput; totals: WorkloadDto;
  days: (WorkloadDto & { date: string })[];
  canImport: boolean; conflicts: { code: string; field: string; message: string }[];
}
