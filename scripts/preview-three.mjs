import {build, context} from 'esbuild';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const internetMode = process.argv.includes('--internet');
const outputDirectory = path.join(root, internetMode ? 'out/internet-preview' : 'out/three-preview');
const buildOnly = process.argv.includes('--build');
const portIndex = process.argv.indexOf('--port');
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535');
await fs.mkdir(outputDirectory, {recursive: true});
let internetProject;
if (internetMode) {
  const directory = path.join(root, 'examples/how-internet-works');
  internetProject = JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8'));
  internetProject.scenes = await Promise.all(internetProject.scenes.map(async scene => ({...scene, audioFile: `data:audio/mpeg;base64,${(await fs.readFile(path.join(directory, scene.audioFile))).toString('base64')}`})));
}

const options = {
  entryPoints: [path.join(root, internetMode ? 'packages/renderer/src/internet/Preview.tsx' : 'packages/renderer/src/three-pilot/Preview.tsx')],
  outfile: path.join(outputDirectory, 'preview.js'),
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  legalComments: 'inline',
  define: {'process.env.NODE_ENV': '"production"', ...(internetMode ? {__INTERNET_PROJECT__: JSON.stringify(internetProject)} : {})},
  plugins: [{name: 'standalone-html', setup(builder) {
    builder.onEnd(async result => {
      if (result.errors.length) return;
      const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text || '';
      const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
      const template = await fs.readFile(path.join(root, internetMode ? 'packages/renderer/src/internet/preview.html' : 'packages/renderer/src/three-pilot/preview.html'), 'utf8');
      const html = template.replace('<!-- STYLES -->', () => `<style>${css}</style>`).replace('<!-- SCRIPT -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
      await fs.writeFile(path.join(outputDirectory, 'index.html'), html);
      console.log(`Built standalone HTML: ${path.join(outputDirectory, 'index.html')}`);
    });
  }}],
};

if (buildOnly) {
  await build(options);
} else {
  const bundler = await context(options);
  await bundler.rebuild();
  await bundler.watch();
  const server = createServer(async (request, response) => {
    if (request.url === '/favicon.ico') {response.writeHead(204).end(); return;}
    if (request.url !== '/' && request.url !== '/index.html') {response.writeHead(404).end('Not found'); return;}
    try {
      const html = await fs.readFile(path.join(outputDirectory, 'index.html'));
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(html);
    } catch {
      response.writeHead(503).end('Preview is rebuilding. Refresh in a moment.');
    }
  });
  server.on('error', async error => {console.error(error.message); await bundler.dispose(); process.exitCode = 1;});
  server.listen(port, '127.0.0.1', () => console.log(`Local ${internetMode ? 'internet video' : '3D'} preview: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close();
    bundler.dispose().finally(() => process.exit(0));
  });
}
