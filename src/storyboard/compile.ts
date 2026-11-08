import {VIDEO} from '../render/config';
import {storyboardSchema,type Storyboard} from './schema';
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
  const scene={id:shot.id,kind:shot.visual,from,duration:end-from,headline:shot.headline,subline:shot.subline,direction:shot.direction};
  if(scene.duration<1) throw new Error(`Shot ${shot.id} is shorter than one frame`);
  from=end;
  return scene;
 });
 return {board,scenes};
};
