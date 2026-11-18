import { RECORD_ID } from '../../../../common/identifiers';
export { RECORD_ID };
export enum SkillLevel {
  NotStarted = 0,
  Beginner = 1,
  Developing = 2,
  Proficient = 3,
  Advanced = 4,
}
export enum SkillSourceType {
  WeeklyTask = 'weekly_task',
  ResearchGoal = 'research_goal',
  RoadmapCheckpoint = 'roadmap_checkpoint',
}
export enum EvidenceType {
  Note = 'note',
  ExternalLink = 'external_link',
}
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  [SkillLevel.NotStarted]: 'Not started',
  [SkillLevel.Beginner]: 'Beginner',
  [SkillLevel.Developing]: 'Developing',
  [SkillLevel.Proficient]: 'Proficient',
  [SkillLevel.Advanced]: 'Advanced',
};
export const SKILL_LEVEL_VALUES = [
  SkillLevel.NotStarted,
  SkillLevel.Beginner,
  SkillLevel.Developing,
  SkillLevel.Proficient,
  SkillLevel.Advanced,
] as const;
export const TARGET_LEVELS = [
  SkillLevel.Beginner,
  SkillLevel.Developing,
  SkillLevel.Proficient,
  SkillLevel.Advanced,
] as const;
export type TargetSkillLevel = (typeof TARGET_LEVELS)[number];
export const SOURCE_TYPES = Object.values(SkillSourceType);
export const SKILL_ICONS = ['book', 'target', 'sparkles', 'roadmap', 'clock', 'trophy'] as const;
export const SKILL_COLORS = ['purple', 'cyan', 'gold', 'green'] as const;
export type SkillIcon = (typeof SKILL_ICONS)[number];
export type SkillColor = (typeof SKILL_COLORS)[number];
export const SKILL_STATE_ID = '000000000000000000000003';
