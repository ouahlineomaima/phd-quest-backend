import {
  WeeklyPlanRecord,
  StoredTask,
} from '../../../weekly-plans/persistence/interfaces/weekly-plan.interface';
import { XpTransaction } from '../../../gamification/persistence/interfaces/xp-transaction.interface';
import {
  DailyActivityRecord,
  ActivityEvent,
} from '../../../daily-activity/persistence/interfaces/daily-activity.interface';
import { RoadmapLevel } from '../../../roadmap/persistence/interfaces/roadmap.interface';
import { GoalRecord } from '../../../goals/persistence/interfaces/goal.interface';
import { AchievementRecord } from '../../../achievements/persistence/interfaces/achievement.interface';
import { FocusSession } from '../../../focus-sessions/persistence/interfaces/focus-session.interface';
import {
  SupervisorRecord,
  MeetingRecord,
} from '../../../supervisor-meetings/persistence/interfaces/meeting.interface';
import {
  CategoryRecord,
  SkillRecord,
  StateRecord,
} from '../../../research-skills/persistence/interfaces/skill.interface';
export type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? Serialized<Item>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type BackupRecord<T> = Serialized<Omit<T, '_id' | 'editVersion'>> & { id: string };
export interface BackupRecords {
  weeklyPlans: BackupRecord<WeeklyPlanRecord>;
  xpTransactions: BackupRecord<XpTransaction>;
  dailyActivity: BackupRecord<DailyActivityRecord>;
  roadmapLevels: BackupRecord<RoadmapLevel>;
  goals: BackupRecord<GoalRecord>;
  achievements: BackupRecord<AchievementRecord>;
  focusSessions: BackupRecord<FocusSession>;
  supervisors: BackupRecord<SupervisorRecord>;
  supervisorMeetings: BackupRecord<MeetingRecord>;
  skillCategories: BackupRecord<CategoryRecord>;
  researchSkills: BackupRecord<SkillRecord>;
  skillTreeState: BackupRecord<StateRecord>;
}
export type BackupData = { [K in keyof BackupRecords]: BackupRecords[K][] };
export type BackupTask = Serialized<StoredTask>;
export type BackupEvent = Serialized<ActivityEvent>;
export const BACKUP_SECTIONS = [
  'weeklyPlans',
  'xpTransactions',
  'dailyActivity',
  'roadmapLevels',
  'goals',
  'achievements',
  'focusSessions',
  'supervisors',
  'supervisorMeetings',
  'skillCategories',
  'researchSkills',
  'skillTreeState',
] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];
export const OPTIONAL_BACKUP_SECTIONS = [
  'focusSessions',
  'supervisors',
  'supervisorMeetings',
  'skillCategories',
  'researchSkills',
  'skillTreeState',
] as const;
export type OptionalBackupSection = (typeof OPTIONAL_BACKUP_SECTIONS)[number];
export type LegacyBackupData = Omit<BackupData, OptionalBackupSection> &
  Partial<Pick<BackupData, OptionalBackupSection>>;
export interface LegacyBackupFile {
  application: 'phd-quest';
  schemaVersion: 1;
  exportedAt: string;
  settings: { timezone: string; weeklyBaselineMinutes: 360 };
  counts: Record<Exclude<BackupSection, OptionalBackupSection>, number> &
    Partial<Record<OptionalBackupSection, number>>;
  data: LegacyBackupData;
}
export interface BackupFile extends LegacyBackupFile {
  counts: Record<BackupSection, number>;
  data: BackupData;
}
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const RESTORE_CONFIRMATION = 'REPLACE ALL DATA';
