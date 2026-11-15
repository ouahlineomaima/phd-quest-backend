import { calendarOrdinal } from '../../../../common/calendar';
export function streaks(dates: string[], today: string) {
  const day = calendarOrdinal(today)!;
  const days = [...new Set(dates.map(calendarOrdinal).filter((value): value is number => value !== null && value <= day))].sort((a, b) => a - b);
  let longestStreak = 0, run = 0, previous = -Infinity;
  for (const value of days) { run = value === previous + 1 ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); previous = value; }
  const active = new Set(days);
  let end = active.has(day) ? day : day - 1, currentStreak = 0;
  while (active.has(end)) { currentStreak++; end--; }
  return { currentStreak, longestStreak };
}
