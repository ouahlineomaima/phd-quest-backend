import { RoadmapStatus } from '../../persistence/enums/roadmap.enums';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { applicationWrite } from '../../../../database/application-write';
import { RoadmapRepository } from '../../persistence/repositories/roadmap.repository';
import { ConfirmRoadmapDto } from '../../api/dtos/roadmap-import.dto';
import { importedLevels, roadmapDigest, validateRoadmapImport } from './roadmap-import-validation';
@Injectable()
export class RoadmapImportService {
  constructor(
    private readonly repository: RoadmapRepository,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async preview(input: unknown) {
    const roadmap = await validateRoadmapImport(input);
    return this.connection.transaction(
      async (session) => {
        const levels = await this.repository.list(session),
          revision = await this.repository.revision(session);
        return {
          roadmap,
          digest: roadmapDigest(roadmap),
          revision,
          metadataPersisted: false,
          totals: {
            levels: roadmap.levels.length,
            objectives: roadmap.levels.reduce((sum, level) => sum + level.objectives.length, 0),
            checkpoints: roadmap.levels.reduce((sum, level) => sum + level.checkpoints.length, 0),
            requiredCheckpoints: roadmap.levels.reduce(
              (sum, level) => sum + level.checkpoints.filter((c) => c.required).length,
              0,
            ),
          },
          existing: {
            willReplace: levels.length > 0,
            levels: levels.length,
            completedLevels: levels.filter((level) => level.status === RoadmapStatus.Completed)
              .length,
            validatedCheckpoints: levels.reduce(
              (sum, level) => sum + level.checkpoints.filter((c) => c.completed).length,
              0,
            ),
            historicalCheckpointValidations: levels.reduce(
              (sum, level) => sum + level.checkpoints.filter((c) => !!c.firstValidatedAt).length,
              0,
            ),
          },
          resetsProgress: true,
          preservesHistoricalAchievements: true,
        };
      },
      { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
    );
  }
  async confirm(input: ConfirmRoadmapDto) {
    if (input.confirmation !== 'REPLACE ROADMAP')
      throw new BadRequestException('Type REPLACE ROADMAP to confirm replacement.');
    const roadmap = await validateRoadmapImport(input.roadmap),
      digest = roadmapDigest(roadmap);
    if (digest !== input.digest)
      throw new ConflictException(
        'The roadmap changed after preview. Validate it again before replacing.',
      );
    if (!Number.isSafeInteger(input.revision) || input.revision < 0)
      throw new BadRequestException('A valid preview revision is required.');
    return applicationWrite(
      this.connection,
      async (session) => {
        if ((await this.repository.revision(session)) !== input.revision + 1)
          throw new ConflictException(
            'Workspace data changed after preview, or this import already ran. Preview again before replacing the roadmap.',
          );
        await this.repository.replace(importedLevels(roadmap), session);
        return {
          levels: await this.repository.list(session),
          metadata: {
            roadmapId: roadmap.roadmapId,
            title: roadmap.title,
            durationYears: roadmap.durationYears,
            persisted: false,
          },
        };
      },
      { maxCommitTimeMS: 10000 },
    );
  }
}
