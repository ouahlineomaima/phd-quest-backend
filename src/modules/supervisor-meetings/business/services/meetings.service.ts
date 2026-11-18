import { MeetingResponse, MeetingListResponse } from '../../api/dtos/meeting-response.dto';
import { TaskStatus } from '../../../weekly-plans/persistence/enums/task.enums';
import {
  definedFields as defined,
  recordResponse as response,
} from '../../../../common/record-fields';
import { resolveCheckpoint } from '../../../roadmap/business/services/checkpoint-identity';
import { MeetingChanges } from '../../persistence/repositories/meetings.repository';
import { CheckpointReference } from '../../persistence/interfaces/meeting.interface';
import {
  SupervisorRole,
  MeetingType,
  MeetingStatus,
  MeetingActionPhase,
  MeetingActionStatus,
} from '../../persistence/enums/meeting.enums';
import { assertEditVersion, editVersion } from '../../../../database/edit-version';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { applicationWrite } from '../../../../database/application-write';
import { ApplicationClock } from '../../../../common/application-clock';
import { calendarOrdinal } from '../../../../common/calendar';
import { MeetingsRepository } from '../../persistence/repositories/meetings.repository';
import {
  MeetingAction,
  MeetingRecord,
  SupervisorRecord,
} from '../../persistence/interfaces/meeting.interface';
import {
  ActionFieldsDto,
  ActionFilterDto,
  CreateMeetingDto,
  CreateSupervisorDto,
  MeetingFieldsDto,
  MeetingFilterDto,
  SupervisorFieldsDto,
} from '../../api/dtos/meeting.dto';
import { RECORD_ID, TASK_REFERENCE } from '../../persistence/enums/meeting.enums';
import { meetingInstant, meetingLocalTime, meetingTimeLabel } from './meeting-time';
export function validTaskReferences(ids: string[]) {
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        typeof id !== 'string' ||
        !TASK_REFERENCE.test(id) ||
        calendarOrdinal(id.split(':')[0]) === null ||
        new Date(id.split(':')[0] + 'T12:00:00Z').getUTCDay() !== 0,
    )
  )
    throw new BadRequestException('Use unique, valid Sunday weekId:taskId references.');
}
export function linkedProgress(tasks: { status: string }[], total: number) {
  const completed = tasks.filter((t) => t.status === TaskStatus.Completed).length;
  return {
    completed,
    total: tasks.length,
    linked: total,
    missing: total - tasks.length,
    percentage: tasks.length ? Math.round((completed / tasks.length) * 100) : null,
  };
}
function required(input: object, fields: string[]) {
  for (const field of fields)
    if (!(input as Record<string, unknown>)[field])
      throw new BadRequestException(`${field} is required.`);
}
// ES2023 DTO instances include unset class fields. They must never overwrite saved
// note sections or action defaults when handling a partial update.
@Injectable()
export class MeetingsService {
  constructor(
    private readonly repository: MeetingsRepository,
    private readonly clock: ApplicationClock,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  private read<T>(work: (session: ClientSession) => Promise<T>) {
    return this.connection.transaction(work, { readConcern: { level: 'snapshot' } });
  }
  private id(value: string) {
    if (!RECORD_ID.test(value)) throw new BadRequestException('Invalid record ID.');
    return value;
  }
  private async meeting(id: string, session: ClientSession) {
    const row = await this.repository.meeting(this.id(id), session);
    if (!row) throw new NotFoundException('Meeting not found.');
    return row;
  }
  private async supervisor(id: string, session: ClientSession) {
    const row = await this.repository.supervisor(this.id(id), session);
    if (!row) throw new NotFoundException('Supervisor not found.');
    return row;
  }
  private editable(record: { archivedAt: Date | null }) {
    if (record.archivedAt)
      throw new ConflictException(
        'Archived records are preserved in history and cannot be edited.',
      );
  }
  private fields(input: MeetingFieldsDto, old?: MeetingRecord): MeetingChanges {
    const { scheduledLocal, scheduledAt, notes, ...fields } = defined(input);
    if (scheduledLocal !== undefined && scheduledAt !== undefined)
      throw new BadRequestException('Supply scheduledLocal or scheduledAt, not both.');
    return {
      ...fields,
      ...(scheduledLocal !== undefined
        ? { scheduledAt: meetingInstant(scheduledLocal, this.clock.timezone) }
        : scheduledAt !== undefined
          ? { scheduledAt: new Date(scheduledAt) }
          : {}),
      ...(notes
        ? {
            notes: {
              agenda: '',
              discussion: '',
              feedback: '',
              decisions: '',
              ...old?.notes,
              ...defined(notes),
            },
          }
        : {}),
    };
  }
  async supervisors(archived?: string) {
    return (await this.repository.listSupervisors(archived)).map((row) => response(row));
  }
  createSupervisor(input: CreateSupervisorDto) {
    required(input, ['name']);
    return applicationWrite(this.connection, async (session) => {
      return response(
        await this.repository.createSupervisor(
          { ...input, role: input.role ?? SupervisorRole.Primary },
          session,
        ),
      );
    });
  }
  editSupervisor(id: string, input: SupervisorFieldsDto, version?: string) {
    return applicationWrite(this.connection, async (session) => {
      const old = await this.supervisor(id, session);
      assertEditVersion(old, version);
      this.editable(old);
      const row = await this.repository.updateSupervisor(old, defined(input), session);
      return response(row!);
    });
  }
  archiveSupervisor(id: string, version?: string) {
    return applicationWrite(this.connection, async (session) => {
      const old = await this.supervisor(id, session);
      assertEditVersion(old, version);
      if (old.archivedAt) return response(old);
      const row = await this.repository.updateSupervisor(
        old,
        { archivedAt: this.clock.now() },
        session,
      );
      return response(row!);
    });
  }
  private async references(
    input: MeetingFieldsDto,
    session: ClientSession,
    previous?: MeetingRecord,
  ) {
    if (input.supervisorIds !== undefined) {
      if (!input.supervisorIds.length)
        throw new BadRequestException('Select at least one supervisor.');
      const rows = await this.repository.supervisorsByIds(input.supervisorIds, session);
      if (
        rows.length !== input.supervisorIds.length ||
        rows.some((row) => row.archivedAt && !previous?.supervisorIds.includes(row._id.toString()))
      )
        throw new BadRequestException(
          'Select existing active supervisors. Historical archived supervisors may be retained.',
        );
    }
    if (input.goalIds !== undefined) {
      const rows = await this.repository.goals(input.goalIds, session);
      if (
        input.goalIds.some(
          (id) => !rows.some((row) => row._id.toString() === id) && !previous?.goalIds.includes(id),
        )
      )
        throw new BadRequestException('New goal links must reference existing goals.');
    }
    if (input.checkpointRefs === undefined) return undefined;
    const refs: CheckpointReference[] = input.checkpointRefs.map((ref) => ({ ...ref }));
    for (const ref of refs) {
      const prior = previous?.checkpointRefs.find(
        (old) => old.levelNumber === ref.levelNumber && old.checkpointId === ref.checkpointId,
      );
      if (!ref.checkpointIdentity && prior) {
        if (prior.checkpointIdentity) ref.checkpointIdentity = prior.checkpointIdentity;
        continue;
      }
      if (ref.checkpointIdentity && ref.checkpointIdentity === prior?.checkpointIdentity) continue;
      const identity = await this.repository.checkpointIdentity(
        ref.levelNumber,
        ref.checkpointId,
        session,
      );
      if (ref.checkpointIdentity && ref.checkpointIdentity !== identity)
        throw new BadRequestException('The checkpoint was replaced. Reload before linking.');
      ref.checkpointIdentity = identity;
    }
    return refs;
  }

  private async details(rows: MeetingRecord[], session: ClientSession): Promise<MeetingResponse[]> {
    const supervisorIds = [...new Set(rows.flatMap((r) => r.supervisorIds))],
      goalIds = [...new Set(rows.flatMap((r) => r.goalIds))],
      sources = [...new Set(rows.flatMap((r) => r.actions.flatMap((a) => a.linkedTaskIds)))];
    // Sequential reads share one snapshot session; no N+1 requests or concurrent session operations.
    const supervisors = await this.repository.supervisorsByIds(supervisorIds, session);
    const goals = await this.repository.goals(goalIds, session),
      levels = await this.repository.levels(
        [...new Set(rows.flatMap((r) => r.checkpointRefs.map((c) => c.levelNumber)))],
        session,
      ),
      tasks = await this.repository.taskStates(sources, session);
    const byTask = new Map(tasks.map((t) => [t.sourceId, t])),
      byGoal = new Map(goals.map((g) => [g._id.toString(), g])),
      bySupervisor = new Map(supervisors.map((s) => [s._id.toString(), s]));
    return rows.map((row) => ({
      ...response(row),
      scheduledLocal: meetingLocalTime(row.scheduledAt, this.clock.timezone),
      scheduledLabel: meetingTimeLabel(row.scheduledAt, this.clock.timezone),
      supervisors: row.supervisorIds.map((id) => {
        const s = bySupervisor.get(id);
        return s
          ? response(s)
          : { id, name: 'Unavailable supervisor', missing: true as const, archivedAt: null };
      }),
      linkedGoals: row.goalIds.map((id) => {
        const g = byGoal.get(id);
        return g
          ? { id, title: g.title, status: g.status, missing: false }
          : { id, title: 'Unavailable goal', status: null, missing: true };
      }),
      linkedCheckpoints: row.checkpointRefs.map((ref) => {
        const { checkpoint, resolution } = resolveCheckpoint(ref, levels);
        return {
          ...ref,
          resolution,
          title:
            checkpoint?.title ??
            (resolution === 'unverified'
              ? 'Unverified historical checkpoint'
              : 'Unavailable checkpoint'),
          completed: checkpoint?.completed ?? null,
          missing: !checkpoint,
        };
      }),
      actions: row.actions.map((action) => {
        const valid = action.linkedTaskIds.flatMap((source) =>
          byTask.has(source) ? [byTask.get(source)!] : [],
        );
        return {
          ...action,
          meetingVersion: editVersion(row),
          meetingId: row._id.toString(),
          linkedTasks: action.linkedTaskIds.map(
            (source) =>
              byTask.get(source) ?? {
                sourceId: source,
                weekId: source.split(':')[0],
                taskId: source.split(':')[1],
                title: 'Unavailable task',
                status: null,
                date: '',
                missing: true as const,
              },
          ),
          progress: linkedProgress(valid, action.linkedTaskIds.length),
        };
      }),
    }));
  }
  list(filter: MeetingFilterDto = {}): Promise<MeetingListResponse> {
    return this.read(async (session) => ({
      timezone: this.clock.timezone,
      items: await this.details(await this.repository.selectMeetings(filter, session), session),
    }));
  }
  detail(id: string) {
    return this.read(async (session) => ({
      timezone: this.clock.timezone,
      ...(await this.details([await this.meeting(id, session)], session))[0],
    }));
  }
  create(input: CreateMeetingDto) {
    required(input, ['title', 'supervisorIds']);
    if (!input.scheduledAt && !input.scheduledLocal)
      throw new BadRequestException('A scheduled date and time is required.');
    const fields = this.fields(input);
    return applicationWrite(this.connection, async (session) => {
      const checkpointRefs = await this.references(input, session);
      const record = await this.repository.createMeeting(
        {
          ...fields,
          ...(checkpointRefs ? { checkpointRefs } : {}),
          type: input.type ?? MeetingType.Online,
        },
        session,
      );
      return (await this.details([record], session))[0];
    });
  }
  edit(id: string, input: MeetingFieldsDto, version?: string) {
    return applicationWrite(this.connection, async (session) => {
      const old = await this.meeting(id, session);
      assertEditVersion(old, version);
      this.editable(old);
      const checkpointRefs = await this.references(input, session, old);
      const fields = { ...this.fields(input, old), ...(checkpointRefs ? { checkpointRefs } : {}) };
      const record = await this.repository.updateMeeting(old, fields, session);
      return (await this.details([record!], session))[0];
    });
  }
  status(id: string, status: MeetingRecord['status'], version?: string) {
    return applicationWrite(this.connection, async (session) => {
      const old = await this.meeting(id, session);
      assertEditVersion(old, version);
      this.editable(old);
      const row = await this.repository.updateMeeting(old, { status }, session);
      return (await this.details([row!], session))[0];
    });
  }
  archive(id: string, version?: string) {
    return applicationWrite(this.connection, async (session) => {
      const old = await this.meeting(id, session);
      assertEditVersion(old, version);
      if (old.archivedAt) return response(old);
      const row = await this.repository.updateMeeting(
        old,
        { archivedAt: this.clock.now() },
        session,
      );
      return response(row!);
    });
  }
  action(
    id: string,
    actionId: string | null,
    input: ActionFieldsDto,
    remove = false,
    version?: string,
  ) {
    if (!actionId) required(input, ['title', 'phase']);
    else this.id(actionId);
    return applicationWrite(this.connection, async (session) => {
      const meeting = await this.meeting(id, session);
      assertEditVersion(meeting, version);
      this.editable(meeting);
      const old = actionId ? meeting.actions.find((a) => a.id === actionId) : undefined;
      if (actionId && !old) throw new NotFoundException('Meeting action not found.');
      if (input.dueDate != null && calendarOrdinal(input.dueDate) === null)
        throw new BadRequestException('Due date must be a real calendar date.');
      if (input.linkedTaskIds !== undefined) {
        validTaskReferences(input.linkedTaskIds);
        const available = await this.repository.taskStates(input.linkedTaskIds, session);
        if (
          input.linkedTaskIds.some(
            (source) =>
              !available.some((t) => t.sourceId === source) && !old?.linkedTaskIds.includes(source),
          )
        )
          throw new BadRequestException('New task links must reference existing weekly tasks.');
      }
      const now = this.clock.now(),
        newAction = {
          ...(old ?? {
            id: new Types.ObjectId().toString(),
            description: '',
            dueDate: null,
            status: MeetingActionStatus.Pending,
            linkedTaskIds: [],
            createdAt: now,
          }),
          ...defined(input),
          updatedAt: now,
        } as MeetingAction;
      if (!old && meeting.actions.length >= 200)
        throw new BadRequestException('A meeting supports at most 200 actions.');
      const actions = remove
        ? meeting.actions.filter((a) => a.id !== actionId)
        : old
          ? meeting.actions.map((a) => (a.id === actionId ? newAction : a))
          : [...meeting.actions, newAction];
      const row = await this.repository.updateMeeting(meeting, { actions }, session);
      return (await this.details([row!], session))[0];
    });
  }
  actions(filter: ActionFilterDto = {}) {
    if (filter.dueDate && calendarOrdinal(filter.dueDate) === null)
      throw new BadRequestException('Invalid action due date.');
    return this.read(async (session) => {
      const rows = await this.repository.selectMeetings(filter, session);
      const meetings = await this.details(rows, session),
        today = this.clock.dateAt(this.clock.now());
      const items = meetings
        .flatMap((m) =>
          m.actions.map((a) => ({
            ...a,
            meetingTitle: m.title,
            meetingArchived: !!m.archivedAt,
            overdue: !!a.dueDate && a.dueDate < today && a.status !== MeetingActionStatus.Completed,
          })),
        )
        .filter(
          (a) =>
            (!filter.phase || a.phase === filter.phase) &&
            (!filter.status ||
              (filter.status === 'open'
                ? a.status !== MeetingActionStatus.Completed
                : a.status === filter.status)) &&
            (!filter.dueDate || a.dueDate === filter.dueDate) &&
            (!filter.due ||
              filter.due === 'all' ||
              (filter.due === 'overdue'
                ? a.overdue
                : filter.due === 'today'
                  ? a.dueDate === today
                  : a.dueDate === null)),
        )
        .sort(
          (a, b) =>
            (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id),
        );
      return { timezone: this.clock.timezone, today, items };
    });
  }
  summary() {
    return this.read(async (session) => {
      const rows = await this.repository.selectMeetings({}, session),
        now = this.clock.now(),
        today = this.clock.dateAt(now),
        actions = rows.flatMap((r) => r.actions),
        open = actions.filter((a) => a.status !== MeetingActionStatus.Completed);
      const upcoming = rows.filter(
          (r) => r.status === MeetingStatus.Scheduled && r.scheduledAt >= now,
        ),
        next = upcoming[0];
      return {
        timezone: this.clock.timezone,
        today,
        upcoming: upcoming.length,
        completed: rows.filter((r) => r.status === MeetingStatus.Completed).length,
        pending: open.length,
        preparation: open.filter((a) => a.phase === MeetingActionPhase.PreMeeting).length,
        followUp: open.filter((a) => a.phase === MeetingActionPhase.PostMeeting).length,
        overdue: open.filter((a) => a.dueDate && a.dueDate < today).length,
        nextMeeting: next
          ? {
              id: next._id.toString(),
              title: next.title,
              scheduledAt: next.scheduledAt,
              scheduledLabel: meetingTimeLabel(next.scheduledAt, this.clock.timezone),
            }
          : null,
      };
    });
  }
}
