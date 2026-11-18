import { BadRequestException, PipeTransform } from '@nestjs/common';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { WeeklyPlanResponseDto } from './weekly-plan-response.dto';
import { GamificationSummaryDto } from '../../../gamification/api/dtos/gamification-summary.dto';
export class CompleteTaskDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(1440)
  actualMinutes?: number;
}
export class EmptyReopenBodyPipe implements PipeTransform {
  transform(value: unknown) {
    if (
      value === undefined ||
      (value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0)
    )
      return {};
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Reopen accepts an empty body only',
      details: [{ field: 'body', message: 'Remove all fields from the reopen request.' }],
    });
  }
}
export interface WeeklyProgressDto {
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  completedEstimatedMinutes: number;
  actualRecordedMinutes: number;
  potentialXp: number;
  earnedXp: number;
}
export interface ProgressSnapshotDto {
  plan: WeeklyPlanResponseDto;
  weeklyProgress: WeeklyProgressDto;
  gamification: GamificationSummaryDto;
}
export interface TaskMutationDto extends ProgressSnapshotDto {
  changed: boolean;
  xpAwarded: number;
}
