const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { randomUUID } = require('node:crypto');
const { isolated } = require('../safety/isolated.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH);
const frontend = path.resolve(__dirname, '../../../phd-quest-frontend'),
  assets = path.join(frontend, 'dist/phd-quest/browser'),
  artifacts = path.join(frontend, '.artifacts/stage3');
fs.mkdirSync(artifacts, { recursive: true });
let own, server, browser;
const checks = [];
const pass = (label) => {
  checks.push(label);
  console.log('PASS', label);
};
(async () => {
  try {
    let api;
    server = http.createServer((req, res) => {
      if (req.url.startsWith('/api')) {
        const target = new URL(req.url, api),
          proxy = http.request(
            target,
            { method: req.method, headers: { ...req.headers, host: target.host } },
            (r) => {
              res.writeHead(r.statusCode, r.headers);
              r.pipe(res);
            },
          );
        proxy.on('error', () => res.writeHead(502).end());
        req.pipe(proxy);
        return;
      }
      const file = path.join(assets, decodeURIComponent(req.url.split('?')[0])),
        selected =
          fs.existsSync(file) && fs.statSync(file).isFile()
            ? file
            : path.join(assets, 'index.html');
      res.setHeader(
        'content-type',
        {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.html': 'text/html',
          '.svg': 'image/svg+xml',
        }[path.extname(selected)] || 'application/octet-stream',
      );
      fs.createReadStream(selected).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/phd_quest_stage2_' + randomUUID().replaceAll('-', '');
    own = await isolated(uri.toString(), { CORS_ORIGINS: origin });
    api = new URL(own.base).origin;
    async function call(endpoint, method = 'GET', body, status = 200) {
      const response = await fetch(own.base + endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data));
      return data;
    }
    const category = await call(
        '/research-skills/categories',
        'POST',
        { name: 'Stage 3 category' },
        201,
      ),
      skill = await call(
        '/research-skills',
        'POST',
        { name: 'Stage 3 keyboard skill', categoryId: category.id },
        201,
      ),
      profile = await call('/supervisors', 'POST', { name: 'Stage 3 supervisor' }, 201),
      meeting = await call(
        '/supervisor-meetings',
        'POST',
        {
          title: 'Stage 3 meeting',
          scheduledAt: '2026-12-01T10:00:00Z',
          supervisorIds: [profile.id],
        },
        201,
      );
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    const dialog = () => page.getByRole('dialog', { includeHidden: false });
    let blocked = true;
    await page.route('**/api/goals**', (route) =>
      blocked
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.continue(),
    );
    await page.route('**/api/roadmap', (route) =>
      blocked
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.continue(),
    );
    await page.goto(origin + '/skills');
    const node = page.locator('#skill-node-' + skill.id);
    await node.waitFor();
    await node.focus();
    await page.keyboard.press('Enter');
    await page.locator('#skill-details:focus').waitFor();
    assert.equal(await node.getAttribute('aria-pressed'), 'true');
    assert.equal(await node.getAttribute('aria-controls'), 'skill-details');
    assert.equal(
      await page.locator('#skill-details').getAttribute('aria-labelledby'),
      'skill-title-' + skill.id,
    );
    assert.equal(await page.getByRole('tree').count(), 0);
    await page.getByRole('button', { name: 'Back to selected skill', exact: true }).click();
    await node.locator(':scope:focus').waitFor();
    pass('Keyboard selection exposes pressed state, labelled details, and deliberate return focus');
    await page.keyboard.press('Tab');
    for (const theme of ['dark', 'light']) {
      await page
        .locator('html')
        .evaluate((el, value) => el.setAttribute('data-theme', value), theme);
      await node.focus();
      const ring = await node.evaluate((el) => ({
        width: getComputedStyle(el).outlineWidth,
        style: getComputedStyle(el).outlineStyle,
        color: getComputedStyle(el).outlineColor,
      }));
      assert.equal(ring.style, 'solid');
      assert.equal(ring.width, '3px');
      assert.notEqual(ring.color, 'rgba(0, 0, 0, 0)');
    }
    pass('Keyboard focus ring remains visible in dark and light themes');
    await page.getByRole('button', { name: 'Edit skill', exact: true }).click();
    await dialog().getByLabel('Skill description', { exact: true }).fill('Stage 3 preserved edit');
    await dialog().getByRole('button', { name: 'Save skill', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Edit skill', exact: true })
      .locator(':scope:focus')
      .waitFor();
    assert.equal(
      (await call('/research-skills/' + skill.id)).description,
      'Stage 3 preserved edit',
    );
    pass('Extracted skill editor saves and restores focus to its opener');
    await page.getByRole('button', { name: 'Manage categories', exact: true }).click();
    await dialog().getByRole('button', { name: 'Edit category', exact: true }).click();
    await dialog().getByLabel('Category name', { exact: true }).fill('Edited Stage 3 category');
    await dialog().getByRole('button', { name: 'Save category', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal((await call('/research-skills')).categories[0].name, 'Edited Stage 3 category');
    pass('Category editing preserves its focused mutation workflow');
    await page.getByRole('button', { name: 'Add skill', exact: true }).click();
    await dialog().getByLabel('Skill name', { exact: true }).fill('Temporary Stage 3 skill');
    await dialog().getByRole('button', { name: 'Save skill', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.locator('.node-select').filter({ hasText: 'Temporary Stage 3 skill' }).click();
    await page.getByRole('button', { name: 'Archive skill', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page
      .getByText('Archived category or skill / read-only history', { exact: true })
      .waitFor();
    assert.ok(
      (await call('/research-skills')).skills.find((s) => s.name === 'Temporary Stage 3 skill')
        .archivedAt,
    );
    await node.click();
    pass('Skill creation and archive retain history without removing records');

    await page.getByRole('button', { name: 'Link activity', exact: true }).click();
    await dialog()
      .getByLabel(/^Activity source type/)
      .selectOption('research_goal');
    await dialog()
      .getByRole('button', { name: 'Retry Research goal options', exact: true })
      .waitFor();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await node.waitFor();
    pass('Optional goal failure leaves primary skill data and selection intact');
    await page.getByRole('button', { name: 'Link activity', exact: true }).click();
    await dialog()
      .getByLabel(/^Activity source type/)
      .selectOption('roadmap_checkpoint');
    await dialog().getByRole('button', { name: 'Retry Roadmap options', exact: true }).waitFor();
    blocked = false;
    await dialog().getByRole('button', { name: 'Retry Roadmap options', exact: true }).click();
    await dialog()
      .getByLabel(/^Roadmap checkpoint/)
      .selectOption('0:research-environment-ready');
    await dialog().getByRole('button', { name: 'Save activity links', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.ok((await call('/research-skills/' + skill.id)).associations[0].checkpointIdentity);
    pass('Independent roadmap retry enables a current identity-safe association');
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await dialog().getByLabel('Evidence title', { exact: true }).fill('Stage 3 evidence');
    await dialog().getByRole('button', { name: 'Save evidence', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal((await call('/research-skills/' + skill.id)).evidence.length, 1);
    pass('Evidence remains editable through extracted dialogs');
    await page.getByRole('button', { name: 'Edit evidence', exact: true }).click();
    await dialog().getByLabel('Evidence description', { exact: true }).fill('Edited evidence note');
    await dialog().getByRole('button', { name: 'Save evidence', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal(
      (await call('/research-skills/' + skill.id)).evidence[0].description,
      'Edited evidence note',
    );
    pass('Existing evidence edits preserve confirmed proficiency');

    blocked = true;
    await page.goto(origin + '/supervisor-meetings/' + meeting.id);
    await page.getByRole('heading', { name: 'Stage 3 meeting', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit / reschedule', exact: true }).click();
    await dialog()
      .getByLabel('Agenda (optional)', { exact: true })
      .fill('Notes survive optional reference errors');
    await dialog().getByText('Research goals (optional)', { exact: true }).click();
    await dialog()
      .getByRole('button', { name: 'Retry Research goal options', exact: true })
      .waitFor();
    await dialog().getByRole('button', { name: 'Save meeting', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal(
      (await call('/supervisor-meetings/' + meeting.id)).notes.agenda,
      'Notes survive optional reference errors',
    );
    pass('Meeting notes save while optional goal/roadmap endpoints fail');
    await page.getByRole('button', { name: 'Add preparation task', exact: true }).click();
    await dialog().getByLabel('Action title', { exact: true }).fill('Stage 3 manual action');
    await dialog().getByRole('button', { name: 'Save action', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal((await call('/supervisor-meetings/' + meeting.id)).actions.length, 1);
    pass('Extracted action editor creates a manual meeting action');
    await page.goto(origin + '/supervisor-meetings');
    await page.getByRole('button', { name: 'Supervisors', exact: true }).click();
    await page.getByRole('button', { name: 'Edit supervisor', exact: true }).click();
    await dialog().getByLabel('Supervisor notes', { exact: true }).fill('Stage 3 profile edit');
    await dialog().getByRole('button', { name: 'Save supervisor', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal((await call('/supervisors'))[0].notes, 'Stage 3 profile edit');
    pass('Supervisor editing stays independently recoverable');
    await page.clock.install({ time: new Date('2026-12-01T09:59:59Z') });
    await page.goto(origin + '/supervisor-meetings');
    await page.getByRole('link', { name: 'Stage 3 meeting', exact: true }).waitFor();
    await page.clock.fastForward(2000);
    await page
      .getByRole('link', { name: 'Stage 3 meeting', exact: true })
      .waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Meeting history', exact: true }).click();
    await page.getByRole('link', { name: 'Stage 3 meeting', exact: true }).waitFor();
    pass('An open meeting list crosses its time boundary without reloading');
    for (const route of ['skills', 'supervisor-meetings', 'supervisor-meetings/' + meeting.id]) {
      await page.goto(origin + '/' + route);
      await page.locator('h1').waitFor();
      if (route === 'skills') {
        await page.locator('#skill-node-' + skill.id).click();
        await page.locator('#skill-details').waitFor();
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const theme of ['dark', 'light']) {
          await page
            .locator('html')
            .evaluate((el, value) => el.setAttribute('data-theme', value), theme);
          await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
          await page.screenshot({
            path: path.join(
              artifacts,
              route.replaceAll('/', '-') + '-' + width + '-' + theme + '.png',
            ),
            fullPage: true,
          });
        }
      }
    }
    pass('Skill and Meeting pages fit desktop and mobile viewports');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(artifacts, 'results.json'),
      JSON.stringify(
        { passed: checks.length, checks, pageErrors: errors, isolated: true },
        null,
        2,
      ),
    );
    console.log('STAGE 3 BROWSER COMPLETE:', checks.length, 'checks');
  } finally {
    if (browser) {
      const page = browser.contexts()[0]?.pages()[0];
      if (page)
        await page
          .screenshot({ path: path.join(artifacts, 'last-screen.png'), fullPage: true })
          .catch(() => {});
      await browser.close();
    }
    if (server) await new Promise((r) => server.close(r));
    if (own) await own.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
