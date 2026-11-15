export const BACKUP_SECTIONS = ['weeklyPlans', 'xpTransactions', 'dailyActivity', 'roadmapLevels', 'goals', 'achievements'] as const;
export type BackupSection = typeof BACKUP_SECTIONS[number];
export interface BackupFile {
  application: 'phd-quest'; schemaVersion: 1; exportedAt: string;
  settings: { timezone: string; weeklyBaselineMinutes: 360 };
  counts: Record<BackupSection, number>;
  data: Record<BackupSection, Record<string, unknown>[]>;
}
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const RESTORE_CONFIRMATION = 'REPLACE ALL DATA';
