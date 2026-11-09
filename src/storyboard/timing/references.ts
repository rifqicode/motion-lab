import { z } from 'zod';
import { resolveCues, type ResolvedCues } from './cues';

const cueReferenceSchema = z
  .object({
    cue: z.string(),
    edge: z.enum(['start', 'end']).default('start'),
    offset: z.number().finite().default(0),
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Replace authored cue references with numeric seconds before schema validation. */
export function resolveCueReferences(input: unknown, cues: ResolvedCues): unknown {
  if (Array.isArray(input)) return input.map((value) => resolveCueReferences(value, cues));
  if (!isRecord(input)) return input;
  if (Object.hasOwn(input, 'cue')) {
    const reference = cueReferenceSchema.parse(input);
    const cue = cues[reference.cue];
    if (!cue) throw new Error(`Unknown cue reference: ${reference.cue}`);
    const time = cue[reference.edge] + reference.offset;
    if (time < 0) throw new Error('Cue reference resolves before shot');
    return time;
  }
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, resolveCueReferences(value, cues)]),
  );
}

function compileShotTiming(shot: unknown): unknown {
  if (!isRecord(shot)) return shot;
  const duration = typeof shot.durationSeconds === 'number' ? shot.durationSeconds : undefined;
  const cues = resolveCues(shot.cues ?? {}, duration);
  return { ...shot, illustration: resolveCueReferences(shot.illustration, cues) };
}

export function compileTimeline(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.shots)) return input;
  return { ...input, shots: input.shots.map(compileShotTiming) };
}
