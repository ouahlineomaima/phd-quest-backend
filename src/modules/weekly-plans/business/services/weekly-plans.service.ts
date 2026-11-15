import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isObjectIdOrHexString, mongo } from 'mongoose';
import { WeeklyPlansRepository } from '../../persistence/repositories/weekly-plans.repository';
import { WeeklyPlanInput } from '../../persistence/interfaces/weekly-plan.interface';
import { ImportPreviewDto } from '../../api/dtos/weekly-plan-response.dto';
import { calendarDates, validatePlan } from './plan-validation';

@Injectable()
export class WeeklyPlansService {
  constructor(private readonly repository: WeeklyPlansRepository) {}

  list() { return this.repository.list(); }
  async detail(id: string) {
    if (!isObjectIdOrHexString(id)) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid weekly plan ID', details: [{ field: 'id', message: 'Use a valid saved plan ID.' }] });
    const plan = await this.repository.findById(id);
    if (!plan) throw new NotFoundException();
    return plan;
  }
  async confirm(input: WeeklyPlanInput) {
    const plan = validatePlan(input);
    const conflict = () => new ConflictException({ code: 'WEEK_EXISTS', message: 'This week is already saved. Existing tasks and progress were preserved.', details: [{ field: 'weekId', message: 'Choose another week. Replacement and merging are not supported.' }] });
    if (await this.repository.exists(plan.weekId)) throw conflict();
    try { return await this.repository.insert(plan); }
    catch (error) {
      // The unique index remains authoritative if two confirmations pass the existence check together.
      if (error instanceof mongo.MongoServerError && error.code === 11000) throw conflict();
      throw error;
    }
  }

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
