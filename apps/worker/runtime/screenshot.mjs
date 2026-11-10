import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const input = JSON.parse(await fs.readFile('/work/input.json', 'utf8'));
const require = createRequire(path.join(input.repoRoot, 'apps/cli/package.json'));
const {openBrowser, selectComposition, renderStill} = require('@remotion/renderer');
await fs.mkdir('/tmp/studio-home', {recursive: true});
const browser = await openBrowser('chrome', {browserExecutable: '/usr/bin/chromium', chromeMode: 'chrome-for-testing', chromiumOptions: {enableMultiProcessOnLinux: true}});
try {
  const composition = await selectComposition({serveUrl: '/work/build/render', id: 'StudioCandidate', puppeteerInstance: browser, timeoutInMilliseconds: 20_000});
  await renderStill({serveUrl: '/work/build/render', composition, frame: input.frame, output: '/work/screenshot/frame.png',
    imageFormat: 'png', puppeteerInstance: browser, timeoutInMilliseconds: 20_000});
} finally { await browser.close({silent: true}); }
process.exit(0);
