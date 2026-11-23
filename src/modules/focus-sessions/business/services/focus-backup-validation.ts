import { BadRequestException } from '@nestjs/common';
import type { BackupRecords } from '../../../backup/persistence/interfaces/backup.interface';
import { FocusMode, FocusKind, FocusState } from '../../persistence/enums/focus.enums';
import { validateFocus } from './focus-validation';
import { FocusCompletion } from '../../persistence/enums/focus.enums';

export function validateTimerBackup(row: BackupRecords['focusSessions'], end: string) {
  const fail = () => {
    throw new BadRequestException({
      code: 'INVALID_BACKUP',
      message: 'Invalid focus timer state or timing history.',
    });
  };
  const uuid = (value: unknown) =>
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
  const date = (value: unknown) =>
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
  const start = Date.parse(row.startedAt),
    heartbeat = Date.parse(row.lastHeartbeatAt ?? '');
  validateFocus(
    {
      sessionId: row.sessionId,
      mode: row.mode,
      targetSeconds: row.targetSeconds,
      taskRef: row.taskRef,
      startedAt: new Date(Date.parse(end) - 1000).toISOString(),
      endedAt: end,
      focusedSeconds: 1,
      completionType: FocusCompletion.StoppedEarly,
    },
    new Date(end),
  );
  if (
    !Object.values(FocusState).includes(row.state!) ||
    !Object.values(FocusKind).includes(row.kind!) ||
    !Number.isSafeInteger(row.confirmedMilliseconds) ||
    row.confirmedMilliseconds! < 0 ||
    (row.timerPolicy === undefined &&
      row.confirmedMilliseconds! > (row.targetSeconds ?? 604800) * 1000) ||
    row.focusedSeconds !== Math.floor(row.confirmedMilliseconds! / 1000) ||
    row.confirmedMilliseconds! > Date.parse(row.endedAt ?? end) - start ||
    row.confirmedMilliseconds! > heartbeat - start ||
    !date(row.lastHeartbeatAt) ||
    heartbeat < start ||
    heartbeat > Date.parse(end) ||
    typeof row.recovered !== 'boolean' ||
    !Number.isSafeInteger(row.heartbeatSequence) ||
    row.heartbeatSequence! < 0
  )
    fail();
  const running = row.state === FocusState.Running,
    stopped = row.state === FocusState.Stopped;
  if (
    row.kind === FocusKind.Break &&
    (row.mode !== FocusMode.Countdown ||
      ![300, 900].includes(row.targetSeconds!) ||
      row.taskRef ||
      row.appliedAt ||
      row.effectiveSeconds !== undefined)
  )
    fail();
  if (
    (stopped
      ? row.activeSlot !== undefined || !date(row.endedAt)
      : row.activeSlot !== 'workspace' || row.endedAt !== null) ||
    (!stopped &&
      (row.appliedAt || row.effectiveSeconds !== undefined || row.completionType !== null))
  )
    fail();
  if (running) {
    if (
      !(row.timerPolicy === 'manual' && row.ownerId === null && row.ownerToken === null) &&
      (!uuid(row.ownerId) || !uuid(row.ownerToken))
    )
      fail();
    if (row.intervalStartedAt !== row.lastHeartbeatAt || !date(row.intervalStartedAt)) fail();
    if (row.timerPolicy === 'manual') {
      if (row.leaseUntil !== null || row.activityUntil !== null) fail();
    } else {
      // Validate historical metadata without using it to expire live sessions.
      const legacyActivityWindow =
        row.kind === FocusKind.Break ? row.targetSeconds! * 1000 + 45000 : 300000;
      if (
        !date(row.leaseUntil) ||
        Date.parse(row.leaseUntil!) !== heartbeat + 45000 ||
        !date(row.activityUntil) ||
        Date.parse(row.activityUntil!) < heartbeat ||
        Date.parse(row.activityUntil!) > heartbeat + legacyActivityWindow
      )
        fail();
    }
  } else if (
    row.ownerId !== null ||
    row.ownerToken !== null ||
    row.intervalStartedAt !== null ||
    row.leaseUntil !== null ||
    row.activityUntil !== null ||
    row.heartbeatSequence !== 0
  )
    fail();
  if (
    stopped &&
    row.completionType !==
      (row.mode === FocusMode.Countdown &&
      (row.timerPolicy === 'manual'
        ? row.focusedSeconds >= row.targetSeconds!
        : row.focusedSeconds === row.targetSeconds)
        ? FocusCompletion.TargetReached
        : FocusCompletion.StoppedEarly)
  )
    fail();
}
