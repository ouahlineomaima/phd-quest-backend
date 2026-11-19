const { reserveDatabase, releaseDatabase } = require('../safety/owned-database.cjs');
// Real browser + real isolated API. No request is sent to the user's application origin.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { randomUUID } = require('node:crypto'),
  mongoose = require('mongoose');
require('reflect-metadata');
const { launchBrowser } = require('../safety/browser.cjs'),
  { NestFactory } = require('@nestjs/core'),
  { Module } = require('@nestjs/common'),
  { ConfigModule, ConfigService } = require('@nestjs/config'),
  { getConnectionToken } = require('@nestjs/mongoose');
const load = (file, name) => require('../../dist/' + file)[name],
  DatabaseModule = load('database/database.module', 'DatabaseModule'),
  BackupModule = load('modules/backup/backup.module', 'BackupModule'),
  DashboardModule = load('modules/dashboard/dashboard.module', 'DashboardModule'),
  HealthModule = load('modules/health/health.module', 'HealthModule'),
  validateEnvironment = load('config/environment', 'validateEnvironment'),
  configureApi = load('common/configure-api', 'configureApi');
const Plans = load(
    'modules/weekly-plans/business/services/weekly-plans.service',
    'WeeklyPlansService',
  ),
  Tasks = load(
    'modules/weekly-plans/business/services/task-progress.service',
    'TaskProgressService',
  ),
  Goals = load('modules/goals/business/services/goals.service', 'GoalsService'),
  Backup = load('modules/backup/business/services/backup.service', 'BackupService');
const name = 'phd_quest_skills_browser_' + randomUUID().replaceAll('-', ''),
  uri = new URL(process.env.MONGODB_URI);
uri.pathname = '/' + name;
const frontend = path.resolve(__dirname, '../../../phd-quest-frontend'),
  assets = path.join(frontend, 'dist/phd-quest/browser'),
  artifacts = path.join(frontend, '.artifacts/skills');
