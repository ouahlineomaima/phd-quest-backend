import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { DailyActivityModule } from '../daily-activity/daily-activity.module';
import {
  XP_TRANSACTION_MODEL,
  xpTransactionSchema,
} from './persistence/models/xp-transaction.model';
import { GamificationRepository } from './persistence/repositories/gamification.repository';
import { GamificationService } from './business/services/gamification.service';
import { GamificationController } from './api/controllers/gamification.controller';
@Module({
  imports: [
    TimeModule,
    DailyActivityModule,
    MongooseModule.forFeature([{ name: XP_TRANSACTION_MODEL, schema: xpTransactionSchema }]),
  ],
  providers: [GamificationRepository, GamificationService],
  controllers: [GamificationController],
  exports: [GamificationService],
})
export class GamificationModule {}
