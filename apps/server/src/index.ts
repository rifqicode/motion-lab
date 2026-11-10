import path from 'node:path';
import {StudioService} from './service.js';
import {createStudioHttp} from './http.js';

const repoRoot = path.resolve(process.env.STUDIO_REPO_ROOT ?? process.cwd());
const port = Number(process.env.STUDIO_PORT ?? 4180);
const previewPort = Number(process.env.STUDIO_PREVIEW_PORT ?? 4181);
if (![port, previewPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535) || port === previewPort) throw new Error('Studio ports must be distinct integers between 1024 and 65535.');

const service = new StudioService({repoRoot, projectRoot: path.resolve(process.env.STUDIO_PROJECT_ROOT ?? path.join(repoRoot, '.studio', 'projects')), runtimeImage: process.env.STUDIO_RUNTIME_IMAGE});
await service.start();
const http = await createStudioHttp({service, editorDir: path.join(repoRoot, 'out', 'studio-editor'), port, previewPort}).catch(async error => {await service.close(); throw error;});
console.log(`Local studio: http://127.0.0.1:${port}`);
console.log('M0: silent 2D, Codex subscription login, local JSON/source files.');
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await http.close();
  await service.close();
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {void close().then(() => process.exit(0), error => {console.error(error.message); process.exit(1);});});
