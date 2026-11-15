import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WEEKLY_PLAN_MODEL, weeklyPlanSchema } from './persistence/models/weekly-plan.model';
import { WeeklyPlansRepository } from './persistence/repositories/weekly-plans.repository';
import { WeeklyPlansController } from './api/controllers/weekly-plans.controller';
import { WeeklyPlansService } from './business/services/weekly-plans.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: WEEKLY_PLAN_MODEL, schema: weeklyPlanSchema }])],
  controllers: [WeeklyPlansController],
  providers: [WeeklyPlansRepository, WeeklyPlansService],
})
export class WeeklyPlansModule {}
