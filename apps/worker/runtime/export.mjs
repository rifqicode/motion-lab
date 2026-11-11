import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openStudioBrowser} from './browser.mjs';

const inputPath = process.env.STUDIO_EXPORT_INPUT ?? '/work/export/input.json';
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const exportDir = process.env.STUDIO_EXPORT_DIR ?? '/work/export';
const renderDir = process.env.STUDIO_RENDER_DIR ?? '/work/build/render';
const require = createRequire(path.join(input.repoRoot, 'apps/cli/package.json'));
const renderer = require('@remotion/renderer');
const {selectComposition, renderMedia, getVideoMetadata} = renderer;
await fs.mkdir('/tmp/studio-home', {recursive: true});
const browser = await openStudioBrowser(renderer, input.repoRoot);
try {
  const composition = await selectComposition({serveUrl: renderDir, id: 'StudioCandidate', puppeteerInstance: browser,
    timeoutInMilliseconds: 20_000});
  const expected = input.expected;
  if (composition.durationInFrames !== expected.durationFrames || composition.fps !== expected.fps
      || composition.width !== expected.width || composition.height !== expected.height) throw new Error('Export composition differs from validated timeline.');
  await renderMedia({serveUrl: renderDir, composition, codec: 'h264', outputLocation: path.join(exportDir, 'video.mp4'),
    puppeteerInstance: browser, concurrency: 2, timeoutInMilliseconds: 30_000});
  const metadata = await getVideoMetadata(path.join(exportDir, 'video.mp4'));
  const probe = await promisify(execFile)('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate', '-of', 'json', path.join(exportDir, 'video.mp4')]);
  const audioStreams = JSON.parse(probe.stdout).streams;
  if (expected.hasAudio && !audioStreams?.length) throw new Error('Export is missing the accepted voice-over audio stream.');
  if (typeof metadata.durationInSeconds !== 'number' || !Number.isFinite(metadata.durationInSeconds)
      || metadata.width !== expected.width || metadata.height !== expected.height || Math.abs(metadata.fps - expected.fps) > 0.01
      || Math.abs(metadata.durationInSeconds - expected.durationFrames / expected.fps) > 1 / expected.fps + 0.01) throw new Error(`Export metadata mismatch: ${JSON.stringify(metadata)}`);
  await fs.writeFile(path.join(exportDir, 'verified.json'), JSON.stringify({status: 'verified', width: metadata.width, height: metadata.height,
    fps: metadata.fps, durationFrames: Math.round(metadata.durationInSeconds * metadata.fps), hasAudio: Boolean(audioStreams?.length), metadata}));
} finally { await browser.close({silent: true}); }
