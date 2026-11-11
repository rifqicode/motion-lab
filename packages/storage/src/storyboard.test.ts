import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {StudioStore} from './index.js';
import {board} from '../../studio-core/test/storyboard-fixture.js';

describe('storyboard persistence and approval', () => {
  let root: string;
  let store: StudioStore;
  let projectId: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-storyboard-'));
    store = new StudioStore(root);
    await store.acquireLock();
    projectId = (await store.createProject('Director fixture', 'Explain cache routing')).id;
  });
  afterEach(async () => { await store.releaseLock(); await fs.rm(root, {recursive: true, force: true}); });

  it('loads legacy projects without mutating them and preserves explicit storyboard approval', async () => {
    const original = await fs.readFile(path.join(root, projectId, 'project.json'), 'utf8');
    expect((await store.getSnapshot(projectId)).storyboard).toEqual({draft: null, hash: null, approvedHash: null, briefHash: null});
    expect(await fs.readFile(path.join(root, projectId, 'project.json'), 'utf8')).toBe(original);
    const saved = await store.saveStoryboard(projectId, board, null);
    const approved = await store.approveStoryboard(projectId, saved.hash!);
    expect(approved.approvedHash).toBe(saved.hash);
    expect((await store.getProject(projectId)).approvedBriefHash).toBe(approved.briefHash);
    expect((await store.saveStoryboard(projectId, board, saved.hash)).approvedHash).toBe(saved.hash);
    const reordered = await store.saveStoryboard(projectId, {...board, shots: [...board.shots].reverse()}, saved.hash);
    expect(reordered.approvedHash).toBeNull();
    expect(reordered.draft?.shots.map(shot => shot.id)).toEqual(['explain', 'hook']);
  });

  it('rejects stale concurrent edits and refuses generic writes to approval records', async () => {
    const first = await store.saveStoryboard(projectId, board, null);
    const edits = await Promise.allSettled([
      store.saveStoryboard(projectId, {...board, hook: 'First edit'}, first.hash),
      store.saveStoryboard(projectId, {...board, hook: 'Second edit'}, first.hash),
    ]);
    expect(edits.filter(edit => edit.status === 'fulfilled')).toHaveLength(1);
    expect(edits.filter(edit => edit.status === 'rejected')).toHaveLength(1);
    await expect(store.approveStoryboard(projectId, first.hash!)).rejects.toMatchObject({code: 'STALE_STORYBOARD'});
    await expect(store.writeJson(projectId, 'storyboard.json', first)).rejects.toMatchObject({code: 'RESERVED_RECORD'});
  });

  it('invalidates approval on brief/style changes, even if the old brief is later restored', async () => {
    const saved = await store.saveStoryboard(projectId, board, null);
    await store.approveStoryboard(projectId, saved.hash!);
    await store.updateBrief(projectId, 'Different story');
    expect((await store.getStoryboard(projectId)).approvedHash).toBeNull();
    await expect(store.approveStoryboard(projectId, saved.hash!)).rejects.toMatchObject({code: 'STALE_BRIEF'});
    await store.updateBrief(projectId, 'Explain cache routing');
    expect((await store.getStoryboard(projectId)).approvedHash).toBeNull();
    await store.approveStoryboard(projectId, saved.hash!);
    await store.updateStyle(projectId, {mood: 'Bright'});
    expect((await store.getStoryboard(projectId)).approvedHash).toBeNull();
  });

  it('detects changed storyboard content under an unchanged fingerprint', async () => {
    await store.saveStoryboard(projectId, board, null);
    const file = path.join(root, projectId, 'storyboard.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    record.draft.hook = 'Tampered';
    await fs.writeFile(file, JSON.stringify(record));
    await expect(store.getStoryboard(projectId)).rejects.toMatchObject({code: 'INVALID_STORYBOARD'});
  });

  it('allows approving storyboard when brief is empty as long as briefHash matches', async () => {
    const emptyBriefProject = await store.createProject('Empty brief project', '');
    const saved = await store.saveStoryboard(emptyBriefProject.id, board, null);
    const approved = await store.approveStoryboard(emptyBriefProject.id, saved.hash!);
    expect(approved.approvedHash).toBe(saved.hash);
  });
});
