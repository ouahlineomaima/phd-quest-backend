import { RoadmapStatus } from '../enums/roadmap.enums';
import { Schema } from 'mongoose';
import { RoadmapLevel } from '../interfaces/roadmap.interface';
export const ROADMAP_MODEL = 'RoadmapLevel';
const checkpoint = new Schema(
  {
    checkpointIdentity: { type: String },
    goalIds: { type: [String], default: undefined },
    id: { type: String, required: true },
    title: String,
    description: String,
    mandatory: Boolean,
    completed: Boolean,
    validatedAt: { type: Date, default: null },
    firstValidatedAt: { type: Date, default: null },
    evidence: { type: String, default: '' },
  },
  { _id: false },
);
export const roadmapSchema = new Schema<RoadmapLevel>(
  {
    levelNumber: { type: Number, required: true, min: 0, max: 12 },
    year: { type: Number, default: null },
    title: String,
    // Year heading metadata lives on the first chapter of each academic year (1, 5, 9).
    yearTitle: { type: String, trim: true, maxlength: 160, default: undefined },
    description: String,
    objectives: [String],
    checkpoints: [checkpoint],
    status: { type: String, enum: Object.values(RoadmapStatus) },
    completedAt: { type: Date, default: null },
  },
  { collection: 'roadmap_levels', timestamps: true, autoCreate: false, autoIndex: false },
);
