const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertRuntime } = require('../../scripts/runtime.cjs');
const { disposableName } = require('../safety/owned-database.cjs');
const { candidates, launchBrowser } = require('../safety/browser.cjs');
test('verification refuses unsupported Node versions instead of masking timezone differences', () => {
  for (const version of ['22.22.3', '24.14.0', '25.0.0'])
    assert.throws(() => assertRuntime(version), /Unsupported Node/);
  assert.doesNotThrow(() => assertRuntime('24.15.0'));
});
test('disposable guards reject real, shared, malformed and dbName-redirected targets before connecting', () => {
  for (const uri of [
    'mongodb://localhost/phd_quest',
    'mongodb://localhost/phd_quest_test',
    'mongodb://localhost/_foundation_validation',
    'https://example.com/phd_quest_stage4_' + 'a'.repeat(32),
    'mongodb://localhost/phd_quest_stage4_' + 'a'.repeat(32) + '?dbName=phd_quest',
  ])
    assert.throws(() => disposableName(uri));
  assert.equal(
    disposableName('mongodb://localhost/phd_quest_stage4_' + 'a'.repeat(32)),
    'phd_quest_stage4_' + 'a'.repeat(32),
  );
});
test('browser executable overrides take priority and platform discovery includes Edge', () => {
  assert.deepEqual(
    candidates({ BROWSER_EXECUTABLE: '/custom/browser', CHROME_PATH: '/old/browser' }, 'linux'),
    ['/custom/browser'],
  );
  assert.ok(candidates({ 'ProgramFiles(x86)': 'C:/Programs' }, 'win32')[0].includes('Microsoft'));
  assert.ok(candidates({}, 'darwin').some((file) => file.includes('Edge')));
});
test('missing explicit browser fails with actionable diagnostics without downloading binaries', async () => {
  const old = process.env.BROWSER_EXECUTABLE;
  process.env.BROWSER_EXECUTABLE = '/definitely-missing-phd-quest-browser';
  try {
    await assert.rejects(launchBrowser(), /BROWSER_EXECUTABLE/);
  } finally {
    if (old === undefined) delete process.env.BROWSER_EXECUTABLE;
    else process.env.BROWSER_EXECUTABLE = old;
  }
});

test('integration entry point refuses missing opt-in, production targets and external APIs before building', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  for (const [overrides, message] of [
    [{ TEST_MONGODB_URI: '' }, /Explicit TEST_MONGODB_URI/],
    [{ TEST_MONGODB_URI: 'mongodb://127.0.0.1:1/phd_quest' }, /must name phd_quest_test/],
    [
      {
        TEST_MONGODB_URI: 'mongodb://127.0.0.1:1/phd_quest_test',
        API_BASE_URL: 'http://localhost:3000/api',
      },
      /external API/,
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify.mjs', 'integration', '--no-build'],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          API_BASE_URL: '',
          PROGRESS_TEST_BASE_URL: '',
          RESEARCH_TEST_BASE_URL: '',
          ...overrides,
        },
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout, /\[verify\] build/);
  }
});
