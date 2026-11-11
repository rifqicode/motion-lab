import {describe, expect, it} from 'vitest';
import type {ServerResponse} from 'node:http';
import {StudioEvents} from './events.js';

function response() {
  const chunks: string[] = [];
  return {chunks, response: {destroyed: false, writableLength: 0, write: (text: string) => chunks.push(text)} as unknown as ServerResponse};
}
describe('activity SSE resync', () => {
  it('replays only the project and supplies timestamps', () => {
    const events = new StudioEvents(); const target = response();
    events.publish('one', 'shot.queued', {shotId: 'hook'});
    events.publish('two', 'shot.failed', {});
    const stop = events.subscribe('one', target.response);
    expect(target.chunks.join('')).toContain('shot.queued');
    expect(target.chunks.join('')).toContain('timestamp');
    expect(target.chunks.join('')).not.toContain('shot.failed'); stop();
  });
  it('requests snapshot resync after a server restart', () => {
    const events = new StudioEvents(); const target = response();
    const stop = events.subscribe('one', target.response, 500);
    expect(target.chunks.join('')).toContain('stream.reset');
    expect(target.chunks.join('')).toContain('id: 0'); stop();
  });
  it('requests resync when a reconnect cursor predates retained history', () => {
    const events = new StudioEvents(); const target = response();
    for (let i = 0; i < 605; i++) events.publish('one', 'shot.queued', {});
    const stop = events.subscribe('one', target.response, 1);
    expect(target.chunks.join('')).toContain('stream.reset'); stop();
  });
});
