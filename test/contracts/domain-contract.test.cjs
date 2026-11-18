const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const fixture = require('../../docs/contracts/domain-values.v1.json');
const groups = [
  'research-skills/skill',
  'supervisor-meetings/meeting',
  'goals/goal',
  'focus-sessions/focus',
  'roadmap/roadmap',
];
const enums = Object.assign(
  {},
  ...groups.map((group) => {
    const [feature, file] = group.split('/');
    return require(`../../dist/modules/${feature}/persistence/enums/${file}.enums`);
  }),
  require('../../dist/modules/weekly-plans/persistence/enums/task.enums'),
);
test('domain enums retain exact version-1 wire values and independent repository fixtures agree', () => {
  for (const [name, values] of Object.entries(fixture.enums)) {
    assert.ok(enums[name], name);
    const actual = Object.values(enums[name]).filter((v) => typeof v === typeof values[0]);
    assert.deepEqual(actual, values, name);
  }
  const frontend = path.resolve(
    __dirname,
    '../../../phd-quest-frontend/docs/contracts/domain-values.v1.json',
  );
  if (fs.existsSync(frontend))
    assert.deepEqual(JSON.parse(fs.readFileSync(frontend, 'utf8')), fixture);
});
test('business services do not query exposed persistence models', () => {
  for (const feature of ['research-skills', 'supervisor-meetings']) {
    const directory = path.resolve(
      __dirname,
      '../../src/modules/' + feature + '/business/services',
    );
    for (const file of fs.readdirSync(directory).filter((f) => f.endsWith('.service.ts')))
      assert.doesNotMatch(
        fs.readFileSync(path.join(directory, file), 'utf8'),
        /this\.repository\.(?:skills|categories|state|meetings|supervisors)\./,
        file,
      );
  }
});
module.exports = { fixture };
