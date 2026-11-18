import { Schema } from 'mongoose';
import { XpSource } from '../enums/xp-source.enum';
import { XpTransaction } from '../interfaces/xp-transaction.interface';
export const XP_TRANSACTION_MODEL = 'XpTransaction';
export const xpTransactionSchema = new Schema<XpTransaction>(
  {
    sourceType: { type: String, required: true, enum: Object.values(XpSource), immutable: true },
    sourceId: { type: String, required: true, immutable: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
      validate: Number.isInteger,
      immutable: true,
    },
    awardedAt: { type: Date, required: true, immutable: true },
    description: { type: String, required: true, immutable: true },
    metadata: {
      type: new Schema({ planId: String, weekId: String, taskId: String }, { _id: false }),
      required: true,
      immutable: true,
    },
  },
  { collection: 'xp_transactions', autoCreate: false, autoIndex: false },
);
xpTransactionSchema.index(
  { sourceType: 1, sourceId: 1 },
  { unique: true, name: 'xp_source_unique' },
);
