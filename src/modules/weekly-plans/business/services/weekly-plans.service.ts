import { Injectable } from '@nestjs/common';
import { WeeklyPlansRepository } from '../../persistence/repositories/weekly-plans.repository';
import { WeeklyPlanInput } from '../../persistence/interfaces/weekly-plan.interface';
import { ImportPreviewDto } from '../../api/dtos/weekly-plan-response.dto';
import { calendarDates, validatePlan } from './plan-validation';

@Injectable()
export class WeeklyPlansService {
  constructor(private readonly repository: WeeklyPlansRepository) {}

  async preview(input: WeeklyPlanInput): Promise<ImportPreviewDto> {
    const plan = validatePlan(input);
    const exists = await this.repository.exists(plan.weekId);
    const total = (tasks: WeeklyPlanInput['tasks']) => ({
      taskCount: tasks.length, estimatedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      potentialXp: tasks.reduce((sum, task) => sum + task.xpReward, 0),
    });
    return {
      plan, totals: total(plan.tasks), days: calendarDates(plan.startDate).map(date => ({ date, ...total(plan.tasks.filter(task => task.date === date)) })),
      canImport: !exists, conflicts: exists ? [{ code: 'WEEK_EXISTS', field: 'weekId', message: 'This week is already saved. Importing it again cannot replace or reset its progress.' }] : [],
    };
  }
}
