import ts from 'typescript';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
// Load TypeScript engine modules with the installed compiler; no extra test dependency.
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const { nodeSchema, illustrationSchema } = require('../src/illustration/schema.ts');
const {
  nodePose,
  bezier,
  cameraPose,
  sampleTrack,
  tween,
  squash,
  anticipate,
} = require('../src/illustration/motion.ts');
const { compileStoryboard } = require('../src/storyboard/compile.ts');
const { storyboard } = require('../src/storyboard/example.ts');
const {
  validateIllustration,
  illustrationAssets,
  registerIllustrationAsset,
} = require('../src/illustration/registry.ts');
const { graphSchema } = require('../src/graph/schema.ts');
let tests = 0;
const test = (name, fn) => {
  fn();
  tests++;
  console.log(`PASS ${name}`);
};
const scene = (nodes) => illustrationSchema.parse({ nodes });
const n = (extra = {}) => nodeSchema.parse({ id: 'thing', kind: 'group', ...extra });
test('reject unknown nodes, nonfinite positions and malformed path geometry', () => {
  assert.throws(() => n({ kind: 'bitmap' }));
  assert.throws(() => n({ x: Infinity }));
  assert.throws(() => n({ kind: 'path' }));
});
test('reject unordered tracks, duplicate properties and invalid opacity', () => {
  assert.throws(() => n({ tracks: [tween('x', 0, 0, 0, 1)] }));
  assert.throws(() => n({ tracks: [tween('x', 0, 1, 0, 1), tween('x', 1, 1, 1, 2)] }));
  assert.throws(() => n({ tracks: [tween('opacity', 0, 1, 0, 2)] }));
});
test('reject duplicate siblings and broken clip/mask references', () => {
  assert.throws(() => scene([n(), n()]));
  assert.throws(() => scene([n({ clip: 'missing' })]));
  assert.throws(() => scene([n({ mask: 'missing' })]));
});
test('asset references, layer overrides and timing are checked before rendering', () => {
  assert.throws(() => validateIllustration(scene([n({ kind: 'asset', asset: 'missing' })]), 5));
  assert.throws(() =>
    validateIllustration(
      scene([
        n({
          kind: 'asset',
          asset: 'coffee-bean',
          layerTracks: { missing: [tween('x', 0, 1, 0, 1)] },
        }),
      ]),
      5,
    ),
  );
  assert.throws(() => validateIllustration(scene([n({ tracks: [tween('x', 4, 2, 0, 1)] })]), 5));
});
test('tracks clamp and arbitrary frame seeks are deterministic', () => {
  const t = tween('x', 1, 2, 10, 100, 'linear');
  assert.equal(sampleTrack(t, 0, 60), 10);
  assert.equal(sampleTrack(t, 4, 60), 100);
  assert.equal(sampleTrack(t, 2, 60), 55);
  const node = n({ tracks: [t] });
  const before = nodePose(node, 2.7, 60);
  nodePose(node, 0.1, 60);
  assert.deepEqual(nodePose(node, 2.7, 60), before);
});
test('path movement has correct endpoints, orientation and camera clamps', () => {
  const points = [
    [0, 0],
    [0, 100],
    [100, 100],
    [100, 0],
  ];
  assert.deepEqual(bezier(points, 0), [0, 0]);
  assert.deepEqual(bezier(points, 1), [100, 0]);
  assert.deepEqual(bezier(points, 0.5), [50, 75]);
  const node = n({ follow: { points, start: 1, duration: 2, orient: true } });
  assert.deepEqual([nodePose(node, 3, 60).x, nodePose(node, 3, 60).y], [100, 0]);
  assert.equal(
    cameraPose(
      [
        { time: 0, x: 0, y: 0, zoom: 1 },
        { time: 2, x: 10, y: 10, zoom: 2 },
      ],
      5,
    ).zoom,
    2,
  );
});
test('squash and anticipation return to authored hold values', () => {
  const node = n({ tracks: squash(0, 1) });
  assert.equal(nodePose(node, 2, 60).scaleX, 1);
  assert.equal(nodePose(node, 2, 60).scaleY, 1);
  const a = n({ tracks: anticipate('x', 0, 1, 0, 10) });
  assert.ok(nodePose(a, 0.2, 60).x < 0);
  assert.ok(nodePose(a, 0.8, 60).x > 10);
  assert.equal(nodePose(a, 1, 60).x, 10);
});
test('all registered assets have bounds, provenance and unique layer targets', () => {
  for (const asset of Object.values(illustrationAssets)) {
    assert.ok(asset.bounds[2] > 0 && asset.bounds[3] > 0);
    assert.ok(asset.source && asset.license);
    const ids = [];
    const visit = (ns) =>
      ns.forEach((n) => {
        ids.push(n.id);
        visit(n.children);
      });
    visit(asset.layers);
    assert.equal(new Set(ids).size, ids.length);
  }
});
test('registration rejects missing metadata, duplicate IDs and unknown style tokens', () => {
  assert.throws(() => registerIllustrationAsset({ id: 'bad', layers: [n()] }));
  assert.throws(() => registerIllustrationAsset({ ...illustrationAssets['coffee-bean'] }));
  assert.throws(() =>
    registerIllustrationAsset({
      ...illustrationAssets['coffee-bean'],
      id: 'bad-token',
      layers: [n({ fill: '$unknown' })],
    }),
  );
});
test('definitions reject recursive masks and asset cycles are rejected', () => {
  assert.throws(() =>
    illustrationSchema.parse({
      nodes: [n()],
      masks: [{ id: 'self', nodes: [n({ mask: 'self' })] }],
    }),
  );
  illustrationAssets['cycle-fixture'] = {
    ...illustrationAssets['coffee-bean'],
    id: 'cycle-fixture',
    layers: [n({ kind: 'asset', asset: 'cycle-fixture' })],
  };
  try {
    assert.throws(() =>
      validateIllustration(scene([n({ kind: 'asset', asset: 'cycle-fixture' })]), 5),
    );
  } finally {
    delete illustrationAssets['cycle-fixture'];
  }
});
test('coffee compiles to exactly 900 frames with independently animated nodes', () => {
  const { scenes } = compileStoryboard(storyboard);
  assert.equal(scenes.length, 3);
  assert.equal(scenes.at(-1).from + scenes.at(-1).duration, 900);
  scenes.forEach((s) => assert.equal(s.kind, 'illustrated'));
  assert.throws(() => compileStoryboard({ ...storyboard, shots: storyboard.shots.slice(1) }));
});
test('legacy storyboard and 3D graph contract still compile', () => {
  const visuals = ['phone', 'graph', 'finale'];
  const legacy = {
    ...storyboard,
    shots: storyboard.shots.map((s, i) => ({
      ...s,
      visual: visuals[i],
      illustration: undefined,
      assets: [
        {
          id: i === 2 ? 'earth' : i === 1 ? 'router' : 'device',
          type: 'procedural-3d',
          description: 'Legacy asset',
        },
      ],
      graph:
        i === 1 ? graphSchema.parse({ objects: [{ id: 'router', asset: 'router' }] }) : undefined,
    })),
  };
  const { scenes } = compileStoryboard(legacy);
  assert.deepEqual(
    scenes.map((s) => s.kind),
    visuals,
  );
  assert.equal(scenes[1].graph.objects[0].asset, 'router');
});

