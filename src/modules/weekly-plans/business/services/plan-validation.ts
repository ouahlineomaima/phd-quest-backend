import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { WeeklyPlanInput } from '../../persistence/interfaces/weekly-plan.interface';

export const MAX_IMPORT_BYTES = 500 * 1024;
const monthLengths = (year: number) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Gregorian arithmetic only. Day 1 is Monday 0001-01-01; ordinal % 7 === 0 means Sunday.
export function calendarOrdinal(value: string): number | null {
  if (!/^(?:19|[2-9][0-9])[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const lengths = monthLengths(year);
  if (month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) return null;
  const previous = year - 1;
  return 365 * previous + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400)
    + lengths.slice(0, month - 1).reduce((sum, length) => sum + length, 0) + day;
}

export function calendarDates(startDate: string): string[] {
  let [year, month, day] = startDate.split('-').map(Number);
  return Array.from({ length: 7 }, () => {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    day++;
    if (day > monthLengths(year)[month - 1]) { day = 1; month++; }
    if (month > 12) { month = 1; year++; }
    return value;
  });
}

export function validatePlan(input: WeeklyPlanInput): WeeklyPlanInput {
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_IMPORT_BYTES) throw new PayloadTooLargeException({ code: 'IMPORT_TOO_LARGE', message: 'Weekly plan JSON must be at most 500 KiB.' });
  const errors: { field: string; message: string }[] = [];
  const date = (value: string, field: string) => {
    const ordinal = calendarOrdinal(value);
    if (ordinal === null) errors.push({ field, message: 'Use a real calendar date in YYYY-MM-DD format (1900–9999).' });
    return ordinal;
  };
  const start = date(input.startDate, 'startDate'), end = date(input.endDate, 'endDate');
  date(input.weekId, 'weekId');
  if (input.weekId !== input.startDate) errors.push({ field: 'weekId', message: 'weekId must equal the Sunday startDate.' });
  if (start !== null && start % 7 !== 0) errors.push({ field: 'startDate', message: 'The week must start on Sunday.' });
  if (start !== null && end !== null && end - start !== 6) errors.push({ field: 'endDate', message: 'endDate must be the Saturday six calendar days after startDate.' });
  const seen = new Map<string, number>();
  input.tasks.forEach((task, index) => {
    const taskDate = date(task.date, `tasks.${index}.date`);
    if (taskDate !== null && start !== null && end !== null && (taskDate < start || taskDate > end)) errors.push({ field: `tasks.${index}.date`, message: 'Task date must fall inside this week.' });
    if (seen.has(task.id)) errors.push({ field: `tasks.${index}.id`, message: `Duplicate task ID; first used at tasks.${seen.get(task.id)}.id.` });
    else seen.set(task.id, index);
  });
  if (errors.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Weekly plan validation failed', details: errors });
  return input;
}
