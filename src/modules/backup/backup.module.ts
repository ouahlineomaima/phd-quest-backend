import { FocusSessionsModule } from '../focus-sessions/focus-sessions.module';
import { ResearchSkillsModule } from '../research-skills/research-skills.module';
import { SupervisorMeetingsModule } from '../supervisor-meetings/supervisor-meetings.module';
import { Module } from '@nestjs/common';
import { TimeModule } from '../../common/application-clock';
import { WeeklyPlansModule } from '../weekly-plans/weekly-plans.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { GoalsModule } from '../goals/goals.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { BackupRepository } from './persistence/repositories/backup.repository';
import { BackupService } from './business/services/backup.service';
import { BackupController } from './api/controllers/backup.controller';
@Module({
  imports: [
    ResearchSkillsModule,
    SupervisorMeetingsModule,
    FocusSessionsModule,
    TimeModule,
    WeeklyPlansModule,
    RoadmapModule,
    GoalsModule,
    AchievementsModule,
  ],
  providers: [BackupRepository, BackupService],
  controllers: [BackupController],
})
export class BackupModule {}
