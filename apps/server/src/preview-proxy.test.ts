import {describe, expect, it} from 'vitest';
import {validatePreviewPath} from './preview-proxy.js';

describe('preview proxy routes', () => {
  it.each(['/p/project/live/index.html', '/p/project/live/@vite/client', '/p/project/live/@fs/work/output/.vite/deps/react.js'])('allows runtime module %s', path => {
    expect(validatePreviewPath(path)).toBe(path);
  });
  it.each(['/p/project/live/%2e%2e/secret', '/p/project/live/%5csecret', '/p/project/live/__studio/check',
    '/p/project/live/session.json', '/p/project/live/.env', '/p/project/live/.git/config', '/p/project/live/%00', '/p/project/live/%invalid'])('rejects private/control/invalid path %s', path => {
    expect(() => validatePreviewPath(path)).toThrow();
  });
});
