import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {verifyIsolation} from './isolation.mjs';
import {openStudioBrowser} from './browser.mjs';

process.on('uncaughtException', error => {console.error(error); process.exit(1);});
process.on('unhandledRejection', error => {console.error(error); process.exit(1);});

const root = process.env.STUDIO_SOURCE_DIR ?? '/work/source';
const output = process.env.STUDIO_OUTPUT_DIR ?? '/work/output';
const input = JSON.parse(await fs.readFile(path.join(root, 'session.json'), 'utf8'));
const requireRoot = createRequire(path.join(input.repoRoot, 'package.json'));
const requireWorker = createRequire(path.join(input.repoRoot, 'apps/worker/package.json'));
const requireRenderer = createRequire(path.join(input.repoRoot, 'packages/renderer/package.json'));
const requireCli = createRequire(path.join(input.repoRoot, 'apps/cli/package.json'));
const {createServer} = await import(pathToFileURL(requireWorker.resolve('vite')).href);
const renderer = requireCli('@remotion/renderer');
const ts = requireRoot('typescript');
const isolationChecks = process.env.STUDIO_LOCAL_RUNTIME === '1'
  ? {localMode: true, hostFileHidden: true, sourceReadOnly: true, rootReadOnly: true, externalNetworkBlocked: true, nonRoot: true}
  : await verifyIsolation(input.hostSentinelPath);
const aliases = ['react/jsx-dev-runtime', 'react/jsx-runtime', 'react-dom/client', 'react-dom', 'react', 'remotion', '@remotion/player'].map(name => ({
  find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: requireRenderer.resolve(name),
}));
let vite;
let probePort = 0;
const respond = (response, status, value) => { response.writeHead(status, {'content-type': 'application/json'}); response.end(JSON.stringify(value)); };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value);
let checking = false;

function typecheck(meta) {
  const rendererModules = path.join(input.repoRoot, 'packages/renderer/node_modules');
  const files = meta.files.map(file => path.join(root, 'versions', meta.buildId, file.path));
  const program = ts.createProgram(files, {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: false,
    skipLibCheck: true, esModuleInterop: true, noEmit: true, allowJs: true, checkJs: false, noImplicitAny: false,
    paths: {react: [path.join(rendererModules, '@types/react/index.d.ts')],
      'react/jsx-runtime': [path.join(rendererModules, '@types/react/jsx-runtime.d.ts')],
      'react/jsx-dev-runtime': [path.join(rendererModules, '@types/react/jsx-dev-runtime.d.ts')],
      remotion: [path.join(path.dirname(requireRenderer.resolve('remotion/package.json')), 'dist/cjs/index.d.ts')]},
    typeRoots: [path.join(rendererModules, '@types')], types: ['react']});
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnostics(diagnostics.slice(0, 20), {
    getCurrentDirectory: () => root, getCanonicalFileName: value => value, getNewLine: () => '\n'}));
}

async function check(meta, frames) {
  console.log(JSON.stringify({stage: 'typecheck', buildId: meta.buildId}));
  try {
    typecheck(meta);
  } catch (error) {
    console.warn('Typecheck warning (non-blocking for preview):', error.message);
  }
  console.log(JSON.stringify({stage: 'browser', buildId: meta.buildId}));
  const browser = await openStudioBrowser(renderer, input.repoRoot);
  const captures = [];
  const issues = [];
  try {
    for (const frame of frames) {
      const errors = [];
      const page = await browser.newPage({context: {sourceMap: null, webpackStats: null}, logLevel: 'error', indent: false,
        pageIndex: 0, onBrowserLog: log => {if (log.type === 'error') errors.push(log.text);}, onLog: () => {}});
      try {
        await page.setViewport({width: 720, height: 1280, deviceScaleFactor: 1});
        await page.goto({url: `http://127.0.0.1:${probePort}${input.basePath}versions/${meta.buildId}/probe.html?probe=1&frame=${frame}`, timeout: 30_000});
        const deadline = Date.now() + 20_000;
        let state;
        do {
          state = await page.evaluate(() => window.__studioProbe ?? null);
          if (state?.error) throw new Error(state.error);
          if (errors.length) throw new Error(errors.join('\n'));
          if (state?.ready) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        } while (Date.now() < deadline);
        if (!state?.ready || state.buildId !== meta.buildId) throw new Error('Preview did not acknowledge the requested source version.');
        const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('text,p,h1,h2,h3,h4,span')).filter(element => {
          const style = getComputedStyle(element);
          if (style.visibility === 'hidden' || Number(style.opacity) === 0 || !element.textContent?.trim()) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.left < -3 || rect.top < -3 || rect.right > 723 || rect.bottom > 1283);
        }).slice(0, 20).map(element => ({text: element.textContent?.slice(0, 120), bounds: element.getBoundingClientRect().toJSON()})));
        for (const item of overflow) issues.push({frame, severity: 'warning', category: 'overflow',
          message: 'Visible text extends outside the composition; check whether this is intentional motion.', evidence: item});
        const screenshot = await page._client().send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
        const file = path.join(output, 'evidence', meta.buildId, `${frame}.png`);
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, Buffer.from(screenshot.value.data, 'base64'));
        captures.push({frame, file});
      } finally { await page.close(); }
    }
    return {captures, isolationChecks, issues};
  } finally { await browser.close({silent: true}); }
}

