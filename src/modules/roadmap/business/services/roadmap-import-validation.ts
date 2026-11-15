import { preparationCamp } from './preparation-camp';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createValidationPipe } from '../../../../common/validation';
import { ImportedLevelDto, RoadmapImportDto } from '../../api/dtos/roadmap-import.dto';
export const MAX_ROADMAP_IMPORT_BYTES = 500 * 1024;
export async function validateRoadmapImport(input: unknown): Promise<RoadmapImportDto> {
  if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > MAX_ROADMAP_IMPORT_BYTES) throw new PayloadTooLargeException('Roadmap JSON must be at most 500 KiB.');
  const dto = await createValidationPipe().transform(input, { type: 'body', metatype: RoadmapImportDto }) as RoadmapImportDto;
  const details: { field: string; message: string }[] = [];
  const hasCamp = dto.levels.length === 13;
  dto.levels.forEach((level, index) => {
    if (level.levelNumber !== index + (hasCamp ? 0 : 1)) details.push({ field: `levels.${index}.levelNumber`, message: 'Provide levels 0 through 12 in order, or legacy levels 1 through 12.' });
    if (!level.checkpoints.some(checkpoint => checkpoint.required)) details.push({ field: `levels.${index}.checkpoints`, message: 'Each level needs at least one required checkpoint.' });
  });
  if (details.length) throw new BadRequestException({ code: 'INVALID_ROADMAP', message: 'Roadmap validation failed', details });
  // Explicit ordering makes whitespace/property-order differences produce the same digest.
  return { schemaVersion: 1, roadmapId: dto.roadmapId, title: dto.title, durationYears: 3,
    levels: [...(hasCamp ? [] : [campImport()]), ...dto.levels].map(level => ({ levelNumber: level.levelNumber, title: level.title, description: level.description, objectives: level.objectives,
      checkpoints: level.checkpoints.map(checkpoint => ({ id: checkpoint.id, title: checkpoint.title,
        ...(checkpoint.description !== undefined ? { description: checkpoint.description } : {}), required: checkpoint.required })) })) };
}
function campImport(): ImportedLevelDto {
  const camp = preparationCamp();
  return { levelNumber: 0, title: camp.title, description: camp.description, objectives: camp.objectives,
    checkpoints: camp.checkpoints.map(checkpoint => ({ id: checkpoint.id, title: checkpoint.title, required: true })) };
}
export function roadmapDigest(roadmap: RoadmapImportDto) { return createHash('sha256').update(JSON.stringify(roadmap)).digest('hex'); }
export function importedLevels(roadmap: RoadmapImportDto) {
  return roadmap.levels.map(level => ({ levelNumber: level.levelNumber, year: level.levelNumber === 0 ? null : Math.floor((level.levelNumber - 1) / 4) + 1,
    title: level.title, description: level.description, objectives: level.objectives,
    checkpoints: level.checkpoints.map(checkpoint => ({ id: checkpoint.id, title: checkpoint.title,
      ...(checkpoint.description !== undefined ? { description: checkpoint.description } : {}), mandatory: checkpoint.required,
      completed: false, validatedAt: null, firstValidatedAt: null, evidence: '' })),
    status: level.levelNumber === 0 ? 'current' : 'locked', completedAt: null,
  }));
}
