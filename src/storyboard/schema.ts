import {z} from 'zod';
export const shotSchema=z.object({
 id:z.string().min(1),
 narration:z.string().min(1),
 purpose:z.enum(['hook','explain','payoff']),
 visual:z.enum(['phone','network','finale']),
 durationSeconds:z.number().positive(),
 headline:z.string().min(1),
 subline:z.string().optional(),
 assets:z.array(z.object({id:z.string(),type:z.enum(['procedural-3d','svg','text','image']),description:z.string()})),
 direction:z.object({camera:z.enum(['push','track','orbit','static']),energy:z.enum(['calm','medium','high']),transition:z.enum(['cut','fade'])})
});
export const storyboardSchema=z.object({
 version:z.literal('1.0'),
 title:z.string().min(1),
 premise:z.string().min(1),
 shots:z.array(shotSchema).min(1)
});
export type Storyboard=z.infer<typeof storyboardSchema>;
