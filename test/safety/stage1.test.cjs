const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  { spawnSync } = require('node:child_process');
const { target, isolated } = require('./isolated.cjs');
const uri = () => {
  const value = new URL(process.env.MONGODB_URI);
  value.pathname = '/phd_quest_stage1_' + randomUUID().replaceAll('-', '');
  return value.toString();
};
const headers = (version) => ({
  'content-type': 'application/json',
  ...(version ? { 'if-match': JSON.stringify(version) } : {}),
});
test('smoke isolation refuses unsafe entry points before connecting', () => {
  for (const [args, env, pattern] of [
    [[], {}, /Refusing live smoke/],
    [['--isolated'], { SMOKE_MONGODB_URI: 'mongodb://127.0.0.1/phd_quest' }, /unverified database/],
    [
      ['--isolated'],
      {
        SMOKE_MONGODB_URI: 'mongodb://127.0.0.1/phd_quest_smoke_' + 'a'.repeat(32),
        API_BASE_URL: 'http://localhost:3000/api',
      },
      /External API_BASE_URL/,
    ],
  ]) {
    const r = spawnSync(process.execPath, ['test/plans/api.smoke.cjs', ...args], {
      encoding: 'utf8',
      env: { ...process.env, SMOKE_MONGODB_URI: '', API_BASE_URL: '', ...env },
      timeout: 20000,
    });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, pattern);
  }
  for (const value of [
    'mongodb://localhost/phd_quest',
    'mongodb://localhost/test',
    'mongodb://localhost/phd_quest_stage1_short',
  ])
    assert.throws(() => target(value));
});
test('Stage 1: isolated concurrency, browser write boundary and atomic restore', async (t) => {
  let own;
  try {
    const address = uri();
    own = await isolated(address);
    const { app, connection, base } = own;
    const Backup =
        require('../../dist/modules/backup/business/services/backup.service').BackupService,
      Repo =
        require('../../dist/modules/backup/persistence/repositories/backup.repository').BackupRepository,
      backup = app.get(Backup);
    const revision = async () =>
      (await connection.collection('_application_control').findOne({ _id: 'writes' }))?.revision ??
      0;
    async function call(path, method = 'GET', body, version, status = 200) {
      const response = await fetch(base + path, {
        method,
        headers: headers(version),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data));
      return data;
    }
    let category, skill, other, profile, meeting;
    await t.test(
      'nonempty target is refused and unrelated owned records survive refusal',
      async () => {
        await assert.rejects(isolated(address), /must be empty/);
        assert.equal(await connection.collection('_test_owner').countDocuments(), 1);
      },
    );
    await t.test(
      'trusted-origin and originless JSON creates; GET and DTO errors still work',
      async () => {
        const response = await fetch(base + '/supervisors', {
          method: 'POST',
          headers: { ...headers(), origin: 'http://localhost:4200' },
          body: JSON.stringify({ name: 'Trusted supervisor' }),
        });
        assert.equal(response.status, 201);
        profile = await response.json();
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
        category = await call(
          '/research-skills/categories',
          'POST',
          { name: 'Owned safety category' },
          undefined,
          201,
        );
        skill = await call(
          '/research-skills',
          'POST',
          { name: 'Owned research skill', categoryId: category.id },
          undefined,
          201,
        );
        other = await call(
          '/research-skills',
          'POST',
          { name: 'Unrelated skill', categoryId: category.id },
          undefined,
          201,
        );
        meeting = await call(
          '/supervisor-meetings',
          'POST',
          {
            title: 'Owned discussion',
            scheduledAt: '2026-12-01T10:00:00Z',
            supervisorIds: [profile.id],
          },
          undefined,
          201,
        );
        assert.equal((await call('/research-skills/' + skill.id)).editVersion, skill.editVersion);
        await call('/supervisors', 'POST', { name: 'Invalid', unknown: true }, undefined, 400);
      },
    );
    await t.test(
      'external, null, malformed and prefix-lookalike origins never reach writers',
      async () => {
        const before = (await backup.export()).data,
          rev = await revision();
        for (const origin of [
          'https://untrusted.example',
          'null',
          'not an origin',
          'http://localhost:4200/',
          'http://localhost:4200.evil.example',
          'http://localhost:4200, https://evil.example',
        ]) {
          for (const [path, method, body] of [
            ['/supervisors', 'POST', { name: 'Forbidden' }],
            ['/goals', 'POST', { title: 'Forbidden', type: 'research' }],
            ['/research-skills/initialize', 'POST', {}],
            ['/supervisor-meetings/' + meeting.id, 'PATCH', { title: 'Forbidden' }],
            ['/anything', 'PUT', {}],
            ['/anything', 'DELETE', {}],
            ['/anything', 'PROPPATCH', {}],
          ]) {
            const r = await fetch(base + path, {
              method,
              headers: { ...headers(), origin },
              body: JSON.stringify(body),
            });
            assert.equal(r.status, 403);
            assert.equal((await r.json()).code, 'UNTRUSTED_ORIGIN');
          }
        }
        assert.equal(await revision(), rev);
        assert.deepEqual((await backup.export()).data, before);
      },
    );
    await t.test(
      'simple form, plain text, absent content type and cross-site metadata fail closed',
      async () => {
        const rev = await revision(),
          before = (await backup.export()).data;
        for (const extra of [
          { 'content-type': 'application/x-www-form-urlencoded' },
          { 'content-type': 'text/plain' },
          { 'content-type': 'multipart/form-data; boundary=owned' },
          {},
        ]) {
          const r = await fetch(base + '/supervisors', {
            method: 'POST',
            headers: extra,
            body: 'name=Forbidden',
          });
          assert.equal(r.status, 415);
        }
        const r = await fetch(base + '/research-skills/initialize', {
          method: 'POST',
          headers: { ...headers(), 'sec-fetch-site': 'cross-site' },
          body: '{}',
        });
        assert.equal(r.status, 403);
        assert.equal(await revision(), rev);
        assert.deepEqual((await backup.export()).data, before);
      },
    );
    await t.test('missing and malformed preconditions are rejected without mutation', async () => {
      const before = (await backup.export()).data,
        rev = await revision();
      await call('/research-skills/' + skill.id, 'PATCH', { name: 'Forbidden' }, undefined, 428);
      const r = await fetch(base + '/supervisors/' + profile.id, {
        method: 'PATCH',
        headers: { ...headers(), 'if-match': '*' },
        body: '{}',
      });
      assert.equal(r.status, 400);
      assert.equal((await r.json()).code, 'INVALID_VERSION');
      assert.equal(await revision(), rev);
      assert.deepEqual((await backup.export()).data, before);
    });
    await t.test(
      'two skill clients cannot overwrite metadata; deliberate fresh save succeeds',
      async () => {
        const stale = skill.editVersion;
        const a = await call('/research-skills/' + skill.id, 'PATCH', { name: 'Client A' }, stale);
        const rev = await revision(),
          b = await call('/research-skills/' + skill.id, 'PATCH', { name: 'Client B' }, stale, 409);
        assert.equal(b.code, 'STALE_RECORD');
        assert.deepEqual(b.details, { recordId: skill.id, currentVersion: a.editVersion });
        assert.equal(await revision(), rev);
        assert.equal((await call('/research-skills/' + skill.id)).name, 'Client A');
        skill = await call(
          '/research-skills/' + skill.id,
          'PATCH',
          { description: 'Deliberate fresh save' },
          a.editVersion,
        );
        other = await call(
          '/research-skills/' + other.id,
          'PATCH',
          { description: 'Unrelated updates do not invalidate skill' },
          other.editVersion,
        );
        skill = await call(
          '/research-skills/' + skill.id,
          'PATCH',
          { sortOrder: 2 },
          skill.editVersion,
        );
      },
    );
    let goalA, goalB;
    await t.test(
      'simultaneous association replacements preserve the winner and reject the loser',
      async () => {
        goalA = await call('/goals', 'POST', { title: 'Goal A', type: 'research' }, undefined, 201);
        goalB = await call('/goals', 'POST', { title: 'Goal B', type: 'research' }, undefined, 201);
        const send = (goal) =>
          fetch(base + '/research-skills/' + skill.id, {
            method: 'PATCH',
            headers: headers(skill.editVersion),
            body: JSON.stringify({
              associations: [{ sourceType: 'research_goal', sourceId: goal.id, targetLevel: 2 }],
            }),
          });
        const responses = await Promise.all([send(goalA), send(goalB)]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const winner = await responses.find((r) => r.status === 200).json();
        const current = await call('/research-skills/' + skill.id);
        assert.deepEqual(
          current.associations.map((a) => a.sourceId),
          winner.associations.map((a) => a.sourceId),
        );
        skill = current;
      },
    );
    await t.test(
      'proficiency stale intent cannot duplicate history; no-op retains token and history',
      async () => {
        const old = skill.editVersion;
        skill = await call(
          '/research-skills/' + skill.id + '/proficiency',
          'PATCH',
          { level: 3, confirm: true },
          old,
        );
        await call(
          '/research-skills/' + skill.id + '/proficiency',
          'PATCH',
          { level: 1, confirm: true },
          old,
          409,
        );
        let current = await call('/research-skills/' + skill.id);
        assert.equal(current.proficiency, 3);
        assert.equal(current.proficiencyHistory.length, 1);
        current = await call(
          '/research-skills/' + skill.id + '/proficiency',
          'PATCH',
          { level: 3, confirm: true },
          skill.editVersion,
        );
        assert.equal(current.editVersion, skill.editVersion);
        assert.equal(current.proficiencyHistory.length, 1);
      },
    );
    await t.test('evidence and category updates require their own aggregate token', async () => {
      const old = skill.editVersion;
      skill = await call(
        '/research-skills/' + skill.id + '/evidence',
        'POST',
        { title: 'Evidence A', type: 'note' },
        old,
        201,
      );
      await call(
        '/research-skills/' + skill.id + '/evidence/' + skill.evidence[0].id,
        'PATCH',
        { title: 'Stale B' },
        old,
        409,
      );
      await call(
        '/research-skills/' + skill.id + '/evidence/' + skill.evidence[0].id,
        'DELETE',
        {},
        old,
        409,
      );
      const prior = category.editVersion;
      category = await call(
        '/research-skills/categories/' + category.id,
        'PATCH',
        { description: 'Category A' },
        prior,
      );
      await call(
        '/research-skills/categories/' + category.id,
        'PATCH',
        { description: 'Category B' },
        prior,
        409,
      );
    });
    await t.test(
      'supervisor profiles use independent versions and preserve winning contact data',
      async () => {
        const old = profile.editVersion;
        profile = await call('/supervisors/' + profile.id, 'PATCH', { notes: 'Supervisor A' }, old);
        await call('/supervisors/' + profile.id, 'PATCH', { notes: 'Supervisor B' }, old, 409);
        assert.equal(
          (await call('/supervisors')).find((s) => s.id === profile.id).notes,
          'Supervisor A',
        );
        meeting = await call(
          '/supervisor-meetings/' + meeting.id,
          'PATCH',
          { location: 'Independent meeting edit' },
          meeting.editVersion,
        );
      },
    );
    await t.test(
      'stale meeting notes, links, statuses and embedded actions cannot overwrite newer work',
      async () => {
        const old = meeting.editVersion;
        meeting = await call(
          '/supervisor-meetings/' + meeting.id,
          'PATCH',
          { notes: { agenda: 'Agenda A', decisions: 'Decision A' }, goalIds: [goalA.id] },
          old,
        );
        for (const [suffix, method, body] of [
          ['', 'PATCH', { notes: { agenda: 'Stale B', decisions: '' }, goalIds: [goalB.id] }],
          ['/status', 'PATCH', { status: 'completed' }],
          ['/actions', 'POST', { title: 'Stale action', phase: 'pre_meeting' }],
          ['/archive', 'PATCH', {}],
        ])
          await call('/supervisor-meetings/' + meeting.id + suffix, method, body, old, 409);
        const first = meeting.editVersion;
        meeting = await call(
          '/supervisor-meetings/' + meeting.id + '/actions',
          'POST',
          { title: 'Action A', phase: 'pre_meeting' },
          first,
          201,
        );
        const action = meeting.actions[0];
        assert.equal(action.meetingVersion, meeting.editVersion);
        await call(
          '/supervisor-meetings/' + meeting.id + '/actions/' + action.id,
          'PATCH',
          { status: 'completed' },
          first,
          409,
        );
        await call(
          '/supervisor-meetings/' + meeting.id + '/actions/' + action.id,
          'DELETE',
          {},
          first,
          409,
        );
        meeting = await call(
          '/supervisor-meetings/' + meeting.id + '/actions/' + action.id,
          'PATCH',
          { status: 'completed' },
          meeting.editVersion,
        );
        assert.equal(meeting.actions[0].status, 'completed');
        assert.equal(meeting.notes.agenda, 'Agenda A');
        assert.equal(meeting.notes.decisions, 'Decision A');
        assert.deepEqual(meeting.goalIds, [goalA.id]);
      },
    );
    await t.test(
      'legacy records without tokens are readable and upgraded atomically on first edit',
      async () => {
        await connection
          .collection('research_skills')
          .updateOne(
            { _id: new (require('mongoose').Types.ObjectId)(other.id) },
            { $unset: { editVersion: '' } },
          );
        const legacy = await call('/research-skills/' + other.id);
        assert.equal(legacy.editVersion, 'legacy:' + other.id);
        other = await call(
          '/research-skills/' + other.id,
          'PATCH',
          { description: 'Legacy upgrade' },
          legacy.editVersion,
        );
        assert.notEqual(other.editVersion, legacy.editVersion);
        await call(
          '/research-skills/' + other.id,
          'PATCH',
          { description: 'Stale legacy' },
          legacy.editVersion,
          409,
        );
      },
    );
    await t.test(
      'v1 backups preserve domain histories, rotate tokens on restore and reject pre-restore drafts',
      async () => {
        const saved = await backup.export(),
          old = skill.editVersion;
        assert.ok(!('editVersion' in saved.data.researchSkills[0]));
        const preview = await backup.preview(saved);
        await backup.restore({ backup: saved, ...preview, confirmation: 'REPLACE ALL DATA' });
        assert.deepEqual((await backup.export()).data, saved.data);
        const current = await call('/research-skills/' + skill.id);
        assert.notEqual(current.editVersion, old);
        await call(
          '/research-skills/' + skill.id,
          'PATCH',
          { name: 'Pre-restore stale draft' },
          old,
          409,
        );
        assert.equal(current.proficiencyHistory.length, 1);
        assert.equal(current.evidence.length, 1);
      },
    );
    await t.test(
      'rollback preserves operational tokens and data; mutation invalidates a backup preview',
      async () => {
        const saved = await backup.export(),
          current = await call('/supervisor-meetings/' + meeting.id),
          preview = await backup.preview(saved),
          repo = app.get(Repo),
          replace = repo.replace.bind(repo);
        repo.replace = async (...args) => {
          await replace(...args);
          throw new Error('Stage 1 rollback probe');
        };
        try {
          await assert.rejects(
            backup.restore({ backup: saved, ...preview, confirmation: 'REPLACE ALL DATA' }),
            /rollback probe/,
          );
        } finally {
          repo.replace = replace;
        }
        assert.deepEqual((await backup.export()).data, saved.data);
        assert.equal(
          (await call('/supervisor-meetings/' + meeting.id)).editVersion,
          current.editVersion,
        );
        const stale = await backup.preview(saved);
        await call(
          '/supervisor-meetings/' + meeting.id,
          'PATCH',
          { location: 'Newer edit' },
          current.editVersion,
        );
        await assert.rejects(
          backup.restore({ backup: saved, ...stale, confirmation: 'REPLACE ALL DATA' }),
          (e) => e.getStatus() === 409,
        );
      },
    );
    await t.test(
      'archived profiles are read-only and stale archive commands conflict',
      async () => {
        const current = (await call('/supervisors')).find((p) => p.id === profile.id);
        const archived = await call(
          '/supervisors/' + profile.id + '/archive',
          'PATCH',
          {},
          current.editVersion,
        );
        await call(
          '/supervisors/' + profile.id,
          'PATCH',
          { notes: 'Forbidden' },
          archived.editVersion,
          409,
        );
        await call(
          '/supervisors/' + profile.id + '/archive',
          'PATCH',
          {},
          current.editVersion,
          409,
        );
      },
    );
  } finally {
    if (own) await own.cleanup();
  }
});
