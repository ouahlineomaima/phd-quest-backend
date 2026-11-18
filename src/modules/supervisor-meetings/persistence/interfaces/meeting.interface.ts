import {
  SupervisorRole,
  MeetingType,
  MeetingStatus,
  MeetingActionPhase,
  MeetingActionStatus,
} from '../enums/meeting.enums';
import { Types } from 'mongoose';
export interface SupervisorRecord {
  editVersion?: string;
  _id: Types.ObjectId;
  name: string;
  role: SupervisorRole;
  institution: string;
  email: string;
  notes: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface CheckpointReference {
  levelNumber: number;
  checkpointId: string;
  checkpointIdentity?: string;
}
export interface MeetingAction {
  id: string;
  phase: MeetingActionPhase;
  title: string;
  description: string;
  dueDate: string | null;
  status: MeetingActionStatus;
  linkedTaskIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
export interface MeetingRecord {
  editVersion?: string;
  _id: Types.ObjectId;
  title: string;
  scheduledAt: Date;
  plannedDurationMinutes: number | null;
  type: MeetingType;
  location: string;
  status: MeetingStatus;
  supervisorIds: string[];
  notes: { agenda: string; discussion: string; feedback: string; decisions: string };
  goalIds: string[];
  checkpointRefs: CheckpointReference[];
  documents: { label: string; url: string }[];
  actions: MeetingAction[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
