import {describe, expect, it} from 'vitest';
import {sortGenerationRuns, type GenerationRun} from './studio-state.js';

describe('generation run recency', () => {
  it('selects the newest run by creation time rather than UUID filename order', () => {
    const earlier: GenerationRun = {candidateId: 'zzz-earlier', createdAt: '2026-11-11T10:00:00.000Z', shots: []};
    const latest: GenerationRun = {candidateId: 'aaa-latest', createdAt: '2026-11-11T10:01:00.000Z', shots: []};
    const fromFilesystem = [latest, earlier];
    const sorted = sortGenerationRuns(fromFilesystem);
    expect(sorted.at(-1)).toBe(latest);
    expect(fromFilesystem).toEqual([latest, earlier]);
  });
  it('retains runs without timestamps and sorts ties deterministically', () => {
    const runs: GenerationRun[] = [{candidateId: 'z', shots: []}, {candidateId: 'a', shots: []}];
    expect(sortGenerationRuns(runs).map(run => run.candidateId)).toEqual(['a', 'z']);
  });
});
