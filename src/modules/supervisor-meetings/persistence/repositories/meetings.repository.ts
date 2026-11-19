import { MeetingStatus, MeetingActionStatus, MeetingActionPhase } from '../enums/meeting.enums';
import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, mongo, FilterQuery, Types } from 'mongoose';
import { MEETING_MODEL, SUPERVISOR_MODEL } from '../models/meeting.model';
import { MeetingRecord, SupervisorRecord } from '../interfaces/meeting.interface';
import { GoalRecord } from '../../../goals/persistence/interfaces/goal.interface';
import { LinkedTaskState } from '../../../goals/persistence/interfaces/goal.interface';
import { RoadmapLevel } from '../../../roadmap/persistence/interfaces/roadmap.interface';
import { captureCheckpointIdentity } from '../../../roadmap/persistence/repositories/checkpoint-references';
import { editFilter, editUpdate } from '../../../../database/edit-version';
export type SupervisorChanges = Partial<
  Omit<SupervisorRecord, '_id' | 'editVersion' | 'createdAt' | 'updatedAt'>
>;
export type MeetingChanges = Partial<
  Omit<MeetingRecord, '_id' | 'editVersion' | 'createdAt' | 'updatedAt'>
>;
export type MeetingActionsRecord = Pick<
  MeetingRecord,
  '_id' | 'title' | 'archivedAt' | 'editVersion' | 'actions'
>;
export interface MeetingSelection {
  archived?: string;
  status?: string;
  supervisorId?: string;
  meetingId?: string;
}
const archiveFilter = (value = 'active') =>
  value === 'all' ? {} : { archivedAt: value === 'archived' ? { $ne: null } : null };
