import { videoSettingsSchema } from '../render/config';
import { cuesSchema } from './timeline';
import { z } from 'zod';
import { illustrationSchema } from '../illustration/schema';
import { graphSchema } from '../graph/schema';
export const shotSchema = z.object({
  id: z.string().min(1),
  narration: z.string().min(1),
  purpose: z.enum(['hook', 'explain', 'payoff']),
  visual: z.enum([
    'phone',
    'network',
    'finale',
    'graph',
    'bean',
    'extraction',
    'espresso',
    'illustrated',
  ]),
  graph: graphSchema.optional(),
  illustration: illustrationSchema.optional(),
  durationSeconds: z.number().finite().positive(),
  cues: cuesSchema.default({}),
  headline: z.string().min(1),
  subline: z.string().optional(),
  assets: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['procedural-3d', 'svg', 'text', 'image']),
      description: z.string(),
    }),
  ),
  direction: z.object({
    camera: z.enum(['push', 'track', 'orbit', 'static']),
    energy: z.enum(['calm', 'medium', 'high']),
    transition: z.enum(['cut', 'fade']),
  }),
});
export const storyboardSchema = z.object({
  version: z.literal('1.0'),
  video: videoSettingsSchema.optional(),
  title: z.string().min(1),
  premise: z.string().min(1),
  shots: z.array(shotSchema).min(1),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