async function handler(request, response, controls = false) {
  try {
    if (request.url === '/__studio/check' && request.method === 'POST') {
      if (!controls) return respond(response, 403, {error: 'Control requests are only accepted through the private Unix socket.'});
      if (checking) return respond(response, 409, {error: 'Preview validation already running.'});
      let raw = '';
      for await (const chunk of request) {raw += chunk; if (raw.length > 16_384) throw new Error('Request too large.');}
      const data = JSON.parse(raw);
      if (!validId(data.buildId)) throw new Error('Invalid preview version.');
      const meta = JSON.parse(await fs.readFile(path.join(root, 'versions', data.buildId, 'meta.json'), 'utf8'));
      const frames = [...new Set(data.frames)];
      if (!frames.length || frames.length > 100 || frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= meta.durationFrames)) throw new Error('Invalid check frames.');
      checking = true;
      try { return respond(response, 200, await check(meta, frames)); }
      finally { checking = false; }
    }
    if (request.method !== 'GET') return respond(response, 405, {error: 'Method not allowed.'});
    if (request.url === '/__studio/health') return respond(response, 200, {ready: true, isolationChecks});
    response.setHeader('access-control-allow-origin', '*');
    vite.middlewares(request, response, () => {response.writeHead(404); response.end();});
  } catch (error) { respond(response, 422, {error: String(error?.message ?? error).slice(0, 16000)}); }
}
const server = http.createServer((request, response) => void handler(request, response, true));
vite = await createServer({configFile: false, envFile: false, root, base: input.basePath, appType: 'mpa',
  esbuild: {jsx: 'automatic'},
  plugins: [{name: 'studio-probe-no-hmr', transformIndexHtml: {order: 'post', handler(html, context) {
    return context.path.endsWith('/probe.html') ? html.replace(/<script type="module" src="[^"]*\/@vite\/client"><\/script>/g, '') : html;
  }}}],
  cacheDir: path.join(output, '.vite'), logLevel: 'error', resolve: {alias: aliases, dedupe: ['react', 'react-dom', 'remotion']},
  optimizeDeps: {include: ['react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-dom/client', 'remotion', '@remotion/player']},
  server: {middlewareMode: true, cors: true, allowedHosts: ['127.0.0.1', 'localhost'],
    hmr: {server, host: '127.0.0.1', clientPort: input.previewPort, path: 'hmr', overlay: false},
    fs: {strict: true, allow: [root, path.join(input.repoRoot, 'node_modules'), path.join(input.repoRoot, 'packages/renderer/node_modules')],
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/session.json', '**/meta.json']},
    watch: {usePolling: true, interval: 75}}});
await fs.mkdir(output, {recursive: true});
await fs.unlink(path.join(output, 'runtime.sock')).catch(error => {if (error.code !== 'ENOENT') throw error;});
await new Promise(resolve => server.listen(path.join(output, 'runtime.sock'), resolve));
await fs.chmod(path.join(output, 'runtime.sock'), 0o600);
const probeServer = http.createServer((request, response) => void handler(request, response));
await new Promise(resolve => probeServer.listen(0, '127.0.0.1', resolve));
probePort = probeServer.address().port;
console.log(JSON.stringify({ready: true, probePort}));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void vite.close().finally(() => process.exit(0)));
