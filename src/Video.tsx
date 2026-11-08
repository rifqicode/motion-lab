import React from 'react';
import {AbsoluteFill,Sequence,useCurrentFrame,interpolate} from 'remotion';
import {scenes} from './spec';
import {Phone} from './scenes/Phone';
import {Network} from './scenes/Network';
import {Finale} from './scenes/Finale';
const registry={phone:Phone,network:Network,finale:Finale};
const Scene:React.FC<{kind:keyof typeof registry;duration:number}>=({kind,duration})=>{
 const frame=useCurrentFrame();
 const opacity=interpolate(frame,[0,12,duration-15,duration],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const Component=registry[kind];
 return <AbsoluteFill style={{opacity}}><Component/></AbsoluteFill>;
};
export const Video:React.FC=()=>{
 const frame=useCurrentFrame();
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 40%,#163d60 0%,#07121f 68%)',fontFamily:'Arial,sans-serif'}}>
  {scenes.map(s=><Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Scene kind={s.kind} duration={s.duration}/></Sequence>)}
  <div style={{position:'absolute',top:120,left:80,color:'#78eee7',fontSize:32,fontWeight:700,letterSpacing:6}}>MOTION LAB / 001</div>
  <div style={{position:'absolute',bottom:110,left:80,right:80,height:5,background:'#24435b',borderRadius:5}}>
   <div style={{height:'100%',width:`${(frame+1)/450*100}%`,background:'#78eee7',borderRadius:5}}/>
  </div>
 </AbsoluteFill>;
};
