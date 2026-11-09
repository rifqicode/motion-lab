import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser } from '@remotion/renderer';
import { join, relative } from 'node:path';
import { loadTypeScript } from './load-typescript.mjs';
import { parsePreviewOptions, preparePreviewRun } from './preview/options.mjs';
import { planPreview } from './preview/plan.mjs';
import { renderPreviewFrames } from './preview/render.mjs';
import { writePreviewReport } from './preview/report.mjs';

// CLI flow: read options -> select frames -> render PNGs -> build the review report.
const options = parsePreviewOptions(process.argv.slice(2));
const run = await preparePreviewRun(options);
const { scenes } = loadTypeScript('../src/spec.ts');
const serveUrl = options.reportOnly ? null : await bundle({ entryPoint: 'src/index.ts' });
const browser = await openBrowser('chrome', {
  browserExecutable: process.env.MOTIONLAB_BROWSER ?? '/usr/bin/google-chrome',
});

try {
  let samples = run.previous?.samples;
  if (!samples) {
    const compositions = await getCompositions(serveUrl, { puppeteerInstance: browser });
    const tasks = planPreview(compositions, scenes, options);
    samples = await renderPreviewFrames({ browser, serveUrl, compositions, tasks, run });
  }
  await writePreviewReport({ browser, run, samples, scenes });
  console.log(`Review: ${relative(process.cwd(), join(run.directory, 'index.html'))}`);
} finally {
  await browser.close({ silent: true });
}
