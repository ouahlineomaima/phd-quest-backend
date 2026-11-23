import type { FocusSession } from '../../persistence/interfaces/focus-session.interface';
import { FocusState } from '../../persistence/enums/focus.enums';

// A running interval remains authoritative while clients are absent or disconnected.
// Legacy lease metadata is retained for compatibility and never expires a session.
export function measuredMilliseconds(row: FocusSession, now: Date): number {
  const confirmed = row.confirmedMilliseconds ?? row.focusedSeconds * 1000;
  const extra =
    row.state === FocusState.Running && row.intervalStartedAt
      ? Math.max(0, now.getTime() - row.intervalStartedAt.getTime())
      : 0;
  return confirmed + extra;
}
export function sessionView(row: FocusSession, now: Date) {
  return {
    ...row,
    recovered: !!row.recovered,
    elapsedMilliseconds: measuredMilliseconds(row, now),
    serverNow: now.toISOString(),
    leaseUntil: row.leaseUntil ?? null,
  };
}
