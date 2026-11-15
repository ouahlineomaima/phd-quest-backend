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

