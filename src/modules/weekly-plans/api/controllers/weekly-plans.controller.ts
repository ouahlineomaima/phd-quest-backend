import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { WeeklyPlansService } from '../../business/services/weekly-plans.service';
import { ImportPlanDto } from '../dtos/import-plan.dto';

@Controller('weekly-plans')
export class WeeklyPlansController {
  constructor(private readonly plans: WeeklyPlansService) {}
  @Post('import/preview') @HttpCode(200)
  preview(@Body() input: ImportPlanDto) { return this.plans.preview(input); }
}
