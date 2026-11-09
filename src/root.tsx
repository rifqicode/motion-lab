import React from 'react';
import {AbsoluteFill,Composition} from 'remotion';
import {Video} from './Video';
import {VIDEO} from './render/config';
import {scenes,durationInFrames} from './spec';
import {Phone} from './scenes/Phone';
import {Network} from './scenes/Network';
import {Finale} from './scenes/Finale';
import {GraphScene} from './scenes/Graph';
import {themes} from './styles/theme';
const registry={phone:Phone,network:Network,finale:Finale,graph:GraphScene};
export const Root:React.FC=()=> <>
 <Composition id="MotionLab" component={Video} durationInFrames={durationInFrames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>
 {scenes.map(shot=>{
  const Component=registry[shot.kind];
  const illustrated=shot.kind==='graph'&&shot.graph?.objects.every(o=>['coffee-bean','coffee-cup','coffee-stream'].includes(o.asset));
  const Preview:React.FC=()=> <AbsoluteFill style={{background:illustrated?themes.illustrated.background:themes.techNoir.background,fontFamily:'Arial,sans-serif'}}>
   <Component headline={shot.headline} subline={shot.subline} direction={shot.direction} assets={shot.assets} graph={shot.graph}/>
  </AbsoluteFill>;
  return <Composition key={shot.id} id={`Shot-${shot.id.replace(/[^a-zA-Z0-9-]/g,'-')}`} component={Preview} durationInFrames={shot.duration} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>;
 })}
</>;