const { resolveCues } = require('../src/storyboard/timeline.ts');
const { morphPath } = require('../src/illustration/path-morph.ts');
const { sampleColorTrack } = require('../src/illustration/motion.ts');
const { layoutFor } = require('../src/illustration/layout.ts');
test('cue chains move downstream actions when an upstream duration changes', () => {
  const a = resolveCues(
    {
      load: { at: 0.2, duration: 1 },
      dock: { after: 'load', duration: 0.5 },
      flow: { after: 'dock', duration: 1 },
    },
    5,
  );
  const b = resolveCues(
    {
      load: { at: 0.2, duration: 1.5 },
      dock: { after: 'load', duration: 0.5 },
      flow: { after: 'dock', duration: 1 },
    },
    5,
  );
  assert.ok(Math.abs(b.flow.start - a.flow.start - 0.5) < 1e-8);
  assert.throws(() => resolveCues({ a: { after: 'b' }, b: { after: 'a' } }, 5));
  assert.throws(() => resolveCues({ a: { after: 'missing' } }, 5));
  assert.throws(() => resolveCues({ a: { at: 4, duration: 2 } }, 5));
});
test('raw storyboard cue references remain live through compilation', () => {
  const base = compileStoryboard(storyboard);
  const edited = structuredClone(storyboard);
  edited.shots[1].cues.load.duration += 0.25;
  const next = compileStoryboard(edited);
  const find = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const child = find(n.children, id);
      if (child) return child;
    }
  };
  const before = find(base.scenes[1].illustration.nodes, 'stream'),
    after = find(next.scenes[1].illustration.nodes, 'stream');
  assert.ok(Math.abs(after.tracks[0].keys[0].time - before.tracks[0].keys[0].time - 0.25) < 1e-8);
  const cupA = find(base.scenes[1].illustration.nodes, 'liquid'),
    cupB = find(next.scenes[1].illustration.nodes, 'liquid');
  assert.ok(Math.abs(cupB.tracks[0].keys[1].time - cupA.tracks[0].keys[1].time - 0.25) < 1e-8);
});
test('custom dimensions, FPS and total duration compile without fixed 15-second limit', () => {
  const custom = {
    ...storyboard,
    video: { width: 1920, height: 1080, fps: 24 },
    shots: storyboard.shots.map((s, i) => ({
      ...s,
      cues: {},
      visual: 'phone',
      illustration: undefined,
      durationSeconds: [0.333, 0.333, 0.334][i],
    })),
  };
  const result = compileStoryboard(custom);
  assert.equal(result.video.durationInFrames, 24);
  assert.deepEqual(
    result.scenes.map((s) => s.duration),
    [8, 8, 8],
  );
  assert.equal(result.video.width, 1920);
  assert.throws(() =>
    compileStoryboard({ ...custom, video: { ...custom.video, durationSeconds: 10 } }),
  );
  assert.throws(() => compileStoryboard({ ...custom, video: { width: -1 } }));
});
test('landscape and square layouts reserve separate text and illustration zones', () => {
  const landscape = layoutFor(1920, 1080),
    square = layoutFor(1080, 1080);
  assert.equal(landscape.mode, 'landscape');
  assert.ok(landscape.margin + landscape.titleWidth < landscape.art.left);
  assert.equal(square.mode, 'square');
  assert.ok(square.art.top + square.art.height < square.captionY);
  assert.equal(layoutFor(540, 960).titleFont, 45);
});
test('gradient references and stop order are validated', () => {
  assert.throws(() => validateIllustration(scene([n({ fill: '@missing' })]), 5));
  assert.throws(() =>
    illustrationSchema.parse({
      nodes: [n()],
      paints: [
        {
          id: 'bad',
          kind: 'linear',
          stops: [
            { offset: 1, color: 'red' },
            { offset: 0, color: 'blue' },
          ],
        },
      ],
    }),
  );
  const good = illustrationSchema.parse({
    nodes: [n({ fill: '@shade' })],
    paints: [
      {
        id: 'shade',
        kind: 'radial',
        stops: [
          { offset: 0, color: '$cream' },
          { offset: 1, color: '$gold' },
        ],
      },
    ],
  });
  validateIllustration(good, 5);
});
test('color tracks interpolate and morph paths keep compatible topology', () => {
  const t = {
    property: 'fill',
    easing: 'linear',
    keys: [
      { time: 0, value: '#000000' },
      { time: 1, value: '#ffffff' },
    ],
  };
  assert.equal(
    sampleColorTrack(t, -1, (c) => c),
    '#000000',
  );
  assert.equal(
    sampleColorTrack(t, 2, (c) => c),
    '#ffffff',
  );
  assert.notEqual(
    sampleColorTrack(t, 0.5, (c) => c),
    '#000000',
  );
  assert.equal(morphPath('M 0 0 L 10 0', 'M 0 0 L 20 0', 0.5), 'M 0 0 L 15 0');
  assert.throws(() =>
    n({
      kind: 'path',
      d: 'M0 0 L10 0',
      morph: { from: 'M0 0 L10 0', to: 'M0 0 C1 2 3 4 5 6', start: 0, duration: 1 },
    }),
  );
  const pose = nodePose(n({ tracks: [tween('skewX', 0, 1, 0, 12)] }), 1, 60);
  assert.equal(pose.skewX, 12);
});
const { validateVideoMetadata } = await import('./video-metadata.mjs');
test('video metadata validation follows configured output instead of hardcoded 1080p60', () => {
  const expected = { width: 1920, height: 1080, fps: 24, durationInFrames: 240 };
  const stream = {
    width: 1920,
    height: 1080,
    avg_frame_rate: '24/1',
    duration: '10',
    nb_frames: '240',
    codec_name: 'h264',
  };
  validateVideoMetadata(stream, expected);
  assert.throws(() => validateVideoMetadata({ ...stream, width: 1080 }, expected));
  assert.throws(() => validateVideoMetadata({ ...stream, avg_frame_rate: '0/0' }, expected));
});
test('default output uses mobile 9:16 with protected text regions', () => {
  const {
    videoSettingsSchema,
    MOBILE_VIDEO,
    MOBILE_SAFE_AREA,
  } = require('../src/render/config.ts');
  assert.deepEqual(videoSettingsSchema.parse({}), MOBILE_VIDEO);
  const { video } = compileStoryboard(storyboard);
  assert.equal(video.width, 1080);
  assert.equal(video.height, 1920);
  const layout = layoutFor(1080, 1920);
  assert.ok(layout.headerY >= MOBILE_SAFE_AREA.top);
  assert.ok(layout.margin + layout.titleWidth <= 1080 - MOBILE_SAFE_AREA.right);
  assert.ok(layout.captionY + layout.captionFont * 1.5 * 2 <= 1920 - MOBILE_SAFE_AREA.bottom);
});
const { planPreview } = await import('./preview/plan.mjs');
const { parsePreviewOptions } = await import('./preview/options.mjs');
test('preview planner preserves cue samples, clamps boundaries and supports focused assets', () => {
  const compositions = [
    'MotionLab',
    'Shot-bean',
    'MotionLab-square',
    'Gallery-education',
    'Asset-bean',
  ].map((id) => ({ id, fps: 30, durationInFrames: 100 }));
  const shots = [{ id: 'bean', from: 0, duration: 100, cues: { flow: { start: 1, end: 2 } } }];
  const tasks = planPreview(compositions, shots, { variants: true });
  assert.deepEqual(
    [...tasks.get('Shot-bean')].sort((a, b) => a - b),
    [0, 25, 30, 45, 50, 60, 75, 99],
  );
  assert.deepEqual([...tasks.get('MotionLab')], [0, 50, 99]);
  assert.deepEqual([...tasks.get('MotionLab-square')], [60]);
  assert.deepEqual(
    [...planPreview(compositions, shots, { assetsOnly: true, only: 'Asset-bean' }).keys()],
    ['Asset-bean'],
  );
  assert.throws(() => planPreview(compositions, shots, { only: 'missing' }));
});
test('preview options keep existing CLI flags and reject missing values', () => {
  const options = parsePreviewOptions([
    '--variants',
    '--baseline',
    'old',
    '--out',
    'new',
    '--only',
    'MotionLab',
  ]);
  assert.equal(options.variants, true);
  assert.equal(options.baseline, 'old');
  assert.equal(options.output, 'new');
  assert.equal(options.only, 'MotionLab');
  assert.throws(() => parsePreviewOptions(['--baseline']));
});
console.log(`${tests} engine tests passed`);
