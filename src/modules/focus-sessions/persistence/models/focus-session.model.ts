import { FocusMode, FocusCompletion, FocusState, FocusKind } from '../enums/focus.enums';
import { Schema } from 'mongoose';
import type { FocusSession } from '../interfaces/focus-session.interface';
export const FOCUS_MODEL = 'FocusSession';
export const focusSessionSchema = new Schema<FocusSession>(
  {
    sessionId: { type: String, required: true },
    mode: { type: String, enum: Object.values(FocusMode), required: true },
    targetSeconds: { type: Number, default: null },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    focusedSeconds: { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER, required: true },
    taskRef: { type: String, default: null },
    taskTitle: { type: String, default: null, maxlength: 160 },
    completionType: { type: String, enum: Object.values(FocusCompletion), default: null },
    appliedAt: { type: Date, default: null },
    appliedMinutes: { type: Number, min: 0, default: 0 },
    state: { type: String, enum: Object.values(FocusState) },
    kind: { type: String, enum: Object.values(FocusKind) },
    activeSlot: String,
    editVersion: String,
    confirmedMilliseconds: { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER },
    intervalStartedAt: Date,
    lastHeartbeatAt: Date,
    leaseUntil: Date,
    activityUntil: Date,
    ownerId: String,
    ownerToken: String,
    heartbeatSequence: { type: Number, min: 0 },
    recovered: Boolean,
    timerPolicy: { type: String, enum: ['manual'] },
    effectiveSeconds: { type: Number, min: 0, max: 86400 },
    applicationMode: { type: String, enum: ['task-actual'] },
    actualMinutesBefore: { type: Number, min: 0, max: 1440 },
    actualMinutesAfter: { type: Number, min: 0, max: 1440 },
  },
  {
    collection: 'focus_sessions',
    timestamps: true,
    strict: 'throw',
    autoCreate: false,
    autoIndex: false,
  },
);
