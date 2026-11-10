import {describe, expect, it} from 'vitest';
import {SourceProposalSchema, assertCandidateTransition, briefHash, validateSourcePath} from './index.js';

const proposal = () => ({
  baseRevisionId: null,
  summary: 'Introduce a cache node and highlight a miss.',
  shots: [{id: 'cache', durationFrames: 450, intent: 'Explain a cache miss', visualDirection: 'Dark SVG diagram'}],
  changedFiles: [{path: 'src/shots/cache.tsx', content: 'export default function Cache() { return null; }'}],
  deletedFiles: [],
});

describe('studio source contracts', () => {
  it('accepts scoped source edits with a stable shot identity and expected base revision', () => {
    const input = {...proposal(), baseRevisionId: 'revision-previous'};
    expect(SourceProposalSchema.parse(input)).toEqual(input);
    expect(validateSourcePath('src/shared/ServerIcon.tsx')).toBe('src/shared/ServerIcon.tsx');
  });

  it.each([
    '../outside.tsx', '/tmp/outside.tsx', 'src/../outside.tsx', 'src/./shot.tsx',
    'src//shot.tsx', 'src\\shot.tsx', 'src/C:/shot.tsx', 'src/shot\0.tsx',
    'package.json', 'src/package.json', 'src/shot.tsx/../../outside.tsx',
  ])('rejects a source path that could escape or change executable configuration: %s', (path) => {
    expect(() => validateSourcePath(path)).toThrow();
    const input = proposal();
    input.changedFiles[0].path = path;
    expect(SourceProposalSchema.safeParse(input).success).toBe(false);
  });

  it('rejects duplicate, conflicting file changes and duplicate stable shot IDs', () => {
    const duplicateFile = proposal();
    duplicateFile.changedFiles.push({...duplicateFile.changedFiles[0]});
    expect(SourceProposalSchema.safeParse(duplicateFile).success).toBe(false);

    const conflictingFile = proposal();
    conflictingFile.deletedFiles = [conflictingFile.changedFiles[0].path];
    expect(SourceProposalSchema.safeParse(conflictingFile).success).toBe(false);

    const duplicateShot = proposal();
    duplicateShot.shots.push({...duplicateShot.shots[0]});
    expect(SourceProposalSchema.safeParse(duplicateShot).success).toBe(false);
  });

  it('limits UTF-8 bytes rather than only character count', () => {
    const input = proposal();
    input.changedFiles[0].content = '界'.repeat(22_000);
    expect(input.changedFiles[0].content.length).toBeLessThan(65_536);
    expect(SourceProposalSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unrecognized model output fields and out-of-range frame durations', () => {
    expect(SourceProposalSchema.safeParse({...proposal(), command: 'run arbitrary shell'}).success).toBe(false);
    for (const frames of [0, -1, 1.5, 2701]) {
      const input = proposal();
      input.shots[0].durationFrames = frames;
      expect(SourceProposalSchema.safeParse(input).success).toBe(false);
    }
  });

  it('does not let cancelled, failed, discarded or applied candidates become ready again', () => {
    for (const state of ['cancelled', 'failed', 'discarded', 'applied', 'stale'] as const) {
      expect(() => assertCandidateTransition(state, 'ready')).toThrow();
    }
    expect(() => assertCandidateTransition('building', 'applied')).toThrow();
    expect(() => assertCandidateTransition('smoke-checking', 'ready')).not.toThrow();
  });

  it('changes approval hashes when creative instructions change while ignoring surrounding whitespace', () => {
    expect(briefHash('  Explain cache misses.\n')).toBe(briefHash('Explain cache misses.'));
    expect(briefHash('Explain cache misses.')).not.toBe(briefHash('Explain cache hits.'));
  });
});
