const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function ({ page, origin, call, pass, active = false }) {
  const header = page.locator('.topbar');
  const progress = header.locator('pq-gamification-header');
  const details = page.getByRole('dialog', {
    name: /Research streak|Experience points|Player level/,
  });
  const summary = await call('/gamification/summary');
  await progress
    .getByRole('button', { name: `Total XP: ${summary.totalXp}. Show details`, exact: true })
    .waitFor();
  assert.equal(await header.locator('pq-brand').count(), 1);
  assert.equal(await page.locator('.sidebar pq-brand, .sidebar .journey-preview').count(), 0);
  assert.equal(
    await header.getByRole('link', { name: /Local workspace: API and database online/ }).count(),
    1,
  );
  assert.equal(
    await progress.getByRole('progressbar').getAttribute('aria-valuenow'),
    String(summary.levelProgressPercent),
  );
  const xp = progress.getByRole('button', { name: /^Total XP:/ });
  await xp.focus();
  await page.keyboard.press('Enter');
  await details.filter({ hasText: 'Total accumulated XP' }).waitFor();
  assert.equal(await xp.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await details.waitFor({ state: 'hidden' });
  assert.equal(await xp.evaluate((el) => el === el.ownerDocument.activeElement), true);
  await progress.getByRole('button', { name: /^Streak:/ }).click();
  await details.getByText('Longest streak', { exact: true }).waitFor();
  await xp.click();
  await details.getByText('Total accumulated XP', { exact: true }).waitFor();
  assert.equal(await page.locator('[popover]:popover-open').count(), 1);
  await header.locator('.breadcrumb').click();
  await details.waitFor({ state: 'hidden' });
  pass(
    'Global branding, live workspace status and authoritative gamification replace the sidebar card; popovers support keyboard, Escape and outside dismissal',
  );

  const artifact = path.resolve(__dirname, '../../../phd-quest-frontend/.artifacts/global-header');
  fs.mkdirSync(artifact, { recursive: true });
  const crumb = header.locator('.breadcrumb strong');
  const originalCrumb = await crumb.textContent();
  await crumb.evaluate((el) => {
    el.textContent = 'Long nested research navigation context '.repeat(12);
  });
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['dark', 'light']) {
      const toggle = header.getByRole('button', { name: `Switch to ${theme} theme`, exact: true });
      if (await toggle.count()) await toggle.click();
      for (const kind of ['Streak:', 'Total XP:', 'Player level ']) {
        const button = progress.getByRole('button', { name: new RegExp('^' + kind) });
        assert.equal(await button.isVisible(), true);
        const buttonBox = await button.boundingBox();
        assert.ok(buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= width);
        await button.click();
        await details.waitFor();
        const box = await details.boundingBox();
        assert.ok(
          box.x >= 0 &&
            box.x + box.width <= width + 1 &&
            box.y >= 0 &&
            box.y + box.height <= height + 1,
        );
        if (kind === 'Player level ' && width === 390 && theme === 'light')
          await page.screenshot({
            path: path.join(artifact, `${active ? 'active' : 'idle'}-level-details-mobile.png`),
          });
        await details.getByRole('button', { name: 'Close player details' }).click();
      }
      assert.equal(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        true,
      );
      if (active) {
        const mini = page.locator('.focus-mini');
        assert.equal(await mini.count(), 1);
        const box = await mini.boundingBox();
        const headerBox = await header.boundingBox();
        assert.ok(
          box.x >= 0 &&
            box.x + box.width <= width &&
            box.y + box.height <= headerBox.y + headerBox.height + 1,
        );
        assert.equal((await call('/focus-sessions/current')).state, 'running');
      }
      if ((width === 1440 && theme === 'dark') || (width === 390 && theme === 'light')) {
        await crumb.evaluate((el, value) => {
          el.textContent = value;
        }, originalCrumb);
        await page.screenshot({
          path: path.join(artifact, `${active ? 'active' : 'idle'}-${width}-${theme}.png`),
        });
        await crumb.evaluate((el) => {
          el.textContent = 'Long nested research navigation context '.repeat(12);
        });
      }
    }
  }
  await page.setViewportSize({ width: 1366, height: 420 });
  const headerY = (await header.boundingBox()).y;
  await page.locator('.sidebar').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.locator('main').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.equal((await header.boundingBox()).y, headerY);
  assert.equal(await progress.isVisible(), true);
  await page.locator('main').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator('.sidebar').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await crumb.evaluate((el, value) => {
    el.textContent = value;
  }, originalCrumb);
  pass(
    active
      ? 'One running mini timer survives popovers, theme changes and all five responsive layouts without lifecycle writes'
      : 'Header and viewport-safe popovers fit five desktop/tablet/mobile sizes and both themes, independent of sidebar/content scrolling',
  );
  if (!active) {
    const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 844 } });
    const secondary = await context.newPage();
    const secondaryErrors = [];
    secondary.on('pageerror', (error) => secondaryErrors.push(error.message));
    try {
      let summaryReads = 0;
      secondary.on('request', (request) => {
        if (request.url().endsWith('/gamification/summary')) summaryReads++;
      });
      const release = Promise.withResolvers();
      await secondary.route('**/api/gamification/summary', async (route) => {
        await release.promise;
        await route.continue();
      });
      await secondary.goto(origin + '/focus');
      const secondaryProgress = secondary.locator('pq-gamification-header');
      await secondaryProgress
        .getByRole('button', { name: 'XP unavailable. Show details', exact: true })
        .waitFor();
      assert.equal(
        await secondaryProgress.locator('.indicators').getAttribute('aria-busy'),
        'true',
      );
      release.resolve();
      await secondaryProgress.getByRole('button', { name: /^Total XP: \d/ }).waitFor();
      await secondary.unroute('**/api/gamification/summary');
      const initialReads = summaryReads;
      for (const route of ['/skills', '/goals', '/focus']) {
        await secondary.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await secondary.locator(`.sidebar a[href="${route}"]`).click();
        await secondary.locator('h1').waitFor();
      }
      assert.equal(summaryReads, initialReads);
      assert.equal(
        await secondary
          .getByRole('button', { name: 'Open navigation', exact: true })
          .getAttribute('aria-expanded'),
        'false',
      );
      await secondary.route('**/api/gamification/summary', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await secondary.route('**/api/health', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await secondary.reload();
      await secondary
        .getByRole('link', { name: 'Local workspace: API unavailable. Open settings', exact: true })
        .waitFor();
      await secondaryProgress
        .getByRole('button', { name: 'XP unavailable. Show details', exact: true })
        .click();
      const secondaryDetails = secondary.getByRole('dialog', {
        name: 'Experience points',
        exact: true,
      });
      await secondaryDetails.getByRole('button', { name: 'Retry progress', exact: true }).waitFor();
      assert.equal(
        await secondaryDetails.getByText('Total accumulated XP', { exact: true }).count(),
        0,
      );
      await secondary.unroute('**/api/gamification/summary');
      await secondary.unroute('**/api/health');
      await secondaryDetails.getByRole('button', { name: 'Retry progress', exact: true }).click();
      await secondaryDetails.getByText('Total accumulated XP', { exact: true }).waitFor();
      await secondaryDetails.getByRole('button', { name: 'Close player details' }).click();
      pass(
        'Mobile navigation preserves routes without repeated summary reads; unavailable progress is not displayed as zero and recovers through Retry',
      );

      const backup = await call('/backup/export');
      const example = require('../../docs/contracts/weekly-plan.v1.example.json');
      const xpPlan = await call(
        '/weekly-plans/import/confirm',
        'POST',
        {
          ...structuredClone(example),
          weekId: '2099-01-04',
          startDate: '2099-01-04',
          endDate: '2099-01-10',
          tasks: [
            { ...example.tasks[0], id: 'header-level-test', date: '2099-01-04', xpReward: 500 },
          ],
        },
        undefined,
        201,
      );
      await secondary.setViewportSize({ width: 1440, height: 900 });
      await secondary.goto(origin + '/weekly-plan');
      await secondary.locator('#saved-week').selectOption(xpPlan.id);
      await secondary.getByRole('button', { name: /^Sunday 2099-01-04/ }).click();
      const completion = secondary.waitForResponse(
        (response) =>
          response.url().endsWith('/header-level-test/complete') && response.status() === 200,
      );
      await secondary
        .locator('pq-plan-task')
        .getByRole('button', { name: 'Complete task', exact: true })
        .click();
      const updated = (await (await completion).json()).gamification;
      await secondaryProgress
        .getByRole('button', { name: `Total XP: ${updated.totalXp}. Show details`, exact: true })
        .waitFor();
      assert.ok(updated.playerLevel > summary.playerLevel);
      assert.equal(
        await secondaryProgress.getByRole('progressbar').getAttribute('aria-valuenow'),
        String(updated.levelProgressPercent),
      );
      await secondary.goto(origin + '/settings');
      await secondary.getByLabel('Choose backup JSON', { exact: true }).setInputFiles({
        name: 'owned-header-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      const restore = secondary.getByRole('dialog', {
        name: 'Restore saved progress',
        exact: true,
      });
      await restore
        .getByLabel('Type REPLACE ALL DATA to confirm replacement')
        .fill('REPLACE ALL DATA');
      await restore.getByRole('button', { name: 'Replace data and restore', exact: true }).click();
      await restore
        .getByText('Backup restored successfully. Your progress summary has been refreshed.')
        .waitFor();
      await restore.getByRole('button', { name: 'Close', exact: true }).click();
      await secondaryProgress
        .getByRole('button', { name: `Total XP: ${summary.totalXp}. Show details`, exact: true })
        .waitFor();
      pass(
        'Task completion crosses a level threshold in the header; UI backup restore immediately restores authoritative XP and level without reloading',
      );

      const {
        playerProgress,
      } = require('../../dist/modules/gamification/business/services/player-level');
      const large = {
        ...summary,
        ...playerProgress(9007199254740990),
        currentStreak: 99999,
        longestStreak: 99999,
      };
      await secondary.route('**/api/gamification/summary', (route) =>
        route.fulfill({ json: large }),
      );
      await secondary.setViewportSize({ width: 390, height: 844 });
      await secondary.goto(origin + '/focus');
      await secondaryProgress
        .getByRole('button', { name: `Total XP: ${large.totalXp}. Show details`, exact: true })
        .waitFor();
      for (const button of await secondaryProgress.getByRole('button').all()) {
        const box = await button.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390);
      }
      assert.equal(
        await secondary.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        true,
      );
      await secondaryProgress.getByRole('button', { name: /^Player level / }).click();
      await secondary
        .getByRole('dialog', { name: 'Player level', exact: true })
        .getByText(String(large.totalXp), { exact: true })
        .waitFor();
      pass(
        'Large authoritative progression fixtures fit the mobile header and level details without overflow',
      );
      await secondary.unroute('**/api/gamification/summary');
      let afterMidnight = false,
        calendarReads = 0;
      await secondary.clock.install({ time: new Date('2026-11-26T23:59:58Z') });
      await secondary.route('**/api/gamification/summary', (route) => {
        calendarReads++;
        return route.fulfill({
          json: {
            ...summary,
            timezone: 'UTC',
            currentStreak: 9,
            longestStreak: 9,
            asOf: afterMidnight ? '2026-11-27T00:00:01Z' : '2026-11-26T23:59:58Z',
            todayActivity: {
              ...summary.todayActivity,
              date: afterMidnight ? '2026-11-27' : '2026-11-26',
              taskCompletionCount: afterMidnight ? 0 : 1,
            },
          },
        });
      });
      await secondary.goto(origin + '/focus');
      await secondaryProgress
        .getByRole('button', { name: 'Streak: 9 days. Show details', exact: true })
        .waitFor();
      const readsBeforeBoundary = calendarReads;
      afterMidnight = true;
      const refreshed = secondary.waitForResponse(
        (response) => response.url().endsWith('/gamification/summary') && response.status() === 200,
      );
      await secondary.clock.fastForward(3000);
      await refreshed;
      await secondaryProgress
        .getByRole('button', { name: 'Streak: 9 days. Show details', exact: true })
        .click();
      const streakDetails = secondary.getByRole('dialog', { name: 'Research streak', exact: true });
      await streakDetails.getByText('Today · 2026-11-27', { exact: true }).waitFor();
      await streakDetails.getByText('No qualifying activity yet', { exact: true }).waitFor();
      assert.equal(calendarReads, readsBeforeBoundary + 1);
      await secondary.clock.fastForward(300000);
      assert.equal(calendarReads, readsBeforeBoundary + 1);
      pass(
        'A local date boundary refreshes one shared summary and today activity without route reloads or gamification polling',
      );
      assert.deepEqual(secondaryErrors, []);
    } finally {
      await context.close();
    }
  }
};
