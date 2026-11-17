import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MeetingsService } from '../../business/services/meetings.service';
import { ActionFieldsDto, ActionFilterDto, CreateMeetingDto, CreateSupervisorDto, MeetingFieldsDto, MeetingFilterDto, MeetingStatusDto, SupervisorFieldsDto, SupervisorFilterDto } from '../dtos/meeting.dto';
import { EmptyReopenBodyPipe } from '../../../weekly-plans/api/dtos/task-progress.dto';
@Controller('supervisors')
export class SupervisorsController {
  constructor(private readonly service:MeetingsService) {}
  @Get() list(@Query() filter:SupervisorFilterDto) {return this.service.supervisors(filter.archived);}
  @Post() create(@Body() input:CreateSupervisorDto) {return this.service.createSupervisor(input);}
  @Patch(':id') edit(@Param('id') id:string,@Body() input:SupervisorFieldsDto) {return this.service.editSupervisor(id,input);}
  @Patch(':id/archive') archive(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _body:unknown) {return this.service.archiveSupervisor(id);}
}
@Controller('supervisor-meetings')
export class MeetingsController {
  constructor(private readonly service:MeetingsService) {}
  @Get() list(@Query() filter:MeetingFilterDto) {return this.service.list(filter);}
  @Get('actions') actions(@Query() filter:ActionFilterDto) {return this.service.actions(filter);}
  @Get('summary') summary() {return this.service.summary();}
  @Post() create(@Body() input:CreateMeetingDto) {return this.service.create(input);}
  @Get(':id') detail(@Param('id') id:string) {return this.service.detail(id);}
  @Patch(':id') edit(@Param('id') id:string,@Body() input:MeetingFieldsDto) {return this.service.edit(id,input);}
  @Patch(':id/status') status(@Param('id') id:string,@Body() input:MeetingStatusDto) {return this.service.status(id,input.status);}
  @Patch(':id/archive') archive(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _body:unknown) {return this.service.archive(id);}
  @Post(':id/actions') createAction(@Param('id') id:string,@Body() input:ActionFieldsDto) {return this.service.action(id,null,input);}
  @Patch(':id/actions/:actionId') editAction(@Param('id') id:string,@Param('actionId') actionId:string,@Body() input:ActionFieldsDto) {return this.service.action(id,actionId,input);}
  @Delete(':id/actions/:actionId') removeAction(@Param('id') id:string,@Param('actionId') actionId:string,@Body(new EmptyReopenBodyPipe()) _body:unknown) {return this.service.action(id,actionId,{},true);}
}
