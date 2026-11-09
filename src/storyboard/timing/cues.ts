import { z } from 'zod';
const finite = z.number().finite();
export const cueSchema = z
  .object({
    at: finite.nonnegative().optional(),
    after: z.string().min(1).optional(),
    edge: z.enum(['start', 'end']).default('end'),
    offset: finite.default(0),
    duration: finite.nonnegative().default(0),
  })
  .strict()
  .refine(
    (c) => (c.at !== undefined) !== (c.after !== undefined),
    'Specify exactly one of at or after',
  );
export const cuesSchema = z.record(cueSchema);
export type CueDefinitions = z.input<typeof cuesSchema>;
export type ResolvedCues = Record<string, { start: number; end: number }>;
export const resolveCues = (input: unknown, duration = Infinity): ResolvedCues => {
  const definitions = cuesSchema.parse(input),
    resolved: ResolvedCues = {},
    resolving = new Set<string>();
  const resolveCue = (id: string): ResolvedCues[string] => {
    if (Object.hasOwn(resolved, id)) return resolved[id];
    if (resolving.has(id)) throw new Error(`Cyclic cue dependency: ${id}`);
    if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown cue: ${id}`);
    resolving.add(id);
    const cue = definitions[id];
    const start = (cue.at ?? resolveCue(cue.after!)[cue.edge]) + cue.offset;
    const end = start + cue.duration;
    if (start < 0 || end > duration + 1e-8) throw new Error(`Cue outside shot: ${id}`);
    resolved[id] = { start, end };
    resolving.delete(id);
    return resolved[id];
  };
  Object.keys(definitions).forEach(resolveCue);
  return resolved;
};
