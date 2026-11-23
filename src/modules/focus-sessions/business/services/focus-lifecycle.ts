import type { FocusSession } from '../../persistence/interfaces/focus-session.interface';
import { FocusState, FocusKind } from '../../persistence/enums/focus.enums';

export const HEARTBEAT_MS = 15000;
export const LEASE_MS = 45000;
export const ACTIVITY_MS = 300000;
// Rest is not research activity. Keep existing 5/15-minute breaks usable without interaction.
export function activityWindow(row: Pick<FocusSession, 'kind' | 'targetSeconds'>): number {
  return row.kind === FocusKind.Break ? (row.targetSeconds ?? 0) * 1000 + LEASE_MS : ACTIVITY_MS;
}
export function expired(row: FocusSession, now: Date): boolean {
  return (
    row.state === FocusState.Running &&
    (!row.leaseUntil || !row.activityUntil || now >= row.leaseUntil || now >= row.activityUntil)
  );
}
// Only a live command can confirm a new running interval. Expiration grants no grace time.
export function measuredMilliseconds(row: FocusSession, now: Date): number {
  const confirmed = row.confirmedMilliseconds ?? row.focusedSeconds * 1000;
  const extra =
    row.state === FocusState.Running && !expired(row, now) && row.intervalStartedAt
      ? Math.max(0, now.getTime() - row.intervalStartedAt.getTime())
      : 0;
  return Math.min(row.targetSeconds ? row.targetSeconds * 1000 : 604800000, confirmed + extra);
}
export function sessionView(row: FocusSession, now: Date) {
  const recovered = expired(row, now);
  return {
    ...row,
    state: recovered ? FocusState.Paused : row.state,
    recovered: recovered || !!row.recovered,
    elapsedMilliseconds: measuredMilliseconds(row, now),
    serverNow: now.toISOString(),
    leaseUntil: row.leaseUntil ?? null,
  };
}
