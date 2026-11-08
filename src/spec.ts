import {z} from 'zod';
export const sceneSchema=z.object({id:z.string(),kind:z.enum(['phone','network','finale']),from:z.number().int().nonnegative(),duration:z.number().int().positive()});
export const scenes=z.array(sceneSchema).parse([{id:'intro',kind:'phone',from:0,duration:150},{id:'network',kind:'network',from:150,duration:150},{id:'finale',kind:'finale',from:300,duration:150}]);
