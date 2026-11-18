import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
export function isUtcInstant(value: unknown, end?: string): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value &&
    (!end || value <= end)
  );
}
export function validateBackupHistory(
  row: { createdAt: string; updatedAt: string; archivedAt?: string | null },
  end: string,
  invalid: () => never,
): void {
  if (
    !isUtcInstant(row.createdAt, end) ||
    !isUtcInstant(row.updatedAt, end) ||
    row.createdAt > row.updatedAt
  )
    invalid();
  if (
    row.archivedAt !== undefined &&
    row.archivedAt !== null &&
    (!isUtcInstant(row.archivedAt, end) ||
      row.archivedAt < row.createdAt ||
      row.archivedAt > row.updatedAt)
  )
    invalid();
}
export function validateBackupDto<T extends object>(
  type: new () => T,
  input: Record<string, unknown>,
  invalid: () => never,
): T {
  const dto = plainToInstance(type, input);
  if (
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
      .length
  )
    invalid();
  return dto;
}
