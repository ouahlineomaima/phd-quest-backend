import {RoadmapStatus} from '../enums/roadmap.enums';
import { applicationWrite, applicationRevision } from '../../../../database/application-write';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { ROADMAP_MODEL } from '../models/roadmap.model';
import { RoadmapLevel } from '../interfaces/roadmap.interface';
import type { importedLevels } from '../../business/services/roadmap-import-validation';
import { preparationCamp } from '../../business/services/preparation-camp';
import { initialRoadmap } from '../../business/services/roadmap-seed';
@Injectable()
export class RoadmapRepository implements OnModuleInit {
  constructor(@InjectModel(ROADMAP_MODEL) private readonly model: Model<RoadmapLevel>, @InjectConnection() private readonly connection: Connection) {}
  async onModuleInit() {
    await this.model.createCollection();
    await this.model.collection.createIndex({ levelNumber: 1 }, { unique: true, name: 'roadmap_level_unique' });
    try {
      await applicationWrite(this.connection, async session => {
        const existing = await this.model.find().sort({ levelNumber: 1 }).session(session).lean();
        if (!existing.length) await this.model.insertMany(initialRoadmap(), { session });
        else if (existing.length === 12 && existing.every((level, index) => level.levelNumber === index + 1)) {
          // Add only the new camp. Never renumber, relock or complete existing research work.
          await this.model.insertMany([preparationCamp()], { session });
        }
        // Preparation is now the current chapter. Pause later progression without erasing work.
        if (await this.model.exists({ levelNumber: 0, status: RoadmapStatus.Current }).session(session)) {
          await this.model.updateMany({ levelNumber: { $gt: 0 }, status: RoadmapStatus.Current }, { $set: { status: RoadmapStatus.Locked } }, { session });
        }
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || await this.model.countDocuments() !== 13) throw error;
    }
    // A partial legacy map must be repaired explicitly; never replace existing work.
    const levels = await this.model.find().sort({ levelNumber: 1 }).lean();
    if (levels.length !== 13 || levels.some((level, index) => level.levelNumber !== index || level.year !== (index === 0 ? null : Math.floor((index - 1) / 4) + 1))) throw new Error('Expected Preparation Camp and twelve research chapters; existing data was preserved.');
  }
  revision(session: ClientSession) { return applicationRevision(this.connection, session); }
  async replace(levels: ReturnType<typeof importedLevels>, session: ClientSession) {
    await this.model.deleteMany({}, { session });
    await this.model.insertMany(levels, { session });
  }
  list(session?: ClientSession) { return this.model.find({}, { _id: 0, __v: 0 }).sort({ levelNumber: 1 }).session(session ?? null).lean().exec(); }
  find(levelNumber: number, session?: ClientSession) { return this.model.findOne({ levelNumber }, { _id: 0, __v: 0 }).session(session ?? null).lean().exec(); }
  update(levelNumber: number, fields: Record<string, unknown>, session: ClientSession) {
    return this.model.findOneAndUpdate({ levelNumber }, { $set: fields }, { session, new: true, runValidators: true, projection: { _id: 0, __v: 0 } }).lean().exec();
  }
}
