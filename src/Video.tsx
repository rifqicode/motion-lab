import React from 'react';
import {AbsoluteFill,Sequence,useCurrentFrame,useVideoConfig,Easing} from 'remotion';
import {scenes} from './spec';
import {Phone} from './scenes/Phone';
import {Network} from './scenes/Network';
import {Finale} from './scenes/Finale';
const registry={phone:Phone,network:Network,finale:Finale};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const Scene:React.FC<{kind:keyof typeof registry;duration:number}>=({kind,duration})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const fade=Math.round(fps*0.65);
 const inOpacity=Easing.out(Easing.cubic)(clamp(frame/fade));
 const outOpacity=Easing.in(Easing.cubic)(clamp((duration-frame)/fade));
 const Component=registry[kind];
 return <AbsoluteFill style={{opacity:Math.min(inOpacity,outOpacity)}}><Component/></AbsoluteFill>;
};
export const Video:React.FC=()=>{
 const frame=useCurrentFrame();const {durationInFrames}=useVideoConfig();
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 44%,#164463 0%,#071421 65%,#030b16 100%)',fontFamily:'Arial,sans-serif'}}>
  {scenes.map(s=><Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Scene kind={s.kind} duration={s.duration}/></Sequence>)}
  <div style={{position:'absolute',top:120,left:85,color:'#78eee7',fontSize:28,fontWeight:700,letterSpacing:7}}>MOTION LAB <span style={{color:'#7893a8'}}> / HYBRID 001</span></div>
  <div style={{position:'absolute',bottom:100,left:80,right:80,height:4,background:'#24435b',borderRadius:5}}>
   <div style={{height:'100%',width:`${(frame+1)/durationInFrames*100}%`,background:'#78eee7',borderRadius:5}}/>
  </div>
 </AbsoluteFill>;
};
