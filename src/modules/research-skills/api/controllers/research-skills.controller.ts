import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ResearchSkillsService } from '../../business/services/research-skills.service';
import { CategoryDto, SkillDto, ProficiencyDto, EvidenceDto } from '../dtos/skill.dto';
import { EmptyReopenBodyPipe } from '../../../weekly-plans/api/dtos/task-progress.dto';
@Controller('research-skills')
export class ResearchSkillsController {
 constructor(private readonly service:ResearchSkillsService){}
 @Get() list(){return this.service.list();}
 @Get('summary') summary(){return this.service.summary();}
 @Post('initialize') initialize(@Body(new EmptyReopenBodyPipe()) _body:unknown){return this.service.initialize();}
 @Post('categories') createCategory(@Body() input:CategoryDto){return this.service.createCategory(input);}
 @Patch('categories/:id') editCategory(@Param('id') id:string,@Body() input:CategoryDto){return this.service.editCategory(id,input);}
 @Patch('categories/:id/archive') archiveCategory(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _body:unknown){return this.service.archiveCategory(id);}
 @Post() create(@Body() input:SkillDto){return this.service.create(input);}
 @Get(':id') detail(@Param('id') id:string){return this.service.detail(id);}
 @Patch(':id') edit(@Param('id') id:string,@Body() input:SkillDto){return this.service.edit(id,input);}
 @Patch(':id/archive') archive(@Param('id') id:string,@Body(new EmptyReopenBodyPipe()) _body:unknown){return this.service.archive(id);}
 @Patch(':id/proficiency') proficiency(@Param('id') id:string,@Body() input:ProficiencyDto){return this.service.proficiency(id,input);}
 @Post(':id/evidence') addEvidence(@Param('id') id:string,@Body() input:EvidenceDto){return this.service.evidence(id,null,input);}
 @Patch(':id/evidence/:evidenceId') editEvidence(@Param('id') id:string,@Param('evidenceId') eid:string,@Body() input:EvidenceDto){return this.service.evidence(id,eid,input);}
 @Delete(':id/evidence/:evidenceId') removeEvidence(@Param('id') id:string,@Param('evidenceId') eid:string,@Body(new EmptyReopenBodyPipe()) _body:unknown){return this.service.evidence(id,eid,{},true);}
}
