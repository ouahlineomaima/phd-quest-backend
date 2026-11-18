import { FocusMode, FocusCompletion } from '../enums/focus.enums';
export interface FocusSession {
  sessionId: string; mode: FocusMode; targetSeconds: number | null;
  startedAt: Date; endedAt: Date; focusedSeconds: number; taskRef: string | null;
  taskTitle: string | null; completionType: FocusCompletion;
  appliedAt: Date | null; appliedMinutes: number; createdAt: Date; updatedAt: Date;
}