function updated<T>(row: T | null): T {
  if (!row)
    throw new ConflictException({
      code: 'STALE_RECORD',
      message: 'The record changed. Reload before saving.',
    });
  return row;
}
@Injectable()
export class MeetingsRepository implements OnModuleInit {
  constructor(
    @InjectModel(SUPERVISOR_MODEL) private readonly supervisors: Model<SupervisorRecord>,
    @InjectModel(MEETING_MODEL) private readonly meetings: Model<MeetingRecord>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async onModuleInit() {
    await this.supervisors.createCollection();
    await this.meetings.createCollection();
    await this.supervisors.collection.createIndex({ archivedAt: 1, name: 1 });
    const indexes: mongo.IndexSpecification[] = [
      { archivedAt: 1, scheduledAt: 1 },
      { status: 1, scheduledAt: 1 },
      { supervisorIds: 1, scheduledAt: 1 },
      { 'actions.status': 1, 'actions.dueDate': 1 },
      { 'actions.phase': 1 },
    ];
    for (const index of indexes) await this.meetings.collection.createIndex(index);
  }
  listSupervisors(archived = 'active'): Promise<SupervisorRecord[]> {
    return this.supervisors.find(archiveFilter(archived)).sort({ name: 1, _id: 1 }).lean().exec();
  }
  supervisorsByIds(ids: string[], session: ClientSession): Promise<SupervisorRecord[]> {
    return this.supervisors
      .find({ _id: { $in: ids } })
      .session(session)
      .lean()
      .exec();
  }
  supervisor(id: string, session: ClientSession): Promise<SupervisorRecord | null> {
    return this.supervisors.findById(id).session(session).lean().exec();
  }
  meeting(id: string, session: ClientSession): Promise<MeetingRecord | null> {
    return this.meetings.findById(id).session(session).lean().exec();
  }
  selectMeetings(selection: MeetingSelection, session: ClientSession): Promise<MeetingRecord[]> {
    const filter: FilterQuery<MeetingRecord> = {
      ...archiveFilter(selection.archived),
      ...(selection.status ? { status: selection.status } : {}),
      ...(selection.supervisorId ? { supervisorIds: selection.supervisorId } : {}),
      ...(selection.meetingId ? { _id: selection.meetingId } : {}),
    };
    return this.meetings
      .find(filter)
      .sort({ scheduledAt: 1, _id: 1 })
      .session(session)
      .lean()
      .exec();
  }
  selectActionMeetings(
    filter: {
      archived?: string;
      meetingId?: string;
      status?: string;
      phase?: string;
      dueDate?: string;
      due?: string;
    },
    today: string,
    session: ClientSession,
  ): Promise<MeetingActionsRecord[]> {
    const conditions: Record<string, unknown>[] = [],
      expressions: unknown[] = [];
    if (filter.phase) {
      conditions.push({ phase: filter.phase });
      expressions.push({ $eq: ['$$action.phase', filter.phase] });
    }
    if (filter.status) {
      const open = filter.status === 'open';
      conditions.push({ status: open ? { $ne: MeetingActionStatus.Completed } : filter.status });
      expressions.push({
        [open ? '$ne' : '$eq']: [
          '$$action.status',
          open ? MeetingActionStatus.Completed : filter.status,
        ],
      });
    }
    if (filter.dueDate) {
      conditions.push({ dueDate: filter.dueDate });
      expressions.push({ $eq: ['$$action.dueDate', filter.dueDate] });
    }
    if (filter.due === 'overdue') {
      conditions.push({
        dueDate: { $ne: null, $lt: today },
        status: { $ne: MeetingActionStatus.Completed },
      });
      expressions.push({
        $and: [
          { $ne: ['$$action.dueDate', null] },
          { $lt: ['$$action.dueDate', today] },
          { $ne: ['$$action.status', MeetingActionStatus.Completed] },
        ],
      });
    }
    if (filter.due === 'today' || filter.due === 'undated') {
      const date = filter.due === 'today' ? today : null;
      conditions.push({ dueDate: date });
      expressions.push({ $eq: ['$$action.dueDate', date] });
    }
    return this.meetings
      .aggregate<MeetingActionsRecord>([
        {
          $match: {
            ...archiveFilter(filter.archived),
            ...(filter.meetingId ? { _id: new Types.ObjectId(filter.meetingId) } : {}),
            actions: { $elemMatch: conditions.length ? { $and: conditions } : {} },
          },
        },
        { $sort: { scheduledAt: 1, _id: 1 } },
        {
          $project: {
            title: 1,
            archivedAt: 1,
            editVersion: 1,
            actions: {
              $filter: {
                input: '$actions',
                as: 'action',
                cond: expressions.length ? { $and: expressions } : true,
              },
            },
          },
        },
      ])
      .session(session)
      .exec();
  }
  async summary(now: Date, today: string, session: ClientSession) {
    const countActions = (conditions: unknown[]) => ({
      $size: { $filter: { input: '$actions', as: 'action', cond: { $and: conditions } } },
    });
    const open = { $ne: ['$$action.status', MeetingActionStatus.Completed] };
    const [row] = await this.meetings
      .aggregate<{
        counts: {
          upcoming: number;
          completed: number;
          pending: number;
          preparation: number;
          followUp: number;
          overdue: number;
        }[];
        next: Pick<MeetingRecord, '_id' | 'title' | 'scheduledAt'>[];
      }>([
        { $match: { archivedAt: null } },
        {
          $facet: {
            counts: [
              {
                $group: {
                  _id: null,
                  upcoming: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$status', MeetingStatus.Scheduled] },
                            { $gte: ['$scheduledAt', now] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  completed: {
                    $sum: { $cond: [{ $eq: ['$status', MeetingStatus.Completed] }, 1, 0] },
                  },
                  pending: { $sum: countActions([open]) },
                  preparation: {
                    $sum: countActions([
                      open,
                      { $eq: ['$$action.phase', MeetingActionPhase.PreMeeting] },
                    ]),
                  },
                  followUp: {
                    $sum: countActions([
                      open,
                      { $eq: ['$$action.phase', MeetingActionPhase.PostMeeting] },
                    ]),
                  },
                  overdue: {
                    $sum: countActions([
                      open,
                      { $ne: ['$$action.dueDate', null] },
                      { $lt: ['$$action.dueDate', today] },
                    ]),
                  },
                },
              },
            ],
            next: [
              { $match: { status: MeetingStatus.Scheduled, scheduledAt: { $gte: now } } },
              { $sort: { scheduledAt: 1, _id: 1 } },
              { $limit: 1 },
              { $project: { title: 1, scheduledAt: 1 } },
            ],
          },
        },
      ])
      .session(session)
      .exec();
    return {
      counts: {
        upcoming: row?.counts[0]?.upcoming ?? 0,
        completed: row?.counts[0]?.completed ?? 0,
        pending: row?.counts[0]?.pending ?? 0,
        preparation: row?.counts[0]?.preparation ?? 0,
        followUp: row?.counts[0]?.followUp ?? 0,
        overdue: row?.counts[0]?.overdue ?? 0,
      },
      next: row?.next[0] ?? null,
    };
  }
  async createSupervisor(
    fields: SupervisorChanges,
    session: ClientSession,
  ): Promise<SupervisorRecord> {
    const [row] = await this.supervisors.create([fields], { session });
    return row.toObject();
  }
  async createMeeting(fields: MeetingChanges, session: ClientSession): Promise<MeetingRecord> {
    const [row] = await this.meetings.create([fields], { session });
    return row.toObject();
  }
  async updateSupervisor(
    old: SupervisorRecord,
    fields: SupervisorChanges,
    session: ClientSession,
  ): Promise<SupervisorRecord> {
    return updated(
      await this.supervisors
        .findOneAndUpdate(editFilter(old), editUpdate({ $set: fields }), {
          session,
          new: true,
          runValidators: true,
        })
        .lean(),
    );
  }
  async updateMeeting(
    old: MeetingRecord,
    fields: MeetingChanges,
    session: ClientSession,
  ): Promise<MeetingRecord> {
    return updated(
      await this.meetings
        .findOneAndUpdate(editFilter(old), editUpdate({ $set: fields }), {
          session,
          new: true,
          runValidators: true,
        })
        .lean(),
    );
  }
  checkpointIdentity(level: number, id: string, session: ClientSession): Promise<string> {
    return captureCheckpointIdentity(this.connection, level, id, session);
  }
  async taskStates(sources: string[], session: ClientSession): Promise<LinkedTaskState[]> {
    if (!sources.length) return [];
    return this.connection
      .collection('weekly_plans')
      .aggregate<LinkedTaskState>(
        [
          { $match: { weekId: { $in: [...new Set(sources.map((s) => s.split(':')[0]))] } } },
          { $unwind: '$tasks' },
          {
            $project: {
              _id: 0,
              sourceId: { $concat: ['$weekId', ':', '$tasks.id'] },
              weekId: 1,
              taskId: '$tasks.id',
              title: '$tasks.title',
              status: '$tasks.status',
              date: '$tasks.date',
            },
          },
          { $match: { sourceId: { $in: sources } } },
        ],
        { session },
      )
      .toArray();
  }
  goals(
    ids: string[],
    session: ClientSession,
  ): Promise<Pick<GoalRecord, '_id' | 'title' | 'status'>[]> {
    return this.connection
      .collection<GoalRecord>('goals')
      .find(
        { _id: { $in: ids.map((id) => new this.connection.base.Types.ObjectId(id)) } },
        { session, projection: { title: 1, status: 1 } },
      )
      .toArray();
  }
  levels(
    numbers: number[],
    session: ClientSession,
  ): Promise<Pick<RoadmapLevel, 'levelNumber' | 'title' | 'checkpoints'>[]> {
    return this.connection
      .collection<RoadmapLevel>('roadmap_levels')
      .find(
        { levelNumber: { $in: numbers } },
        { session, projection: { levelNumber: 1, title: 1, checkpoints: 1 } },
      )
      .toArray();
  }
}
