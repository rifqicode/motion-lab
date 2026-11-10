import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateStoryboard } from './generator.js';
import { MockLLMProvider, DEFAULT_MOCK_PROJECT } from './providers/mock.js';
import { cleanJsonOutput } from './generator.js';
import { StoryboardCache, computeStoryboardHash } from './cache.js';

const TEST_CACHE_DIR = path.resolve(process.cwd(), '.cache/test-storyboard');

describe('Storyboard Generator', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_CACHE_DIR)) {
      fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_CACHE_DIR)) {
      fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    }
  });

  it('cleans json output with markdown fences', () => {
    const raw = '```json\n{"hello": "world"}\n```';
    expect(cleanJsonOutput(raw)).toBe('{"hello": "world"}');
  });

  it('generates a valid storyboard with MockLLMProvider', async () => {
    const provider = new MockLLMProvider();
    const result = await generateStoryboard({
      sourceText: 'PostgreSQL CDC Architecture with WAL and Debezium',
      provider,
      options: {
        cacheDir: TEST_CACHE_DIR,
        useCache: false,
      },
    });

    expect(result.cached).toBe(false);
    expect(result.retries).toBe(0);
    expect(result.project.id).toBe(DEFAULT_MOCK_PROJECT.id);
    expect(result.project.scenes.length).toBe(2);
    expect(result.project.aspectRatio).toBe('9:16');
  });

  it('auto-repairs when LLM returns invalid schema on first attempt', async () => {
    // 1 failure attempt, then succeeds
    const provider = new MockLLMProvider({ failAttempts: 1 });
    const result = await generateStoryboard({
      sourceText: 'Auto repair test',
      provider,
      options: {
        cacheDir: TEST_CACHE_DIR,
        useCache: false,
        maxRetries: 2,
      },
    });

    expect(result.retries).toBe(1);
    expect(provider.getCallCount()).toBe(2);
    expect(result.project.scenes.length).toBe(2);
  });

  it('throws when maxRetries is exceeded on persistent invalid schema', async () => {
    // 3 failure attempts, maxRetries = 1
    const provider = new MockLLMProvider({ failAttempts: 3 });
    await expect(
      generateStoryboard({
        sourceText: 'Exceeded retries test',
        provider,
        options: {
          cacheDir: TEST_CACHE_DIR,
          useCache: false,
          maxRetries: 1,
        },
      })
    ).rejects.toThrow(/Failed to generate valid storyboard after 2 attempt\(s\)/);
  });

  it('caches generated storyboard and reuses it on subsequent calls', async () => {
    const provider = new MockLLMProvider();
    const sourceText = 'PostgreSQL Change Data Capture';

    // 1st call: not cached
    const res1 = await generateStoryboard({
      sourceText,
      provider,
      options: { cacheDir: TEST_CACHE_DIR, useCache: true },
    });
    expect(res1.cached).toBe(false);
    expect(provider.getCallCount()).toBe(1);

    // 2nd call: cached
    const res2 = await generateStoryboard({
      sourceText,
      provider,
      options: { cacheDir: TEST_CACHE_DIR, useCache: true },
    });
    expect(res2.cached).toBe(true);
    // Provider shouldn't be called again
    expect(provider.getCallCount()).toBe(1);
    expect(res2.project.id).toBe(res1.project.id);
  });
});
