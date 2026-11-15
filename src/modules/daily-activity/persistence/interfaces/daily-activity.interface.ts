export interface ActivityEvent { eventId: string; sourceId: string; planId: string; taskId: string; occurredAt: Date; }
export interface DailyActivityRecord { date: string; taskCompletionCount: number; firstActivityAt: Date; lastActivityAt: Date; events: ActivityEvent[]; }
