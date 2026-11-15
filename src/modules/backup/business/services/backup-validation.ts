import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { calendarOrdinal } from '../../../../common/calendar';
import { localDateAt } from '../../../../common/application-clock';
import { ImportPlanDto } from '../../../weekly-plans/api/dtos/import-plan.dto';
import { validatePlan } from '../../../weekly-plans/business/services/plan-validation';
import { streaks } from '../../../daily-activity/business/services/streaks';
import { ACHIEVEMENT_DEFINITIONS } from '../../../achievements/business/services/achievement-definitions';
import { BACKUP_SECTIONS, BackupFile, MAX_BACKUP_BYTES } from '../../persistence/interfaces/backup.interface';

// Dynamic JSON is checked field by field before cross-record traversal or schema hydration.
type Row = Record<string, any>;
function invalid(path: string, message: string): never {
  throw new BadRequestException({ code: 'INVALID_BACKUP', message: 'Backup validation failed', details: [{ field: path, message }] });
}
function shape(value: unknown, required: string[], optional: string[], path: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'Expected an object.');
  const row = value as Row;
  if (Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) invalid(path, 'Unexpected fields are not allowed.');
  if (required.some(key => !Object.hasOwn(row, key))) invalid(path, 'Required fields are missing.');
  return row;
}
function text(value: unknown, path: string, max: number, blank = false): string {
  if (typeof value !== 'string' || value.length > max || (!blank && !value.trim())) invalid(path, `Expected ${blank ? 'text' : 'nonblank text'} up to ${max} characters.`);
  return value;
}
function integer(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid(path, `Expected an integer from ${min} to ${max}.`);
  return value;
}
function oneOf(value: unknown, options: unknown[], path: string) { if (!options.includes(value)) invalid(path, 'Unsupported value.'); }
function boolean(value: unknown, path: string) { if (typeof value !== 'boolean') invalid(path, 'Expected true or false.'); }
function list(value: unknown, path: string, max = 100000): any[] {
  if (!Array.isArray(value) || value.length > max) invalid(path, `Expected an array of at most ${max} records.`);
  return value;
}
function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) invalid(path, 'Expected a stable lowercase record ID.');
  return value;
}
function date(value: unknown, path: string) { if (typeof value !== 'string' || calendarOrdinal(value) === null) invalid(path, 'Expected a real YYYY-MM-DD date.'); }
function timestamp(value: unknown, path: string, end: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value || value > end) invalid(path, 'Expected an ISO UTC timestamp no later than the export.');
  return value;
}
function unique(rows: any[], key: (row: any) => unknown, path: string) {
  const keys = rows.map(key); if (new Set(keys).size !== keys.length) invalid(path, 'Duplicate identifiers or unique keys.');
}
function history(row: Row, path: string, end: string) {
  timestamp(row.createdAt, path + '.createdAt', end); timestamp(row.updatedAt, path + '.updatedAt', end);
  if (row.createdAt > row.updatedAt) invalid(path, 'Creation must not follow the last update.');
}
function interval(value: string | null, row: Row, path: string) {
  if (value && (value < row.createdAt || value > row.updatedAt)) invalid(path, 'History falls outside record timestamps.');
}
export function backupDigest(backup: BackupFile) { return createHash('sha256').update(JSON.stringify(backup)).digest('hex'); }

