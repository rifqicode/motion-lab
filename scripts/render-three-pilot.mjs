import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/cli/package.json'));
const {bundle} = require('@remotion/bundler');
const {renderMedia, renderStill, selectComposition} = require('@remotion/renderer');
const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const scenario = value('--scenario') || 'egg';
if (!['egg', 'run'].includes(scenario)) throw new Error('--scenario must be egg or run');
const output = path.resolve(root, value('--out') || (scenario === 'run' ? 'out/three-running.mp4' : 'out/three-pilot.mp4'));
if (!output.toLowerCase().endsWith('.mp4')) throw new Error('--out must end in .mp4');
const planFile = value('--plan');
const scenePlan = JSON.parse(await fs.readFile(path.resolve(root, planFile || 'packages/renderer/src/three-pilot/scene-plan.json'), 'utf8'));
if (scenario === 'run' && !planFile) {scenePlan.id = 'run-trip-wound'; scenePlan.durationSeconds = 14; scenePlan.fps = 24; scenePlan.narration = '';}
if (scenario === 'run' && (scenePlan.durationSeconds !== 14 || scenePlan.fps !== 24)) throw new Error('The running storyboard currently requires 14 seconds at 24 fps');
if (!(scenePlan.durationSeconds > 0 && scenePlan.durationSeconds <= 30) || !Number.isInteger(scenePlan.fps) || scenePlan.fps < 1 || scenePlan.fps > 60) throw new Error('Invalid duration/fps');
for (const name of ['reachStart', 'reachEnd', 'doubtStart', 'bubbleStart']) {
  const t = scenePlan.beats[name];
  if (!Number.isFinite(t) || t < 0 || t >= scenePlan.durationSeconds) throw new Error(`Invalid beat: ${name}`);
}
if (scenePlan.beats.reachEnd <= scenePlan.beats.reachStart) throw new Error('Reach must end after it starts');
if (!Number.isFinite(scenePlan.camera?.pushIn) || scenePlan.camera.pushIn < 0 || scenePlan.camera.pushIn > 1) throw new Error('Camera pushIn must be between 0 and 1');
for (const key of ['background', 'shirt', 'skin']) {
  if (!/^#[0-9a-f]{6}$/i.test(scenePlan.palette?.[key])) throw new Error(`Invalid palette color: ${key}`);
}
await fs.mkdir(path.dirname(output), {recursive: true});
const started = Date.now();
console.log('Bundling local Three.js scene...');
const serveUrl = await bundle({entryPoint: path.join(root, 'packages/renderer/src/three-pilot/Root.tsx'), webpackOverride: config => ({...config, resolve: {...config.resolve, extensionAlias: {'.js': ['.ts', '.tsx', '.js'], ...config.resolve?.extensionAlias}}})});
const chromiumOptions = {gl: 'swangle', enableMultiProcessOnLinux: true};
console.log('Opening Chromium / SwiftShader...');
const composition = await selectComposition({serveUrl, id: scenario === 'run' ? 'RunningAccident' : 'ThreePilot', inputProps: {scenePlan}, chromiumOptions});
if (args.includes('--still')) {
  console.log('Rendering preview frame...');
  const frame = Number(value('--frame') || 96);
  if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationInFrames) throw new Error('Preview frame is outside the composition');
  await renderStill({serveUrl, composition, inputProps: {scenePlan}, output: output.replace(/\.mp4$/i, '.png'), frame, chromiumOptions, imageFormat: 'png'});
} else {
  let last = -1;
  const temporaryOutput = output.replace(/\.mp4$/i, '.partial.mp4');
  await renderMedia({serveUrl, composition, inputProps: {scenePlan}, codec: 'h264', pixelFormat: 'yuv420p', crf: 18, outputLocation: temporaryOutput, chromiumOptions, concurrency: 1, onProgress: ({progress}) => {
    const percent = Math.floor(progress * 10) * 10;
    if (percent !== last) {console.log(`Render ${percent}%`); last = percent;}
  }});
  await fs.rename(temporaryOutput, output);
}
const report = {scenePlan, resolution: `${composition.width}x${composition.height}`, frames: composition.durationInFrames, elapsedSeconds: (Date.now() - started) / 1000, renderer: 'Three.js + Remotion / ANGLE SwiftShader', audio: 'silent visual pilot', output: args.includes('--still') ? output.replace(/\.mp4$/i, '.png') : output};
await fs.writeFile(output.replace(/\.mp4$/i, args.includes('--still') ? '.still.report.json' : '.report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
