import { BadRequestException } from '@nestjs/common';
import { calendarOrdinal } from '../../../../common/calendar';
import { SaveFocusSessionDto } from '../../api/dtos/focus-session.dto';
export function validateFocus(input: SaveFocusSessionDto, now: Date) {
  const start = new Date(input.startedAt), end = new Date(input.endedAt);
  const invalid = typeof input.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.sessionId) || !['target-reached','stopped-early'].includes(input.completionType) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end > now || start > end
    || !Number.isInteger(input.focusedSeconds) || input.focusedSeconds < 1 || input.focusedSeconds > 604800
    || input.focusedSeconds > Math.floor((end.getTime()-start.getTime())/1000)
    || (input.mode === 'countdown' ? !Number.isInteger(input.targetSeconds) || input.targetSeconds! < 60 || input.targetSeconds! > 10800 || input.targetSeconds! % 60 !== 0 || input.focusedSeconds > input.targetSeconds! || (input.completionType === 'target-reached') !== (input.focusedSeconds === input.targetSeconds) : input.mode !== 'stopwatch' || input.targetSeconds !== null || input.completionType !== 'stopped-early')
    || (input.taskRef !== null && (typeof input.taskRef !== 'string' || !/^\d{4}-\d{2}-\d{2}:[a-z0-9][a-z0-9_-]{0,63}$/.test(input.taskRef) || calendarOrdinal(input.taskRef.split(':')[0]) === null || new Date(input.taskRef.split(':')[0]+'T12:00:00Z').getUTCDay() !== 0));
  if (invalid) throw new BadRequestException('Focus session dates, duration, mode or completion type are inconsistent.');
  return { sessionId: input.sessionId, mode: input.mode, targetSeconds: input.targetSeconds,
    startedAt: start, endedAt: end, focusedSeconds: input.focusedSeconds, taskRef: input.taskRef, completionType: input.completionType };
}
