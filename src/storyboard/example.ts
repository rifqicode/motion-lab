import {storyboardSchema} from './schema';
export const storyboard=storyboardSchema.parse({
 version:'1.0',title:'From a Tap to the Web',
 premise:'A simple tap launches a journey across the network.',
 shots:[
  {id:'intro',narration:'Every tap starts a journey.',purpose:'hook',visual:'phone',durationSeconds:5,headline:'Every tap\nstarts a journey.',subline:'A single request. Infinite possibilities.',assets:[{id:'device',type:'procedural-3d',description:'Floating smartphone with a luminous screen'}],direction:{camera:'push',energy:'medium',transition:'fade'}},
  {id:'network',narration:'Your request travels through connected systems.',purpose:'explain',visual:'network',durationSeconds:5,headline:'Information\nin motion.',subline:'From device to destination',assets:[{id:'nodes',type:'svg',description:'Device, router and cloud connected by a curved data path'}],direction:{camera:'track',energy:'high',transition:'fade'}},
  {id:'finale',narration:'One tap connects you to a world in motion.',purpose:'payoff',visual:'finale',durationSeconds:5,headline:'CONNECTED.',subline:'One tap. A world in motion.',assets:[{id:'globe',type:'procedural-3d',description:'Rotating crystalline connected sphere'}],direction:{camera:'push',energy:'calm',transition:'fade'}}
 ]
});
