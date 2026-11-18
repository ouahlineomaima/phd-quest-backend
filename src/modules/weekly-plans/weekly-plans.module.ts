import { AchievementsModule } from '../achievements/achievements.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WEEKLY_PLAN_MODEL, weeklyPlanSchema } from './persistence/models/weekly-plan.model';
import { WeeklyPlansRepository } from './persistence/repositories/weekly-plans.repository';
import { WeeklyPlansController } from './api/controllers/weekly-plans.controller';
import { WeeklyPlansService } from './business/services/weekly-plans.service';
import { TaskProgressService } from './business/services/task-progress.service';
import { TaskProgressController } from './api/controllers/task-progress.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { DailyActivityModule } from '../daily-activity/daily-activity.module';
import { TimeModule } from '../../common/application-clock';

@Module({
  imports: [
    AchievementsModule,
    TimeModule,
    GamificationModule,
    DailyActivityModule,
    MongooseModule.forFeature([{ name: WEEKLY_PLAN_MODEL, schema: weeklyPlanSchema }]),
  ],
  controllers: [WeeklyPlansController, TaskProgressController],
  providers: [WeeklyPlansRepository, WeeklyPlansService, TaskProgressService],
})
export class WeeklyPlansModule {}
