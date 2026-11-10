import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {materializeSource, readSourceFiles, validateSourceFiles} from './source.js';
import type {SourceProposal} from '../../studio-core/src/index.js';

const entry = 'src/shots/cache.tsx';
const shot = {id: 'cache', durationFrames: 450, intent: 'Explain a cache miss', visualDirection: 'Dark SVG'};
const component = `import React from 'react';
export default function Cache({frame}: {frame: number}) {
  return <svg width={720} height={1280}><text x={100} y={200 + frame}>Cache miss</text></svg>;
}`;
const proposal = (content = component): SourceProposal => ({
  baseRevisionId: null, summary: 'Show the key moving between two nodes.', shots: [{...shot}],
  changedFiles: [{path: entry, content}], deletedFiles: [],
});

describe('generated shot source boundary', () => {
  it('accepts a custom frame-driven React/SVG shot without requiring a template', () => {
    expect(() => validateSourceFiles(proposal())).not.toThrow();
  });

  it.each([
    "import fs from 'node:fs'; export default () => null;",
    "import child from 'child_process'; export default () => null;",
    "import unknown from 'unapproved-package'; export default () => null;",
    "import remote from 'https://example.invalid/module.js'; export default () => null;",
    "const load = () => import('./shared.tsx'); export default () => null;",
    "const load = require('node:fs'); export default () => null;",
    "const run = new Function('return 1'); export default () => null;",
    "const run = eval('1'); export default () => null;",
    "fetch('/api/projects'); export default () => null;",
    "window.parent.postMessage({}, '*'); export default () => null;",
    "const tick = setInterval(() => {}, 10); export default () => null;",
    "const seed = Math.random(); export default () => null;",
    "const time = Date.now(); export default () => null;",
    "export default () => <iframe srcDoc='host code' />;",
    "export default () => <script>host code</script>;",
    "export default () => <div dangerouslySetInnerHTML={{__html: 'host code'}} />;",
    "export default () => <img src='/api/projects' />;",
  ])('rejects forbidden capability in generated code: %s', (content) => {
    expect(() => validateSourceFiles(proposal(content))).toThrow();
  });

  it('rejects malformed TSX before creating a runnable artifact', () => {
    expect(() => validateSourceFiles(proposal('export default function Broken( { return <div>'))).toThrow();
  });

  it('rejects writing outside src or replacing the dependency/build configuration', () => {
    for (const sourcePath of ['../outside.tsx', '/tmp/outside.tsx', 'src/../../outside.tsx', 'package.json', 'src/config.json']) {
      const input = proposal();
      input.changedFiles[0].path = sourcePath;
      expect(() => validateSourceFiles(input)).toThrow();
    }
    expect(() => validateSourceFiles(proposal("import escape from '../../outside.tsx'; export default () => null;"))).toThrow();
  });
});

