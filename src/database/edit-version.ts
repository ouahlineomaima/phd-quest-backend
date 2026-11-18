import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface EditableRecord {
  _id: { toString(): string };
  editVersion?: string;
}
// Legacy records acquire a persisted token on their first successful edit. Restore
// generates fresh tokens, so drafts from before a restore can never match again.
export function editVersion(row: EditableRecord): string {
  return row.editVersion ?? `legacy:${row._id.toString()}`;
}
export function assertEditVersion(row: EditableRecord, expected: string | undefined): void {
  if (!expected)
    throw new HttpException(
      {
        code: 'VERSION_REQUIRED',
        message: 'Reload this record and submit its version in If-Match.',
      },
      428,
    );
  if (!/^"(?:[a-f0-9-]{36}|legacy:[a-f0-9]{24})"$/.test(expected))
    throw new BadRequestException({
      code: 'INVALID_VERSION',
      message: 'If-Match must contain the quoted record version.',
    });
  if (expected !== `"${editVersion(row)}"`)
    throw new ConflictException({
      code: 'STALE_RECORD',
      message: 'This record was changed in another tab or session. Your edits have not been saved.',
      details: { recordId: row._id.toString(), currentVersion: editVersion(row) },
    });
}
export function editFilter(row: EditableRecord) {
  return { _id: row._id, editVersion: row.editVersion ?? { $exists: false } };
}
export function editUpdate<T extends { $set?: object }>(update: T) {
  return { ...update, $set: { ...update.$set, editVersion: randomUUID() } };
}
