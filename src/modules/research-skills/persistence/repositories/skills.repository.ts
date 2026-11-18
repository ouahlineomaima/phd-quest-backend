import { TaskStatus } from '../../../weekly-plans/persistence/enums/task.enums';
import { GoalStatus } from '../../../goals/persistence/enums/goal.enums';
import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  SKILL_CATEGORY_MODEL,
  RESEARCH_SKILL_MODEL,
  SKILL_TREE_STATE_MODEL,
} from '../models/research-skill.model';
import {
  CategoryRecord,
  SkillRecord,
  StateRecord,
  ProficiencyChange,
} from '../interfaces/skill.interface';
import { SkillSourceType, SKILL_STATE_ID } from '../enums/skill.enums';
import { GoalRecord } from '../../../goals/persistence/interfaces/goal.interface';
import { RoadmapLevel } from '../../../roadmap/persistence/interfaces/roadmap.interface';
import { captureCheckpointIdentity } from '../../../roadmap/persistence/repositories/checkpoint-references';
import { editFilter, editUpdate } from '../../../../database/edit-version';
export type CategoryChanges = Partial<
  Omit<CategoryRecord, '_id' | 'editVersion' | 'createdAt' | 'updatedAt'>
>;
export type SkillChanges = Partial<
  Omit<SkillRecord, '_id' | 'editVersion' | 'createdAt' | 'updatedAt' | 'proficiencyHistory'>
>;
export interface ActivitySource {
  title: string;
  completed: boolean;
}
function updated<T>(row: T | null): T {
  if (!row)
    throw new ConflictException({
      code: 'STALE_RECORD',
      message: 'The record changed. Reload before saving.',
    });
  return row;
}
@Injectable()
export class SkillsRepository implements OnModuleInit {
  constructor(
    @InjectModel(SKILL_CATEGORY_MODEL) private readonly categories: Model<CategoryRecord>,
    @InjectModel(RESEARCH_SKILL_MODEL) private readonly skills: Model<SkillRecord>,
    @InjectModel(SKILL_TREE_STATE_MODEL) private readonly state: Model<StateRecord>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async onModuleInit() {
    await this.categories.createCollection();
    await this.skills.createCollection();
    await this.state.createCollection();
    await this.categories.collection.createIndex({ archivedAt: 1, sortOrder: 1 });
    await this.skills.collection.createIndex({ categoryId: 1, archivedAt: 1, sortOrder: 1 });
  }
  initialization(session: ClientSession): Promise<StateRecord | null> {
    return this.state.findById(SKILL_STATE_ID).session(session).lean().exec();
  }
  async markInitialized(at: Date, session: ClientSession): Promise<void> {
    if (!(await this.initialization(session)))
      await this.state.create(
        [
          {
            _id: new Types.ObjectId(SKILL_STATE_ID),
            initializedAt: at,
            createdAt: at,
            updatedAt: at,
          },
        ],
        { session },
      );
  }
  async hasRecords(session: ClientSession): Promise<boolean> {
    return (
      !!(await this.categories.exists({}).session(session)) ||
      !!(await this.skills.exists({}).session(session))
    );
  }
  listCategories(session: ClientSession): Promise<CategoryRecord[]> {
    return this.categories.find().sort({ sortOrder: 1, _id: 1 }).session(session).lean().exec();
  }
  listSkills(session: ClientSession): Promise<SkillRecord[]> {
    return this.skills.find().sort({ sortOrder: 1, _id: 1 }).session(session).lean().exec();
  }
  category(id: string, session: ClientSession): Promise<CategoryRecord | null> {
    return this.categories.findById(id).session(session).lean().exec();
  }
  skill(id: string, session: ClientSession): Promise<SkillRecord | null> {
    return this.skills.findById(id).session(session).lean().exec();
  }
  async createCategory(input: CategoryChanges, session: ClientSession): Promise<CategoryRecord> {
    const [row] = await this.categories.create([input], { session });
    return row.toObject();
  }
  async createSkill(
    input: SkillChanges & { _id?: Types.ObjectId },
    session: ClientSession,
  ): Promise<SkillRecord> {
    const [row] = await this.skills.create([input], { session });
    return row.toObject();
  }
  async updateCategory(
    old: CategoryRecord,
    fields: CategoryChanges,
    session: ClientSession,
  ): Promise<CategoryRecord> {
    return updated(
      await this.categories
        .findOneAndUpdate(editFilter(old), editUpdate({ $set: fields }), {
          session,
          new: true,
          runValidators: true,
        })
        .lean(),
    );
  }
  async updateSkill(
    old: SkillRecord,
    fields: SkillChanges,
    session: ClientSession,
    history?: ProficiencyChange,
  ): Promise<SkillRecord> {
    return updated(
      await this.skills
        .findOneAndUpdate(
          editFilter(old),
          editUpdate({
            $set: fields,
            ...(history ? { $push: { proficiencyHistory: history } } : {}),
          }),
          { session, new: true, runValidators: true },
        )
        .lean(),
    );
  }
  checkpointIdentity(sourceId: string, session: ClientSession): Promise<string> {
    const [number, id] = sourceId.split(':');
    return captureCheckpointIdentity(this.connection, Number(number), id, session);
  }
  async sources(session: ClientSession): Promise<Map<string, ActivitySource>> {
    const tasks = await this.connection
      .collection('weekly_plans')
      .aggregate<{ sourceId: string; title: string; completed: boolean }>(
        [
          { $unwind: '$tasks' },
          {
            $project: {
              _id: 0,
              sourceId: { $concat: ['$weekId', ':', '$tasks.id'] },
              title: '$tasks.title',
              completed: { $eq: ['$tasks.status', TaskStatus.Completed] },
            },
          },
        ],
        { session },
      )
      .toArray();
    const goals = await this.connection
      .collection<GoalRecord>('goals')
      .find({}, { session, projection: { title: 1, status: 1, completedAt: 1 } })
      .toArray();
    const levels = await this.connection
      .collection<RoadmapLevel>('roadmap_levels')
      .find({}, { session, projection: { levelNumber: 1, checkpoints: 1 } })
      .toArray();
    return new Map<string, ActivitySource>([
      ...tasks.map(
        (t) =>
          [
            SkillSourceType.WeeklyTask + ':' + t.sourceId,
            { title: t.title, completed: t.completed },
          ] as const,
      ),
      ...goals.map(
        (g) =>
          [
            SkillSourceType.ResearchGoal + ':' + g._id.toString(),
            {
              title: g.title,
              completed:
                g.status === GoalStatus.Completed ||
                (g.status === GoalStatus.Archived && !!g.completedAt),
            },
          ] as const,
      ),
      ...levels.flatMap((l) =>
        l.checkpoints
          .filter((c) => !!c.checkpointIdentity)
          .map(
            (c) =>
              [
                SkillSourceType.RoadmapCheckpoint +
                  ':' +
                  l.levelNumber +
                  ':' +
                  c.id +
                  ':' +
                  c.checkpointIdentity,
                { title: c.title, completed: c.completed === true },
              ] as const,
          ),
      ),
    ]);
  }
}
