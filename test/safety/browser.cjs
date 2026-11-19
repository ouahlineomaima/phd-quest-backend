const fs = require('node:fs');
const path = require('node:path');
const { assertRuntime } = require('../../scripts/runtime.cjs');
function candidates(env = process.env, platform = process.platform) {
  const override = env.BROWSER_EXECUTABLE || env.CHROME_PATH;
  if (override) return [override];
  if (platform === 'win32')
    return [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]
      .filter(Boolean)
      .flatMap((root) => [
        path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(root, 'Google/Chrome/Application/chrome.exe'),
      ]);
  if (platform === 'darwin')
    return [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  return [
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}
async function launchBrowser() {
  assertRuntime();
  let chromium;
  try {
    ({ chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core'));
  } catch {
    throw new Error('Playwright Core is missing. Run npm ci in the backend repository.');
  }
  const paths = [
    ...candidates(),
    ...(process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH
      ? []
      : [chromium.executablePath()]),
  ];
  const errors = [];
  for (const executablePath of [...new Set(paths)].filter((file) => fs.existsSync(file))) {
    try {
      return await chromium.launch({ executablePath, headless: true, timeout: 15000 });
    } catch (error) {
      errors.push(`${path.basename(executablePath)}: ${error.message.split('\n')[0]}`);
    }
  }
  throw new Error(
    'No usable Chromium browser. Install Edge/Chrome/Chromium or set BROWSER_EXECUTABLE to its executable. Browser downloads are never automatic. ' +
      errors.join('; '),
  );
}
module.exports = { candidates, launchBrowser };
