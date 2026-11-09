import { z } from 'zod';
export const objectSchema = z.object({
  id: z.string().min(1),
  asset: z.enum(['router', 'earth', 'device', 'data_packet']),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.number().positive().default(1),
  motion: z
    .object({
      preset: z.enum(['reveal', 'float', 'rotate', 'travel', 'none']).default('reveal'),
      start: z.number().nonnegative().default(0),
      duration: z.number().positive().default(1),
      amplitude: z.number().nonnegative().default(0.12),
    })
    .default({ preset: 'reveal', start: 0, duration: 1, amplitude: 0.12 }),
});
export const graphSchema = z.object({ objects: z.array(objectSchema).min(1) });
export type SceneGraph = z.infer<typeof graphSchema>;
