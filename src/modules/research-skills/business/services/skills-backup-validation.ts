import {
  isUtcInstant,
  validateBackupHistory,
  validateBackupDto,
} from '../../../../common/backup-validation';
import { LegacyBackupData } from '../../../backup/persistence/interfaces/backup.interface';
import { BadRequestException } from '@nestjs/common';
import { CategoryDto, SkillDto, EvidenceDto } from '../../api/dtos/skill.dto';
import { RECORD_ID, SKILL_STATE_ID } from '../../persistence/enums/skill.enums';
import { safeEvidence, validateAssociations, validateGraph } from './skill-rules';
type Row = Record<string, unknown>;
function invalid(): never {
  throw new BadRequestException('Invalid Skill Tree backup records, history or references.');
}
function shape(row: unknown, keys: string[], optional: string[] = []) {
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    keys.some((k) => !Object.hasOwn(row, k)) ||
    Object.keys(row).some((k) => !keys.includes(k) && !optional.includes(k))
  )
    invalid();
}
function instant(value: unknown, end?: string) {
  if (!isUtcInstant(value, end)) invalid();
}
function history(
  row: { createdAt: string; updatedAt: string; archivedAt?: string | null },
  end: string,
) {
  validateBackupHistory(row, end, invalid);
}
function dto<T extends object>(type: new () => T, input: Row) {
  validateBackupDto(type, input, invalid);
}
function level(v: unknown) {
  if (!Number.isInteger(v) || typeof v !== 'number' || v < 0 || v > 4) invalid();
}
export function validateSkillsBackup(data: LegacyBackupData, end: string) {
  const categories = data.skillCategories ?? [],
    skills = data.researchSkills ?? [],
    state = data.skillTreeState ?? [];
  if (state.length > 1 || ((categories.length || skills.length) && state.length !== 1)) invalid();
  for (const row of state) {
    shape(row, ['id', 'initializedAt', 'createdAt', 'updatedAt']);
    if (row.id !== SKILL_STATE_ID) invalid();
    history(row, end);
    instant(row.initializedAt, end);
    if (row.initializedAt < row.createdAt || row.initializedAt > row.updatedAt) invalid();
  }
  for (const row of categories) {
    shape(row, [
      'id',
      'name',
      'description',
      'icon',
      'color',
      'sortOrder',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]);
    history(row, end);
    const { id, archivedAt, createdAt, updatedAt, ...fields } = row;
    dto(CategoryDto, fields);
  }
  const categoryIds = new Set(categories.map((r) => r.id)),
    nestedIds = new Set<string>();
  for (const row of skills) {
    shape(row, [
      'id',
      'categoryId',
      'name',
      'description',
      'proficiency',
      'prerequisiteIds',
      'associations',
      'evidence',
      'proficiencyHistory',
      'sortOrder',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]);
    history(row, end);
    level(row.proficiency);
    if (!categoryIds.has(row.categoryId)) invalid();
    const {
      id,
      proficiency,
      evidence,
      proficiencyHistory,
      archivedAt,
      createdAt,
      updatedAt,
      ...fields
    } = row;
    dto(SkillDto, fields);
    validateAssociations(row.associations);
    for (const association of row.associations)
      shape(association, ['sourceType', 'sourceId'], ['targetLevel', 'checkpointIdentity']);
    if (
      !Array.isArray(evidence) ||
      evidence.length > 200 ||
      !Array.isArray(proficiencyHistory) ||
      proficiencyHistory.length > 10000
    )
      invalid();
    for (const e of evidence) {
      shape(e, ['id', 'title', 'type', 'description', 'url', 'createdAt', 'updatedAt']);
      history(e, end);
      if (
        typeof e.id !== 'string' ||
        !RECORD_ID.test(e.id) ||
        nestedIds.has(e.id) ||
        e.createdAt < createdAt ||
        e.updatedAt > updatedAt
      )
        invalid();
      nestedIds.add(e.id);
      const { id, createdAt: _, updatedAt: __, ...fields } = e;
      dto(EvidenceDto, fields);
      safeEvidence(e);
    }
    let previous = 0,
      last = createdAt;
    for (const h of proficiencyHistory) {
      shape(h, ['id', 'fromLevel', 'toLevel', 'changedAt', 'justification']);
      if (typeof h.id !== 'string' || !RECORD_ID.test(h.id) || nestedIds.has(h.id)) invalid();
      nestedIds.add(h.id);
      level(h.fromLevel);
      level(h.toLevel);
      instant(h.changedAt, end);
      if (
        h.fromLevel !== previous ||
        h.fromLevel === h.toLevel ||
        h.changedAt < last ||
        h.changedAt > updatedAt ||
        typeof h.justification !== 'string' ||
        h.justification.length > 2000
      )
        invalid();
      previous = h.toLevel;
      last = h.changedAt;
    }
    if (previous !== proficiency) invalid();
  }
  validateGraph(skills.map((r) => ({ id: r.id, prerequisiteIds: r.prerequisiteIds })));
  // Missing historical activity/prerequisite references are retained, never treated as completed.
}
