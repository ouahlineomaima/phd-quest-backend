import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { RoadmapService } from '../../business/services/roadmap.service';
import { CheckpointUpdateDto, CompleteLevelDto, EditLevelDto } from '../dtos/roadmap.dto';
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}
  @Get() list() { return this.roadmap.list(); }
  @Get(':levelNumber') detail(@Param('levelNumber', ParseIntPipe) number: number) { return this.roadmap.detail(number); }
  @Patch(':levelNumber') edit(@Param('levelNumber', ParseIntPipe) number: number, @Body() input: EditLevelDto) { return this.roadmap.edit(number, input.description); }
  @Patch(':levelNumber/checkpoints/:checkpointId') checkpoint(@Param('levelNumber', ParseIntPipe) number: number, @Param('checkpointId') id: string, @Body() input: CheckpointUpdateDto) { return this.roadmap.checkpoint(number, id, input); }
  @Post(':levelNumber/complete') complete(@Param('levelNumber', ParseIntPipe) number: number, @Body() _input: CompleteLevelDto) { return this.roadmap.complete(number); }
}
