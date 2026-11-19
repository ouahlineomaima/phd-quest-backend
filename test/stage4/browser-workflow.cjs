const assert = require('node:assert/strict');
module.exports = async function ({ page, origin, pass, call, skillId }) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of [
    'dashboard',
    'weekly-plan',
    'focus',
    'supervisor-meetings',
    'skills',
    'achievements',
    'roadmap',
    'goals',
    'settings',
  ]) {
    await page.goto(origin + '/' + route);
    await page.locator('h1').waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('h1').count(), 1);
    if (route === 'settings') {
      await page.getByRole('button', { name: 'Export backup', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Restore backup', exact: true }).waitFor();
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['dark', 'light']) {
        await page
          .locator('html')
          .evaluate((element, value) => element.setAttribute('data-theme', value), theme);
        await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      }
    }
  }
  pass('All feature routes, backup interface, desktop/mobile and dark/light layouts');
  await page.goto(origin + '/skills');
  const node = page.locator('#skill-node-' + skillId);
  await node.focus();
  await page.keyboard.press('Enter');
  await page.locator('#skill-details:focus').waitFor();
  assert.equal(await node.getAttribute('aria-pressed'), 'true');
  assert.equal(await node.getAttribute('aria-controls'), 'skill-details');
  await page.getByRole('button', { name: 'Back to selected skill', exact: true }).click();
  await node.locator(':scope:focus').waitFor();
  pass('Skill keyboard selection, exposed state, labelled details and return focus');
  await page.route('**/api/goals**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Link activity', exact: true }).click();
  const dialog = page.getByRole('dialog', { includeHidden: false });
  await dialog.getByLabel(/^Activity source type/).selectOption('research_goal');
  await dialog.getByRole('button', { name: 'Retry Research goal options', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await node.waitFor();
  await page.unroute('**/api/goals**');
  pass('Optional reference failure preserves the primary page and editor recovery');
  const profile = await call(
      '/supervisors',
      'POST',
      { name: 'Stage 4 clock supervisor' },
      undefined,
      201,
    ),
    meeting = await call(
      '/supervisor-meetings',
      'POST',
      {
        title: 'Stage 4 clock meeting',
        scheduledAt: '2026-12-15T10:00:00Z',
        supervisorIds: [profile.id],
      },
      undefined,
      201,
    );
  await page.clock.install({ time: new Date('2026-12-15T09:59:59Z') });
  await page.goto(origin + '/supervisor-meetings');
  await page.getByRole('link', { name: meeting.title, exact: true }).waitFor();
  await page.clock.fastForward(2000);
  await page.getByRole('link', { name: meeting.title, exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Meeting history', exact: true }).click();
  await page.getByRole('link', { name: meeting.title, exact: true }).waitFor();
  pass('Meeting time boundary updates an open list without reload');
  assert.deepEqual(errors, []);
};
