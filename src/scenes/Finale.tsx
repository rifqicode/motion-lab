import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Globe} from '../assets/Globe';
import {reveal} from '../motion/presets';
import {shotCamera,type ShotProps} from '../director/shot';
export const Finale:React.FC<ShotProps>=({headline,subline,direction})=>{
 const f=useCurrentFrame();const {fps,width,height}=useVideoConfig();const t=f/fps;
 const headlineProgress=reveal(t,0.85,0.85);
 return <>
  <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:shotCamera(t,direction,8.7),fov:42}}>
   <ambientLight intensity={1.65}/><directionalLight position={[4,5,6]} intensity={3.6} color="#affff4"/><pointLight position={[-4,2,3]} intensity={60} color="#3d84ff"/>
   <Globe t={t}/>
  </ThreeCanvas>
  <div style={{position:'absolute',top:340,left:90,color:'#7aece4',letterSpacing:7,fontSize:30,fontWeight:700}}>03 / THE BIG PICTURE</div>
  <div style={{position:'absolute',top:1260,left:70,right:70,textAlign:'center',opacity:headlineProgress,transform:`translateY(${(1-headlineProgress)*55}px)`}}>
   <div style={{fontSize:112,fontWeight:900,color:'#fff',letterSpacing:-4}}>{headline}</div>
   <div style={{fontSize:38,color:'#a7d2df',marginTop:26}}>{subline}</div>
  </div>
 </>;
};
