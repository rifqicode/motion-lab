import {storyboardSchema} from './schema';
export const storyboard=storyboardSchema.parse({
 version:'1.0',title:'From a Tap to the Web',
 premise:'A simple tap launches a journey across the network.',
 shots:[
  {id:'intro',narration:'Every tap starts a journey.',purpose:'hook',visual:'phone',durationSeconds:5,headline:'Every tap\nstarts a journey.',subline:'A single request. Infinite possibilities.',assets:[{id:'device',type:'procedural-3d',description:'Floating smartphone with a luminous screen'}],direction:{camera:'push',energy:'medium',transition:'fade'}},
  {id:'network',narration:'Your request travels through connected systems.',purpose:'explain',visual:'network',durationSeconds:5,headline:'Information\nin motion.',subline:'From device to destination',assets:[{id:'router',type:'procedural-3d',description:'Wi-Fi router with two antennae and glowing LEDs'},{id:'data_packet',type:'svg',description:'Animated packet moving through a curved connection'}],direction:{camera:'track',energy:'high',transition:'fade'}},
  {id:'finale',narration:'One tap connects you to a world in motion.',purpose:'payoff',visual:'finale',durationSeconds:5,headline:'CONNECTED.',subline:'One tap. A world in motion.',assets:[{id:'earth',type:'procedural-3d',description:'Rotating Earth-inspired globe'},{id:'network_connection',type:'procedural-3d',description:'Glowing arcs between cities on globe'}],direction:{camera:'push',energy:'calm',transition:'fade'}}
 ]
});
