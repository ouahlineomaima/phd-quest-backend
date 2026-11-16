import { FocusSessionsModule } from './modules/focus-sessions/focus-sessions.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './database/database.module';
import { WeeklyPlansModule } from './modules/weekly-plans/weekly-plans.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { BackupModule } from './modules/backup/backup.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { GoalsModule } from './modules/goals/goals.module';
import { RoadmapModule } from './modules/roadmap/roadmap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    HealthModule,
    WeeklyPlansModule,
    GamificationModule,
    RoadmapModule,
    GoalsModule,
    AchievementsModule,
    DashboardModule,
    BackupModule,
    FocusSessionsModule,
  ],
})
export class AppModule {}
