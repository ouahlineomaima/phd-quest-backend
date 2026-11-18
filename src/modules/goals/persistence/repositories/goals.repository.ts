import { GoalStatus } from '../enums/goal.enums';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { GOAL_MODEL } from '../models/goal.model';
import { GoalRecord, LinkedTaskState } from '../interfaces/goal.interface';
@Injectable()
export class GoalsRepository implements OnModuleInit {
  constructor(
    @InjectModel(GOAL_MODEL) private readonly model: Model<GoalRecord>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async onModuleInit() {
    await this.model.createCollection();
    await this.model.collection.createIndex({ status: 1, type: 1, targetDate: 1 });
  }
  async list(filter: { type?: string; status?: string }, session?: ClientSession, limit = 0) {
    const records = await this.model
      .find(Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined)))
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .session(session ?? null)
      .lean();
    return records.map((record) => this.response(record));
  }
  async byIds(ids: string[], session: ClientSession) {
    const rows = await this.model
      .find({ _id: { $in: ids } })
      .session(session)
      .lean();
    return rows.map((row) => this.response(row));
  }
  async taskStates(sources: string[], session: ClientSession): Promise<LinkedTaskState[]> {
    if (!sources.length) return [];
    const weeks = [...new Set(sources.map((source) => source.split(':')[0]))];
    return this.connection
      .collection('weekly_plans')
      .aggregate<LinkedTaskState>(
        [
          { $match: { weekId: { $in: weeks } } },
          { $unwind: '$tasks' },
          {
            $project: {
              _id: 0,
              sourceId: { $concat: ['$weekId', ':', '$tasks.id'] },
              weekId: 1,
              taskId: '$tasks.id',
              title: '$tasks.title',
              date: '$tasks.date',
              status: '$tasks.status',
            },
          },
          { $match: { sourceId: { $in: sources } } },
        ],
        { session },
      )
      .toArray();
  }
  activeCount(session: ClientSession) {
    return this.model.countDocuments({ status: GoalStatus.Active }).session(session);
  }
  find(id: string, session: ClientSession) {
    return this.model.findById(id).session(session).lean().exec();
  }
  async insert(input: Record<string, unknown>, session: ClientSession) {
    const [record] = await this.model.create([input], { session });
    return this.response(record.toObject());
  }
  async update(id: string, fields: Record<string, unknown>, session: ClientSession) {
    const record = await this.model
      .findByIdAndUpdate(id, { $set: fields }, { session, new: true, runValidators: true })
      .lean();
    return this.response(record!);
  }
  weekExists(weekId: string, session: ClientSession) {
    return this.connection
      .collection('weekly_plans')
      .findOne({ weekId }, { session, projection: { _id: 1 } });
  }
  levelExists(levelNumber: number, session: ClientSession) {
    return this.connection
      .collection('roadmap_levels')
      .findOne({ levelNumber }, { session, projection: { _id: 1 } });
  }
  response(record: GoalRecord) {
    const { _id, __v, ...fields } = record as GoalRecord & { __v?: number };
    return { id: _id.toString(), ...fields };
  }
}
