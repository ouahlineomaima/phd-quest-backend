import { applicationWrite } from '../../../../database/application-write';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { ROADMAP_MODEL } from '../models/roadmap.model';
import { RoadmapLevel } from '../interfaces/roadmap.interface';
import { initialRoadmap } from '../../business/services/roadmap-seed';
@Injectable()
export class RoadmapRepository implements OnModuleInit {
  constructor(@InjectModel(ROADMAP_MODEL) private readonly model: Model<RoadmapLevel>, @InjectConnection() private readonly connection: Connection) {}
  async onModuleInit() {
    await this.model.createCollection();
    await this.model.collection.createIndex({ levelNumber: 1 }, { unique: true, name: 'roadmap_level_unique' });
    try {
      await applicationWrite(this.connection, async session => {
        if (!await this.model.exists({}).session(session)) await this.model.insertMany(initialRoadmap(), { session });
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || await this.model.countDocuments() !== 12) throw error;
    }
    // A partial legacy map must be repaired explicitly; never replace existing work.
    const levels = await this.model.find().sort({ levelNumber: 1 }).lean();
    if (levels.length !== 12 || levels.some((level, index) => level.levelNumber !== index + 1)) throw new Error('Expected the fixed twelve-level research roadmap; existing data was preserved.');
  }
  list(session?: ClientSession) { return this.model.find({}, { _id: 0, __v: 0 }).sort({ levelNumber: 1 }).session(session ?? null).lean().exec(); }
  find(levelNumber: number, session?: ClientSession) { return this.model.findOne({ levelNumber }, { _id: 0, __v: 0 }).session(session ?? null).lean().exec(); }
  update(levelNumber: number, fields: Record<string, unknown>, session: ClientSession) {
    return this.model.findOneAndUpdate({ levelNumber }, { $set: fields }, { session, new: true, runValidators: true, projection: { _id: 0, __v: 0 } }).lean().exec();
  }
}
