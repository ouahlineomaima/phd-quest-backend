import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FocusSessionsService } from '../../business/services/focus-sessions.service';
import {
  ApplyFocusTimeDto,
  FocusHistoryQuery,
  SaveFocusSessionDto,
  TaskTimesQuery,
} from '../dtos/focus-session.dto';
@Controller('focus-sessions')
export class FocusSessionsController {
  constructor(private readonly service: FocusSessionsService) {}
  @Post() save(@Body() body: SaveFocusSessionDto) {
    return this.service.save(body);
  }
  @Get() history(@Query() query: FocusHistoryQuery) {
    return this.service.history(query.page, query.limit);
  }
  @Get('summary') summary() {
    return this.service.summary();
  }
  @Get('task-times') taskTimes(@Query() query: TaskTimesQuery) {
    return this.service.taskTimes(query.weekId);
  }
  @Get(':id/application-preview') preview(@Param('id') id: string) {
    return this.service.preview(id);
  }
  @Post(':id/apply-time') apply(@Param('id') id: string, @Body() _body: ApplyFocusTimeDto) {
    return this.service.apply(id);
  }
}
