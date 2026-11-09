import { loadTypeScript } from './load-typescript.mjs';
import { validateVideoMetadata } from './video-metadata.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
const file = process.argv[2] ?? 'out/motion-lab.mp4';
if (!existsSync(file) || statSync(file).size === 0)
  throw new Error('Missing or empty MP4: ' + file);
const data = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,avg_frame_rate,nb_frames,duration,codec_name',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  ),
);
const { video } = loadTypeScript('../src/spec.ts');
console.log('Validated video:', validateVideoMetadata(data.streams?.[0], video));
