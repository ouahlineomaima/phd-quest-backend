import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { WeeklyPlansService } from '../../business/services/weekly-plans.service';
import { ImportPlanDto } from '../dtos/import-plan.dto';
import { TaskDescriptionDto } from '../dtos/task-description.dto';

@Controller('weekly-plans')
export class WeeklyPlansController {
  constructor(private readonly plans: WeeklyPlansService) {}
  @Post('import/preview')
  @HttpCode(200)
  preview(@Body() input: ImportPlanDto) {
    return this.plans.preview(input);
  }
  @Post('import/confirm')
  confirm(@Body() input: ImportPlanDto) {
    return this.plans.confirm(input);
  }
  @Get()
  list() {
    return this.plans.list();
  }
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.plans.detail(id);
  }
  @Patch(':id/tasks/:taskId/description')
  updateDescription(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() input: TaskDescriptionDto,
  ) {
    return this.plans.updateDescription(id, taskId, input.description);
  }
}
