import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { XP_TRANSACTION_MODEL } from '../models/xp-transaction.model';
import { XpTransaction } from '../interfaces/xp-transaction.interface';
import { XpSource } from '../enums/xp-source.enum';
@Injectable()
export class GamificationRepository implements OnModuleInit {
  constructor(@InjectModel(XP_TRANSACTION_MODEL) private readonly ledger: Model<XpTransaction>, @InjectConnection() private readonly connection: Connection) {}
  async onModuleInit() {
    await this.ledger.createCollection();
    await this.ledger.collection.createIndex({ sourceType: 1, sourceId: 1 }, { unique: true, name: 'xp_source_unique' });
  }
  async award(transaction: XpTransaction, session: ClientSession) {
    if (await this.ledger.exists({ sourceType: transaction.sourceType, sourceId: transaction.sourceId }).session(session)) return 0;
    await this.ledger.create([transaction], { session });
    return transaction.amount;
  }
  async total(session: ClientSession, weekId?: string) {
    const rows = await this.ledger.aggregate<{ total: number }>([
      { $match: { sourceType: XpSource.TaskCompletion, ...(weekId ? { 'metadata.weekId': weekId } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session).exec();
    return rows[0]?.total ?? 0;
  }
  async completedCount(session: ClientSession) {
    const rows = await this.connection.collection('weekly_plans').aggregate<{ total: number }>([
      { $project: { count: { $size: { $filter: { input: '$tasks', as: 'task', cond: { $eq: ['$$task.status', 'completed'] } } } } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ], { session }).toArray();
    return rows[0]?.total ?? 0;
  }
}
