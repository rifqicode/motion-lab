import {describe, expect, it} from 'vitest';
import type {StudioStore} from '@studio/storage';
import {StudioEvents} from './events.js';
import {recordPreviewQa, reviewPreviewQa} from './visual-qa.js';

function fixture() {
  const records: Record<string, unknown> = {
    'builds/build/build.json': {id: 'build', sourceHash: 'a'.repeat(64), status: 'ready', smokeFrames: [0, 10, 20, 30],
      shots: [{id: 'one', durationFrames: 20}, {id: 'two', durationFrames: 20}]},
    'builds/build/director.json': {storyboardHash: 'b'.repeat(64), storyboard: {concept: 'IMMUTABLE_APPROVED_GUIDELINES'}},
    'builds/build/preview-qa.json': {issues: [{frame: 30, message: 'Text outside composition'}]},
  };
  const store = {projectPath: () => '/tmp/qa-fixture',
    readJson: async (_: string, relative: string) => records[relative],
    writeJson: async (_: string, relative: string, value: unknown) => {records[relative] = value;},
  } as unknown as StudioStore;
  return {store, records, events: new StudioEvents()};
}

describe('visual QA evidence', () => {
  it('maps geometry warnings to exact shot/local frames and keeps semantic checks inconclusive', async () => {
    const {store, events} = fixture();
    const report = await recordPreviewQa(store, events, 'project', 'build', 'job', 'two');
    expect(report.frames).toEqual([20, 30]);
    expect(report.issues).toEqual([expect.objectContaining({shotId: 'two', globalFrame: 30, localFrame: 10, severity: 'warning'})]);
    expect(report.checks.find(check => check.kind === 'visual consistency')?.status).toBe('inconclusive');
  });

  it('reviews the immutable Director snapshot rather than current project draft', async () => {
    const {store, events} = fixture();
    let prompt = '';
    const runtime = {createThread: async () => 'qa-thread', runTurn: async (options: {prompt: string}) => {
      prompt = options.prompt;
      return {status: 'completed', text: JSON.stringify({summary: 'Sampled frames checked', issues: [
        {shotId: 'two', globalFrame: 30, severity: 'warning', category: 'readability', message: 'Small label'},
      ]})};
    }};
    const result = await reviewPreviewQa({store, events, runtime, projectId: 'project', buildId: 'build', jobId: 'job', signal: new AbortController().signal, repoRoot: '/tmp'});
    expect(prompt).toContain('IMMUTABLE_APPROVED_GUIDELINES');
    expect(result.issues[0].localFrame).toBe(10);
  });

  it('rejects invented frame anchors instead of publishing an unsupported report', async () => {
    const {store, events} = fixture();
    const runtime = {createThread: async () => 'qa-thread', runTurn: async () => ({status: 'completed', text: JSON.stringify({summary: 'Invalid evidence', issues: [
      {shotId: 'two', globalFrame: 21, severity: 'error', category: 'clipping', message: 'Unsupported frame'},
    ]})})};
    await expect(reviewPreviewQa({store, events, runtime, projectId: 'project', buildId: 'build', jobId: 'job', signal: new AbortController().signal, repoRoot: '/tmp'})).rejects.toMatchObject({code: 'QA_INVALID_ANCHOR'});
  });
});
