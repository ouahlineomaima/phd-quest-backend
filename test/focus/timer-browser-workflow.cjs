const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
module.exports = async function ({ page: previousPage, origin, pass, call, own }) {
  // Stage 4 installs a synthetic calendar clock. Timer presence/lifecycle checks need a fresh real-clock context.
  const browser = previousPage.context().browser();
  await previousPage.context().close();
  let context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let page = await context.newPage();
  const peer = await context.newPage(),
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
    const finishOffer = page.getByRole('region', { name: 'Time applied. Finish this task?' });
    await finishOffer.waitFor();
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].status, 'pending');
    const beforeCompletion = await call('/gamification/summary');
    await page.route('**/api/weekly-plans/*/tasks/*/complete', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary completion failure' }),
      }),
    );
    await finishOffer.getByRole('button', { name: 'Complete task', exact: true }).click();
    await finishOffer.getByRole('alert').filter({ hasText: 'Time is already saved' }).waitFor();
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 3);
    await page.unroute('**/api/weekly-plans/*/tasks/*/complete');
    await finishOffer.getByRole('button', { name: 'Complete task', exact: true }).click();
    await finishOffer.waitFor({ state: 'hidden' });
    const completed = (await call('/weekly-plans/' + plan.id)).tasks[0];
    assert.equal(completed.status, 'completed');
    assert.equal(completed.actualMinutes, 3);
    const awarded = await call('/gamification/summary');
    assert.equal(awarded.totalXp - beforeCompletion.totalXp, example.tasks[0].xpReward);
    await call(
      '/weekly-plans/' + plan.id + '/tasks/integrated-timer/complete',
      'PATCH',
      {},
      undefined,
      200,
    );
    assert.equal((await call('/gamification/summary')).totalXp, awarded.totalXp);
    assert.equal(new URL(page.url()).pathname, '/focus');
    pass(
      'After applying time, optional completion stays on Focus, retries safely, preserves actual minutes and awards XP once',
    );
    const extra = await call(
      '/focus-sessions/start',
      'POST',
      {
        sessionId: randomUUID(),
        ownerId: randomUUID(),
        kind: 'focus',
        mode: 'stopwatch',
        targetSeconds: null,
        taskRef: first.taskRef,
      },
      undefined,
      201,
    );
    now += 1000;
    await call('/focus-sessions/' + extra.sessionId + '/stop', 'POST', {}, extra.editVersion, 201);
    await page.getByRole('button', { name: 'Refresh history', exact: true }).click();
    await page.getByRole('button', { name: 'Review / apply time', exact: true }).click();
    await dialog.waitFor();
    await correction.fill('1');
    await dialog.getByRole('button', { name: 'Confirm apply time to task' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await finishOffer.count(), 0);
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 4);
    assert.equal((await call('/gamification/summary')).totalXp, awarded.totalXp);
    pass(
      'Applying more time to a completed task preserves its status and does not offer completion or award more XP',
    );
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
    assert.equal((await call('/weekly-plans/' + plan.id)).tasks[0].actualMinutes, 4);
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
    assert.equal((await call('/focus-sessions/current')).state, 'running');
    pass('Tabs share one timer; closing another tab never pauses or transfers the session');
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
    const away = await call('/focus-sessions/current');
    const external = await context.newPage();
    await external.goto('about:blank');
    await external.bringToFront();
    now += 600000;
    assert.equal((await call('/focus-sessions/current')).elapsedMilliseconds, 600000);
    now += 1200000;
    assert.equal((await call('/focus-sessions/current')).state, 'running');
    assert.equal((await call('/focus-sessions/current')).elapsedMilliseconds, 1800000);
    pass(
      'Ten minutes in another tab and thirty minutes without app interaction leave the timer running',
    );
    await context.close();
    now += 3 * 3600000;
    const absent = await call('/focus-sessions/current');
    assert.equal(absent.state, 'running');
    assert.equal(absent.sessionId, away.sessionId);
    assert.equal(absent.elapsedMilliseconds, 12600000);
    context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/focus');
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const reopenedMini = page.locator('.focus-mini');
    await reopenedMini.filter({ hasText: '03:30:' }).waitFor();
    pass(
      'Closing every PhD Quest tab for three hours reopens the same running session with the entire elapsed duration',
    );
    const browserNow = await page.evaluate(() => Date.now());
    await page.clock.install({ time: new Date(browserNow) });
    await context.setOffline(true);
    now += 600000;
    await page.clock.fastForward(600000);
    assert.equal((await call('/focus-sessions/current')).state, 'running');
    await reopenedMini.filter({ hasText: 'running' }).waitFor();
    now += 1200000;
    await page.clock.fastForward(1200000);
    assert.equal((await call('/focus-sessions/current')).elapsedMilliseconds, 14400000);
    const synced = page.waitForResponse(
      (response) => response.url().endsWith('/focus-sessions/current') && response.status() === 200,
    );
    await context.setOffline(false);
    await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('online')));
    await synced;
    await reopenedMini.filter({ hasText: '04:00:' }).waitFor();
    pass(
      'Network interruption and simulated sleep/wake preserve running state and resynchronize the full elapsed duration',
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    now += 1800000;
    assert.equal((await call('/focus-sessions/current')).elapsedMilliseconds, 14400000);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    now += 120000;
    await page.getByRole('button', { name: 'Stop session', exact: true }).click();
    const finalDialog = page.getByRole('dialog', { name: 'Review stopped session' });
    await finalDialog.waitFor();
    await finalDialog.getByRole('button', { name: 'Save without applying', exact: true }).click();
    await finalDialog.waitFor({ state: 'hidden' });
    const stopped = (await call('/focus-sessions')).items.find(
      (record) => record.sessionId === away.sessionId,
    );
    assert.equal(stopped.focusedSeconds, 14520);
    pass(
      'Explicit pause excludes paused time; resume and explicit stop finalize once and save without applying',
    );
    assert.deepEqual(errors, []);
  } finally {
    clock.now = originalNow;
    await context.close();
  }
};
