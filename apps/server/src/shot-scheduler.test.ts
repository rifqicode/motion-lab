import {describe, expect, it} from 'vitest';
import {ShotScheduler, type ShotTask} from './shot-scheduler.js';

const task = (shotId: string): ShotTask => ({shotId, status: 'queued', attempt: 1});

describe('shot scheduler', () => {
  it('overlaps two generations but serializes publications without dropping siblings', async () => {
    const scheduler = new ShotScheduler();
    let active = 0; let max = 0; let publishing = 0;
    const merged: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const result = await scheduler.run(['a', 'b', 'c'].map(task), {
      concurrency: 2, signal: new AbortController().signal, onChange: async () => {},
    }, async current => {
      active++; max = Math.max(max, active);
      if (active === 2) release();
      await gate; active--;
      return current.shotId;
    }, async (_, value) => {
      expect(publishing++).toBe(0);
      await Promise.resolve(); merged.push(value); publishing--;
    });
    expect(max).toBe(2);
    expect(merged.sort()).toEqual(['a', 'b', 'c']);
    expect(result.every(item => item.status === 'preview_ready')).toBe(true);
  });

  it('keeps successful siblings when a generation or publication fails', async () => {
    const result = await new ShotScheduler().run(['a', 'b', 'c'].map(task), {
      concurrency: 2, signal: new AbortController().signal, onChange: async () => {},
    }, async current => {
      if (current.shotId === 'a') throw new Error('Provider failed');
      return current.shotId;
    }, async (_, value) => { if (value === 'b') throw new Error('Runtime error'); });
    expect(result.map(item => item.status)).toEqual(['failed', 'failed', 'preview_ready']);
  });

  it('does not publish a late cancelled output and continues the queue', async () => {
    const scheduler = new ShotScheduler();
    const published: string[] = [];
    const result = await scheduler.run(['a', 'b'].map(task), {
      concurrency: 1, signal: new AbortController().signal, onChange: async () => {},
    }, async current => { if (current.shotId === 'a') scheduler.cancel('a'); return current.shotId; },
    async (_, value) => { published.push(value); });
    expect(result.map(item => item.status)).toEqual(['cancelled', 'preview_ready']);
    expect(published).toEqual(['b']);
  });

  it('cancels queued work when the parent is aborted', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await new ShotScheduler().run(['a', 'b'].map(task), {
      concurrency: 2, signal: controller.signal, onChange: async () => {},
    }, async () => { throw new Error('Should not dispatch'); }, async () => {});
    expect(result.map(item => item.status)).toEqual(['cancelled', 'cancelled']);
  });
});
