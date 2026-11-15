import { Module } from '@nestjs/common';
import { TimeModule } from '../../common/application-clock';
import { GamificationModule } from '../gamification/gamification.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { GoalsModule } from '../goals/goals.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { DashboardRepository } from './persistence/repositories/dashboard.repository';
import { DashboardService } from './business/services/dashboard.service';
import { DashboardController } from './api/controllers/dashboard.controller';
@Module({imports:[TimeModule,GamificationModule,RoadmapModule,GoalsModule,AchievementsModule],providers:[DashboardRepository,DashboardService],controllers:[DashboardController]})
export class DashboardModule {}
