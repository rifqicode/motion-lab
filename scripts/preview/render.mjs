import { renderStill } from '@remotion/renderer';
import { access, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

async function copyBaseline(run, file) {
  if (!run.baseline) return null;
  try {
    await access(join(run.baseline, file));
    const before = `before-${file}`;
    await copyFile(join(run.baseline, file), join(run.directory, before));
    return before;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function renderPreviewFrames({ browser, serveUrl, compositions, tasks, run }) {
  const samples = [];
  for (const [id, frames] of tasks) {
    const composition = compositions.find((item) => item.id === id);
    for (const frame of [...frames].sort((a, b) => a - b)) {
      const file = `${id}-${frame}.png`;
      await renderStill({
        serveUrl,
        composition,
        frame,
        output: join(run.directory, file),
        puppeteerInstance: browser,
        logLevel: 'error',
      });
      samples.push({
        composition: id,
        frame,
        time: frame / composition.fps,
        width: composition.width,
        height: composition.height,
        file,
        before: await copyBaseline(run, file),
      });
      console.log(`${id}: ${frame}`);
    }
  }
  return samples;
}
