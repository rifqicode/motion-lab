import React from 'react';
import {Easing,useCurrentFrame,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
const smooth=(x:number)=>Easing.inOut(Easing.cubic)(Math.max(0,Math.min(1,x)));
export const Finale:React.FC<{headline:string;subline?:string}>=({headline,subline})=>{
 const f=useCurrentFrame();const {fps,width,height}=useVideoConfig();const t=f/fps;
 const enter=smooth(t/1.1);const headline=smooth((t-0.85)/0.85);
 return <>
  <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:[0,0,9.2-Math.min(t,4)*0.65],fov:42}}>
   <ambientLight intensity={1.6}/><directionalLight position={[4,5,6]} intensity={3.8} color="#affff4"/><pointLight position={[-4,2,3]} intensity={70} color="#3d84ff"/>
   <group rotation={[t*0.18,t*0.4,t*0.07]} scale={0.2+enter*1.5}>
    <mesh><icosahedronGeometry args={[1.6,2]}/><meshStandardMaterial color="#56d7dc" metalness={0.72} roughness={0.2} wireframe/></mesh>
    <mesh scale={0.87}><icosahedronGeometry args={[1.6,1]}/><meshStandardMaterial color="#19496b" metalness={0.35} roughness={0.3} transparent opacity={0.75}/></mesh>
   </group>
  </ThreeCanvas>
  <div style={{position:'absolute',top:340,left:90,color:'#7aece4',letterSpacing:7,fontSize:30,fontWeight:700}}>03 / THE BIG PICTURE</div>
  <div style={{position:'absolute',top:1260,left:70,right:70,textAlign:'center',opacity:headline,transform:`translateY(${(1-headline)*55}px)`}}>
   <div style={{fontSize:112,fontWeight:900,color:'#fff',letterSpacing:-4}}>{headline}</div>
   <div style={{fontSize:38,color:'#a7d2df',marginTop:26}}>{subline}</div>
  </div>
 </>;
};
