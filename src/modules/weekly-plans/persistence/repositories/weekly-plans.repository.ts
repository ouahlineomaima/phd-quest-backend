import { applicationWrite } from '../../../../database/application-write';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { WEEKLY_PLAN_MODEL } from '../models/weekly-plan.model';
import { StoredTask, WeeklyPlanInput, WeeklyPlanRecord } from '../interfaces/weekly-plan.interface';
import { TaskStatus } from '../enums/task.enums';
import { WeeklyPlanResponseDto, WeekSummaryDto } from '../../api/dtos/weekly-plan-response.dto';

@Injectable()
export class WeeklyPlansRepository implements OnModuleInit {
  constructor(@InjectModel(WEEKLY_PLAN_MODEL) private readonly model: Model<WeeklyPlanRecord>) {}

  async onModuleInit() {
    // Enforce uniqueness before HTTP startup, including when global autoIndex is disabled.
    await this.model.createCollection();
    await this.model.collection.createIndex(
      { weekId: 1 },
      { unique: true, name: 'weekly_plan_week_unique' },
    );
  }
  async exists(weekId: string) {
    return !!(await this.model.exists({ weekId }));
  }
  async insert(input: WeeklyPlanInput, session?: ClientSession): Promise<WeeklyPlanResponseDto> {
    const work = async (session: ClientSession) => {
      const [record] = await this.model.create([input], { session });
      return this.toResponse(record.toObject());
    };
    return session ? work(session) : applicationWrite(this.model.db, work);
  }
  async findById(id: string) {
    const record = await this.model.findById(id).lean().exec();
    return record ? this.toResponse(record) : null;
  }
  async list(): Promise<WeekSummaryDto[]> {
    const records = await this.model
      .aggregate<{
        _id: WeeklyPlanRecord['_id'];
        weekId: string;
        startDate: string;
        endDate: string;
        title: string;
        taskCount: number;
        estimatedMinutes: number;
        potentialXp: number;
        createdAt: Date;
        updatedAt: Date;
      }>([
        { $sort: { startDate: -1 } },
        {
          $project: {
            weekId: 1,
            startDate: 1,
            endDate: 1,
            title: 1,
            createdAt: 1,
            updatedAt: 1,
            taskCount: { $size: '$tasks' },
            estimatedMinutes: { $sum: '$tasks.estimatedMinutes' },
            potentialXp: { $sum: '$tasks.xpReward' },
          },
        },
      ])
      .exec();
    return records.map(({ _id, createdAt, updatedAt, ...summary }) => ({
      ...summary,
      id: _id.toString(),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }));
  }
  recordById(id: string, session: ClientSession) {
    return this.model.findById(id).session(session).lean().exec();
  }
  updateDescription(id: string, taskId: string, description: string, session: ClientSession) {
    return this.model
      .findOneAndUpdate(
        { _id: id, 'tasks.id': taskId },
        description
          ? { $set: { 'tasks.$.description': description } }
          : { $unset: { 'tasks.$.description': '' } },
        { session, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
  transition(
    id: string,
    taskId: string,
    from: TaskStatus,
    fields: Partial<
      Pick<StoredTask, 'status' | 'actualMinutes' | 'completedAt' | 'firstCompletedAt'>
    >,
    session: ClientSession,
  ) {
    const update = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [`tasks.$.${key}`, value]),
    );
    return this.model
      .findOneAndUpdate(
        { _id: id, tasks: { $elemMatch: { id: taskId, status: from } } },
        { $set: update },
        { session, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
  toResponse(record: WeeklyPlanRecord): WeeklyPlanResponseDto {
    return {
      id: record._id.toString(),
      schemaVersion: record.schemaVersion,
      weekId: record.weekId,
      startDate: record.startDate,
      endDate: record.endDate,
      title: record.title,
      objectives: record.objectives,
      notes: record.notes,
      tasks: record.tasks.map((task) => ({
        id: task.id,
        date: task.date,
        title: task.title,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
        xpReward: task.xpReward,
        priority: task.priority,
        isOptional: task.isOptional,
        deliverable: task.deliverable,
        actualMinutes: task.actualMinutes,
        status: task.status,
        completedAt: task.completedAt?.toISOString() ?? null,
        firstCompletedAt: task.firstCompletedAt?.toISOString() ?? null,
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
