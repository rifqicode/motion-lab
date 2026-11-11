import {describe, expect, it} from 'vitest';
import {acceptsPreviewMessage, previewConnectionKey} from './preview-connection.js';

describe('live preview connection identity', () => {
  it('keeps the same iframe identity across HMR build versions in one live session', () => {
    expect(previewConnectionKey('project', 'build-a', 'live')).toBe(previewConnectionKey('project', 'build-b', 'live'));
  });
  it('separates project sessions and immutable history builds', () => {
    expect(previewConnectionKey('project-a', 'build-a', 'live')).not.toBe(previewConnectionKey('project-b', 'build-a', 'live'));
    expect(previewConnectionKey('project', 'build-a')).not.toBe(previewConnectionKey('project', 'build-b'));
  });
  it('accepts updated build metadata on the established live MessageChannel', () => {
    expect(acceptsPreviewMessage({version: 1, buildId: 'build-b', sessionId: 'live', type: 'updated'}, 'build-a', 'live')).toBe(true);
  });
  it('rejects incompatible versions and messages from another session', () => {
    for (const value of [null, {}, {version: 2, buildId: 'build-a', sessionId: 'live'}, {version: 1, buildId: 4, sessionId: 'live'}, {version: 1, buildId: 'build-a', sessionId: 'other'}]) {
      expect(acceptsPreviewMessage(value, 'build-a', 'live')).toBe(false);
    }
  });
  it('keeps immutable preview events pinned to the requested history build', () => {
    expect(acceptsPreviewMessage({version: 1, buildId: 'build-a'}, 'build-a')).toBe(true);
    expect(acceptsPreviewMessage({version: 1, buildId: 'build-b'}, 'build-a')).toBe(false);
  });
});