export function validateBackup(input: unknown, timezone: string): BackupFile {
  if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > MAX_BACKUP_BYTES) throw new PayloadTooLargeException('Backup JSON must be at most 20 MiB.');
  const file = shape(input, ['application', 'schemaVersion', 'exportedAt', 'settings', 'counts', 'data'], [], 'backup');
  oneOf(file.application, ['phd-quest'], 'application'); oneOf(file.schemaVersion, [1], 'schemaVersion');
  timestamp(file.exportedAt, 'exportedAt', new Date().toISOString());
  const end = file.exportedAt;
  const settings = shape(file.settings, ['timezone', 'weeklyBaselineMinutes'], [], 'settings');
  if (settings.timezone !== timezone) invalid('settings.timezone', 'Backup timezone must match the configured application timezone before restoration.');
  oneOf(settings.weeklyBaselineMinutes, [360], 'settings.weeklyBaselineMinutes');
  const counts = shape(file.counts, [...BACKUP_SECTIONS], [], 'counts');
  const data = shape(file.data, [...BACKUP_SECTIONS], [], 'data');
  for (const section of BACKUP_SECTIONS) {
    const rows = list(data[section], 'data.' + section); integer(counts[section], 'counts.' + section, 0);
    if (counts[section] !== rows.length) invalid('counts.' + section, 'Count does not match the records.');
    for (const row of rows) id(row?.id, section + '.id');
    unique(rows, row => row.id, section);
  }
  const plans = new Map<string, Row>(), tasks = new Map<string, Row>(), taskSources = new Map<string, string>();
  unique(data.weeklyPlans, row => row.weekId, 'weeklyPlans.weekId');
  for (const row of data.weeklyPlans) {
    shape(row, ['id', 'schemaVersion', 'weekId', 'startDate', 'endDate', 'title', 'objectives', 'tasks', 'createdAt', 'updatedAt'], ['notes'], 'weeklyPlans');
    history(row, 'weeklyPlans', end); text(row.title, 'weeklyPlans.title', 160);
    if (row.notes !== undefined) text(row.notes, 'weeklyPlans.notes', 5000, true);
    list(row.objectives, 'weeklyPlans.objectives', 20).forEach(value => text(value, 'weeklyPlans.objectives', 300));
    const imported = { ...row }; delete imported.id; delete imported.createdAt; delete imported.updatedAt;
    imported.tasks = list(row.tasks, 'weeklyPlans.tasks', 200).map(task => {
      shape(task, ['id', 'date', 'title', 'estimatedMinutes', 'xpReward', 'priority', 'isOptional', 'deliverable', 'actualMinutes', 'status', 'completedAt', 'firstCompletedAt'], ['description'], 'tasks');
      text(task.title, 'tasks.title', 160); text(task.deliverable, 'tasks.deliverable', 500);
      if (task.description !== undefined) text(task.description, 'tasks.description', 2000, true);
      integer(task.actualMinutes, 'tasks.actualMinutes', 0, 1440); oneOf(task.status, ['pending', 'completed'], 'tasks.status');
      const first = timestamp(task.firstCompletedAt, 'tasks.firstCompletedAt', end, true), completed = timestamp(task.completedAt, 'tasks.completedAt', end, true);
      interval(first, row, 'tasks.firstCompletedAt'); interval(completed, row, 'tasks.completedAt');
      if ((task.status === 'completed') !== (completed !== null) || (completed && (!first || first > completed)) || (!first && task.actualMinutes !== 0)) invalid('tasks', 'Completion state, first completion and recorded time are inconsistent.');
      const source = row.weekId + ':' + task.id;
      tasks.set(source, task); taskSources.set(source, row.id);
      const { actualMinutes, status, completedAt, firstCompletedAt, ...fields } = task; return fields;
    });
    const dto = plainToInstance(ImportPlanDto, imported);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) invalid('weeklyPlans', 'Plan fields do not match the weekly-plan contract.');
    validatePlan(dto); plans.set(row.id, row);
  }
  unique(data.xpTransactions, row => row.sourceType + ':' + row.sourceId, 'xpTransactions.source');
  const rewards = new Map<string, Row>();
  for (const row of data.xpTransactions) {
    shape(row, ['id', 'sourceType', 'sourceId', 'amount', 'awardedAt', 'description', 'metadata'], [], 'xpTransactions');
    oneOf(row.sourceType, ['task_completion'], 'xpTransactions.sourceType'); text(row.sourceId, 'xpTransactions.sourceId', 100); integer(row.amount, 'xpTransactions.amount', 1, 1000);
    timestamp(row.awardedAt, 'xpTransactions.awardedAt', end); text(row.description, 'xpTransactions.description', 1000);
    const meta = shape(row.metadata, ['planId', 'weekId', 'taskId'], [], 'xpTransactions.metadata');
    const plan = plans.get(meta.planId), task = tasks.get(row.sourceId);
    if (!plan || !task || taskSources.get(row.sourceId) !== meta.planId || plan.weekId !== meta.weekId || row.sourceId !== meta.weekId + ':' + meta.taskId || row.amount !== task.xpReward || row.awardedAt !== task.firstCompletedAt) invalid('xpTransactions', 'Reward must match its plan, task, configured reward and first completion.');
    rewards.set(row.sourceId, row);
  }
  for (const [source, task] of tasks) if (task.firstCompletedAt && task.xpReward > 0 && !rewards.has(source)) invalid('xpTransactions', 'A completed rewarded task is missing its immutable XP transaction.');
  const events: Row[] = [], bySource = new Map<string, Row[]>();
  unique(data.dailyActivity, row => row.date, 'dailyActivity.date');
  for (const row of data.dailyActivity) {
    shape(row, ['id', 'date', 'taskCompletionCount', 'firstActivityAt', 'lastActivityAt', 'events'], [], 'dailyActivity');
    date(row.date, 'dailyActivity.date'); integer(row.taskCompletionCount, 'dailyActivity.taskCompletionCount', 1);
    timestamp(row.firstActivityAt, 'dailyActivity.firstActivityAt', end); timestamp(row.lastActivityAt, 'dailyActivity.lastActivityAt', end);
    const dayEvents = list(row.events, 'dailyActivity.events');
    if (dayEvents.length !== row.taskCompletionCount) invalid('dailyActivity', 'Activity count must match completion events.');
    for (const event of dayEvents) {
      shape(event, ['eventId', 'sourceId', 'planId', 'taskId', 'occurredAt'], [], 'dailyActivity.events');
      text(event.eventId, 'events.eventId', 100); text(event.sourceId, 'events.sourceId', 100); text(event.taskId, 'events.taskId', 64);
      timestamp(event.occurredAt, 'events.occurredAt', end);
      const task = tasks.get(event.sourceId), plan = plans.get(event.planId);
      if (!task || !plan || taskSources.get(event.sourceId) !== event.planId || event.sourceId !== plan.weekId + ':' + event.taskId || !task.firstCompletedAt || event.occurredAt < task.firstCompletedAt || event.occurredAt > plan.updatedAt || localDateAt(new Date(event.occurredAt), timezone) !== row.date) invalid('dailyActivity.events', 'Completion event references or local calendar day are inconsistent.');
      events.push(event); const group = bySource.get(event.sourceId) ?? []; group.push(event); bySource.set(event.sourceId, group);
    }
    const times = dayEvents.map(e => e.occurredAt).sort();
    if (row.firstActivityAt !== times[0] || row.lastActivityAt !== times[times.length - 1]) invalid('dailyActivity', 'Activity bounds must match the saved events.');
  }
  unique(events, row => row.eventId, 'dailyActivity.events.eventId');
  for (const [source, task] of tasks) {
    const times = (bySource.get(source) ?? []).map(e => e.occurredAt).sort();
    if (task.firstCompletedAt && (times[0] !== task.firstCompletedAt || (task.status === 'completed' && times[times.length - 1] !== task.completedAt))) invalid('tasks', 'Task completion timestamps must match immutable activity history.');
  }
  if (![12, 13].includes(data.roadmapLevels.length)) invalid('roadmapLevels', 'Twelve research chapters, optionally preceded by Preparation Camp, are required.');
  unique(data.roadmapLevels, row => row.levelNumber, 'roadmapLevels.levelNumber');
  const levels = [...data.roadmapLevels].sort((a, b) => a.levelNumber - b.levelNumber);
  const hasCamp = levels.length === 13;
  const preparationPending = hasCamp && levels[0].status === 'current';
  let currentSeen = false;
  for (const [index, row] of levels.entries()) {
    shape(row, ['id', 'levelNumber', 'year', 'title', 'description', 'objectives', 'checkpoints', 'status', 'completedAt', 'createdAt', 'updatedAt'], [], 'roadmapLevels');
    const number = index + (hasCamp ? 0 : 1);
    if (row.levelNumber !== number || row.year !== (number === 0 ? null : Math.floor((number - 1) / 4) + 1)) invalid('roadmapLevels', 'Fixed order and three-year structure are required.');
    text(row.title, 'roadmapLevels.title', 160); text(row.description, 'roadmapLevels.description', 3000); history(row, 'roadmapLevels', end);
    list(row.objectives, 'roadmapLevels.objectives', 20).forEach(v => text(v, 'roadmapLevels.objectives', 300));
    const checkpoints = list(row.checkpoints, 'roadmapLevels.checkpoints', 100); unique(checkpoints, c => c.id, 'checkpoints.id');
    if (!checkpoints.some(c => c.mandatory === true)) invalid('checkpoints', 'A chapter must contain a mandatory checkpoint.');
    oneOf(row.status, ['current', 'locked', 'completed'], 'roadmapLevels.status');
    timestamp(row.completedAt, 'roadmapLevels.completedAt', end, true); interval(row.completedAt, row, 'roadmapLevels.completedAt');
    if (number === 0) {
      if (row.status === 'locked' || (row.status === 'completed') !== !!row.completedAt) invalid('roadmapLevels', 'Preparation Camp is independently current or completed.');
    } else if (row.status === 'completed') { if (currentSeen || !row.completedAt) invalid('roadmapLevels', 'Completed chapters must form a prefix.'); }
    else { if (row.completedAt || row.status !== (currentSeen ? 'locked' : 'current') && !(preparationPending && !currentSeen && row.status === 'locked')) invalid('roadmapLevels', 'Only the next uncompleted chapter may be current.'); currentSeen = true; }
    for (const checkpoint of checkpoints) {
      shape(checkpoint, ['id', 'title', 'mandatory', 'completed', 'validatedAt', 'firstValidatedAt', 'evidence'], ['description','goalIds'], 'checkpoints');
      if(checkpoint.goalIds!==undefined){const refs=list(checkpoint.goalIds,'checkpoints.goalIds',100);unique(refs,value=>value,'checkpoints.goalIds');for(const ref of refs){id(ref,'checkpoints.goalIds');if(!data.goals.some((goal:Row)=>goal.id===ref))invalid('checkpoints.goalIds','Linked goal is missing.');}}
      text(checkpoint.id, 'checkpoints.id', 100); if (!/^[a-z0-9][a-z0-9_-]*$/.test(checkpoint.id)) invalid('checkpoints.id', 'Use a stable checkpoint identifier.');
      text(checkpoint.title, 'checkpoints.title', 300); if (checkpoint.description !== undefined) text(checkpoint.description, 'checkpoints.description', 3000, true);
      text(checkpoint.evidence, 'checkpoints.evidence', 2000, true); boolean(checkpoint.completed, 'checkpoints.completed'); boolean(checkpoint.mandatory, 'checkpoints.mandatory');
      const first = timestamp(checkpoint.firstValidatedAt, 'checkpoints.firstValidatedAt', end, true), validated = timestamp(checkpoint.validatedAt, 'checkpoints.validatedAt', end, true);
      interval(first, row, 'checkpoints.firstValidatedAt'); interval(validated, row, 'checkpoints.validatedAt');
      if (checkpoint.completed !== !!validated || (validated && (!first || first > validated)) || (row.status === 'locked' && first && !preparationPending) || (row.status === 'completed' && checkpoint.mandatory && !checkpoint.completed) || (row.completedAt && validated && validated > row.completedAt)) invalid('checkpoints', 'Checkpoint history conflicts with research progression.');
    }
    if (number > 1 && row.status === 'completed' && row.completedAt < levels[index - 1].completedAt) invalid('roadmapLevels', 'Research completion dates must follow chapter order.');
  }
  for (const row of data.goals) {
    shape(row, ['id', 'title', 'description', 'type', 'status', 'targetDate', 'relatedWeekId', 'relatedRoadmapLevel', 'completedAt', 'firstCompletedAt', 'createdAt', 'updatedAt'], ['linkedTaskIds'], 'goals');
    if(row.linkedTaskIds!==undefined){const refs=list(row.linkedTaskIds,'goals.linkedTaskIds',200);unique(refs,value=>value,'goals.linkedTaskIds');for(const ref of refs){if(typeof ref!=='string'||!tasks.has(ref))invalid('goals.linkedTaskIds','Linked task must exist using its full weekId:taskId identity.');}}
    text(row.title, 'goals.title', 160); text(row.description, 'goals.description', 2000, true); oneOf(row.type, ['weekly', 'monthly', 'research'], 'goals.type'); oneOf(row.status, ['active', 'completed', 'archived'], 'goals.status'); history(row, 'goals', end);
    if (row.targetDate !== null) date(row.targetDate, 'goals.targetDate');
    if (row.relatedWeekId !== null && !data.weeklyPlans.some((p: Row) => p.weekId === row.relatedWeekId)) invalid('goals.relatedWeekId', 'Related weekly plan is missing.');
    if (row.relatedRoadmapLevel !== null) {
      integer(row.relatedRoadmapLevel, 'goals.relatedRoadmapLevel', 0, 12);
      if (!levels.some(level => level.levelNumber === row.relatedRoadmapLevel)) invalid('goals.relatedRoadmapLevel', 'Related roadmap level is missing.');
    }
    const first = timestamp(row.firstCompletedAt, 'goals.firstCompletedAt', end, true), completed = timestamp(row.completedAt, 'goals.completedAt', end, true);
    interval(first, row, 'goals.firstCompletedAt'); interval(completed, row, 'goals.completedAt');
    if ((row.status === 'active' && completed) || (row.status === 'completed' && !completed) || (completed && (!first || first > completed))) invalid('goals', 'Goal completion history is inconsistent.');
  }
  if (data.achievements.length !== ACHIEVEMENT_DEFINITIONS.length) invalid('achievements', 'All supported achievement definitions are required.');
  unique(data.achievements, row => row.code, 'achievements.code');
  for (const row of data.achievements) {
    shape(row, ['id', 'code', 'title', 'description', 'icon', 'category', 'unlockedAt', 'createdAt', 'updatedAt'], [], 'achievements');
    const definition = ACHIEVEMENT_DEFINITIONS.find(d => d.code === row.code);
    if (!definition || Object.entries(definition).some(([key, value]) => row[key] !== value)) invalid('achievements', 'Unknown or altered achievement definition.');
    history(row, 'achievements', end); timestamp(row.unlockedAt, 'achievements.unlockedAt', end, true); interval(row.unlockedAt, row, 'achievements.unlockedAt');
    if (!row.unlockedAt) continue;
    const at = row.unlockedAt, eligibleEvents = events.filter(e => e.occurredAt <= at);
    const conditions: Record<string, boolean> = {
      first_task: eligibleEvents.length > 0,
      ten_tasks: new Set(eligibleEvents.map(e => e.sourceId)).size >= 10,
      hundred_xp: data.xpTransactions.filter((r: Row) => r.awardedAt <= at).reduce((sum: number, r: Row) => sum + r.amount, 0) >= 100,
      seven_day_streak: streaks(eligibleEvents.map(e => localDateAt(new Date(e.occurredAt), timezone)), localDateAt(new Date(at), timezone)).longestStreak >= 7,
      first_plan: data.weeklyPlans.some((p: Row) => p.createdAt <= at),
      // Replacement creates a new map after earlier unlocks. The unlock record remains historical evidence.
      first_checkpoint: levels.filter(l => l.levelNumber > 0).every(l => l.createdAt >= at) || levels.filter(l => l.levelNumber > 0).some(l => l.checkpoints.some((c: Row) => c.firstValidatedAt && c.firstValidatedAt <= at)),
      first_level: levels.filter(l => l.levelNumber > 0).every(l => l.createdAt >= at) || levels.filter(l => l.levelNumber > 0).some(l => l.completedAt && l.completedAt <= at),
      first_goal: data.goals.some((g: Row) => g.firstCompletedAt && g.firstCompletedAt <= at),
    };
    if (!conditions[row.code]) invalid('achievements.' + row.code, 'Unlocked achievement is missing authoritative historical evidence.');
  }
  return file as BackupFile;
}
