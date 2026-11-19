import { SkillTreeResponse, SkillResponse } from '../../api/dtos/skill-response.dto';
import { assertEditVersion } from '../../../../database/edit-version';
import { definedFields, recordResponse } from '../../../../common/record-fields';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { applicationWrite } from '../../../../database/application-write';
import { ApplicationClock } from '../../../../common/application-clock';
import { ActivitySource, SkillsRepository } from '../../persistence/repositories/skills.repository';
import {
  Association,
  SkillRecord,
  CategoryRecord,
  Evidence,
  ProficiencyChange,
} from '../../persistence/interfaces/skill.interface';
import { CategoryDto, SkillDto, EvidenceDto, ProficiencyDto } from '../../api/dtos/skill.dto';
import {
  RECORD_ID,
  SOURCE_TYPES,
  SkillLevel,
  SkillSourceType,
  TARGET_LEVELS,
  SkillIcon,
  SkillColor,
} from '../../persistence/enums/skill.enums';
import {
  activityGroup,
  safeEvidence,
  sourceKey,
  validateAssociations,
  validateGraph,
} from './skill-rules';
import { SKILL_TEMPLATE } from './skill-template';
@Injectable()
export class ResearchSkillsService {
  constructor(
    private readonly repository: SkillsRepository,
    private readonly clock: ApplicationClock,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  private read<T>(work: (s: ClientSession) => Promise<T>) {
    return this.connection.transaction(work, { readConcern: { level: 'snapshot' } });
  }
  private id(id: string) {
    if (!RECORD_ID.test(id)) throw new BadRequestException('Invalid record ID.');
    return id;
  }
  private editable(row: { archivedAt: Date | null }) {
    if (row.archivedAt) throw new ConflictException('Archived records are read-only.');
  }
  private marker(s: ClientSession) {
    return this.repository.markInitialized(this.clock.now(), s);
  }
  private async category(id: string, s: ClientSession) {
    const row = await this.repository.category(this.id(id), s);
    if (!row) throw new NotFoundException('Skill category not found.');
    return row;
  }
  private async skill(id: string, s: ClientSession) {
    const row = await this.repository.skill(this.id(id), s);
    if (!row) throw new NotFoundException('Research skill not found.');
    this.editable(row);
    this.editable(await this.category(row.categoryId, s));
    return row;
  }
  private present(
    row: SkillRecord,
    categories: CategoryRecord[],
    bySkill: Map<string, Pick<SkillRecord, '_id' | 'name' | 'proficiency' | 'archivedAt'>>,
    sources: Map<string, ActivitySource>,
  ): SkillResponse {
    const associations = row.associations.map((a) => {
      const source = sources.get(sourceKey(a));
      const resolution = source
        ? ('resolved' as const)
        : a.sourceType === SkillSourceType.RoadmapCheckpoint && !a.checkpointIdentity
          ? ('unverified' as const)
          : ('missing' as const);
      return {
        ...a,
        title:
          source?.title ??
          (resolution === 'unverified'
            ? 'Unverified historical checkpoint'
            : 'Unavailable activity'),
        resolution,
        missing: !source,
        completed: source?.completed ?? false,
      };
    });
    const category = categories.find((c) => c._id.toString() === row.categoryId);
    return {
      ...recordResponse(row),
      effectiveArchived: !!row.archivedAt || !!category?.archivedAt || !category,
      categoryName: category?.name ?? 'Unavailable category',
      prerequisites: row.prerequisiteIds.map((id) => {
        const p = bySkill.get(id);
        return {
          id,
          name: p?.name ?? 'Unavailable prerequisite',
          proficiency: p?.proficiency ?? null,
          archivedAt: p?.archivedAt ?? null,
          missing: !p,
          developed: !!p && p.proficiency >= SkillLevel.Developing,
        };
      }),
      associations,
      targeted: TARGET_LEVELS.map((targetLevel) => {
        const progress = activityGroup(associations.filter((a) => a.targetLevel === targetLevel));
        return {
          ...progress,
          targetLevel,
          suggestReview: progress.ready && targetLevel > row.proficiency,
        };
      }),
      untargeted: SOURCE_TYPES.map((sourceType) => ({
        ...activityGroup(
          associations.filter((a) => a.targetLevel === null && a.sourceType === sourceType),
        ),
        sourceType,
      })),
    };
  }
  private async tree(s: ClientSession): Promise<SkillTreeResponse> {
    const state = await this.repository.initialization(s),
      categories = await this.repository.listCategories(s),
      skills = await this.repository.listSkills(s),
      sources = await this.repository.sources(
        s,
        skills.flatMap((row) => row.associations),
      );
    const bySkill = new Map(skills.map((row) => [row._id.toString(), row]));
    return {
      initialized: !!state,
      categories: categories.map((row) => recordResponse(row)),
      skills: skills.map((row) => this.present(row, categories, bySkill, sources)),
    };
  }
  list(): Promise<SkillTreeResponse> {
    return this.read((s) => this.tree(s));
  }
  detail(id: string): Promise<SkillResponse> {
    this.id(id);
    return this.read(async (s) => {
      const row = await this.repository.skill(id, s);
      if (!row) throw new NotFoundException('Research skill not found.');
      const categories = await this.repository.categoriesByIds([row.categoryId], s),
        prerequisites = await this.repository.prerequisites(row.prerequisiteIds, s),
        sources = await this.repository.sources(s, row.associations);
      return this.present(
        row,
        categories,
        new Map(prerequisites.map((item) => [item._id.toString(), item])),
        sources,
      );
    });
  }
  summary() {
    return this.read(async (s) => ({
      initialized: !!(await this.repository.initialization(s)),
      ...(await this.repository.summary(s)),
    }));
  }
  initialize() {
    return applicationWrite(this.connection, async (s) => {
      if (await this.repository.initialization(s)) return this.tree(s);
      if (await this.repository.hasRecords(s)) {
        await this.marker(s);
        return this.tree(s);
      }
      const icons: readonly SkillIcon[] = [
          'book',
          'target',
          'sparkles',
          'book',
          'trophy',
          'roadmap',
        ],
        colors: readonly SkillColor[] = ['purple', 'cyan', 'gold', 'green', 'purple', 'cyan'];
      for (const [index, [name, names]] of SKILL_TEMPLATE.entries()) {
        const category = await this.repository.createCategory(
          { name, sortOrder: index, icon: icons[index], color: colors[index] },
          s,
        );
        let previous: string | undefined;
        for (const [order, name] of names.entries()) {
          const skill = await this.repository.createSkill(
            {
              categoryId: category._id.toString(),
              name,
              sortOrder: order,
              prerequisiteIds: order === 3 && previous ? [previous] : [],
            },
            s,
          );
          previous = skill._id.toString();
        }
      }
      await this.marker(s);
      return this.tree(s);
    });
  }
  createCategory(input: CategoryDto) {
    if (!input.name) throw new BadRequestException('Category name is required.');
    return applicationWrite(this.connection, async (s) => {
      await this.marker(s);
      return recordResponse(await this.repository.createCategory(definedFields(input), s));
    });
  }
  editCategory(id: string, input: CategoryDto, version?: string) {
    return applicationWrite(this.connection, async (s) => {
      const old = await this.category(id, s);
      assertEditVersion(old, version);
      this.editable(old);
      return recordResponse(await this.repository.updateCategory(old, definedFields(input), s));
    });
  }
  archiveCategory(id: string, version?: string) {
    return applicationWrite(this.connection, async (s) => {
      const old = await this.category(id, s);
      assertEditVersion(old, version);
      if (old.archivedAt) return recordResponse(old);
      return recordResponse(
        await this.repository.updateCategory(old, { archivedAt: this.clock.now() }, s),
      );
    });
  }
  private async references(
    input: SkillDto,
    id: string,
    s: ClientSession,
    old?: SkillRecord,
  ): Promise<Association[] | undefined> {
    if (input.categoryId) this.editable(await this.category(input.categoryId, s));
    if (input.prerequisiteIds !== undefined) {
      const rows = await this.repository.listSkills(s),
        existing = new Set(rows.map((r) => r._id.toString()));
      for (const ref of input.prerequisiteIds)
        if (!existing.has(ref) && !old?.prerequisiteIds.includes(ref))
          throw new BadRequestException('New prerequisites must exist.');
      validateGraph([
        ...rows
          .filter((r) => r._id.toString() !== id)
          .map((r) => ({ id: r._id.toString(), prerequisiteIds: r.prerequisiteIds })),
        { id, prerequisiteIds: input.prerequisiteIds },
      ]);
    }
    if (input.associations === undefined) return undefined;
    const links: Association[] = input.associations.map((a) => ({
      ...a,
      targetLevel: a.targetLevel ?? null,
    }));
    validateAssociations(links);
    for (const link of links) {
      if (link.sourceType !== SkillSourceType.RoadmapCheckpoint) {
        if (link.checkpointIdentity)
          throw new BadRequestException('Only checkpoint links may carry a checkpoint identity.');
        continue;
      }
      const prior = old?.associations.find(
        (a) => a.sourceType === link.sourceType && a.sourceId === link.sourceId,
      );
      // Editing a historical link never guesses or upgrades its missing generation.
      if (!link.checkpointIdentity && prior) {
        if (prior.checkpointIdentity) link.checkpointIdentity = prior.checkpointIdentity;
        continue;
      }
      if (prior?.checkpointIdentity === link.checkpointIdentity && link.checkpointIdentity)
        continue;
      const identity = await this.repository.checkpointIdentity(link.sourceId, s);
      if (link.checkpointIdentity && link.checkpointIdentity !== identity)
        throw new BadRequestException('The checkpoint was replaced. Reload before linking.');
      link.checkpointIdentity = identity;
    }
    const sources = await this.repository.sources(s, links);
    for (const link of links)
      if (
        !sources.has(sourceKey(link)) &&
        !old?.associations.some((a) => sourceKey(a) === sourceKey(link))
      )
        throw new BadRequestException('New linked activities must exist.');
    return links;
  }
  create(input: SkillDto) {
    if (!input.name || !input.categoryId)
      throw new BadRequestException('Skill name and category are required.');
    return applicationWrite(this.connection, async (s) => {
      const id = new Types.ObjectId(),
        associations = await this.references(input, id.toString(), s);
      await this.marker(s);
      return recordResponse(
        await this.repository.createSkill(
          { ...definedFields(input), _id: id, associations: associations ?? [] },
          s,
        ),
      );
    });
  }
  edit(id: string, input: SkillDto, version?: string) {
    return applicationWrite(this.connection, async (s) => {
      const old = await this.skill(id, s);
      assertEditVersion(old, version);
      const associations = await this.references(input, id, s, old);
      const { associations: _, ...fields } = definedFields(input);
      return recordResponse(
        await this.repository.updateSkill(
          old,
          { ...fields, ...(associations ? { associations } : {}) },
          s,
        ),
      );
    });
  }
  archive(id: string, version?: string) {
    return applicationWrite(this.connection, async (s) => {
      const old = await this.repository.skill(this.id(id), s);
      if (!old) throw new NotFoundException('Research skill not found.');
      assertEditVersion(old, version);
      if (old.archivedAt) return recordResponse(old);
      return recordResponse(
        await this.repository.updateSkill(old, { archivedAt: this.clock.now() }, s),
      );
    });
  }
  proficiency(id: string, input: ProficiencyDto, version?: string) {
    if (
      input.confirm !== true ||
      !Number.isInteger(input.level) ||
      input.level < SkillLevel.NotStarted ||
      input.level > SkillLevel.Advanced
    )
      throw new BadRequestException(
        'Explicit confirmation and proficiency level 0-4 are required.',
      );
    return applicationWrite(this.connection, async (s) => {
      const old = await this.skill(id, s);
      assertEditVersion(old, version);
      if (old.proficiency === input.level) return recordResponse(old);
      if (old.proficiencyHistory.length >= 10000)
        throw new BadRequestException('Proficiency history limit reached.');
      const change: ProficiencyChange = {
        id: new Types.ObjectId().toString(),
        fromLevel: old.proficiency,
        toLevel: input.level,
        changedAt: this.clock.now(),
        justification: input.justification ?? '',
      };
      return recordResponse(
        await this.repository.updateSkill(old, { proficiency: input.level }, s, change),
      );
    });
  }
  evidence(
    id: string,
    evidenceId: string | null,
    input: EvidenceDto,
    remove = false,
    version?: string,
  ) {
    if (evidenceId) this.id(evidenceId);
    return applicationWrite(this.connection, async (s) => {
      const skill = await this.skill(id, s);
      assertEditVersion(skill, version);
      const old = evidenceId ? skill.evidence.find((e) => e.id === evidenceId) : undefined;
      if (evidenceId && !old) throw new NotFoundException('Evidence not found.');
      let evidence = skill.evidence.filter((e) => !remove || e.id !== evidenceId);
      if (!remove) {
        const now = this.clock.now(),
          title = input.title ?? old?.title,
          type = input.type ?? old?.type;
        if (!title || !type) throw new BadRequestException('Evidence title and type are required.');
        const record: Evidence = {
          id: old?.id ?? new Types.ObjectId().toString(),
          title,
          type,
          description: input.description ?? old?.description ?? '',
          url: input.url === undefined ? (old?.url ?? null) : input.url,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
        safeEvidence(record);
        if (skill.evidence.length >= 200 && !old)
          throw new BadRequestException('Evidence limit reached.');
        evidence = old
          ? skill.evidence.map((e) => (e.id === evidenceId ? record : e))
          : [...skill.evidence, record];
      }
      return recordResponse(await this.repository.updateSkill(skill, { evidence }, s));
    });
  }
}
