import {VIDEO} from '../render/config';
import {storyboardSchema,type Storyboard} from './schema';
import {resolveShotAssets} from '../director/shot';
import {resolveAsset} from '../assets/registry';
export const compileStoryboard=(input:unknown)=>{
 const board:Storyboard=storyboardSchema.parse(input);
 const ids=new Set<string>();let from=0;
 const scenes=board.shots.map(shot=>{
  if(ids.has(shot.id))throw new Error(`Duplicate shot id: ${shot.id}`);ids.add(shot.id);
  const duration=Math.round(shot.durationSeconds*VIDEO.fps);if(duration<1)throw new Error(`Shot ${shot.id} is shorter than one frame`);
  if(shot.visual==='graph'&&!shot.graph)throw new Error(`Graph shot ${shot.id} requires graph objects`);
  if(shot.graph){const objectIds=new Set<string>();for(const object of shot.graph.objects){
   resolveAsset(object.asset);
   if(objectIds.has(object.id))throw new Error(`Duplicate graph object id: ${object.id}`);objectIds.add(object.id);
   if(object.motion.start>=shot.durationSeconds)throw new Error(`Object ${object.id} starts after shot ${shot.id} ends`);
  }}
  const scene={id:shot.id,kind:shot.visual,from,duration,headline:shot.headline,subline:shot.subline,direction:shot.direction,assets:resolveShotAssets(shot.assets),graph:shot.graph};
  from+=duration;return scene;
 });
 return {board,scenes,durationInFrames:from};
};
