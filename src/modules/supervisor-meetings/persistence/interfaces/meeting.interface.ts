import { Types } from 'mongoose';
export interface SupervisorRecord {
  _id: Types.ObjectId; name: string; role: 'primary'|'co_supervisor'|'other';
  institution: string; email: string; notes: string; archivedAt: Date|null; createdAt: Date; updatedAt: Date;
}
export interface CheckpointReference { levelNumber: number; checkpointId: string; }
export interface MeetingAction {
  id: string; phase: 'pre_meeting'|'post_meeting'; title: string; description: string;
  dueDate: string|null; status: 'pending'|'in_progress'|'completed'; linkedTaskIds: string[]; createdAt: Date; updatedAt: Date;
}
export interface MeetingRecord {
  _id: Types.ObjectId; title: string; scheduledAt: Date; plannedDurationMinutes: number|null;
  type: 'in_person'|'online'|'hybrid'; location: string; status: 'scheduled'|'completed'|'cancelled'; supervisorIds: string[];
  notes: { agenda: string; discussion: string; feedback: string; decisions: string };
  goalIds: string[]; checkpointRefs: CheckpointReference[]; documents: {label: string; url: string}[];
  actions: MeetingAction[]; archivedAt: Date|null; createdAt: Date; updatedAt: Date;
}
