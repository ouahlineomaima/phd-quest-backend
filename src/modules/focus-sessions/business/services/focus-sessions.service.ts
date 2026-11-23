import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { applicationWrite } from '../../../../database/application-write';
import { calendarOrdinal } from '../../../../common/calendar';
import { sundayWeek } from '../../../dashboard/business/services/sunday-week';
import { FocusSessionsRepository } from '../../persistence/repositories/focus-sessions.repository';
import { SaveFocusSessionDto } from '../../api/dtos/focus-session.dto';
import { validateFocus } from './focus-validation';
import { assertEditVersion, editVersion } from '../../../../database/edit-version';
import { FocusState, FocusKind } from '../../persistence/enums/focus.enums';
@Injectable()
export class FocusSessionsService {
  constructor(
    private readonly repository: FocusSessionsRepository,
    private readonly clock: ApplicationClock,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  save(input: SaveFocusSessionDto) {
    const fields = validateFocus(input, this.clock.now());
    return applicationWrite(this.connection, async (session) => {
      const existing = await this.repository.find(fields.sessionId, session);
      if (existing) {
        if (
          (Object.keys(fields) as (keyof typeof fields)[]).some(
            (key) => JSON.stringify(existing[key]) !== JSON.stringify(fields[key]),
          )
        )
          throw new ConflictException('This session ID was already saved with different contents.');
        return existing;
      }
      const task = fields.taskRef ? await this.repository.task(fields.taskRef, session) : null;
      if (fields.taskRef && !task)
        throw new BadRequestException(
          'The selected weekly task no longer exists. The original session remains recoverable locally; restore the task before retrying, or discard the session.',
        );
      return this.repository.insert(
        { ...fields, taskTitle: task?.title ?? null, appliedAt: null, appliedMinutes: 0 },
        session,
      );
    });
  }
  history(page = 1, limit = 20) {
    return this.connection.transaction((session) => this.repository.history(page, limit, session), {
      readConcern: { level: 'snapshot' },
    });
  }
  summary() {
    return this.connection.transaction(
      async (session) => {
        const today = this.clock.dateAt(this.clock.now()),
          week = sundayWeek(today);
        return {
          timezone: this.clock.timezone,
          today,
          weekId: week.weekId,
          ...(await this.repository.summary(
            this.clock.timezone,
            today,
            week.startDate,
            week.endDate,
            session,
          )),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  taskTimes(weekId: string) {
    if (calendarOrdinal(weekId) === null) throw new BadRequestException('Use a valid week date.');
    return this.connection.transaction(
      async (session) =>
        Object.fromEntries(
          (await this.repository.applied(weekId, session)).map((row) => [row._id, row.minutes]),
        ),
      { readConcern: { level: 'snapshot' } },
    );
  }
  preview(id: string) {
    return this.connection.transaction(
      async (session) => {
        const record = await this.repository.editable(id, session);
        if (!record) throw new NotFoundException('Focus session not found.');
        const task = record.taskRef ? await this.repository.task(record.taskRef, session) : null;
        const totals = record.taskRef
          ? await this.repository.applied(record.taskRef.split(':')[0], session)
          : [];
        return {
          session: { ...record, editVersion: editVersion(record) },
          task: task
            ? {
                title: task.title,
                status: task.status,
                manualActualMinutes: task.actualMinutes,
                appliedFocusMinutes: totals.find((row) => row._id === record.taskRef)?.minutes ?? 0,
              }
            : null,
          proposedMinutes: Math.floor((record.effectiveSeconds ?? record.focusedSeconds) / 60),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  correct(id: string, minutes: number, version?: string) {
    this.validMinutes(minutes);
    return applicationWrite(this.connection, async (s) => {
      const record = await this.repository.editable(id, s);
      if (!record) throw new NotFoundException('Focus session not found.');
      if (record.appliedAt || !record.endedAt || record.kind === FocusKind.Break)
        throw new ConflictException('Only an unapplied stopped focus session can be corrected.');
      assertEditVersion(record, version);
      return this.repository.updateLifecycle(record, { effectiveSeconds: minutes * 60 }, s);
    });
  }
  private validMinutes(minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)
      throw new BadRequestException('Use whole effective minutes from 0 to 1,440.');
  }
  apply(id: string, effectiveMinutes?: number, version?: string, expectedActualMinutes?: number) {
    if (effectiveMinutes !== undefined) this.validMinutes(effectiveMinutes);
    return applicationWrite(this.connection, async (session) => {
      const record = await this.repository.editable(id, session);
      if (!record) throw new NotFoundException('Focus session not found.');
      if (record.appliedAt) return record;
      if (
        !record.endedAt ||
        record.kind === FocusKind.Break ||
        (record.state && record.state !== FocusState.Stopped)
      )
        throw new ConflictException('Stop the focus session before applying time.');
      const updatesActual =
        !!record.state || effectiveMinutes !== undefined || record.effectiveSeconds !== undefined;
      if (updatesActual) {
        assertEditVersion(record, version);
        const minutes =
          effectiveMinutes ?? Math.floor((record.effectiveSeconds ?? record.focusedSeconds) / 60);
        this.validMinutes(minutes);
        const task = record.taskRef ? await this.repository.task(record.taskRef, session) : null;
        if (!task)
          throw new ConflictException(
            'The linked task is unavailable. Session history is preserved.',
          );
        if (expectedActualMinutes !== undefined && task.actualMinutes !== expectedActualMinutes)
          throw new ConflictException(
            'Task time changed after preview. Your correction is retained; inspect the latest task time.',
          );
        if (task.actualMinutes + minutes > 1440)
          throw new BadRequestException(
            'The resulting task actual duration cannot exceed 1,440 minutes.',
          );
        const changed = await this.repository.addTaskMinutes(
          record.taskRef!,
          minutes,
          this.clock.now(),
          session,
        );
        if (changed.modifiedCount !== 1 && minutes !== 0)
          throw new ConflictException('The linked task changed.');
        return this.repository.updateLifecycle(
          record,
          {
            effectiveSeconds: minutes * 60,
            appliedAt: this.clock.now(),
            appliedMinutes: minutes,
            applicationMode: 'task-actual',
            actualMinutesBefore: task.actualMinutes,
            actualMinutesAfter: task.actualMinutes + minutes,
          },
          session,
        );
      }
      const minutes = Math.floor(record.focusedSeconds / 60);
      if (!record.taskRef || minutes < 1)
        throw new BadRequestException(
          'Link a task and record at least one full minute before applying time.',
        );
      if (!(await this.repository.task(record.taskRef, session)))
        throw new ConflictException(
          'The historical task is no longer available. Focus time remains saved separately.',
        );
      return this.repository.apply(id, minutes, this.clock.now(), session);
    });
  }
}
