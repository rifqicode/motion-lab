import { validateIllustration } from '../illustration/registry';
import { VIDEO } from '../render/config';
import { compileTimeline, resolveCues } from './timeline';
import { storyboardSchema, type Storyboard } from './schema';
import { resolveShotAssets } from '../director/shot';
export const compileStoryboard = (input: unknown) => {
  const board: Storyboard = storyboardSchema.parse(compileTimeline(input));
  const total = board.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  const settings = board.video ?? VIDEO;
  if (settings.durationSeconds !== undefined && Math.abs(total - settings.durationSeconds) > 0.0001)
    throw new Error(`Storyboard duration ${total}s must equal ${settings.durationSeconds}s`);
  const video = {
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    durationSeconds: total,
    durationInFrames: Math.round(total * settings.fps),
  };
  const ids = new Set<string>();
  let from = 0;
  let elapsedSeconds = 0;
  const previewIds = new Set<string>();
  const scenes = board.shots.map((shot, index) => {
    if (ids.has(shot.id)) throw new Error(`Duplicate shot id: ${shot.id}`);
    ids.add(shot.id);
    const previewId = shot.id.replace(/[^a-zA-Z0-9-]/g, '-');
    if (previewIds.has(previewId)) throw new Error(`Colliding preview ID: ${shot.id}`);
    previewIds.add(previewId);
    elapsedSeconds += shot.durationSeconds;
    const end =
      index === board.shots.length - 1
        ? video.durationInFrames
        : Math.round(elapsedSeconds * video.fps);
    if (shot.visual === 'graph' && !shot.graph)
      throw new Error(`Graph shot ${shot.id} requires graph objects`);
    if (shot.visual === 'illustrated' && !shot.illustration)
      throw new Error(`Illustrated shot ${shot.id} requires illustration nodes`);
    if (shot.illustration) validateIllustration(shot.illustration, shot.durationSeconds);
    if (shot.graph) {
      const objectIds = new Set<string>();
      for (const object of shot.graph.objects) {
        if (objectIds.has(object.id)) throw new Error(`Duplicate graph object id: ${object.id}`);
        objectIds.add(object.id);
        if (object.motion.start >= shot.durationSeconds)
          throw new Error(`Object ${object.id} starts after shot ${shot.id} ends`);
      }
    }
    const scene = {
      id: shot.id,
      cues: resolveCues(shot.cues, shot.durationSeconds),
      kind: shot.visual,
      from,
      duration: end - from,
      headline: shot.headline,
      subline: shot.subline,
      direction: shot.direction,
      assets: resolveShotAssets(shot.assets),
      graph: shot.graph,
      illustration: shot.illustration,
    };
    if (scene.duration < 1) throw new Error(`Shot ${shot.id} is shorter than one frame`);
    from = end;
    return scene;
  });
  return { board, scenes, video };
};
