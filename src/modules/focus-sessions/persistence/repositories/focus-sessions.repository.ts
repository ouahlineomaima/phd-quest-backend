import { WeeklyPlanRecord } from '../../../weekly-plans/persistence/interfaces/weekly-plan.interface';
import { FocusMode, FocusCompletion } from '../enums/focus.enums';
import { localDateAt } from '../../../../common/application-clock';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { FOCUS_MODEL } from '../models/focus-session.model';
import { FocusSession } from '../interfaces/focus-session.interface';
import { editFilter, editUpdate } from '../../../../database/edit-version';
import { FocusState } from '../enums/focus.enums';
@Injectable()
export class FocusSessionsRepository implements OnModuleInit {
  constructor(
    @InjectModel(FOCUS_MODEL) private readonly model: Model<FocusSession>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async onModuleInit() {
    await this.model.createCollection();
    await this.model.collection.createIndex(
      { sessionId: 1 },
      { unique: true, name: 'focus_session_identity' },
    );
    await this.model.collection.createIndex(
      { endedAt: -1, sessionId: 1 },
      { name: 'focus_history' },
    );
    await this.model.collection.createIndex(
      { activeSlot: 1 },
      {
        unique: true,
        name: 'one_workspace_timer',
        partialFilterExpression: { activeSlot: 'workspace' },
      },
    );
  }
  editable(sessionId: string, session: ClientSession) {
    return this.model.findOne({ sessionId }).session(session).lean().exec();
  }
  current(session: ClientSession) {
    return this.model.findOne({ activeSlot: 'workspace' }).session(session).lean().exec();
  }
  updateLifecycle(
    row: FocusSession & { _id: { toString(): string } },
    fields: object,
    session: ClientSession,
    stopped = false,
  ) {
    return this.model
      .findOneAndUpdate(
        editFilter(row),
        editUpdate({ $set: fields, ...(stopped ? { $unset: { activeSlot: 1 } } : {}) }),
        { new: true, session },
      )
      .lean()
      .exec();
  }
  heartbeat(sessionId: string, fields: object, session: ClientSession) {
    return this.model
      .findOneAndUpdate(
        { sessionId, state: FocusState.Running },
        { $set: fields },
        { new: true, session },
      )
      .lean()
      .exec();
  }
  addTaskMinutes(taskRef: string, minutes: number, at: Date, session: ClientSession) {
    const [weekId, id] = taskRef.split(':');
    return this.connection
      .collection('weekly_plans')
      .updateOne(
        { weekId, 'tasks.id': id },
        { $inc: { 'tasks.$.actualMinutes': minutes }, $set: { updatedAt: at } },
        { session },
      );
  }
  find(sessionId: string, session: ClientSession) {
    return this.model.findOne({ sessionId }, { _id: 0, __v: 0 }).session(session).lean().exec();
  }
  async insert(fields: object, session: ClientSession) {
    const [record] = await this.model.create([fields], { session });
    const { _id, __v, ...saved } = record.toObject();
    return saved;
  }
  async history(page: number, limit: number, session: ClientSession) {
    return {
      items: await this.model
        .find({ endedAt: { $ne: null }, kind: { $ne: 'break' } }, { _id: 0, __v: 0 })
        .sort({ endedAt: -1, sessionId: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .session(session)
        .lean(),
      total: await this.model
        .countDocuments({ endedAt: { $ne: null }, kind: { $ne: 'break' } })
        .session(session),
      page,
      limit,
    };
  }
  apply(sessionId: string, minutes: number, at: Date, session: ClientSession) {
    return this.model
      .findOneAndUpdate(
        { sessionId, appliedAt: null },
        { $set: { appliedAt: at, appliedMinutes: minutes } },
        { new: true, session, projection: { _id: 0, __v: 0 } },
      )
      .lean()
      .exec();
  }
  async task(taskRef: string, session: ClientSession) {
    const [weekId, id] = taskRef.split(':');
    const plan = await this.connection
      .collection<WeeklyPlanRecord>('weekly_plans')
      .findOne({ weekId, 'tasks.id': id }, { session });
    return plan?.tasks.find((task) => task.id === id);
  }
  applied(weekId: string, session: ClientSession) {
    return this.model
      .aggregate<{ _id: string; minutes: number }>([
        { $match: { taskRef: { $regex: '^' + weekId + ':' }, appliedAt: { $ne: null } } },
        { $group: { _id: '$taskRef', minutes: { $sum: '$appliedMinutes' } } },
      ])
      .session(session)
      .exec();
  }
  async summary(
    timezone: string,
    today: string,
    startDate: string,
    endDate: string,
    session: ClientSession,
  ) {
    // Global totals are aggregated in MongoDB. Calendar classification stays in
    // Node: its IANA data can differ from the database server's timezone tables.
    const [totals] = await this.model
      .aggregate<{ seconds: number; count: number; countdowns: number }>([
        { $match: { endedAt: { $ne: null }, kind: { $ne: 'break' } } },
        {
          $group: {
            _id: null,
            seconds: { $sum: '$focusedSeconds' },
            count: { $sum: 1 },
            countdowns: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$mode', FocusMode.Countdown] },
                      { $eq: ['$completionType', FocusCompletion.TargetReached] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .session(session)
      .exec();
    // Two days of padding cover all IANA offsets and skipped/repeated local dates.
    // Exact local-date predicates below remove the padding; no Mongo timezone conversion.
    const rows = await this.model
      .find(
        {
          kind: { $ne: 'break' },
          endedAt: {
            $gte: new Date(Date.parse(startDate + 'T00:00:00Z') - 2 * 86400000),
            $lt: new Date(Date.parse(endDate + 'T00:00:00Z') + 3 * 86400000),
          },
        },
        { _id: 0, endedAt: 1, focusedSeconds: 1 },
      )
      .session(session)
      .lean()
      .exec();
    let todaySeconds = 0,
      weekSeconds = 0;
    for (const row of rows) {
      if (!row.endedAt) continue;
      const date = localDateAt(row.endedAt, timezone);
      if (date === today) todaySeconds += row.focusedSeconds;
      if (date >= startDate && date <= endDate) weekSeconds += row.focusedSeconds;
    }
    return {
      todayMinutes: Math.floor(todaySeconds / 60),
      weekMinutes: Math.floor(weekSeconds / 60),
      overallMinutes: Math.floor((totals?.seconds ?? 0) / 60),
      sessionCount: totals?.count ?? 0,
      completedCountdowns: totals?.countdowns ?? 0,
    };
  }
}
