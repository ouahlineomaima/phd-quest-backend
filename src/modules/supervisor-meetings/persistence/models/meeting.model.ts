import { Schema } from 'mongoose';
import { MeetingRecord, SupervisorRecord } from '../interfaces/meeting.interface';
import { ACTION_PHASES, ACTION_STATUSES, MEETING_STATUSES, MEETING_TYPES, SUPERVISOR_ROLES, TASK_REFERENCE, RECORD_ID } from '../enums/meeting.enums';
export const SUPERVISOR_MODEL = 'Supervisor';
export const MEETING_MODEL = 'SupervisorMeeting';
const options = { timestamps: true, autoIndex: false, autoCreate: false };
export const supervisorSchema = new Schema<SupervisorRecord>({
  name: { type: String, required: true, trim: true, maxlength: 160 }, role: {type: String, required: true, enum: SUPERVISOR_ROLES},
  institution: {type: String, default: '', maxlength: 300}, email: {type: String, default: '', maxlength: 254},
  notes: {type: String, default: '', maxlength: 5000}, archivedAt: {type: Date, default: null},
}, {...options, collection: 'supervisors'});
const action = new Schema({
  id: {type: String, required: true, match: RECORD_ID}, phase: {type: String, required: true, enum: ACTION_PHASES},
  title: {type: String, required: true, trim: true, maxlength: 160}, description: {type: String, default: '', maxlength: 5000},
  dueDate: {type: String, default: null}, status: {type: String, required: true, enum: ACTION_STATUSES},
  linkedTaskIds: {type: [{type: String, match: TASK_REFERENCE}], default: []},
  createdAt: {type: Date, required: true}, updatedAt: {type: Date, required: true},
}, {_id: false});
const notes = new Schema({agenda: {type: String, default: '', maxlength: 10000}, discussion: {type: String, default: '', maxlength: 10000}, feedback: {type: String, default: '', maxlength: 10000}, decisions: {type: String, default: '', maxlength: 10000}}, {_id: false});
export const meetingSchema = new Schema<MeetingRecord>({
  title: {type: String, required: true, trim: true, maxlength: 160}, scheduledAt: {type: Date, required: true},
  plannedDurationMinutes: {type: Number, default: null, min: 1, max: 1440}, type: {type: String, required: true, enum: MEETING_TYPES},
  location: {type: String, default: '', maxlength: 1000}, status: {type: String, default: 'scheduled', enum: MEETING_STATUSES},
  supervisorIds: {type: [{type: String, match: RECORD_ID}], required: true}, notes: {type: notes, default: () => ({})},
  goalIds: {type: [{type: String, match: RECORD_ID}], default: []},
  checkpointRefs: {type: [new Schema({levelNumber: {type: Number, required: true, min: 0, max: 12}, checkpointId: {type: String, required: true, maxlength: 100}}, {_id: false})], default: []},
  documents: {type: [new Schema({label: {type: String, required: true, maxlength: 160}, url: {type: String, required: true, maxlength: 2048}}, {_id: false})], default: []},
  actions: {type: [action], default: []}, archivedAt: {type: Date, default: null},
}, {...options, collection: 'supervisor_meetings'});
