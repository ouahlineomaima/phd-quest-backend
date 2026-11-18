import { MeetingStatus } from '../../persistence/enums/meeting.enums';
import {
  isUtcInstant,
  validateBackupHistory,
  validateBackupDto,
} from '../../../../common/backup-validation';
import { LegacyBackupData } from '../../../backup/persistence/interfaces/backup.interface';
import { BadRequestException } from '@nestjs/common';
import { ActionFieldsDto, MeetingFieldsDto, SupervisorFieldsDto } from '../../api/dtos/meeting.dto';
import { RECORD_ID } from '../../persistence/enums/meeting.enums';
import { validTaskReferences } from './meetings.service';
type Row = Record<string, unknown>;
function invalid(): never {
  throw new BadRequestException(
    'Invalid supervisor-meeting backup records, history or associations.',
  );
}
function shape(row: unknown, fields: string[]) {
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    fields.some((k) => !Object.hasOwn(row, k)) ||
    Object.keys(row).some((k) => !fields.includes(k))
  )
    invalid();
}
function dto<T extends object>(row: Row, type: new () => T) {
  validateBackupDto(type, row, invalid);
}
function instant(value: unknown, end?: string) {
  if (!isUtcInstant(value, end)) invalid();
}
function history(
  row: { createdAt: string; updatedAt: string; archivedAt?: string | null },
  end: string,
) {
  validateBackupHistory(row, end, invalid);
}
function unique(ids: unknown[]) {
  if (new Set(ids).size !== ids.length) invalid();
}
export function validateMeetingBackup(data: LegacyBackupData, end: string) {
  const supervisors = data.supervisors ?? [],
    meetings = data.supervisorMeetings ?? [];
  for (const row of supervisors) {
    shape(row, [
      'id',
      'name',
      'role',
      'institution',
      'email',
      'notes',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]);
    history(row, end);
    const { id, archivedAt, createdAt, updatedAt, ...input } = row;
    dto(input, SupervisorFieldsDto);
  }
  const supervisorIds = new Set(supervisors.map((s) => s.id)),
    actionIds = new Set<string>();
  for (const row of meetings) {
    shape(row, [
      'id',
      'title',
      'scheduledAt',
      'plannedDurationMinutes',
      'type',
      'location',
      'status',
      'supervisorIds',
      'notes',
      'goalIds',
      'checkpointRefs',
      'documents',
      'actions',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]);
    history(row, end);
    instant(row.scheduledAt);
    const { id, status, actions, archivedAt, createdAt, updatedAt, ...input } = row;
    dto(input, MeetingFieldsDto);
    if (
      !Object.values(MeetingStatus).includes(status) ||
      !row.supervisorIds.length ||
      row.supervisorIds.some((id: string) => !supervisorIds.has(id))
    )
      invalid();
    shape(row.notes, ['agenda', 'discussion', 'feedback', 'decisions']);
    if (!Array.isArray(actions) || actions.length > 200) invalid();
    for (const action of actions) {
      shape(action, [
        'id',
        'phase',
        'title',
        'description',
        'dueDate',
        'status',
        'linkedTaskIds',
        'createdAt',
        'updatedAt',
      ]);
      history(action, end);
      if (
        typeof action.id !== 'string' ||
        !RECORD_ID.test(action.id) ||
        actionIds.has(action.id) ||
        action.createdAt < createdAt ||
        action.updatedAt > updatedAt
      )
        invalid();
      actionIds.add(action.id);
      const { id, createdAt: _, updatedAt: __, ...fields } = action;
      dto(fields, ActionFieldsDto);
      validTaskReferences(action.linkedTaskIds);
      if (action.dueDate !== null) {
        const d = new Date(action.dueDate + 'T00:00:00Z');
        if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== action.dueDate)
          invalid();
      }
    }
    unique(row.checkpointRefs.map((r) => `${r.levelNumber}:${r.checkpointId}`));
    // Task, goal and checkpoint references can legitimately outlive replaced records.
    // Keep their stable identities; the read API explicitly exposes unavailable links.
  }
}
