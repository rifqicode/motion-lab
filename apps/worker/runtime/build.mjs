import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {verifyIsolation} from './isolation.mjs';

const inputPath = process.argv[2];
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const isolationChecks = await verifyIsolation(input.hostSentinelPath);
const repo = input.repoRoot;
const rootRequire = createRequire(path.join(repo, 'package.json'));
const rendererRequire = createRequire(path.join(repo, 'packages/renderer/package.json'));
const cliRequire = createRequire(path.join(repo, 'apps/cli/package.json'));
const ts = rootRequire('typescript');
const {build} = rootRequire('esbuild');
const {bundle} = cliRequire('@remotion/bundler');
const {openBrowser, selectComposition, renderStill} = cliRequire('@remotion/renderer');
const output = '/work/output';
const rendererModules = path.join(repo, 'packages/renderer/node_modules');
const cliModules = path.join(repo, 'apps/cli/node_modules');
const rootModules = path.join(repo, 'node_modules');
const report = (stage) => process.stdout.write(JSON.stringify({type: 'progress', stage}) + '\n');
await fs.mkdir('/tmp/studio-home', {recursive: true});

const sourceFiles = input.files.map(file => path.join('/work/source', file.path));
report('typecheck');
const program = ts.createProgram(sourceFiles, {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, esModuleInterop: true, noEmit: true,
  allowJs: true, checkJs: true,
  baseUrl: output,
  paths: {
    react: [path.join(rendererModules, '@types/react/index.d.ts')],
    'react/jsx-runtime': [path.join(rendererModules, '@types/react/jsx-runtime.d.ts')],
    remotion: [path.join(path.dirname(rendererRequire.resolve('remotion/package.json')), 'dist/cjs/index.d.ts')],
  },
  typeRoots: [path.join(rendererModules, '@types'), path.join(cliModules, '@types')],
  types: ['react'],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnostics(diagnostics.slice(0, 20), {
  getCurrentDirectory: () => '/work/source', getCanonicalFileName: file => file, getNewLine: () => '\n',
}));

const imports = input.shots.map((shot, i) => `import Shot${i} from ${JSON.stringify(`/work/source/src/shots/${shot.id}.tsx`)};`).join('\n');
let offset = 0;
const slots = input.shots.map((shot, i) => {
  const result = `<Sequence from={${offset}} durationInFrames={${shot.durationFrames}}><Slot component={Shot${i}} shotId={${JSON.stringify(shot.id)}} durationInFrames={${shot.durationFrames}} /></Sequence>`;
  offset += shot.durationFrames;
  return result;
}).join('\n');
const composition = `import React from 'react';
import {Sequence,useCurrentFrame} from 'remotion';
${imports}
type Props={shotId:string;frame:number;fps:number;durationInFrames:number;width:number;height:number;assets:Record<string,string>};
const Slot=({component:Component,shotId,durationInFrames}:{component:React.ComponentType<Props>;shotId:string;durationInFrames:number})=><Component shotId={shotId} frame={useCurrentFrame()} fps={30} width={720} height={1280} durationInFrames={durationInFrames} assets={{}}/>;
export const StudioComposition=()=> <div style={{width:720,height:1280,position:'relative',overflow:'hidden',background:'#101418'}}>${slots}</div>;`;
await fs.writeFile(path.join(output, 'composition.tsx'), composition);
await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({name: 'studio-candidate-runtime', private: true, type: 'module'}));
const renderEntry = path.join(output, 'render-entry.tsx');
await fs.writeFile(renderEntry, `import React from 'react';import {Composition,registerRoot} from 'remotion';import {StudioComposition} from './composition';const Root=()=> <Composition id="StudioCandidate" component={StudioComposition} durationInFrames={${offset}} fps={30} width={720} height={1280}/>;registerRoot(Root);`);

report('browser-build');
const previewDir = path.join(output, 'preview');
await fs.mkdir(previewDir, {recursive: true});
await build({
  entryPoints: ['/opt/studio-worker/preview.tsx'], outfile: path.join(previewDir, 'preview.js'), bundle: true,
  platform: 'browser', format: 'iife', jsx: 'automatic', minify: true, logLevel: 'silent',
  nodePaths: [rendererModules, cliModules, rootModules],
  alias: {'studio:composition': path.join(output, 'composition.tsx')},
  define: {'process.env.NODE_ENV': '"production"', __STUDIO_META__: JSON.stringify({buildId: input.buildId, durationFrames: offset, fps: 30, width: 720, height: 1280})},
});
await fs.writeFile(path.join(previewDir, 'index.html'), `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Preview komposisi</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#101418;color:#fff}</style></head><body><main id="root" aria-label="Preview video"></main><script src="./preview.js"></script></body></html>`);

report('render-build');
const renderDir = path.join(output, 'render');
await bundle({entryPoint: renderEntry, outDir: renderDir, rootDir: output, publicDir: null, enableCaching: false,
  webpackOverride: config => ({...config, resolve: {...config.resolve,
    modules: [rendererModules, cliModules, rootModules, 'node_modules', ...(config.resolve?.modules ?? [])],
    extensionAlias: {'.js': ['.ts', '.tsx', '.js'], ...config.resolve?.extensionAlias},
  }}),
});

report('smoke-checking');
const browser = await openBrowser('chrome', {browserExecutable: '/usr/bin/chromium', chromeMode: 'chrome-for-testing', chromiumOptions: {enableMultiProcessOnLinux: true}});
try {
  const selected = await selectComposition({serveUrl: renderDir, id: 'StudioCandidate', puppeteerInstance: browser, timeoutInMilliseconds: 20_000});
  const frames = [...new Set([0, Math.floor(offset * .25), Math.floor(offset * .5), Math.floor(offset * .75), offset - 1])];
  await fs.mkdir(path.join(output, 'smoke'), {recursive: true});
  for (const frame of frames) {
    await renderStill({serveUrl: renderDir, composition: selected, frame, imageFormat: 'png',
      output: path.join(output, 'smoke', `${frame}.png`), puppeteerInstance: browser, timeoutInMilliseconds: 20_000,
      onBrowserLog: log => { if (log.type === 'error') throw new Error(`Browser error: ${log.text}`); },
    });
  }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({durationFrames: offset, smokeFrames: frames, isolationChecks}));
} finally { await browser.close({silent: true}); }
report('ready');
await new Promise(resolve => process.stdout.write('', resolve));
process.exit(0);
