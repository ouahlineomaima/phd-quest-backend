import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { WeeklyPlanInput } from '../../persistence/interfaces/weekly-plan.interface';

export const MAX_IMPORT_BYTES = 500 * 1024;
import { calendarOrdinal, calendarDates } from '../../../../common/calendar';
export { calendarOrdinal, calendarDates } from '../../../../common/calendar';

export function validatePlan(input: WeeklyPlanInput): WeeklyPlanInput {
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_IMPORT_BYTES)
    throw new PayloadTooLargeException({
      code: 'IMPORT_TOO_LARGE',
      message: 'Weekly plan JSON must be at most 500 KiB.',
    });
  const errors: { field: string; message: string }[] = [];
  const date = (value: string, field: string) => {
    const ordinal = calendarOrdinal(value);
    if (ordinal === null)
      errors.push({ field, message: 'Use a real calendar date in YYYY-MM-DD format (1900–9999).' });
    return ordinal;
  };
  const start = date(input.startDate, 'startDate'),
    end = date(input.endDate, 'endDate');
  date(input.weekId, 'weekId');
  if (input.weekId !== input.startDate)
    errors.push({ field: 'weekId', message: 'weekId must equal the Sunday startDate.' });
  if (start !== null && start % 7 !== 0)
    errors.push({ field: 'startDate', message: 'The week must start on Sunday.' });
  if (start !== null && end !== null && end - start !== 6)
    errors.push({
      field: 'endDate',
      message: 'endDate must be the Saturday six calendar days after startDate.',
    });
  const seen = new Map<string, number>();
  input.tasks.forEach((task, index) => {
    const taskDate = date(task.date, `tasks.${index}.date`);
    if (taskDate !== null && start !== null && end !== null && (taskDate < start || taskDate > end))
      errors.push({
        field: `tasks.${index}.date`,
        message: 'Task date must fall inside this week.',
      });
    if (seen.has(task.id))
      errors.push({
        field: `tasks.${index}.id`,
        message: `Duplicate task ID; first used at tasks.${seen.get(task.id)}.id.`,
      });
    else seen.set(task.id, index);
  });
  if (errors.length)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Weekly plan validation failed',
      details: errors,
    });
  return input;
}
