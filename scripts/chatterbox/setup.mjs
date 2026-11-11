import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(repoRoot, '.cache/chatterbox');
const python = path.join(cache, '.venv/bin/python');
const env = {...process.env, UV_CACHE_DIR: path.join(repoRoot, '.cache/uv'), UV_PYTHON_INSTALL_DIR: path.join(repoRoot, '.cache/python'), HF_HOME: path.join(cache, 'hf')};
async function run(command, args, input) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: repoRoot, env, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit'});
    if (input) child.stdin.end(input);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
await fs.mkdir(cache, {recursive: true});
if (process.argv.includes('--verify-only')) {
  await fs.copyFile(path.join(cache, 'ready.json'), path.join(cache, 'downloaded.json')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
}
await fs.rm(path.join(cache, 'ready.json'), {force: true});
if (!process.argv.includes('--verify-only')) {
  console.log('Preparing isolated Python environment.');
  await run('uv', ['venv', '--python', '3.11', '--allow-existing', path.join(cache, '.venv')]);
  await run('uv', ['pip', 'install', '--python', python, '-r', 'scripts/chatterbox/requirements.txt']);
}
console.log('Checking the required Perth watermark dependency.');
await run(python, ['-c', 'from perth.perth_net.perth_net_implicit.perth_watermarker import PerthImplicitWatermarker; assert callable(PerthImplicitWatermarker)']);
if (!process.argv.includes('--verify-only')) {
  console.log('Staging pinned model files.');
  await run(python, ['scripts/chatterbox/download.py', cache]);
}
env.STUDIO_CHATTERBOX_SETUP_CHECK = '1';
console.log('Running offline Indonesian synthesis to verify the local model.');
await run(python, ['scripts/chatterbox/synthesize.py'], JSON.stringify({text: 'Selamat datang. Ini suara Bahasa Indonesia.', outputPath: path.join(cache, 'setup-smoke.wav')}));
await fs.rename(path.join(cache, 'downloaded.json'), path.join(cache, 'ready.json'));
console.log('Chatterbox Indonesian ready. Inference uses local model files only.');
