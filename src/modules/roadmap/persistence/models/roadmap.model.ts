import { Schema } from 'mongoose';
import { RoadmapLevel } from '../interfaces/roadmap.interface';
export const ROADMAP_MODEL = 'RoadmapLevel';
const checkpoint = new Schema({ id: { type: String, required: true }, title: String, description: String,
  mandatory: Boolean, completed: Boolean, validatedAt: { type: Date, default: null },
  firstValidatedAt: { type: Date, default: null }, evidence: { type: String, default: '' } }, { _id: false });
export const roadmapSchema = new Schema<RoadmapLevel>({
  levelNumber: { type: Number, required: true, min: 1, max: 12 }, year: Number, title: String,
  description: String, objectives: [String], checkpoints: [checkpoint],
  status: { type: String, enum: ['current', 'locked', 'completed'] }, completedAt: { type: Date, default: null },
}, { collection: 'roadmap_levels', timestamps: true, autoCreate: false, autoIndex: false });
