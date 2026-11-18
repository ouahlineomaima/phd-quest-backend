import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import {
  SKILL_CATEGORY_MODEL,
  RESEARCH_SKILL_MODEL,
  SKILL_TREE_STATE_MODEL,
  skillCategorySchema,
  researchSkillSchema,
  skillTreeStateSchema,
} from './persistence/models/research-skill.model';
import { SkillsRepository } from './persistence/repositories/skills.repository';
import { ResearchSkillsService } from './business/services/research-skills.service';
import { ResearchSkillsController } from './api/controllers/research-skills.controller';
@Module({
  imports: [
    TimeModule,
    MongooseModule.forFeature([
      { name: SKILL_CATEGORY_MODEL, schema: skillCategorySchema },
      { name: RESEARCH_SKILL_MODEL, schema: researchSkillSchema },
      { name: SKILL_TREE_STATE_MODEL, schema: skillTreeStateSchema },
    ]),
  ],
  providers: [SkillsRepository, ResearchSkillsService],
  controllers: [ResearchSkillsController],
  exports: [MongooseModule, ResearchSkillsService],
})
export class ResearchSkillsModule {}
