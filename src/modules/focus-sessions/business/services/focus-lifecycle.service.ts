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
import { measuredMilliseconds, sessionView } from './focus-lifecycle';
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
          leaseUntil: null,
          activityUntil: null,
          ownerId: input.ownerId,
          ownerToken: randomUUID(),
          heartbeatSequence: 0,
          editVersion: randomUUID(),
          recovered: false,
          timerPolicy: 'manual',
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
      const milliseconds = measuredMilliseconds(row, now);
      // Synchronization never changes lifecycle, including legacy records with expired leases.
      if (action === 'reconcile') return sessionView(row, now);
      if (action === 'claim' && row.state !== FocusState.Running)
        throw new ConflictException('Only a running timer can transfer ownership.');
      if ((action === 'resume' || action === 'claim') && !ownerId)
        throw new BadRequestException('A tab identity is required.');
      if (action === 'resume' && row.state === FocusState.Running)
        throw new ConflictException('This timer is already running.');
      const running = action === 'resume' || action === 'claim';
      const stopped = action === 'stop';
      const fields = {
        state: stopped ? FocusState.Stopped : running ? FocusState.Running : FocusState.Paused,
        confirmedMilliseconds: milliseconds,
        focusedSeconds: Math.floor(milliseconds / 1000),
        intervalStartedAt: running ? now : null,
        lastHeartbeatAt: now,
        leaseUntil: null,
        activityUntil: null,
        ownerId: running ? ownerId : null,
        ownerToken: running ? randomUUID() : null,
        heartbeatSequence: 0,
        recovered: running ? false : !!row.recovered,
        timerPolicy: 'manual',
        endedAt: stopped ? now : null,
        completionType: stopped
          ? row.mode === FocusMode.Countdown && milliseconds >= row.targetSeconds! * 1000
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
        row.ownerId !== input.ownerId ||
        row.ownerToken !== input.ownerToken ||
        input.sequence !== (row.heartbeatSequence ?? 0) + 1
      )
        throw new ConflictException(
          'Timer activity is stale. Reload the current session before synchronizing.',
        );
      const milliseconds = measuredMilliseconds(row, now);
      const saved = await this.repository.heartbeat(
        id,
        {
          confirmedMilliseconds: milliseconds,
          focusedSeconds: Math.floor(milliseconds / 1000),
          intervalStartedAt: now,
          lastHeartbeatAt: now,
          leaseUntil: null,
          heartbeatSequence: input.sequence,
          activityUntil: null,
          timerPolicy: 'manual',
        },
        s,
      );
      if (!saved) throw new ConflictException('Timer activity could not be confirmed.');
      return sessionView(saved, now);
    });
  }
}
