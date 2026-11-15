export interface ActivitySummaryDto {
  currentStreak: number; longestStreak: number;
  todayActivity: { date: string; taskCompletionCount: number; firstActivityAt: string | null; lastActivityAt: string | null };
}