describe('immutable generated source snapshots', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-test-')); });
  afterEach(async () => { await fs.rm(root, {recursive: true, force: true}); });

  it('merges a scoped revision into a new snapshot while preserving its original source and manifest', async () => {
    const initial = proposal();
    initial.changedFiles.push({path: 'src/shared/Unused.tsx', content: 'export const unused = 1;'});
    const first = await materializeSource(root, initial);
    const firstManifestPath = path.join(root, 'source', first.sourceId, 'manifest.json');
    const originalManifest = await fs.readFile(firstManifestPath, 'utf8');
    const changed = proposal(component.replace('Cache miss', 'Cache MISS'));
    changed.baseRevisionId = 'revision-original';
    changed.deletedFiles = ['src/shared/Unused.tsx'];
    const second = await materializeSource(root, changed, first.sourceId);
    expect(second.sourceId).not.toBe(first.sourceId);
    expect(await readSourceFiles(root, first.sourceId)).toEqual(first.files);
    expect(await fs.readFile(firstManifestPath, 'utf8')).toBe(originalManifest);
    expect(second.files).toEqual(changed.changedFiles);
    expect((await readSourceFiles(root, second.sourceId))[0].content).toContain('Cache MISS');
    const firstManifest = JSON.parse(originalManifest);
    const secondManifest = JSON.parse(await fs.readFile(path.join(root, 'source', second.sourceId, 'manifest.json'), 'utf8'));
    expect(firstManifest.sourceHash).not.toBe(secondManifest.sourceHash);
  });

  it('preserves unchanged shared modules when changing only one shot', async () => {
    const firstInput = proposal("import React from 'react'; import {Label} from '../shared/Label.js'; export default () => <Label />;");
    firstInput.changedFiles.push({path: 'src/shared/Label.tsx', content: "import React from 'react'; export const Label = () => <text>Cache</text>;"});
    const first = await materializeSource(root, firstInput);
    const nextInput = {...firstInput, changedFiles: [{path: entry, content: firstInput.changedFiles[0].content.replace('<Label />', '<g><Label /></g>')}]};
    const next = await materializeSource(root, nextInput, first.sourceId);
    expect(next.files.find((file) => file.path === 'src/shared/Label.tsx')).toEqual(first.files.find((file) => file.path === 'src/shared/Label.tsx'));
  });

  it('requires the declared shot entry, default export and all relative dependencies before sealing a snapshot', async () => {
    const missingEntry = proposal();
    missingEntry.changedFiles[0].path = 'src/shots/other.tsx';
    await expect(materializeSource(root, missingEntry)).rejects.toThrow();
    await expect(materializeSource(root, proposal('export const Cache = () => null;'))).rejects.toThrow();
    await expect(materializeSource(root, proposal("import Missing from '../shared/Missing.tsx'; export default Missing;"))).rejects.toThrow();
    const sourceRootExists = await fs.stat(path.join(root, 'source')).then(() => true, () => false);
    expect(sourceRootExists).toBe(false);
  });

  it('rejects deleting an unknown file or a referenced shared module', async () => {
    const input = proposal("import React from 'react'; import {Label} from '../shared/Label'; export default () => <Label />;");
    input.changedFiles.push({path: 'src/shared/Label.tsx', content: "import React from 'react'; export const Label = () => <text>Cache</text>;"});
    const first = await materializeSource(root, input);
    await expect(materializeSource(root, {...proposal(), changedFiles: [], deletedFiles: ['src/shared/Unknown.tsx']}, first.sourceId)).rejects.toThrow();
    await expect(materializeSource(root, {...proposal(), changedFiles: [], deletedFiles: ['src/shared/Label.tsx']}, first.sourceId)).rejects.toThrow();
    expect(await readSourceFiles(root, first.sourceId)).toEqual(first.files);
  });

  it('detects edits to an immutable saved source file before using it as a revision base', async () => {
    const first = await materializeSource(root, proposal());
    await fs.writeFile(path.join(root, 'source', first.sourceId, entry), component + '\n// modified on disk');
    await expect(readSourceFiles(root, first.sourceId)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    await expect(materializeSource(root, proposal(), first.sourceId)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
  });

  it('detects a modified source-manifest fingerprint or shot timing before reusing a snapshot', async () => {
    const first = await materializeSource(root, proposal());
    const manifestPath = path.join(root, 'source', first.sourceId, 'manifest.json');
    const original = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    await fs.writeFile(manifestPath, JSON.stringify({...original, sourceHash: '0'.repeat(64)}));
    await expect(readSourceFiles(root, first.sourceId)).rejects.toThrow();
    await fs.writeFile(manifestPath, JSON.stringify({...original, shots: [{...original.shots[0], durationFrames: 900}]}));
    await expect(readSourceFiles(root, first.sourceId)).rejects.toThrow();
  });

  it('rejects a symlink in a saved source tree rather than reading outside its snapshot', async () => {
    const first = await materializeSource(root, proposal());
    const savedEntry = path.join(root, 'source', first.sourceId, entry);
    const unrelated = path.join(root, 'unrelated.tsx');
    await fs.writeFile(unrelated, component);
    await fs.unlink(savedEntry);
    await fs.symlink(unrelated, savedEntry);
    await expect(readSourceFiles(root, first.sourceId)).rejects.toMatchObject({code: 'INVALID_SOURCE'});
    expect(await fs.readFile(unrelated, 'utf8')).toBe(component);
  });
});
