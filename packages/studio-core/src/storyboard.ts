import {z} from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
const text = z.string().trim().min(1).max(8000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const StoryboardShotSchema = z.object({
  id,
  title: z.string().trim().min(1).max(160),
  durationFrames: z.number().int().min(1).max(2700),
  intent: text,
  visualDirection: text,
  motionInstructions: text,
  transition: z.literal('cut'),
  dependencies: z.array(id).max(12),
  sharedComponents: z.array(id).max(12),
}).strict();

export const StoryboardSchema = z.object({
  schemaVersion: z.literal(1),
  concept: text,
  hook: text,
  narrative: text,
  designSystem: z.object({
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
    typography: text,
    spacing: text,
    motionStyle: text,
  }).strict(),
  sharedComponents: z.array(z.object({id, description: text}).strict()).max(12),
  shots: z.array(StoryboardShotSchema).min(1).max(12),
}).strict().superRefine((board, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({code: z.ZodIssueCode.custom, message, path});
  const shotIds = new Set(board.shots.map(shot => shot.id));
  const sharedIds = new Set(board.sharedComponents.map(component => component.id));
  if (shotIds.size !== board.shots.length) issue('Shot IDs must be unique.', ['shots']);
  if (sharedIds.size !== board.sharedComponents.length) issue('Shared component IDs must be unique.', ['sharedComponents']);
  if (board.shots.reduce((sum, shot) => sum + shot.durationFrames, 0) > 18_000) issue('Timeline exceeds 10 minutes.', ['shots']);
  board.shots.forEach((shot, index) => {
    if (new Set(shot.dependencies).size !== shot.dependencies.length) issue('Duplicate shot dependency.', ['shots', index, 'dependencies']);
    if (new Set(shot.sharedComponents).size !== shot.sharedComponents.length) issue('Duplicate shared component.', ['shots', index, 'sharedComponents']);
    for (const dependency of shot.dependencies) {
      if (!shotIds.has(dependency) || dependency === shot.id) issue('Unknown or self-referencing shot dependency.', ['shots', index, 'dependencies']);
    }
    for (const component of shot.sharedComponents) if (!sharedIds.has(component)) issue('Unknown shared component.', ['shots', index, 'sharedComponents']);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(board.shots.map(shot => [shot.id, shot]));
  const walk = (shotId: string): boolean => {
    if (visiting.has(shotId)) return false;
    if (visited.has(shotId)) return true;
    visiting.add(shotId);
    for (const dependency of byId.get(shotId)?.dependencies ?? []) if (!walk(dependency)) return false;
    visiting.delete(shotId);
    visited.add(shotId);
    return true;
  };
  if (board.shots.some(shot => !walk(shot.id))) issue('Shot dependencies contain a cycle.', ['shots']);
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

// Discussion can include a local, unfinished shot without publishing a storyboard.
export const ShotDiscussionContextSchema = z.object({
  position: z.number().int().min(1).max(12),
  draft: z.boolean(),
  shot: StoryboardShotSchema.extend({
    title: z.string().max(160),
    intent: z.string().max(8000),
    visualDirection: z.string().max(8000),
    motionInstructions: z.string().max(8000),
  }),
}).strict();
export type ShotDiscussionContext = z.infer<typeof ShotDiscussionContextSchema>;

export const DirectorRevisionArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  baseRevisionId: id,
  baseSourceId: id,
  baseStoryboard: StoryboardSchema,
  storyboard: StoryboardSchema,
  shotIds: z.array(id).max(12),
  projectStoryboardHash: hash.nullable(),
  instructions: z.string().min(1).max(12_000),
}).strict();
export type DirectorRevisionArtifact = z.infer<typeof DirectorRevisionArtifactSchema>;

export function mergeDirectorRevisionStoryboard(current: Storyboard | null, artifact: DirectorRevisionArtifact): Storyboard {
  if (!current || JSON.stringify(current) === JSON.stringify(artifact.baseStoryboard)) return artifact.storyboard;
  const designChanged = JSON.stringify(artifact.baseStoryboard.designSystem) !== JSON.stringify(artifact.storyboard.designSystem);
  return StoryboardSchema.parse({...current, designSystem: designChanged ? artifact.storyboard.designSystem : current.designSystem,
    shots: current.shots.map(shot => {
      if (!artifact.shotIds.includes(shot.id)) return shot;
      const next = artifact.storyboard.shots.find(item => item.id === shot.id);
      return next ? {...shot, durationFrames: next.durationFrames, motionInstructions: next.motionInstructions} : shot;
    })});
}

export const StoryboardStateSchema = z.object({
  draft: StoryboardSchema.nullable(),
  hash: hash.nullable(),
  approvedHash: hash.nullable(),
  briefHash: hash.nullable(),
}).strict().superRefine((state, ctx) => {
  if (Boolean(state.draft) !== Boolean(state.hash) || Boolean(state.draft) !== Boolean(state.briefHash)
      || state.approvedHash !== null && state.approvedHash !== state.hash) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Inconsistent storyboard state.'});
  }
});
export type StoryboardState = z.infer<typeof StoryboardStateSchema>;
export const emptyStoryboardState = (): StoryboardState => ({draft: null, hash: null, approvedHash: null, briefHash: null});

// Parse first so browser and server hash the same field order and normalized text.
export function serializeStoryboard(value: Storyboard): string { return JSON.stringify(StoryboardSchema.parse(value)); }

export function storyboardShots(board: Storyboard) {
  return board.shots.map(({id, durationFrames, intent, visualDirection}) => ({id, durationFrames, intent, visualDirection, narrationText: ''}));
}

type TimelineShot = {id: string; durationFrames: number};
export function resolveFrame(shots: readonly TimelineShot[], globalFrame: number): {shotId: string; localFrame: number; startFrame: number} | null {
  if (!Number.isSafeInteger(globalFrame) || globalFrame < 0) return null;
  let startFrame = 0;
  for (const shot of shots) {
    if (globalFrame < startFrame + shot.durationFrames) return {shotId: shot.id, localFrame: globalFrame - startFrame, startFrame};
    startFrame += shot.durationFrames;
  }
  return null;
}

export function shotGlobalFrame(shots: readonly TimelineShot[], shotId: string, localFrame: number): number {
  let startFrame = 0;
  for (const shot of shots) {
    if (shot.id === shotId) {
      if (!Number.isSafeInteger(localFrame) || localFrame < 0 || localFrame >= shot.durationFrames) throw new Error('Frame is outside the shot.');
      return startFrame + localFrame;
    }
    startFrame += shot.durationFrames;
  }
  throw new Error('Shot does not exist in this timeline.');
}
