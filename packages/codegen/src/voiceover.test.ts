import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256, type SourceProposal, type VoiceoverTrack} from '@studio/studio-core';
import {materializeSource, readSourceFiles, readSourceVoiceovers} from './source.js';

const shots = [
  {id: 'hook', durationFrames: 120, intent: 'Introduce', visualDirection: 'Title'},
  {id: 'explain', durationFrames: 180, intent: 'Explain', visualDirection: 'Diagram'},
];
const proposal = (): SourceProposal => ({baseRevisionId: null, summary: 'Existing visuals', shots,
  changedFiles: shots.map(shot => ({path: `src/shots/${shot.id}.tsx`, content: `export default () => <div>${shot.id}</div>;`})), deletedFiles: []});
function wav(value = 0): Buffer {
  const bytes = Buffer.alloc(44 + 24_000 * 2, value);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24_000, 24); bytes.writeUInt32LE(48_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

describe('immutable voice-over source snapshots', () => {
  let root: string;
  beforeEach(async () => {root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-voice-source-'));});
  afterEach(async () => {await fs.rm(root, {recursive: true, force: true});});
  async function asset(shotId = 'hook', content = wav()) {
    const file = path.join(root, `${randomUUID()}.wav`);
    await fs.writeFile(file, content);
    const track: VoiceoverTrack = {shotId, assetId: randomUUID(), hash: sha256(content), text: 'Selamat datang.', durationMs: 1000, volume: 0.8, sampleRate: 24_000};
    return {track, file};
  }

  it('adds audio without changing any visual file and seals it into a distinct immutable fingerprint', async () => {
    const original = await materializeSource(root, proposal());
    const before = await fs.readFile(path.join(root, 'source', original.sourceId, 'manifest.json'), 'utf8');
    const audio = await asset();
    const revised = await materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, audio);
    expect(await readSourceFiles(root, revised.sourceId)).toEqual(original.files);
    expect(await readSourceVoiceovers(root, revised.sourceId)).toEqual([audio.track]);
    expect(await readSourceVoiceovers(root, original.sourceId)).toEqual([]);
    expect(await fs.readFile(path.join(root, 'source', original.sourceId, 'manifest.json'), 'utf8')).toBe(before);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'source', revised.sourceId, 'manifest.json'), 'utf8'));
    expect(manifest.sourceHash).not.toBe(JSON.parse(before).sourceHash);
    await fs.writeFile(audio.file, wav(1));
    expect(await fs.readFile(path.join(root, 'source', revised.sourceId, 'audio', `${audio.track.assetId}.wav`))).toEqual(wav());
  });

  it('inherits existing audio when another shot changes and replaces only the selected track', async () => {
    const original = await materializeSource(root, proposal());
    const first = await asset();
    const withHook = await materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, first);
    const second = await asset('explain', wav(1));
    const withBoth = await materializeSource(root, {...proposal(), changedFiles: []}, withHook.sourceId, second);
    const next = await materializeSource(root, {...proposal(), changedFiles: [{path: 'src/shots/explain.tsx', content: 'export default () => <div>Revised diagram</div>;'}]}, withBoth.sourceId);
    expect(await readSourceVoiceovers(root, next.sourceId)).toEqual([second.track, first.track]);
    const replacement = await asset('hook', wav(2));
    const replaced = await materializeSource(root, {...proposal(), changedFiles: []}, next.sourceId, replacement);
    expect(await readSourceVoiceovers(root, replaced.sourceId)).toEqual([second.track, replacement.track]);
    expect(await readSourceVoiceovers(root, withBoth.sourceId)).toEqual([second.track, first.track]);
  });

  it('rejects shortened timelines that would clip inherited narration and leaves the original readable', async () => {
    const original = await materializeSource(root, proposal());
    const audio = await asset();
    const voiced = await materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, audio);
    await expect(materializeSource(root, {...proposal(), shots: shots.map(shot => shot.id === 'hook' ? {...shot, durationFrames: 15} : shot), changedFiles: []}, voiced.sourceId))
      .rejects.toMatchObject({code: 'INVALID_AUDIO'});
    expect(await readSourceVoiceovers(root, voiced.sourceId)).toEqual([audio.track]);
  });

  it('rejects malformed audio, unknown shot ownership, hash mismatches and tampering before reuse', async () => {
    const original = await materializeSource(root, proposal());
    const badHeader = await asset('hook', Buffer.alloc(100));
    await expect(materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, badHeader)).rejects.toThrow();
    await expect(materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, await asset('unknown'))).rejects.toMatchObject({code: 'INVALID_AUDIO'});
    const audio = await asset();
    await expect(materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, {...audio, track: {...audio.track, hash: '0'.repeat(64)}})).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    const voiced = await materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, audio);
    await fs.writeFile(path.join(root, 'source', voiced.sourceId, 'audio', `${audio.track.assetId}.wav`), wav(5));
    await expect(readSourceVoiceovers(root, voiced.sourceId)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    await expect(materializeSource(root, {...proposal(), changedFiles: []}, voiced.sourceId)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
  });

  it('rejects symlinked audio files instead of following them outside the source snapshot', async () => {
    const original = await materializeSource(root, proposal());
    const audio = await asset();
    const voiced = await materializeSource(root, {...proposal(), changedFiles: []}, original.sourceId, audio);
    const saved = path.join(root, 'source', voiced.sourceId, 'audio', `${audio.track.assetId}.wav`);
    await fs.unlink(saved); await fs.symlink(audio.file, saved);
    await expect(readSourceVoiceovers(root, voiced.sourceId)).rejects.toMatchObject({code: 'INVALID_AUDIO'});
  });
});
