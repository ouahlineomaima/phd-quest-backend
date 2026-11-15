import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { TaskProgressService } from '../../business/services/task-progress.service';
import { CompleteTaskDto, EmptyReopenBodyPipe } from '../dtos/task-progress.dto';
@Controller('weekly-plans')
export class TaskProgressController {
  constructor(private readonly progress: TaskProgressService) {}
  @Get(':planId/progress') read(@Param('planId') id: string) { return this.progress.read(id); }
  @Patch(':planId/tasks/:taskId/complete')
  complete(@Param('planId') id: string, @Param('taskId') task: string, @Body() input: CompleteTaskDto) { return this.progress.change(id, task, 'complete', input.actualMinutes); }
  @Patch(':planId/tasks/:taskId/reopen')
  reopen(@Param('planId') id: string, @Param('taskId') task: string, @Body(new EmptyReopenBodyPipe()) _input: unknown) { return this.progress.change(id, task, 'reopen'); }
}
