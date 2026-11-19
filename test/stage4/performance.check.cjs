// Deterministic synthetic records, verified empty UUID database, private API, owned cleanup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Types } = require('mongoose');
const { isolated } = require('../safety/isolated.cjs');
const baselineFile = path.join(__dirname, 'performance-baseline.json');
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const id = (family, n) =>
  new Types.ObjectId((family + n.toString(16).padStart(20, '0')).padStart(24, '0'));
const stamp = new Date('2026-11-18T12:00:00Z');
async function fixture(connection) {
  const plans = Array.from({ length: 156 }, (_, i) => {
    const at = new Date(Date.parse('2024-01-07T12:00:00Z') + i * 7 * 86400000),
      weekId = at.toISOString().slice(0, 10);
    return {
      weekId,
      title: 'Synthetic week ' + i,
      tasks: Array.from({ length: 20 }, (_, j) => ({
        id: 'task-' + j,
        title: 'Synthetic task ' + j,
        date: weekId,
        status: j % 2 ? 'pending' : 'completed',
      })),
    };
  });
  await connection.collection('weekly_plans').insertMany(plans);
  const goals = Array.from({ length: 120 }, (_, i) => ({
    _id: id('3', i),
    title: 'Synthetic goal ' + i,
    status: i % 3 ? 'active' : 'completed',
    completedAt: i % 3 ? null : stamp,
  }));
  await connection.collection('goals').insertMany(goals);
  const levels = await connection
    .collection('roadmap_levels')
    .find()
    .sort({ levelNumber: 1 })
    .toArray();
  const checkpoint = levels[0].checkpoints[0];
  checkpoint.checkpointIdentity = '11111111-1111-4111-8111-111111111111';
  await connection
    .collection('roadmap_levels')
    .updateOne({ _id: levels[0]._id }, { $set: { checkpoints: levels[0].checkpoints } });
  const categories = Array.from({ length: 5 }, (_, i) => ({
    _id: id('1', i),
    name: 'Synthetic category ' + i,
    description: '',
    icon: 'book',
    color: 'purple',
    sortOrder: i,
    archivedAt: i === 4 ? stamp : null,
    createdAt: stamp,
    updatedAt: stamp,
  }));
  await connection.collection('skill_categories').insertMany(categories);
  const links = (i) => [
    {
      sourceType: 'weekly_task',
      sourceId: plans[i % plans.length].weekId + ':task-1',
      targetLevel: 2,
    },
    {
      sourceType: 'weekly_task',
      sourceId: plans[(i + 1) % plans.length].weekId + ':task-0',
      targetLevel: 2,
    },
    {
      sourceType: 'research_goal',
      sourceId: goals[i % goals.length]._id.toString(),
      targetLevel: null,
    },
    {
      sourceType: 'roadmap_checkpoint',
      sourceId: '0:' + checkpoint.id,
      targetLevel: 2,
      ...(i % 10 ? { checkpointIdentity: checkpoint.checkpointIdentity } : {}),
    },
    { sourceType: 'weekly_task', sourceId: '2020-01-05:missing', targetLevel: null },
  ];
  const skills = Array.from({ length: 200 }, (_, i) => ({
    _id: id('2', i),
    categoryId: categories[i % 5]._id.toString(),
    name: 'Synthetic skill ' + i,
    description: '',
    proficiency: i % 5,
    prerequisiteIds: i ? [id('2', i - 1).toString()] : [],
    associations: links(i),
    sortOrder: i,
    archivedAt: i % 9 === 0 ? stamp : null,
    evidence: Array.from({ length: 30 }, (_, j) => ({
      id: 'evidence-' + j,
      title: 'Evidence ' + j,
      type: 'note',
      description: 'e'.repeat(1000),
      url: null,
      createdAt: stamp,
      updatedAt: stamp,
    })),
    proficiencyHistory: Array.from({ length: 20 }, (_, j) => ({
      id: 'history-' + j,
      fromLevel: j % 4,
      toLevel: (j % 4) + 1,
      changedAt: new Date(stamp.getTime() - (i * 20 + j) * 60000),
      justification: 'h'.repeat(100),
    })),
    createdAt: stamp,
    updatedAt: stamp,
  }));
  await connection.collection('research_skills').insertMany(skills);
  const supervisor = {
    _id: id('4', 0),
    name: 'Synthetic supervisor',
    role: 'primary',
    institution: '',
    email: '',
    notes: '',
    archivedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await connection.collection('supervisors').insertOne(supervisor);
  const meetings = Array.from({ length: 500 }, (_, i) => ({
    _id: id('5', i),
    title: 'Synthetic meeting ' + i,
    supervisorIds: [supervisor._id.toString()],
    scheduledAt: new Date(stamp.getTime() + (i - 400) * 86400000),
    status: i % 3 ? 'scheduled' : 'completed',
    type: 'online',
    location: '',
    plannedDurationMinutes: null,
    archivedAt: i % 8 === 0 ? stamp : null,
    notes: { agenda: 'n'.repeat(1000), discussion: 'n'.repeat(1000), feedback: '', decisions: '' },
    documents: [],
    goalIds: [goals[i % 120]._id.toString()],
    checkpointRefs: [
      {
        levelNumber: 0,
        checkpointId: checkpoint.id,
        ...(i % 10 ? { checkpointIdentity: checkpoint.checkpointIdentity } : {}),
      },
    ],
    actions: Array.from({ length: 5 }, (_, j) => ({
      id: 'action-' + i + '-' + j,
      title: 'Synthetic action ' + j,
      description: 'd'.repeat(200),
      phase: j % 2 ? 'post_meeting' : 'pre_meeting',
      status: ['pending', 'in_progress', 'completed'][(i + j) % 3],
      dueDate:
        j === 4 ? null : new Date(stamp.getTime() + (j - 1) * 86400000).toISOString().slice(0, 10),
      linkedTaskIds: [plans[i % 156].weekId + ':task-' + j],
      createdAt: stamp,
      updatedAt: stamp,
    })),
    createdAt: stamp,
    updatedAt: stamp,
  }));
  await connection.collection('supervisor_meetings').insertMany(meetings);
  const focus = Array.from({ length: 8000 }, (_, i) => ({
    sessionId: '22222222-2222-4222-8222-' + i.toString(16).padStart(12, '0'),
    endedAt: new Date(Date.parse('2024-01-01T12:00:00Z') + i * 10800000),
    focusedSeconds: 90 + (i % 3600),
    mode: i % 3 ? 'countdown' : 'stopwatch',
    completionType: i % 2 ? 'stopped-early' : 'target-reached',
    taskRef: i % 4 ? null : plans[i % 156].weekId + ':task-1',
    taskTitle: null,
    appliedAt: null,
    appliedMinutes: 0,
  }));
  await connection.collection('focus_sessions').insertMany(focus);
  return {
    plans: plans.length,
    tasks: plans.length * 20,
    skills: skills.length,
    evidence: skills.length * 30,
    meetings: meetings.length,
    actions: meetings.length * 5,
    focus: focus.length,
    selectedSkill: skills[1]._id.toString(),
  };
}
async function run() {
  let own;
  try {
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/phd_quest_stage2_' + randomUUID().replaceAll('-', '');
    uri.searchParams.set('monitorCommands', 'true');
    own = await isolated(uri.toString(), { APP_TIMEZONE: 'UTC' });
    const counts = await fixture(own.connection);
    const load = (file, name) => require('../../dist/' + file)[name];
    own.app.get(load('common/application-clock', 'ApplicationClock')).now = () => stamp;
    const skills = own.app.get(
      load(
        'modules/research-skills/business/services/research-skills.service',
        'ResearchSkillsService',
      ),
    );
    const meetings = own.app.get(
      load('modules/supervisor-meetings/business/services/meetings.service', 'MeetingsService'),
    );
    const focus = own.app.get(
      load(
        'modules/focus-sessions/business/services/focus-sessions.service',
        'FocusSessionsService',
      ),
    );
    const client = own.connection.getClient();
    client.monitorCommands = true;
    let commands = [],
      materialized = 0,
      bytes = 0;
    client.on('commandStarted', (event) => {
      if (['find', 'aggregate'].includes(event.commandName)) commands.push(event.command);
    });
    client.on('commandSucceeded', (event) => {
      if (['find', 'aggregate', 'getMore'].includes(event.commandName)) {
        const rows = event.reply.cursor?.firstBatch ?? event.reply.cursor?.nextBatch ?? [];
        materialized += rows.length;
        bytes += Buffer.byteLength(JSON.stringify(rows));
      }
    });
    const cases = {
      skillDetail: () => skills.detail(counts.selectedSkill),
      skillSummary: () => skills.summary(),
      meetingActions: () => meetings.actions({ phase: 'pre_meeting', due: 'overdue' }),
      meetingSummary: () => meetings.summary(),
      focusSummary: () => focus.summary(),
    };
    const report = { fixture: counts, node: process.version, measurements: {} };
    for (const [name, work] of Object.entries(cases)) {
      await work();
      const durations = [];
      let payload;
      for (let i = 0; i < 3; i++) {
        commands = [];
        materialized = 0;
        bytes = 0;
        const start = performance.now();
        payload = await work();
        durations.push(performance.now() - start);
      }
      assert.ok(commands.length > 0, 'Driver command monitoring must be enabled');
      const sampled = { queries: commands.length, materialized, bytes };
      const plans = [];
      for (const command of commands) {
        const body = command.find
          ? {
              find: command.find,
              filter: command.filter ?? {},
              ...(command.projection ? { projection: command.projection } : {}),
              ...(command.sort ? { sort: command.sort } : {}),
              ...(command.limit ? { limit: command.limit } : {}),
            }
          : { aggregate: command.aggregate, pipeline: command.pipeline, cursor: {} };
        const explained = await own.connection.db.command({
          explain: body,
          verbosity: 'executionStats',
        });
        const stats =
          explained.executionStats ??
          explained.stages?.find((stage) => stage.$cursor)?.$cursor?.executionStats;
        const plan =
          explained.queryPlanner?.winningPlan ??
          explained.stages?.find((stage) => stage.$cursor)?.$cursor?.queryPlanner?.winningPlan;
        const stages = [
          ...new Set(JSON.stringify(plan ?? {}).match(/IXSCAN|COLLSCAN|FETCH|SORT|GROUP/g) ?? []),
        ];
        plans.push({
          collection: command.find ?? command.aggregate,
          examined: stats?.totalDocsExamined ?? null,
          keys: stats?.totalKeysExamined ?? null,
          stages,
        });
      }
      if (name === 'skillSummary') {
        const tree = await skills.list(),
          active = tree.skills.filter((row) => !row.effectiveArchived);
        const expected = {
          initialized: tree.initialized,
          totalActive: active.length,
          inDevelopment: active.filter((row) => row.proficiency >= 1 && row.proficiency < 4).length,
          advanced: active.filter((row) => row.proficiency === 4).length,
          recentlyImproved: active
            .flatMap((row) =>
              row.proficiencyHistory
                .filter((h) => h.toLevel > h.fromLevel)
                .slice(-1)
                .map((h) => ({
                  id: row.id,
                  name: row.name,
                  proficiency: h.toLevel,
                  at: h.changedAt,
                })),
            )
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .slice(0, 5),
        };
        assert.deepEqual(payload, expected);
      }
      const serialized = canonical(payload);
      report.measurements[name] = {
        queries: sampled.queries,
        materialized: sampled.materialized,
        materializedBytes: sampled.bytes,
        payloadBytes: Buffer.byteLength(serialized),
        responseHash: createHash('sha256').update(serialized).digest('hex'),
        medianMs: Number(durations.sort((a, b) => a - b)[1].toFixed(2)),
        plans,
      };
    }
    if (!process.argv.includes('--baseline')) {
      const all = await meetings.actions({ archived: 'all' });
      for (const status of ['pending', 'in_progress', 'completed', 'open']) {
        const filtered = await meetings.actions({ archived: 'all', status });
        assert.deepEqual(
          filtered.items,
          all.items.filter((row) =>
            status === 'open' ? row.status !== 'completed' : row.status === status,
          ),
          'Embedded action status must never filter parent meeting status',
        );
      }
    }
    if (process.argv.includes('--baseline'))
      fs.writeFileSync(baselineFile, JSON.stringify(report, null, 2) + '\n');
    else {
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      for (const name of Object.keys(cases)) {
        assert.equal(
          report.measurements[name].responseHash,
          baseline.measurements[name].responseHash,
          name + ' response semantics',
        );
        assert.ok(
          report.measurements[name].materialized < baseline.measurements[name].materialized,
          name + ' should materialize fewer records',
        );
      }
    }
    const artifacts = path.resolve(__dirname, '../../.artifacts/stage4');
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(
      path.join(artifacts, process.argv.includes('--baseline') ? 'before.json' : 'after.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    if (own) await own.cleanup();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
