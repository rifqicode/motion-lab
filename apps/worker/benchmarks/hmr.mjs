import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openStudioBrowser} from '../runtime/browser.mjs';

const argument = name => {const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1];};
const fixtureUrl = argument('--fixture-url');
if (!fixtureUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureUrl)) throw new Error('Pass --fixture-url http://127.0.0.1:<port> for an explicitly started fake-AI Studio fixture.');
const projectsRoot = argument('--projects-root');
if (!projectsRoot) throw new Error('Pass --projects-root for the fixture-only project storage directory.');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repoRoot, 'apps/cli/package.json'));
const html = await (await fetch(fixtureUrl)).text();
const token = html.match(/name="studio-session" content="([^"]+)"/)?.[1];
const previewOrigin = html.match(/name="studio-preview-origin" content="([^"]+)"/)?.[1];
if (!token || !previewOrigin) throw new Error('Fixture bootstrap unavailable.');
async function api(route, method = 'GET', data) {
  const response = await fetch(`${fixtureUrl}/api${route}`, {method, headers: {'x-studio-session': token,
    ...(data ? {'content-type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined});
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${result.message}`);
  return result;
}
const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));
async function waitFor(check, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {const value = await check(); if (value) return value; await sleep(25);}
  throw new Error('Timed out waiting for fixture milestone.');
}
const project = await api('/projects', 'POST', {name: `HMR benchmark ${new Date().toISOString()}`, brief: 'Fixture only: two shots to verify HMR transport.'});
const base = `/projects/${project.id}`;
async function job(route, data) {
  const {jobId} = await api(`${base}${route}`, 'POST', {requestId: randomUUID(), ...data});
  return waitFor(async () => {
    const snapshot = await api(base);
    const job = snapshot.jobs.find(item => item.id === jobId);
    if (job?.status === 'failed' || job?.status === 'cancelled') throw new Error(`Fixture job ${job.status}: ${job.error}`);
    return job?.status === 'succeeded' ? snapshot : null;
  }, 240_000);
}
await job('/director', {expectedHash: null});
let snapshot = await api(base);
await api(`${base}/storyboard/approve`, 'POST', {storyboardHash: snapshot.storyboard.hash});
snapshot = await job('/generations', {expectedRevisionId: null, approvedStoryboardHash: snapshot.storyboard.hash});
const projectDir = path.join(path.resolve(projectsRoot), project.id);
const records = [];
for (const id of await fs.readdir(path.join(projectDir, 'builds'))) {
  const record = await fs.readFile(path.join(projectDir, 'builds', id, 'build.json'), 'utf8').then(JSON.parse, () => null);
  if (record?.status === 'ready' && record.kind === 'development') records.push(record);
}
records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
if (records.length < 2) throw new Error('Need two validated immutable versions.');
const versions = [records[0], records.at(-1)];
const activeFile = path.join(projectDir, 'preview/live/active.tsx');
const original = await fs.readFile(activeFile, 'utf8');
const browser = await openStudioBrowser(require('@remotion/renderer'), repoRoot);
const consoleErrors = [];
const page = await browser.newPage({context: {sourceMap: null, webpackStats: null}, logLevel: 'error', indent: false,
  pageIndex: 0, onBrowserLog: log => {if (log.type === 'error') consoleErrors.push(log.text);}, onLog: () => {}});
try {
  await page.goto({url: fixtureUrl, timeout: 30_000});
  await page.evaluate((url, buildId) => {
    window.__hmrBenchmark = {loads: 0, events: [], errors: []};
    const frame = document.createElement('iframe');
    frame.id = 'hmr-benchmark'; frame.width = '360'; frame.height = '640';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.onload = () => {
      window.__hmrBenchmark.loads++;
      const channel = new MessageChannel();
      window.__hmrBenchmark.port = channel.port1;
      channel.port1.onmessage = event => {
        const data = event.data;
        window.__hmrBenchmark.events.push({at: Date.now(), ...data});
        if (data.type === 'error') window.__hmrBenchmark.errors.push(data);
      };
      channel.port1.start();
      frame.contentWindow.postMessage({type: 'studio:connect', version: 1, buildId, sessionId: 'live'}, '*', [channel.port2]);
    };
    frame.src = url;
    document.body.appendChild(frame);
  }, `${previewOrigin}/p/${project.id}/live/index.html`, versions[1].id);
  await waitFor(() => page.evaluate(() => window.__hmrBenchmark.events.find(event => event.type === 'ready')), 60_000);
  const child = await waitFor(() => page.mainFrame().childFrames().find(frame => frame.url().includes(`/p/${project.id}/live/`)));
  const marker = randomUUID();
  await child.evaluate(value => {window.__hmrDocumentMarker = value;}, marker);
  const samples = [];
  for (let index = 0; index < 32; index++) {
    const selected = versions[index % 2];
    await page.evaluate(() => {window.__hmrBenchmark.events = [];});
    const started = Date.now();
    await fs.writeFile(activeFile + '.benchmark-pending', `export {StudioComposition,meta} from './versions/${selected.id}/active.tsx';\n`);
    await fs.rename(activeFile + '.benchmark-pending', activeFile);
    const event = await waitFor(() => page.evaluate(id => window.__hmrBenchmark.events.find(event => event.type === 'updated' && event.buildId === id), selected.id), 20_000);
    const state = await page.evaluate(() => ({loads: window.__hmrBenchmark.loads, errors: window.__hmrBenchmark.errors}));
    if (state.loads !== 1 || await child.evaluate(() => window.__hmrDocumentMarker) !== marker) throw new Error('HMR reloaded the preview document.');
    if (state.errors.length) throw new Error(`Preview errors: ${JSON.stringify(state.errors)}`);
    if (index >= 2) samples.push(event.at - started);
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const report = {timestamp: new Date().toISOString(), fixtureUrl, projectId: project.id, kind: 'HMR transport only',
    provider: 'fixture; no real inference', sampleCount: samples.length, warmupCount: 2, samplesMs: samples,
    p50Ms: ordered[Math.ceil(ordered.length * .5) - 1], p95Ms: ordered[Math.ceil(ordered.length * .95) - 1],
    iframeLoads: 1, sameDocument: true, versions: versions.map(record => record.id),
    excludes: ['AI latency', 'source validation/typecheck', 'runtime QA', 'export'], consoleErrors};
  const destination = argument('--output') ?? '/tmp/motionlab-hmr-benchmark.json';
  await fs.writeFile(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await fs.writeFile(activeFile + '.benchmark-pending', original);
  await fs.rename(activeFile + '.benchmark-pending', activeFile);
  await browser.close({silent: true});
}
