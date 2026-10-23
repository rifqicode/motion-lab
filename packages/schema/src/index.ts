import { z } from 'zod';

export const NodeKindSchema = z.enum([
  'database',
  'log',
  'service',
  'queue',
  'client',
  'custom',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const NodeSchema = z.object({
  id: z.string().min(1, 'Node ID cannot be empty'),
  kind: NodeKindSchema,
  label: z.string().min(1, 'Node label cannot be empty').max(50, 'Label too long for 9:16 layout'),
  icon: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  description: z.string().max(120).optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const EdgeKindSchema = z.enum(['data-flow', 'sync', 'dependency']);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const EdgeSchema = z.object({
  id: z.string().min(1, 'Edge ID cannot be empty'),
  from: z.string().min(1, 'Edge from node ID cannot be empty'),
  to: z.string().min(1, 'Edge to node ID cannot be empty'),
  kind: EdgeKindSchema.default('data-flow'),
  label: z.string().max(40).optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const AnimationPresetSchema = z.enum([
  'node-reveal',
  'connector-draw',
  'event-travel',
  'node-pulse',
  'focus-camera',
  'caption-emphasis',
]);
export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;

export const EasingSchema = z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']);
export type Easing = z.infer<typeof EasingSchema>;

export const AnimationCueSchema = z.object({
  id: z.string().min(1, 'Cue ID cannot be empty'),
  preset: AnimationPresetSchema,
  targetId: z.string().min(1, 'Cue target ID cannot be empty'),
  startFrame: z.number().int().nonnegative('Cue startFrame must be >= 0'),
  durationFrames: z.number().int().positive('Cue durationFrames must be > 0'),
  easing: EasingSchema.optional(),
  params: z.record(z.any()).optional(),
});
export type AnimationCue = z.infer<typeof AnimationCueSchema>;

export const CameraCueSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  zoom: z.number().positive().default(1.2),
  targetNodeId: z.string().optional(),
});
export type CameraCue = z.infer<typeof CameraCueSchema>;

export const SubtitleSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  position: z.enum(['top', 'middle', 'bottom']).default('bottom'),
  fontSize: z.number().positive().default(38),
  highlightColor: z.string().default('#38bdf8'),
});
export type SubtitleSettings = z.infer<typeof SubtitleSettingsSchema>;

export const SceneTypeSchema = z.enum(['data-flow', 'comparison', 'focus-explain']);
export type SceneType = z.infer<typeof SceneTypeSchema>;

export const RawSceneSchema = z.object({
  id: z.string().min(1, 'Scene ID cannot be empty'),
  order: z.number().int().nonnegative('Scene order must be >= 0'),
  type: SceneTypeSchema.default('data-flow'),
  title: z.string().min(1, 'Scene title cannot be empty'),
  narrationText: z.string().min(1, 'Narration text cannot be empty'),
  durationFrames: z.number().int().positive('Scene durationFrames must be > 0'),
  nodes: z.array(NodeSchema).max(8, 'Maximum 8 nodes allowed per scene for 9:16 vertical layout'),
  edges: z.array(EdgeSchema),
  animationCues: z.array(AnimationCueSchema).default([]),
  cameraCues: z.array(CameraCueSchema).default([]),
  subtitleSettings: SubtitleSettingsSchema.default({}),
  audioAssetId: z.string().optional(),
  alignmentAssetId: z.string().optional(),
  revision: z.number().int().default(1),
});

export const SceneSchema = RawSceneSchema.superRefine((scene, ctx) => {
  // Check unique node IDs
  const nodeIds = new Set<string>();
  for (let i = 0; i < scene.nodes.length; i++) {
    const node = scene.nodes[i];
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate node ID: "${node.id}" in scene "${scene.id}"`,
        path: ['nodes', i, 'id'],
      });
    }
    nodeIds.add(node.id);
  }

  // Check unique edge IDs and endpoint validity
  const edgeIds = new Set<string>();
  for (let i = 0; i < scene.edges.length; i++) {
    const edge = scene.edges[i];
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate edge ID: "${edge.id}" in scene "${scene.id}"`,
        path: ['edges', i, 'id'],
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge "${edge.id}" source node "${edge.from}" does not exist in scene nodes`,
        path: ['edges', i, 'from'],
      });
    }
    if (!nodeIds.has(edge.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge "${edge.id}" target node "${edge.to}" does not exist in scene nodes`,
        path: ['edges', i, 'to'],
      });
    }
  }

  // Check animation cues bounds and targets
  const cueIds = new Set<string>();
  for (let i = 0; i < scene.animationCues.length; i++) {
    const cue = scene.animationCues[i];
    if (cueIds.has(cue.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate animation cue ID: "${cue.id}" in scene "${scene.id}"`,
        path: ['animationCues', i, 'id'],
      });
    }
    cueIds.add(cue.id);

    const cueEnd = cue.startFrame + cue.durationFrames;
    if (cueEnd > scene.durationFrames) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Animation cue "${cue.id}" ends at frame ${cueEnd}, which exceeds scene duration of ${scene.durationFrames} frames`,
        path: ['animationCues', i, 'durationFrames'],
      });
    }
  }
});
export type Scene = z.infer<typeof SceneSchema>;

export const RawProjectSchema = z.object({
  id: z.string().min(1, 'Project ID cannot be empty'),
  title: z.string().min(1, 'Project title cannot be empty'),
  sourceText: z.string().optional(),
  language: z.string().default('id-ID'),
  aspectRatio: z.literal('9:16').default('9:16'),
  fps: z.literal(30).default(30),
  themeId: z.string().default('midnight-tech'),
  sceneIds: z.array(z.string()).min(1, 'Project must contain at least one scene ID'),
  scenes: z.array(SceneSchema).min(1, 'Project must contain at least one scene'),
  revision: z.number().int().default(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const ProjectSchema = RawProjectSchema.superRefine((project, ctx) => {
  // Check sceneIds matches scenes
  const actualIds = project.scenes.map((s) => s.id);
  const declaredIds = project.sceneIds;

  const sceneIdSet = new Set<string>();
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    if (sceneIdSet.has(scene.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate scene ID: "${scene.id}"`,
        path: ['scenes', i, 'id'],
      });
    }
    sceneIdSet.add(scene.id);
  }

  if (declaredIds.length !== actualIds.length || !declaredIds.every((id) => sceneIdSet.has(id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Project sceneIds [${declaredIds.join(', ')}] does not match defined scenes [${actualIds.join(', ')}]`,
      path: ['sceneIds'],
    });
  }
});
export type Project = z.infer<typeof ProjectSchema>;

export function validateProject(data: unknown): Project {
  return ProjectSchema.parse(data);
}

export function validateScene(data: unknown): Scene {
  return SceneSchema.parse(data);
}

export function safeValidateProject(data: unknown) {
  return ProjectSchema.safeParse(data);
}

export function safeValidateScene(data: unknown) {
  return SceneSchema.safeParse(data);
}
