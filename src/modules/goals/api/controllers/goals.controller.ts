import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { GoalsService } from '../../business/services/goals.service';
import { CreateGoalDto, EditGoalDto, GoalFilterDto } from '../dtos/goal.dto';
import { EmptyReopenBodyPipe } from '../../../weekly-plans/api/dtos/task-progress.dto';
@Controller('goals')
export class GoalsController {
 constructor(private readonly goals:GoalsService) {}
 @Get() list(@Query() filter:GoalFilterDto) { return this.goals.list(filter); }
 @Post() create(@Body() input:CreateGoalDto) { return this.goals.create(input); }
 @Patch(':id') edit(@Param('id') id:string,@Body() input:EditGoalDto) { return this.goals.edit(id,input); }
 @Patch(':id/complete') complete(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _input:unknown) { return this.goals.transition(id,'complete'); }
 @Patch(':id/reopen') reopen(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _input:unknown) { return this.goals.transition(id,'reopen'); }
 @Patch(':id/archive') archive(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _input:unknown) { return this.goals.transition(id,'archive'); }
}
