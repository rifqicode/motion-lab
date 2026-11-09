import React from 'react';
import {AbsoluteFill,Composition} from 'remotion';
import {Video} from './Video';
import {VIDEO} from './render/config';
import {scenes} from './spec';
import {Phone} from './scenes/Phone';
import {Network} from './scenes/Network';
import {Finale} from './scenes/Finale';

// Standalone previews let editors inspect each shot without rendering the whole film.
// These share the same scene implementations as the final composition.
const registry={phone:Phone,network:Network,finale:Finale};
export const Root:React.FC=()=> <>
 <Composition id="MotionLab" component={Video} durationInFrames={VIDEO.durationInFrames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>
 {scenes.map(shot=>{
  const Component=registry[shot.kind];
  const Preview:React.FC=()=> <AbsoluteFill style={{background:'radial-gradient(ellipse at center,#164463,#030b16)',fontFamily:'Arial,sans-serif'}}>
   <Component headline={shot.headline} subline={shot.subline} direction={shot.direction} assets={shot.assets}/>
  </AbsoluteFill>;
  return <Composition key={shot.id} id={`Shot-${shot.id.replace(/[^a-zA-Z0-9-]/g,'-')}`} component={Preview} durationInFrames={shot.duration} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>;
 })}
</>;
