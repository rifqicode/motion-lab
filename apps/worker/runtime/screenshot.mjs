import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {openStudioBrowser} from './browser.mjs';

const inputPath = process.env.STUDIO_SCREENSHOT_INPUT ?? '/work/input.json';
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const renderDir = process.env.STUDIO_RENDER_DIR ?? '/work/build/render';
const screenshotDir = process.env.STUDIO_SCREENSHOT_DIR ?? '/work/screenshot';
const require = createRequire(path.join(input.repoRoot, 'apps/cli/package.json'));
const renderer = require('@remotion/renderer');
const {selectComposition, renderStill} = renderer;
await fs.mkdir('/tmp/studio-home', {recursive: true});
const browser = await openStudioBrowser(renderer, input.repoRoot);
try {
  const composition = await selectComposition({serveUrl: renderDir, id: 'StudioCandidate', puppeteerInstance: browser, timeoutInMilliseconds: 20_000});
  await renderStill({serveUrl: renderDir, composition, frame: input.frame, output: path.join(screenshotDir, 'frame.png'),
    imageFormat: 'png', puppeteerInstance: browser, timeoutInMilliseconds: 20_000});
} finally { await browser.close({silent: true}); }
process.exit(0);
