import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { GamificationModule } from '../gamification/gamification.module';
import { ACHIEVEMENT_MODEL, achievementSchema } from './persistence/models/achievement.model';
import { AchievementsRepository } from './persistence/repositories/achievements.repository';
import { AchievementsService } from './business/services/achievements.service';
import { AchievementsController } from './api/controllers/achievements.controller';
@Module({
  imports: [
    TimeModule,
    GamificationModule,
    MongooseModule.forFeature([{ name: ACHIEVEMENT_MODEL, schema: achievementSchema }]),
  ],
  providers: [AchievementsRepository, AchievementsService],
  controllers: [AchievementsController],
  exports: [AchievementsService],
})
export class AchievementsModule {}
