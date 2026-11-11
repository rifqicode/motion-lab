import {describe, expect, it} from 'vitest';
import {applyRevisionPatch, revisionStoryboard} from './director-revision.js';
import {board} from '../../../packages/studio-core/test/storyboard-fixture.js';

const plan = {summary: 'Perlambat hook', sharedInstructions: '', designSystem: null,
  updates: [{shotId: 'hook', instructions: 'Retain layout, retime animation over 150 frames.', durationFrames: 150}]};
const files = [{path: 'src/shots/hook.tsx', content: 'export default function Shot(){return <h1>Existing headline</h1>}'}];
const shots = [{id: 'hook', durationFrames: 150, intent: 'Ask why', visualDirection: 'Heading'}];
const patch = {baseRevisionId: 'accepted', shotId: 'hook', summary: 'Change requested text', edits: [{path: files[0].path, oldText: 'Existing headline', newText: 'Revised headline'}]};

describe('bounded Director revisions', () => {
  it('changes requested timing while retaining shot order and untouched metadata', () => {
    const {board: revised} = revisionStoryboard(board, plan, 'hook');
    expect(revised.shots.map(shot => shot.id)).toEqual(board.shots.map(shot => shot.id));
    expect(revised.shots[0].durationFrames).toBe(150);
    expect(revised.shots[1]).toEqual(board.shots[1]);
    expect(revised.designSystem).toEqual(board.designSystem);
  });
  it.each([
    {...plan, updates: [{...plan.updates[0], shotId: 'explain'}]},
    {...plan, sharedInstructions: 'Change shared color'},
    {...plan, designSystem: {...board.designSystem, colors: ['#000000']}},
  ])('rejects a plan escaping selected-shot scope', invalid => {
    expect(() => revisionStoryboard(board, invalid, 'hook')).toThrow('Revisi shot hanya');
  });
  it('allows an explicit shared-only revision in video scope', () => {
    const {board: revised} = revisionStoryboard(board, {...plan, updates: [], sharedInstructions: 'Change existing palette token', designSystem: {...board.designSystem, colors: ['#000000']}});
    expect(revised.shots).toEqual(board.shots);
    expect(revised.designSystem.colors).toEqual(['#000000']);
  });
  it.each([
    {...plan, updates: [plan.updates[0], plan.updates[0]]},
    {...plan, updates: [{...plan.updates[0], shotId: 'unknown'}]},
    {...plan, updates: []},
  ])('rejects duplicate, unknown, or empty revision plans', invalid => {
    expect(() => revisionStoryboard(board, invalid)).toThrow();
  });
  it('applies an exact text edit without changing surrounding source', () => {
    const result = applyRevisionPatch(patch, 'accepted', 'hook', files, shots);
    expect(result.changedFiles).toEqual([{path: files[0].path, content: files[0].content.replace('Existing headline', 'Revised headline')}]);
    expect(result.deletedFiles).toEqual([]);
  });
  it('accepts empty edits only when the caller has verified a real duration change', () => {
    expect(applyRevisionPatch({...patch, edits: []}, 'accepted', 'hook', files, shots, false, true).changedFiles).toEqual([]);
    expect(() => applyRevisionPatch({...patch, edits: []}, 'accepted', 'hook', files, shots)).toThrow('tidak mengubah source');
  });
  it.each([
    {...patch, baseRevisionId: 'another'},
    {...patch, shotId: 'explain'},
    {...patch, edits: [{...patch.edits[0], path: 'src/shots/explain.tsx'}]},
    {...patch, edits: [{...patch.edits[0], path: 'src/shared/design.ts'}]},
    {...patch, edits: [{...patch.edits[0], oldText: files[0].content}]},
    {...patch, edits: [{...patch.edits[0], oldText: 'missing anchor'}]},
    {...patch, edits: [{...patch.edits[0], newText: patch.edits[0].oldText}]},
  ])('rejects stale, cross-scope, whole-file, missing, and no-op patches', invalid => {
    expect(() => applyRevisionPatch(invalid, 'accepted', 'hook', files, shots)).toThrow();
  });
  it('rejects an ambiguous text anchor', () => {
    expect(() => applyRevisionPatch(patch, 'accepted', 'hook', [{...files[0], content: files[0].content + '\n// Existing headline'}], shots)).toThrow('Anchor patch harus unik');
  });
});
