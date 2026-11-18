import { XpSource } from '../enums/xp-source.enum';
export interface XpTransaction {
  sourceType: XpSource;
  sourceId: string;
  amount: number;
  awardedAt: Date;
  description: string;
  metadata: { planId: string; weekId: string; taskId: string };
}
