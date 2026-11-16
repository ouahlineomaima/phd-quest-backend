export interface FocusSession {
  sessionId: string; mode: 'countdown' | 'stopwatch'; targetSeconds: number | null;
  startedAt: Date; endedAt: Date; focusedSeconds: number; taskRef: string | null;
  taskTitle: string | null; completionType: 'target-reached' | 'stopped-early';
  appliedAt: Date | null; appliedMinutes: number; createdAt: Date; updatedAt: Date;
}
