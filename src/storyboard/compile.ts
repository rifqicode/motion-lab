import {VIDEO} from '../render/config';
import {storyboardSchema,type Storyboard} from './schema';
import {resolveShotAssets} from '../director/shot';
export const compileStoryboard=(input:unknown)=>{
 const board:Storyboard=storyboardSchema.parse(input);
 const total=board.shots.reduce((sum,shot)=>sum+shot.durationSeconds,0);
 if(Math.abs(total-VIDEO.durationSeconds)>0.0001) throw new Error(`Storyboard duration ${total}s must equal ${VIDEO.durationSeconds}s`);
 const ids=new Set<string>();
 let from=0;
 const scenes=board.shots.map((shot,index)=>{
  if(ids.has(shot.id)) throw new Error(`Duplicate shot id: ${shot.id}`);
  ids.add(shot.id);
  const end=index===board.shots.length-1?VIDEO.durationInFrames:Math.round((from/VIDEO.fps+shot.durationSeconds)*VIDEO.fps);
  if(shot.visual==='graph'&&!shot.graph) throw new Error(`Graph shot ${shot.id} requires graph objects`);
  if(shot.graph){
   const objectIds=new Set<string>();
   for(const object of shot.graph.objects){
    if(objectIds.has(object.id)) throw new Error(`Duplicate graph object id: ${object.id}`);
    objectIds.add(object.id);
    if(object.motion.start>=shot.durationSeconds) throw new Error(`Object ${object.id} starts after shot ${shot.id} ends`);
   }
  }
  const scene={id:shot.id,kind:shot.visual,from,duration:end-from,headline:shot.headline,subline:shot.subline,direction:shot.direction,assets:resolveShotAssets(shot.assets),graph:shot.graph};
  if(scene.duration<1) throw new Error(`Shot ${shot.id} is shorter than one frame`);
  from=end;
  return scene;
 });
 return {board,scenes};
};
