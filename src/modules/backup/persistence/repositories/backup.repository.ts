import { applicationRevision } from '../../../../database/application-write';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BACKUP_SECTIONS, BackupFile, BackupSection } from '../interfaces/backup.interface';
import { WEEKLY_PLAN_MODEL } from '../../../weekly-plans/persistence/models/weekly-plan.model';
import { XP_TRANSACTION_MODEL } from '../../../gamification/persistence/models/xp-transaction.model';
import { DAILY_ACTIVITY_MODEL } from '../../../daily-activity/persistence/models/daily-activity.model';
import { ROADMAP_MODEL } from '../../../roadmap/persistence/models/roadmap.model';
import { GOAL_MODEL } from '../../../goals/persistence/models/goal.model';
import { ACHIEVEMENT_MODEL } from '../../../achievements/persistence/models/achievement.model';
const MODELS: Record<BackupSection, string> = { weeklyPlans: WEEKLY_PLAN_MODEL, xpTransactions: XP_TRANSACTION_MODEL, dailyActivity: DAILY_ACTIVITY_MODEL, roadmapLevels: ROADMAP_MODEL, goals: GOAL_MODEL, achievements: ACHIEVEMENT_MODEL };
const dateFields = new Set(['createdAt', 'updatedAt', 'completedAt', 'firstCompletedAt', 'validatedAt', 'firstValidatedAt', 'awardedAt', 'occurredAt', 'firstActivityAt', 'lastActivityAt', 'unlockedAt']);
function dates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dates);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dateFields.has(key) && typeof item === 'string' ? new Date(item) : dates(item)]));
  return value;
}
@Injectable()
export class BackupRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  private model(section: BackupSection): Model<any> { return this.connection.model(MODELS[section]); }
  revision(session: ClientSession) { return applicationRevision(this.connection, session); }
  async data(session: ClientSession): Promise<BackupFile['data']> {
    const data = {} as BackupFile['data'];
    for (const section of BACKUP_SECTIONS) {
      const rows = await this.model(section).collection.find({}, { session }).sort({ _id: 1 }).toArray();
      data[section] = rows.map(row => {
        const { _id, __v, ...fields } = row;
        return JSON.parse(JSON.stringify({ id: _id.toString(), ...fields }));
      });
    }
    return data;
  }
  prepare(backup: BackupFile) {
    const prepared = {} as Record<BackupSection, any[]>;
    for (const section of BACKUP_SECTIONS) {
      prepared[section] = backup.data[section].map(row => {
        const { id, ...fields } = row;
        const record = new (this.model(section))({ ...dates(fields) as object, _id: new Types.ObjectId(id as string) });
        if (record.validateSync()) throw new BadRequestException({ code: 'INVALID_BACKUP', message: 'Backup violates application record schemas.', details: [{ field: section, message: 'Check required fields and field limits.' }] });
        return record;
      });
    }
    return prepared;
  }
  async replace(prepared: Record<BackupSection, any[]>, session: ClientSession) {
    for (const section of BACKUP_SECTIONS) {
      await this.model(section).deleteMany({}, { session });
      // Canonical documents already passed the trusted Mongoose schemas. Native insertion preserves every historical timestamp.
      if (prepared[section].length) await this.model(section).collection.insertMany(prepared[section].map(record => record.toObject({ versionKey: false })), { session, ordered: true });
    }
  }
  async transactionReady() {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    return !!hello.setName && hello.isWritablePrimary === true && typeof hello.logicalSessionTimeoutMinutes === 'number';
  }
}
