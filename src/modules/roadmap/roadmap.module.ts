import { AchievementsModule } from '../achievements/achievements.module';
import { GoalsModule } from '../goals/goals.module';
import { RoadmapImportService } from './business/services/roadmap-import.service';
import { RoadmapImportController } from './api/controllers/roadmap-import.controller';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { ROADMAP_MODEL, roadmapSchema } from './persistence/models/roadmap.model';
import { RoadmapRepository } from './persistence/repositories/roadmap.repository';
import { RoadmapService } from './business/services/roadmap.service';
import { RoadmapController } from './api/controllers/roadmap.controller';
@Module({ imports: [AchievementsModule,GoalsModule, TimeModule, MongooseModule.forFeature([{ name: ROADMAP_MODEL, schema: roadmapSchema }])], providers: [RoadmapRepository, RoadmapService, RoadmapImportService], controllers: [RoadmapImportController, RoadmapController], exports: [RoadmapService] })
export class RoadmapModule {}
