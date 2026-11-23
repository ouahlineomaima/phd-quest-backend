import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FocusLifecycleService } from '../../business/services/focus-lifecycle.service';
import { StartFocusDto, FocusCommandDto, FocusHeartbeatDto } from '../dtos/focus-lifecycle.dto';
import { FocusSessionsService } from '../../business/services/focus-sessions.service';
import {
  ApplyFocusTimeDto,
  FocusHistoryQuery,
  SaveFocusSessionDto,
  TaskTimesQuery,
  CorrectFocusTimeDto,
} from '../dtos/focus-session.dto';
@Controller('focus-sessions')
export class FocusSessionsController {
  constructor(
    private readonly service: FocusSessionsService,
    private readonly lifecycle: FocusLifecycleService,
  ) {}
  @Get('current') async current(@Res() response: Response) {
    response.json(await this.lifecycle.current());
  }
  @Post('start') start(@Body() body: StartFocusDto) {
    return this.lifecycle.start(body);
  }
  @Post(':id/heartbeat') heartbeat(@Param('id') id: string, @Body() body: FocusHeartbeatDto) {
    return this.lifecycle.heartbeat(id, body);
  }
  @Post(':id/pause') pause(
    @Param('id') id: string,
    @Body() _body: FocusCommandDto,
    @Headers('if-match') version?: string,
  ) {
    return this.lifecycle.command(id, 'pause', version);
  }
  @Post(':id/resume') resume(
    @Param('id') id: string,
    @Body() body: FocusCommandDto,
    @Headers('if-match') version?: string,
  ) {
    return this.lifecycle.command(id, 'resume', version, body.ownerId);
  }
  @Post(':id/claim') claim(
    @Param('id') id: string,
    @Body() body: FocusCommandDto,
    @Headers('if-match') version?: string,
  ) {
    return this.lifecycle.command(id, 'claim', version, body.ownerId);
  }
  @Post(':id/reconcile') reconcile(
    @Param('id') id: string,
    @Body() _body: FocusCommandDto,
    @Headers('if-match') version?: string,
  ) {
    return this.lifecycle.command(id, 'reconcile', version);
  }
  @Post(':id/stop') stop(
    @Param('id') id: string,
    @Body() _body: FocusCommandDto,
    @Headers('if-match') version?: string,
  ) {
    return this.lifecycle.command(id, 'stop', version);
  }
  @Post(':id/correction') correct(
    @Param('id') id: string,
    @Body() body: CorrectFocusTimeDto,
    @Headers('if-match') version?: string,
  ) {
    return this.service.correct(id, body.effectiveMinutes, version);
  }
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
  @Post(':id/apply-time') apply(
    @Param('id') id: string,
    @Body() body: ApplyFocusTimeDto,
    @Headers('if-match') version?: string,
  ) {
    return this.service.apply(id, body.effectiveMinutes, version, body.expectedActualMinutes);
  }
}
