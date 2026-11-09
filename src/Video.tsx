import React from 'react';
import {AbsoluteFill,Sequence,useCurrentFrame,useVideoConfig} from 'remotion';
import {scenes} from './spec';
import {Phone} from './scenes/Phone';
import {Network} from './scenes/Network';
import {Finale} from './scenes/Finale';
import {lerp,float} from './motion/presets';
import {shotFade,type ShotProps} from './director/shot';
const registry={phone:Phone,network:Network,finale:Finale};
type SceneKind=keyof typeof registry;
const Scene:React.FC<{kind:SceneKind;duration:number}&ShotProps>=({kind,duration,headline,subline,direction,assets})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const t=frame/fps;
 const opacity=shotFade(frame,duration,fps,direction);
 const Component=registry[kind];
 return <AbsoluteFill style={{opacity}}><Component headline={headline} subline={subline} direction={direction} assets={assets}/></AbsoluteFill>;
};
export const Video:React.FC=()=>{
 const frame=useCurrentFrame();const {durationInFrames,fps}=useVideoConfig();const t=frame/fps;
 const glow=lerp(0.2,0.38,(float(t,0.7)+1)/2);
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 44%,#164463 0%,#071421 65%,#030b16 100%)',fontFamily:'Arial,sans-serif'}}>
  <AbsoluteFill style={{background:`radial-gradient(circle at ${50+float(t,0.25,18)}% ${48+float(t,0.32,8)}%,rgba(52,177,203,${glow}),transparent 55%)`}}/>
  {scenes.map(s=><Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Scene kind={s.kind} duration={s.duration} headline={s.headline} subline={s.subline} direction={s.direction} assets={s.assets}/></Sequence>)}
  <div style={{position:'absolute',top:120,left:85,color:'#78eee7',fontSize:28,fontWeight:700,letterSpacing:7}}>MOTION LAB <span style={{color:'#7893a8'}}> / STORYBOARD 001</span></div>
  <div style={{position:'absolute',bottom:100,left:80,right:80,height:4,background:'#24435b',borderRadius:5}}><div style={{height:'100%',width:`${(frame+1)/durationInFrames*100}%`,background:'#78eee7',borderRadius:5}}/></div>
 </AbsoluteFill>;
};
