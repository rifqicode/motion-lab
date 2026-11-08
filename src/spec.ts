import {z} from 'zod';
import {VIDEO} from './render/config';
export const sceneSchema=z.object({id:z.string(),kind:z.enum(['phone','network','finale']),from:z.number().int().nonnegative(),duration:z.number().int().positive()});
const seconds=[{id:'intro',kind:'phone',from:0,duration:5},{id:'network',kind:'network',from:5,duration:5},{id:'finale',kind:'finale',from:10,duration:5}] as const;
export const scenes=z.array(sceneSchema).parse(seconds.map(s=>({...s,from:s.from*VIDEO.fps,duration:s.duration*VIDEO.fps})));
