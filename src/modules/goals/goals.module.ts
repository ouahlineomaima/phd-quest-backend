import { AchievementsModule } from '../achievements/achievements.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { GOAL_MODEL, goalSchema } from './persistence/models/goal.model';
import { GoalsRepository } from './persistence/repositories/goals.repository';
import { GoalsService } from './business/services/goals.service';
import { GoalsController } from './api/controllers/goals.controller';
@Module({
  imports: [
    AchievementsModule,
    TimeModule,
    MongooseModule.forFeature([{ name: GOAL_MODEL, schema: goalSchema }]),
  ],
  providers: [GoalsRepository, GoalsService],
  controllers: [GoalsController],
  exports: [GoalsService],
})
export class GoalsModule {}
