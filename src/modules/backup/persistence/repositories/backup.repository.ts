import { FOCUS_MODEL } from '../../../focus-sessions/persistence/models/focus-session.model';
import { randomUUID } from 'node:crypto';
import {
  SKILL_CATEGORY_MODEL,
  RESEARCH_SKILL_MODEL,
  SKILL_TREE_STATE_MODEL,
} from '../../../research-skills/persistence/models/research-skill.model';
import {
  MEETING_MODEL,
  SUPERVISOR_MODEL,
} from '../../../supervisor-meetings/persistence/models/meeting.model';
import { preparationCamp } from '../../../roadmap/business/services/preparation-camp';
import { applicationRevision } from '../../../../database/application-write';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types, HydratedDocument } from 'mongoose';
import {
  BACKUP_SECTIONS,
  BackupFile,
  LegacyBackupFile,
  BackupSection,
} from '../interfaces/backup.interface';
import { WEEKLY_PLAN_MODEL } from '../../../weekly-plans/persistence/models/weekly-plan.model';
import { XP_TRANSACTION_MODEL } from '../../../gamification/persistence/models/xp-transaction.model';
import { DAILY_ACTIVITY_MODEL } from '../../../daily-activity/persistence/models/daily-activity.model';
import { ROADMAP_MODEL } from '../../../roadmap/persistence/models/roadmap.model';
import { GOAL_MODEL } from '../../../goals/persistence/models/goal.model';
import { ACHIEVEMENT_MODEL } from '../../../achievements/persistence/models/achievement.model';
const MODELS: Record<BackupSection, string> = {
  weeklyPlans: WEEKLY_PLAN_MODEL,
  xpTransactions: XP_TRANSACTION_MODEL,
  dailyActivity: DAILY_ACTIVITY_MODEL,
  roadmapLevels: ROADMAP_MODEL,
  goals: GOAL_MODEL,
  achievements: ACHIEVEMENT_MODEL,
  focusSessions: FOCUS_MODEL,
  supervisors: SUPERVISOR_MODEL,
  supervisorMeetings: MEETING_MODEL,
  skillCategories: SKILL_CATEGORY_MODEL,
  researchSkills: RESEARCH_SKILL_MODEL,
  skillTreeState: SKILL_TREE_STATE_MODEL,
};
const dateFields = new Set([
  'createdAt',
  'updatedAt',
  'completedAt',
  'firstCompletedAt',
  'validatedAt',
  'firstValidatedAt',
  'awardedAt',
  'occurredAt',
  'firstActivityAt',
  'lastActivityAt',
  'unlockedAt',
  'scheduledAt',
  'archivedAt',
  'changedAt',
  'initializedAt',
]);
function dates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dates);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        dateFields.has(key) && typeof item === 'string' ? new Date(item) : dates(item),
      ]),
    );
  return value;
}
@Injectable()
export class BackupRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  private model(section: BackupSection): Model<Record<string, unknown>> {
    return this.connection.model<Record<string, unknown>>(MODELS[section]);
  }
  revision(session: ClientSession) {
    return applicationRevision(this.connection, session);
  }
  async data(session: ClientSession): Promise<BackupFile['data']> {
    const data = {} as BackupFile['data'];
    for (const section of BACKUP_SECTIONS) {
      const rows = await this.model(section)
        .collection.find({}, { session })
        .sort({ _id: 1 })
        .toArray();
      data[section] = rows.map((row) => {
        const { _id, __v, editVersion, ...fields } = row;
        return JSON.parse(JSON.stringify({ id: _id.toString(), ...fields }));
      });
    }
    return data;
  }
  prepare(backup: LegacyBackupFile) {
    const prepared = {} as Record<BackupSection, HydratedDocument<Record<string, unknown>>[]>;
    for (const section of BACKUP_SECTIONS) {
      prepared[section] = (backup.data[section] ?? []).map((row) => {
        const { id, ...originalFields } = row;
        const fields: Record<string, unknown> = { ...originalFields };
        if (section === 'focusSessions') {
          // Restores never resume unattended work, and invalidate every pre-restore tab owner.
          if (fields.state === 'running' || fields.state === 'paused')
            Object.assign(fields, {
              state: 'paused',
              activeSlot: 'workspace',
              intervalStartedAt: null,
              leaseUntil: null,
              activityUntil: null,
              ownerId: null,
              ownerToken: null,
              heartbeatSequence: 0,
              recovered: true,
            });
          if (fields.state || fields.effectiveSeconds !== undefined || fields.applicationMode)
            fields.editVersion = randomUUID();
        }
        const record = new (this.model(section))({
          ...(dates(fields) as object),
          _id: new Types.ObjectId(id as string),
        });
        if (record.validateSync())
          throw new BadRequestException({
            code: 'INVALID_BACKUP',
            message: 'Backup violates application record schemas.',
            details: [{ field: section, message: 'Check required fields and field limits.' }],
          });
        return record;
      });
    }
    // Old v1 backups restore every historical record unchanged, then gain the missing camp.
    if (!backup.data.roadmapLevels.some((row) => row.levelNumber === 0)) {
      prepared.roadmapLevels.push(
        new (this.model('roadmapLevels'))({
          ...preparationCamp(),
          createdAt: new Date(backup.exportedAt),
          updatedAt: new Date(backup.exportedAt),
        }),
      );
    }
    if (
      prepared.roadmapLevels.some(
        (record) => record.levelNumber === 0 && record.status === 'current',
      )
    ) {
      for (const record of prepared.roadmapLevels)
        if (
          typeof record.levelNumber === 'number' &&
          record.levelNumber > 0 &&
          record.status === 'current'
        )
          record.status = 'locked';
    }
    return prepared;
  }
  async replace(
    prepared: Record<BackupSection, HydratedDocument<Record<string, unknown>>[]>,
    session: ClientSession,
  ) {
    for (const section of BACKUP_SECTIONS) {
      await this.model(section).deleteMany({}, { session });
      // Canonical documents already passed the trusted Mongoose schemas. Native insertion preserves every historical timestamp.
      if (prepared[section].length)
        await this.model(section).collection.insertMany(
          prepared[section].map((record) => record.toObject({ versionKey: false })),
          { session, ordered: true },
        );
    }
  }
  async transactionReady() {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    return (
      !!hello.setName &&
      hello.isWritablePrimary === true &&
      typeof hello.logicalSessionTimeoutMinutes === 'number'
    );
  }
}
