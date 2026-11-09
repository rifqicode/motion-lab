import { bundle } from '@remotion/bundler';
import { getCompositions, renderStill, openBrowser } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
const serveUrl = await bundle({ entryPoint: 'src/index.ts' });
const browser = await openBrowser('chrome', {
  browserExecutable: process.env.MOTIONLAB_BROWSER ?? '/usr/bin/google-chrome',
});
await mkdir('out/coffee', { recursive: true });
try {
  const comps = await getCompositions(serveUrl, { puppeteerInstance: browser });
  const frames = [
    0, 75, 150, 285, 299, 300, 375, 420, 480, 585, 599, 600, 675, 720, 780, 840, 885, 899,
  ];
  for (const id of ['MotionLab', 'Shot-bean', 'Shot-extraction', 'Shot-espresso']) {
    const composition = comps.find((c) => c.id === id);
    for (const frame of id === 'MotionLab' ? frames : [0, 30, 75, 120, 180, 240, 285, 299]) {
      const output = `out/coffee/${id}-${frame}.png`;
      await renderStill({ serveUrl, composition, frame, output, puppeteerInstance: browser });
      console.log(output);
    }
  }
} finally {
  await browser.close({ silent: true });
}
