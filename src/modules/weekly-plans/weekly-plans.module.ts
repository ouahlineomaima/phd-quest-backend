import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WEEKLY_PLAN_MODEL, weeklyPlanSchema } from './persistence/models/weekly-plan.model';
import { WeeklyPlansRepository } from './persistence/repositories/weekly-plans.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: WEEKLY_PLAN_MODEL, schema: weeklyPlanSchema }])],
  providers: [WeeklyPlansRepository], exports: [WeeklyPlansRepository],
})
export class WeeklyPlansModule {}
