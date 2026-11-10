import {z} from 'zod';

const styleText = () => z.string().trim().max(4000).default('');

export const StyleBriefSchema = z.object({
  mood: styleText(),
  colorPalette: styleText(),
  typography: styleText(),
  pacing: styleText(),
  transitions: styleText(),
  visualDirection: styleText(),
  referenceNotes: z.string().trim().max(8000).default(''),
  avoid: styleText(),
}).strict();

export type StyleBrief = z.infer<typeof StyleBriefSchema>;
