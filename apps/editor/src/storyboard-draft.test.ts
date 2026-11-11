import {describe, expect, it} from 'vitest';
import type {Storyboard} from '@studio/studio-core/storyboard';
import {syncStoryboardDraft} from './storyboard-draft.js';

const saved = {concept: 'Original'} as Storyboard;
const edited = {concept: 'Local edit'} as Storyboard;
const remote = {concept: 'Remote edit'} as Storyboard;
const base = {projectId: 'project-a', saved: JSON.stringify(saved), hash: 'original-hash'};

describe('storyboard draft snapshot reconciliation', () => {
  it('preserves edits and their base hash across polling and concurrent remote changes', () => {
    for (const server of [saved, remote]) {
      const next = syncStoryboardDraft(edited, base, 'project-a', JSON.stringify(server), 'server-hash');
      expect(next.draft).toBe(edited);
      expect(next.base).toBe(base);
    }
  });
  it('accepts a remote update when no local edits exist', () => {
    const next = syncStoryboardDraft(saved, base, 'project-a', JSON.stringify(remote), 'remote-hash');
    expect(next.draft).toEqual(remote);
    expect(next.base.hash).toBe('remote-hash');
  });
  it('adopts the new base after saving the local draft rather than creating a false conflict', () => {
    const next = syncStoryboardDraft(edited, base, 'project-a', JSON.stringify(edited), 'saved-hash');
    expect(next.draft).toBe(edited);
    expect(next.base.hash).toBe('saved-hash');
  });
  it('loads the selected project without carrying an unsaved draft from another project', () => {
    const next = syncStoryboardDraft(edited, base, 'project-b', 'null', null);
    expect(next.draft).toBeNull();
    expect(next.base).toEqual({projectId: 'project-b', saved: 'null', hash: null});
  });
});
