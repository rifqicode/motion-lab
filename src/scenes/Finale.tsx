import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {ease,pop} from '../motion/presets';
export const Finale:React.FC=()=>{
 const f=useCurrentFrame();const {fps,width,height}=useVideoConfig();const scale=pop(f,fps,5);
 return <>
  <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:[0,0,9],fov:45}}>
   <ambientLight intensity={1.5}/><pointLight position={[3,5,5]} intensity={80} color="#78f7f1"/>
   <mesh rotation={[f*0.006,f*0.012,0]} scale={Math.max(0.001,scale)*1.4}>
    <icosahedronGeometry args={[1.7,1]}/><meshStandardMaterial color="#45c9d2" wireframe metalness={0.4} roughness={0.25}/>
   </mesh>
  </ThreeCanvas>
  <div style={{position:'absolute',top:1240,width:'100%',textAlign:'center',color:'#f3ffff',fontSize:72,fontWeight:800,opacity:ease(f,18,30)}}>CONNECTED.</div>
  <div style={{position:'absolute',top:1350,width:'100%',textAlign:'center',color:'#9fd5e4',fontSize:35,opacity:ease(f,32,30)}}>From a tap to the entire web</div>
 </>;
};
