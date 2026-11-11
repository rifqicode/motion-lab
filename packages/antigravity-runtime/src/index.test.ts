import { describe, expect, it } from 'vitest';
import { AntigravityRuntime, AntigravityRuntimeError, cleanJsonOutput, sanitizeJsonSchema } from './index.js';

describe('AntigravityRuntime', () => {
  it('creates a thread with UUID and resumes it', async () => {
    const runtime = new AntigravityRuntime();
    const threadId = await runtime.createThread({
      role: 'brainstorm',
      developerInstructions: 'Test instructions',
    });
    expect(threadId).toMatch(/^[0-9a-f-]{36}$/);

    const resumedId = await runtime.resumeThread(threadId);
    expect(resumedId).toBe(threadId);
  });

  it('checks status of executable', async () => {
    const runtime = new AntigravityRuntime();
    const status = await runtime.status();
    expect(typeof status.connected).toBe('boolean');
    expect(typeof status.authenticated).toBe('boolean');
    expect(typeof status.model).toBe('string');
    expect(typeof status.accountLabel).toBe('string');
  });

  it('handles non-existent binary gracefully in status()', async () => {
    const runtime = new AntigravityRuntime({ executable: '/path/to/non-existent-agy-bin' });
    const status = await runtime.status();
    expect(status.connected).toBe(false);
    expect(status.authenticated).toBe(false);
  });

  it('cleans json markdown fences properly', () => {
    const raw = '```json\n{\n  "name": "test"\n}\n```';
    expect(cleanJsonOutput(raw)).toBe('{\n  "name": "test"\n}');

    const plain = '{"name": "test"}';
    expect(cleanJsonOutput(plain)).toBe('{"name": "test"}');
  });

  it('rejects turn if signal already aborted', async () => {
    const runtime = new AntigravityRuntime();
    const controller = new AbortController();
    controller.abort();

    await expect(
      runtime.runTurn({
        threadId: 'test-thread',
        prompt: 'test prompt',
        signal: controller.signal,
      })
    ).rejects.toThrowError(AntigravityRuntimeError);
  });

  it('throws error when executing with invalid executable', async () => {
    const runtime = new AntigravityRuntime({ executable: '/bin/false' });
    await expect(
      runtime.runTurn({
        threadId: 'test-thread',
        prompt: 'test prompt',
      })
    ).rejects.toThrowError(AntigravityRuntimeError);
  });

  it('can close cleanly without active turns', async () => {
    const runtime = new AntigravityRuntime();
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it('sanitizes json schemas by removing enum from integer and number types', () => {
    const schema = {
      type: 'object',
      properties: {
        schemaVersion: { type: 'integer', enum: [1] },
        ratio: { type: 'number', enum: [1.5, 2.0] },
        status: { type: 'string', enum: ['cut', 'fade'] },
        nested: {
          type: 'object',
          properties: {
            count: { type: 'integer', enum: [10] },
          },
        },
      },
    };

    const sanitized = sanitizeJsonSchema(schema) as any;
    expect(sanitized.properties.schemaVersion).toEqual({ type: 'integer' });
    expect(sanitized.properties.ratio).toEqual({ type: 'number' });
    expect(sanitized.properties.status).toEqual({ type: 'string', enum: ['cut', 'fade'] });
    expect(sanitized.properties.nested.properties.count).toEqual({ type: 'integer' });
  });
});
