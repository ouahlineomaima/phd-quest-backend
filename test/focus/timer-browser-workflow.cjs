const assert = require('node:assert/strict');
module.exports = async function ({ page: previousPage, origin, pass, call, own }) {
  // Stage 4 installs a synthetic calendar clock. Timer presence/lifecycle checks need a fresh real-clock context.
  const browser = previousPage.context().browser();
  await previousPage.context().close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    peer = await context.newPage(),
    errors = [];
  for (const tab of [page, peer]) tab.on('pageerror', (error) => errors.push(error.message));
  await peer.goto(origin + '/focus');
  await page.bringToFront();
  const { ApplicationClock } = require('../../dist/common/application-clock');
  const clock = own.app.get(ApplicationClock),
    originalNow = clock.now.bind(clock);
  let now = Date.now();
  clock.now = () => new Date(now);
  const mini = page.locator('.focus-mini');
  try {
    const example = require('../../docs/contracts/weekly-plan.v1.example.json');
    const plan = await call(
      '/weekly-plans/import/confirm',
      'POST',
      {
        ...structuredClone(example),
        weekId: '2026-11-22',
        startDate: '2026-11-22',
        endDate: '2026-11-28',
        tasks: [
          {
            ...example.tasks[0],
            id: 'integrated-timer',
            title: 'Integrated timer research task',
            date: '2026-11-23',
          },
        ],
      },
      undefined,
      201,
    );
    await page.goto(origin + '/weekly-plan');
    await page.locator('select').first().selectOption(plan.id);
    await page.getByRole('button', { name: /^Monday 2026-11-23/ }).click();
    const start = page.getByRole('button', {
      name: 'Open timer for Integrated timer research task',
    });
    await start.waitFor();
    await start.click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await mini.filter({ hasText: 'Integrated timer research task' }).waitFor();
    const first = await call('/focus-sessions/current');
    assert.equal(first.taskRef, '2026-11-22:integrated-timer');
    pass('Weekly Plan starts the shared server timer with the stable cross-week task identity');
    await page.locator('a[href="/goals"]').first().click();
    await mini.waitFor();
    await mini.click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    now += 20000;
    await page.getByRole('button', { name: 'Pause', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    now += 60000;
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    now += 10000;
    await page.getByRole('button', { name: 'Stop session', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review stopped session' });
    await dialog.waitFor();
    const correction = dialog.getByRole('spinbutton', {
      name: 'Effective duration (whole minutes)',
    });
    await correction.fill('1.5');
    await dialog.getByRole('button', { name: 'Confirm apply time to task' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'whole effective minutes' }).waitFor();
    await correction.fill('3');
    const latest = await call('/focus-sessions/' + first.sessionId + '/application-preview');
    await call(
      '/focus-sessions/' + first.sessionId + '/correction',
      'POST',
      { effectiveMinutes: 1 },
      latest.session.editVersion,
      201,
    );
    await dialog.getByRole('button', { name: 'Confirm apply time to task' }).click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: /changed|stale/i })
      .waitFor();
    assert.equal(await correction.inputValue(), '3');
    await dialog.getByRole('button', { name: 'Inspect latest record', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm apply time to task' }).waitFor();
    await dialog.getByRole('button', { name: 'Confirm apply time to task' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 3);
    await call(
      '/focus-sessions/' + first.sessionId + '/apply-time',
      'POST',
      { confirm: true, effectiveMinutes: 3 },
      undefined,
      201,
    );
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 3);
    assert.equal(await mini.count(), 0);
    pass(
      'Global timer survives routes; keyboard pause/resume excludes pauses; corrected task application is explicit and exactly once',
    );
    await page.getByLabel('Timer mode', { exact: true }).selectOption('stopwatch');
    await page.getByRole('button', { name: 'Start focus', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    now += 1000;
    await page.getByRole('button', { name: 'Stop session', exact: true }).click();
    await dialog.waitFor();
    await correction.fill('2');
    await dialog.getByRole('button', { name: 'Save without applying', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 3);
    pass(
      'Focus page uses the same lifecycle and saves a standalone corrected duration without task application',
    );
    await page.getByRole('button', { name: 'Start focus', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const other = await page.context().newPage();
    await other.goto(origin + '/focus');
    await other.locator('.focus-mini').waitFor();
    await other.close();
    await peer.close();
    // A force-closed Playwright tab may not deliver pagehide; allow its advisory presence to expire.
    await page.waitForTimeout(13000);
    assert.equal((await call('/focus-sessions/current')).state, 'running');
    pass(
      'Tabs share one timer; closing one tab and handing off ownership do not pause another active tab',
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['dark', 'light']) {
        await page
          .locator('html')
          .evaluate((element, value) => element.setAttribute('data-theme', value), theme);
        await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      }
    }
    pass('Active mini timer and controls fit desktop/mobile and dark/light themes');
    await page.goto('about:blank');
    for (let i = 0; i < 20 && (await call('/focus-sessions/current')).state !== 'paused'; i++)
      await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await call('/focus-sessions/current')).state, 'paused');
    await page.goto(origin + '/focus');
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    pass('Last-tab page exit attempts an exact-origin JSON keepalive pause and reopens paused');
    const before = await call('/focus-sessions/current');
    await page.route('**/api/focus-sessions/*/pause', (route) => route.abort());
    await page.goto('about:blank');
    now += 46000;
    const expired = await call('/focus-sessions/current');
    assert.equal(expired.state, 'paused');
    assert.equal(expired.recovered, true);
    assert.equal(expired.elapsedMilliseconds, before.confirmedMilliseconds);
    await page.unroute('**/api/focus-sessions/*/pause');
    await page.goto(origin + '/focus');
    await page.getByText(/Automatically paused after connection loss/).waitFor();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.reload();
    // Reload may deliver a pause or recover the still-live running lease; both retain the same session.
    await page.getByRole('button', { name: 'Stop session', exact: true }).waitFor();
    assert.equal((await call('/focus-sessions/current')).sessionId, expired.sessionId);
    await page.getByRole('button', { name: 'Stop session', exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Save without applying', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    pass(
      'Failed close delivery expires at the exact confirmed heartbeat; refresh recovers the same authoritative session without phantom time',
    );
    assert.deepEqual(errors, []);
  } finally {
    clock.now = originalNow;
    await context.close();
  }
};
