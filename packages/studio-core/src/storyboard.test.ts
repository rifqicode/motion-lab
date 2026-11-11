import {describe, expect, it} from 'vitest';
import {StoryboardSchema, serializeStoryboard, resolveFrame, shotGlobalFrame} from './storyboard.js';
import {board} from '../test/storyboard-fixture.js';

describe('Director storyboard contract', () => {
  it('normalizes field ordering and text for a stable browser/server fingerprint', () => {
    expect(serializeStoryboard({...board, concept: ' Cache routing '})).toBe(serializeStoryboard(board));
    expect(serializeStoryboard({...board, shots: [...board.shots].reverse()})).not.toBe(serializeStoryboard(board));
    expect(StoryboardSchema.parse({...board, shots: [...board.shots].reverse()}).shots.map(shot => shot.id)).toEqual(['explain', 'hook']);
  });

  it('rejects duplicate identities, unknown references, cycles and unsupported transitions', () => {
    expect(StoryboardSchema.safeParse({...board, shots: [board.shots[0], board.shots[0]]}).success).toBe(false);
    expect(StoryboardSchema.safeParse({...board, shots: [{...board.shots[0], dependencies: ['missing']}]}).success).toBe(false);
    expect(StoryboardSchema.safeParse({...board, shots: [{...board.shots[0], sharedComponents: ['missing']}]}).success).toBe(false);
    expect(StoryboardSchema.safeParse({...board, shots: [{...board.shots[0], dependencies: ['explain']}, board.shots[1]]}).success).toBe(false);
    expect(StoryboardSchema.safeParse({...board, shots: [{...board.shots[0], transition: 'crossfade'}]}).success).toBe(false);
    expect(StoryboardSchema.safeParse({...board, designSystem: {...board.designSystem, colors: ['url(https://invalid)']}}).success).toBe(false);
  });

  it('resolves global/local frames at both sides of a cut without moving stable IDs', () => {
    expect(resolveFrame(board.shots, 89)).toEqual({shotId: 'hook', localFrame: 89, startFrame: 0});
    expect(resolveFrame(board.shots, 90)).toEqual({shotId: 'explain', localFrame: 0, startFrame: 90});
    expect(resolveFrame(board.shots, 269)).toEqual({shotId: 'explain', localFrame: 179, startFrame: 90});
    expect(resolveFrame(board.shots, 270)).toBeNull();
    expect(resolveFrame(board.shots, -1)).toBeNull();
    expect(resolveFrame(board.shots, 1.5)).toBeNull();
    expect(shotGlobalFrame(board.shots, 'explain', 72)).toBe(162);
    expect(() => shotGlobalFrame(board.shots, 'explain', 180)).toThrow();
    expect(() => shotGlobalFrame(board.shots, 'missing', 0)).toThrow();
  });
});
