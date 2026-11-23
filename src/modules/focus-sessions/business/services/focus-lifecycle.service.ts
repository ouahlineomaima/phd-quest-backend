import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ApplicationClock } from '../../../../common/application-clock';
import { applicationWrite } from '../../../../database/application-write';
import { assertEditVersion } from '../../../../database/edit-version';
import { FocusSessionsRepository } from '../../persistence/repositories/focus-sessions.repository';
import {
  FocusCompletion,
  FocusKind,
  FocusMode,
  FocusState,
} from '../../persistence/enums/focus.enums';
import { FocusHeartbeatDto, StartFocusDto } from '../../api/dtos/focus-lifecycle.dto';
import {
  activityWindow,
  expired,
  LEASE_MS,
  measuredMilliseconds,
  sessionView,
} from './focus-lifecycle';
import { validateFocus } from './focus-validation';

@Injectable()
export class FocusLifecycleService {
  constructor(
    private readonly repository: FocusSessionsRepository,
    private readonly clock: ApplicationClock,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  private async record(id: string, session: ClientSession) {
    const row = await this.repository.editable(id, session);
    if (!row || !row.state) throw new NotFoundException('Active timer session not found.');
    return row;
  }
  current() {
    return this.connection.transaction(
      async (s) => {
        const row = await this.repository.current(s);
        return row ? sessionView(row, this.clock.now()) : null;
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  start(input: StartFocusDto) {
    const now = this.clock.now();
    // Reuse the established mode, task-reference, date and target validation.
    validateFocus(
      {
        sessionId: input.sessionId,
        mode: input.mode,
        targetSeconds: input.targetSeconds,
        taskRef: input.taskRef,
        startedAt: new Date(now.getTime() - 1000).toISOString(),
        endedAt: now.toISOString(),
        focusedSeconds: 1,
        completionType: FocusCompletion.StoppedEarly,
      },
      now,
    );
    if (
      input.kind === FocusKind.Break &&
      (input.mode !== FocusMode.Countdown ||
        ![300, 900].includes(input.targetSeconds!) ||
        input.taskRef)
    )
      throw new BadRequestException('Breaks are standalone five- or fifteen-minute countdowns.');
    return applicationWrite(this.connection, async (s) => {
      const existing = await this.repository.editable(input.sessionId, s);
      if (existing) {
        if (
          existing.ownerId === input.ownerId &&
          existing.state !== FocusState.Stopped &&
          existing.taskRef === input.taskRef &&
          existing.mode === input.mode &&
          existing.kind === input.kind &&
          existing.targetSeconds === input.targetSeconds
        )
          return sessionView(existing, this.clock.now());
        throw new ConflictException('This session identity has already been used.');
      }
      if (await this.repository.current(s))
        throw new ConflictException(
          'A running or paused timer already exists. Open Focus to resume or stop it.',
        );
      const task = input.taskRef ? await this.repository.task(input.taskRef, s) : null;
      if (input.taskRef && !task)
        throw new BadRequestException('The selected weekly task is unavailable.');
      const at = this.clock.now();
      const row = await this.repository.insert(
        {
          sessionId: input.sessionId,
          mode: input.mode,
          targetSeconds: input.targetSeconds,
          taskRef: input.taskRef,
          taskTitle: task?.title ?? null,
          kind: input.kind,
          state: FocusState.Running,
          activeSlot: 'workspace',
          startedAt: at,
          endedAt: null,
          focusedSeconds: 0,
          completionType: null,
          appliedAt: null,
          appliedMinutes: 0,
          confirmedMilliseconds: 0,
          intervalStartedAt: at,
          lastHeartbeatAt: at,
          leaseUntil: new Date(at.getTime() + LEASE_MS),
          activityUntil: new Date(at.getTime() + activityWindow(input)),
          ownerId: input.ownerId,
          ownerToken: randomUUID(),
          heartbeatSequence: 0,
          editVersion: randomUUID(),
          recovered: false,
        },
        s,
      );
      return sessionView(row, at);
    });
  }
  command(
    id: string,
    action: 'pause' | 'resume' | 'stop' | 'claim' | 'reconcile',
    version?: string,
    ownerId?: string,
  ) {
    return applicationWrite(this.connection, async (s) => {
      const row = await this.record(id, s);
      const now = new Date(
        Math.max(
          this.clock.now().getTime(),
          row.lastHeartbeatAt?.getTime() ?? row.startedAt.getTime(),
        ),
      );
      if (row.state === FocusState.Stopped) {
        if (action === 'stop') return sessionView(row, now);
        throw new ConflictException('A stopped session cannot resume or accept activity.');
      }
      if (action === 'pause' && row.state === FocusState.Paused) return sessionView(row, now);
      assertEditVersion(row, version);
      const stale = expired(row, now),
        milliseconds = measuredMilliseconds(row, now);
      if (action === 'reconcile' && !stale) return sessionView(row, now);
      if (action === 'claim' && (stale || row.state !== FocusState.Running))
        throw new ConflictException(
          'The owner lease expired. Reload and explicitly resume the paused timer.',
        );
      if ((action === 'resume' || action === 'claim') && !ownerId)
        throw new BadRequestException('A tab identity is required.');
      if (action === 'resume' && row.state === FocusState.Running && !stale)
        throw new ConflictException('This timer is already running.');
      const running = action === 'resume' || action === 'claim';
      const stopped = action === 'stop';
      const fields = {
        state: stopped ? FocusState.Stopped : running ? FocusState.Running : FocusState.Paused,
        confirmedMilliseconds: milliseconds,
        focusedSeconds: Math.floor(milliseconds / 1000),
        intervalStartedAt: running ? now : null,
        lastHeartbeatAt: running || !stale ? now : row.lastHeartbeatAt,
        leaseUntil: running ? new Date(now.getTime() + LEASE_MS) : null,
        // A leader handoff is not evidence of fresh user activity.
        activityUntil: running
          ? action === 'claim'
            ? row.activityUntil
            : new Date(now.getTime() + activityWindow(row))
          : null,
        ownerId: running ? ownerId : null,
        ownerToken: running ? randomUUID() : null,
        heartbeatSequence: 0,
        recovered: running ? false : stale || !!row.recovered,
        endedAt: stopped ? now : null,
        completionType: stopped
          ? row.mode === FocusMode.Countdown && milliseconds === row.targetSeconds! * 1000
            ? FocusCompletion.TargetReached
            : FocusCompletion.StoppedEarly
          : null,
      };
      const saved = await this.repository.updateLifecycle(row, fields, s, stopped);
      if (!saved) throw new ConflictException('The timer changed. Reload before trying again.');
      return sessionView(saved, now);
    });
  }
  heartbeat(id: string, input: FocusHeartbeatDto) {
    return applicationWrite(this.connection, async (s) => {
      const row = await this.record(id, s);
      const now = new Date(
        Math.max(
          this.clock.now().getTime(),
          row.lastHeartbeatAt?.getTime() ?? row.startedAt.getTime(),
        ),
      );
      if (
        row.state !== FocusState.Running ||
        expired(row, now) ||
        row.ownerId !== input.ownerId ||
        row.ownerToken !== input.ownerToken ||
        input.sequence !== (row.heartbeatSequence ?? 0) + 1
      )
        throw new ConflictException(
          'Timer activity is stale. Reload; an expired session must be explicitly resumed.',
        );
      const milliseconds = measuredMilliseconds(row, now);
      if (milliseconds >= (row.targetSeconds ?? 604800) * 1000) {
        const stopped = await this.repository.updateLifecycle(
          row,
          {
            state: FocusState.Stopped,
            confirmedMilliseconds: milliseconds,
            focusedSeconds: Math.floor(milliseconds / 1000),
            endedAt: now,
            lastHeartbeatAt: now,
            intervalStartedAt: null,
            leaseUntil: null,
            activityUntil: null,
            ownerId: null,
            ownerToken: null,
            heartbeatSequence: 0,
            completionType:
              row.mode === FocusMode.Countdown
                ? FocusCompletion.TargetReached
                : FocusCompletion.StoppedEarly,
          },
          s,
          true,
        );
        if (!stopped) throw new ConflictException('The timer changed. Reload before trying again.');
        return sessionView(stopped, now);
      }
      const saved = await this.repository.heartbeat(
        id,
        {
          confirmedMilliseconds: milliseconds,
          focusedSeconds: Math.floor(milliseconds / 1000),
          intervalStartedAt: now,
          lastHeartbeatAt: now,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          heartbeatSequence: input.sequence,
          activityUntil: input.activity
            ? new Date(now.getTime() + activityWindow(row))
            : row.activityUntil,
        },
        s,
      );
      if (!saved) throw new ConflictException('Timer activity could not be confirmed.');
      return sessionView(saved, now);
    });
  }
}
