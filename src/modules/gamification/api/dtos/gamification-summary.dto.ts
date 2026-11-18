import { ActivitySummaryDto } from '../../../daily-activity/api/dtos/activity-summary.dto';
export interface GamificationSummaryDto extends ActivitySummaryDto {
  totalXp: number;
  playerLevel: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemainingToNextLevel: number;
  levelProgressPercent: number;
  totalCompletedTasks: number;
  timezone: string;
  asOf: string;
}