fs.mkdirSync(artifacts, { recursive: true });
let app, server, browser;
let checks = 0;
const pass = (label) => {
  checks++;
  console.log('PASS', label);
};
(async () => {
  try {
    server = http.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const testOrigin = 'http://127.0.0.1:' + server.address().port;
    await reserveDatabase(uri.toString());
    class Owned {}
    Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () =>
              validateEnvironment({
                ...process.env,
                MONGODB_URI: uri.toString(),
                NODE_ENV: 'test',
                APP_TIMEZONE: 'Africa/Casablanca',
              }),
          ],
        }),
        DatabaseModule,
        BackupModule,
        DashboardModule,
        HealthModule,
      ],
    })(Owned);
    app = await NestFactory.create(Owned, { logger: false, bodyParser: false });
    app.get(ConfigService).set('CORS_ORIGINS', testOrigin);
    configureApi(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    assert.equal(app.get(getConnectionToken()).name, name);
    const apiPort = app.getHttpServer().address().port;
    const example = require('../../docs/contracts/weekly-plan.v1.example.json');
    async function plan(weekId, title) {
      const end = new Date(weekId + 'T12:00:00Z');
      end.setUTCDate(end.getUTCDate() + 6);
      return app.get(Plans).confirm({
        ...structuredClone(example),
        title: 'Browser week ' + weekId,
        weekId,
        startDate: weekId,
        endDate: end.toISOString().slice(0, 10),
        tasks: [{ ...example.tasks[0], id: 'evidence', title, date: weekId, xpReward: 10 }],
      });
    }
    const a = await plan('2026-11-15', 'Read evidence A'),
      b = await plan('2026-11-22', 'Read evidence B');
    const researchGoal = await app
      .get(Goals)
      .create({ title: 'Research milestone', type: 'research' });
    server.on('request', (req, res) => {
      if (req.url.startsWith('/api/')) {
        const proxy = http.request(
          {
            hostname: '127.0.0.1',
            port: apiPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (response) => {
            res.writeHead(response.statusCode, response.headers);
            response.pipe(res);
          },
        );
        proxy.on('error', () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(proxy);
        return;
      }
      const relative = decodeURIComponent(req.url.split('?')[0]),
        file = path.resolve(assets, '.' + relative);
      if (!file.startsWith(assets + path.sep) && file !== assets) {
        res.writeHead(403);
        res.end();
        return;
      }
      const target =
        fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(assets, 'index.html');
      const extension = path.extname(target);
      res.setHeader(
        'content-type',
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.ttf': 'font/ttf',
          '.svg': 'image/svg+xml',
        }[extension] ?? 'application/octet-stream',
      );
      fs.createReadStream(target).pipe(res);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await launchBrowser();
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'America/New_York',
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    const dialog = () => page.getByRole('dialog', { includeHidden: false });
    const wait = async () => {
      await page.waitForLoadState('networkidle');
      await page.locator('pq-loading').waitFor({ state: 'hidden' });
    };

    await page.goto(origin + '/skills');
    await page.getByRole('button', { name: 'Initialize Skill Tree', exact: true }).waitFor();
    let apiTree = await (await page.request.get(origin + '/api/research-skills')).json();
    assert.equal(apiTree.initialized, false);
    assert.equal(apiTree.skills.length, 0);
    pass('Empty skills page never initializes automatically');
    await page.getByRole('button', { name: 'Initialize Skill Tree', exact: true }).click();
    await page
      .getByRole('button', { name: 'Initialize Skill Tree', exact: true })
      .waitFor({ state: 'hidden' });
    await page.locator('.skill-node').first().waitFor();
    apiTree = await (await page.request.get(origin + '/api/research-skills')).json();
    assert.equal(apiTree.categories.length, 6);
    assert.equal(apiTree.skills.length, 24);
    pass('Explicit template initialization creates six categories and 24 level-zero skills');
    await page.getByRole('button', { name: 'Manage categories', exact: true }).click();
    await dialog().getByRole('button', { name: 'Add category', exact: true }).click();
    await dialog().getByLabel('Category name', { exact: true }).fill('Specialist methods');
    await dialog().getByLabel('Category sort order', { exact: true }).fill('0');
    await dialog().getByRole('button', { name: 'Save category', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await wait();
    apiTree = await (await page.request.get(origin + '/api/research-skills')).json();
    const custom = apiTree.categories.find((c) => c.name === 'Specialist methods');
    assert.ok(custom);
    pass('Custom category creation and ordering');
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    await dialog().getByLabel('Skill name', { exact: true }).fill('Evaluate evidence');
    await dialog()
      .getByLabel(/^Skill category/)
      .selectOption(custom.id);
    await dialog().getByLabel('Skill sort order', { exact: true }).fill('0');
    await dialog().getByRole('button', { name: 'Save skill', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.locator('.skill-node').filter({ hasText: 'Evaluate evidence' }).waitFor();
    apiTree = await (await page.request.get(origin + '/api/research-skills')).json();
    const skillId = apiTree.skills.find((x) => x.name === 'Evaluate evidence').id;
    async function selectSkill() {
      await page
        .locator('.skill-node')
        .filter({ hasText: 'Evaluate evidence' })
        .locator('.node-select')
        .click();
      await page
        .locator('#skill-details')
        .getByRole('heading', { name: 'Evaluate evidence', exact: true })
        .waitFor();
    }
    await selectSkill();
    await page.getByRole('button', { name: 'Edit skill', exact: true }).click();
    await dialog()
      .getByLabel('Skill description', { exact: true })
      .fill('Assess competing explanations');
    await dialog()
      .getByRole('checkbox', { name: /Academic Search/ })
      .check();
    await dialog().getByRole('button', { name: 'Save skill', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.getByText('Assess competing explanations', { exact: true }).waitFor();
    pass('Custom skill editing, ordering and soft prerequisite connections');
    await page.locator('.node-select').filter({ hasText: 'Academic Search' }).click();
    await page.getByRole('button', { name: 'Edit skill', exact: true }).click();
    await dialog()
      .getByRole('checkbox', { name: /Evaluate evidence/ })
      .check();
    await dialog().getByRole('button', { name: 'Save skill', exact: true }).click();
    await dialog()
      .getByRole('alert')
      .filter({ hasText: /cycles/ })
      .waitFor();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await selectSkill();
    pass('Prerequisite cycle validation displays an actionable error without changing the graph');
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await page.getByLabel('Search skills', { exact: true }).fill('Evaluate evidence');
    await page.locator('.list-row').filter({ hasText: 'Evaluate evidence' }).waitFor();
    await page.getByLabel('Search skills', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Tree view', exact: true }).click();
    pass('Tree/list navigation and search filtering');
    async function proficiency(level, reason) {
      await page.getByRole('button', { name: 'Confirm proficiency', exact: true }).click();
      await dialog()
        .getByLabel(/^Confirmed proficiency level/)
        .selectOption(String(level));
      await dialog().getByLabel('Justification (optional)', { exact: true }).fill(reason);
      await dialog()
        .getByRole('checkbox', {
          name: 'I confirm this proficiency assessment manually.',
          exact: true,
        })
        .check();
      await dialog().getByRole('button', { name: 'Save proficiency', exact: true }).click();
      await dialog().waitFor({ state: 'hidden' });
      await page
        .locator('#skill-details')
        .getByText(new RegExp('Confirmed Level ' + level + ' /'))
        .waitFor();
    }
    await proficiency(3, 'Independent self-assessment');
    await proficiency(1, 'Reassessment after feedback');
    apiTree = await (await page.request.get(origin + '/api/research-skills')).json();
    assert.equal(apiTree.skills.find((x) => x.id === skillId).proficiencyHistory.length, 2);
    pass(
      'Manual skip/decrease proficiency with preserved history despite undeveloped prerequisites',
    );
    await page.getByRole('button', { name: 'Link activity', exact: true }).click();
    await dialog()
      .getByLabel(/^Task week/)
      .selectOption(a.id);
    await dialog()
      .getByLabel(/Read evidence A/)
      .check();
    await dialog()
      .getByLabel(/^Task week/)
      .selectOption(b.id);
    await dialog()
      .getByLabel(/Read evidence B/)
      .check();
    await dialog()
      .getByLabel(/^Optional target proficiency/)
      .selectOption('2');
    await dialog().getByRole('button', { name: 'Save activity links', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.locator('.association').filter({ hasText: 'Read evidence A' }).waitFor();
    pass('Cross-week task associations share an optional target level');
    async function link(type, value, target) {
      await page.getByRole('button', { name: 'Link activity', exact: true }).click();
      await dialog()
        .getByLabel(/^Activity source type/)
        .selectOption(type);
      await dialog()
        .getByLabel(type === 'research_goal' ? /^Research goal/ : /^Roadmap checkpoint/)
        .selectOption(value);
      await dialog()
        .getByLabel(/^Optional target proficiency/)
        .selectOption(target);
      await dialog().getByRole('button', { name: 'Save activity links', exact: true }).click();
      await dialog().waitFor({ state: 'hidden' });
      await wait();
    }
    await link('research_goal', researchGoal.id, '2');
    await link('roadmap_checkpoint', '0:research-environment-ready', '');
    let current = await (await page.request.get(origin + '/api/research-skills/' + skillId)).json();
    assert.equal(current.targeted.find((g) => g.targetLevel === 2).total, 3);
    assert.equal(current.untargeted.find((g) => g.sourceType === 'roadmap_checkpoint').total, 1);
    assert.equal(
      await page
        .locator('.association')
        .filter({ hasText: 'Read evidence A' })
        .getByLabel(/^Target proficiency/)
        .inputValue(),
      '2',
    );
    pass('Mixed-source targeted activities coexist with independent untargeted indicators');
    const linkRow = page.locator('.association').filter({ hasText: 'Read evidence B' });
    const targetSaved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' && r.url().endsWith('/api/research-skills/' + skillId),
    );
    await linkRow.getByLabel(/^Target proficiency/).selectOption('');
    await (await targetSaved).finished();
    await wait();
    current = await (await page.request.get(origin + '/api/research-skills/' + skillId)).json();
    assert.equal(
      current.associations.find((x) => x.sourceId === '2026-11-22:evidence').targetLevel,
      null,
    );
    pass('Each existing association can change between targeted and general development');
    await app.get(Tasks).change(a.id, 'evidence', 'complete', 10);
    await app.get(Goals).transition(researchGoal.id, 'complete');
    await page.getByRole('button', { name: 'Refresh skills', exact: true }).click();
    await page
      .locator('#skill-details')
      .getByText(/Ready to review Level 2/)
      .waitFor();
    current = await (await page.request.get(origin + '/api/research-skills/' + skillId)).json();
    assert.equal(current.proficiency, 1);
    await app.get(Tasks).change(a.id, 'evidence', 'reopen');
    await page.getByRole('button', { name: 'Refresh skills', exact: true }).click();
    await wait();
    current = await (await page.request.get(origin + '/api/research-skills/' + skillId)).json();
    assert.equal(current.targeted.find((g) => g.targetLevel === 2).ready, false);
    assert.equal(current.proficiency, 1);
    pass(
      'Target readiness follows source completion/reopening without changing confirmed proficiency',
    );
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await dialog().getByLabel('Evidence title', { exact: true }).fill('Method critique');
    await dialog()
      .getByLabel('Evidence description', { exact: true })
      .fill('Assessed assumptions and alternatives');
    await dialog().getByRole('button', { name: 'Save evidence', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Method critique', exact: true }).waitFor();
    let evidenceCard = page.locator('article.evidence').filter({ hasText: 'Method critique' });
    await evidenceCard.getByRole('button', { name: 'Edit evidence', exact: true }).click();
    await dialog().getByLabel('Evidence title', { exact: true }).fill('Reviewed method critique');
    await dialog().getByRole('button', { name: 'Save evidence', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Reviewed method critique', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await dialog().getByLabel('Evidence title', { exact: true }).fill('Supporting paper');
    await dialog()
      .getByLabel(/^Evidence type/)
      .selectOption('external_link');
    await dialog().getByLabel('Evidence URL', { exact: true }).fill('https://example.org/paper');
    await dialog().getByRole('button', { name: 'Save evidence', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    const external = page.getByRole('link', { name: 'Open evidence link', exact: true });
    await external.waitFor();
    assert.equal(await external.getAttribute('rel'), 'noopener noreferrer');
    pass('Evidence notes, editing and safely opened external links');
    evidenceCard = page.locator('article.evidence').filter({ hasText: 'Reviewed method critique' });
    await evidenceCard.getByRole('button', { name: 'Remove evidence', exact: true }).click();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await evidenceCard.waitFor();
    await evidenceCard.getByRole('button', { name: 'Remove evidence', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Reviewed method critique', exact: true })
      .waitFor({ state: 'hidden' });
    pass('Evidence removal requires confirmation');
    await page.screenshot({ path: path.join(artifacts, 'desktop-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'desktop-light.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      {},
      { timeout: 5000 },
    );
    await page.screenshot({ path: path.join(artifacts, 'mobile-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'mobile-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    pass('Desktop/mobile layouts and dark/light themes with no horizontal overflow');
    await page.getByRole('button', { name: 'Archive skill', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm', exact: true }).click();
    await page
      .getByText('Archived category or skill / read-only history', { exact: true })
      .waitFor();
    await page.getByLabel(/^Skill history/).selectOption('archived');
    await page.locator('.skill-node').filter({ hasText: 'Evaluate evidence' }).waitFor();
    current = await (await page.request.get(origin + '/api/research-skills/' + skillId)).json();
    assert.equal(current.proficiencyHistory.length, 2);
    assert.equal(current.evidence.length, 1);
    pass('Archived skill preserves evidence/history and remains visible read-only');
    await page.getByRole('button', { name: 'Manage categories', exact: true }).click();
    let categoryRow = dialog().locator('.category-row').filter({ hasText: 'Specialist methods' });
    await categoryRow.getByRole('button', { name: 'Edit category', exact: true }).click();
    await dialog()
      .getByLabel('Category description', { exact: true })
      .fill('Preserved specialist branch');
    await dialog().getByLabel('Category sort order', { exact: true }).fill('1');
    await dialog().getByRole('button', { name: 'Save category', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Manage categories', exact: true }).click();
    categoryRow = dialog().locator('.category-row').filter({ hasText: 'Specialist methods' });
    await categoryRow.getByRole('button', { name: 'Archive category', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm', exact: true }).click();
    await page
      .getByText('Archived category or skill / read-only history', { exact: true })
      .waitFor();
    pass('Category editing/reordering and archive preserve child skills');
    await page.goto(origin + '/dashboard');
    await page.getByRole('link', { name: 'Explore Skill Tree', exact: true }).waitFor();
    await page.goto(origin + '/help');
    await page.getByRole('heading', { name: 'Research Skill Tree', exact: true }).waitFor();
    pass('Dashboard and Help Skill Tree integration');
    await page.goto(origin + '/skills');
    await page.route('**/api/research-skills', (route) =>
      route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } }),
    );
    await page.getByRole('button', { name: 'Refresh skills', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'The request could not be confirmed' })
      .waitFor();
    await page.unroute('**/api/research-skills');
    await page.getByRole('button', { name: 'Refresh skills', exact: true }).click();
    await page.locator('.skill-node').first().waitFor();
    pass('Error feedback and retry');
    await page.goto(origin + '/settings');
    await wait();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    const download = await downloadPromise,
      file = path.join(artifacts, 'isolated-backup.json');
    await download.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.counts.researchSkills, 25);
    assert.equal(saved.counts.skillCategories, 7);
    assert.equal(saved.counts.skillTreeState, 1);
    await page.locator('input[type=file]').setInputFiles(file);
    await page
      .getByText('Research skills (including history and evidence)', { exact: true })
      .waitFor();
    await page
      .getByLabel('Type REPLACE ALL DATA to confirm replacement', { exact: true })
      .fill('REPLACE ALL DATA');
    await page.getByRole('button', { name: 'Replace data and restore', exact: true }).click();
    await page
      .getByText('Backup restored successfully. Your progress summary has been refreshed.', {
        exact: true,
      })
      .waitFor();
    assert.deepEqual((await app.get(Backup).export()).data, saved.data);
    pass('Browser export, preview and explicit restore preserve the complete Skill Tree');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(artifacts, 'results.json'),
      JSON.stringify(
        { passed: checks, failed: 0, pageErrors: errors, database: name, isolated: true },
        null,
        2,
      ),
    );
    console.log(`BROWSER COMPLETE: ${checks} checks passed, 0 failed`);
  } finally {
    if (browser) {
      const pages = browser.contexts().flatMap((c) => c.pages());
      if (pages[0]) {
        await pages[0]
          .screenshot({ path: path.join(artifacts, 'last-screen.png'), fullPage: true })
          .catch(() => {});
        const alerts = await pages[0]
          .getByRole('alert')
          .allTextContents()
          .catch(() => []);
        if (alerts.length) console.log('UI alerts', alerts);
      }
      await browser.close();
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (app) await app.close();
    assert.match(name, /^phd_quest_skills_browser_[a-f0-9]{32}$/);
    await releaseDatabase(uri.toString());
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
