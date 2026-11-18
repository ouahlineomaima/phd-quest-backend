import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import {
  DAILY_ACTIVITY_MODEL,
  dailyActivitySchema,
} from './persistence/models/daily-activity.model';
import { DailyActivityRepository } from './persistence/repositories/daily-activity.repository';
import { DailyActivityService } from './business/services/daily-activity.service';
@Module({
  imports: [
    TimeModule,
    MongooseModule.forFeature([{ name: DAILY_ACTIVITY_MODEL, schema: dailyActivitySchema }]),
  ],
  providers: [DailyActivityRepository, DailyActivityService],
  exports: [DailyActivityService],
})
export class DailyActivityModule {}
