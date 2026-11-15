import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { RoadmapService } from '../../business/services/roadmap.service';
import { CheckpointGoalsDto, CheckpointUpdateDto, CompleteLevelDto, EditLevelDto } from '../dtos/roadmap.dto';
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}
  @Get() list() { return this.roadmap.list(); }
  @Get(':levelNumber') detail(@Param('levelNumber', ParseIntPipe) number: number) { return this.roadmap.detail(number); }
  @Patch(':levelNumber') edit(@Param('levelNumber', ParseIntPipe) number: number, @Body() input: EditLevelDto) { return this.roadmap.edit(number, input.description, input.title); }
  @Patch(':levelNumber/checkpoints/:checkpointId') checkpoint(@Param('levelNumber', ParseIntPipe) number: number, @Param('checkpointId') id: string, @Body() input: CheckpointUpdateDto) { return this.roadmap.checkpoint(number, id, input); }
  @Patch(':levelNumber/checkpoints/:checkpointId/goals') linkGoals(@Param('levelNumber',ParseIntPipe) number:number,@Param('checkpointId') id:string,@Body() input:CheckpointGoalsDto) { return this.roadmap.linkGoals(number,id,input.goalIds); }
  @Post(':levelNumber/complete') complete(@Param('levelNumber', ParseIntPipe) number: number, @Body() _input: CompleteLevelDto) { return this.roadmap.complete(number); }
}
