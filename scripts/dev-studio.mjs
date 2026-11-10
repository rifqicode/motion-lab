import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const alias = Object.fromEntries(['studio-core', 'storage', 'codex-runtime', 'antigravity-runtime', 'codegen'].map(name => [`@studio/${name}`, path.join(root, 'packages', name, 'src', 'index.ts')]));
alias.zod = createRequire(path.join(root, 'apps', 'server', 'package.json')).resolve('zod');
await fs.mkdir(path.join(root, 'out', 'studio-editor'), {recursive: true});
await fs.mkdir(path.join(root, 'out', 'studio-server'), {recursive: true});
const editorEntry = path.join(root, 'apps', 'editor', 'src', 'index.tsx');
const editorExists = await fs.stat(editorEntry).then(() => true, () => false);
if (editorExists) {
  await build({entryPoints: [editorEntry], outfile: path.join(root, 'out', 'studio-editor', 'editor.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', sourcemap: true, alias: {'@studio/studio-core/brief': path.join(root, 'packages/studio-core/src/brief.ts')}, define: {'process.env.NODE_ENV': '"development"'}});
  await fs.copyFile(path.join(root, 'apps', 'editor', 'index.html'), path.join(root, 'out', 'studio-editor', 'index.html'));
} else {
  console.log('Editor UI belum tersedia; API backend tetap dapat dijalankan.');
}
await build({entryPoints: [path.join(root, 'apps', 'server', 'src', 'index.ts')], outfile: path.join(root, 'out', 'studio-server', 'server.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', alias, sourcemap: true});
if (process.argv.includes('--build')) process.exit(0);
const child = spawn(process.execPath, [path.join(root, 'out', 'studio-server', 'server.mjs')], {cwd: root, env: {...process.env, STUDIO_REPO_ROOT: root}, stdio: 'inherit'});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', error => {console.error(error.message); process.exitCode = 1;});
child.on('exit', (code, signal) => {process.exitCode = code ?? (signal ? 1 : 0);});
