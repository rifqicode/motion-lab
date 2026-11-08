import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
const PhoneMesh:React.FC<{frame:number}>=({frame})=>{
 const turn=interpolate(frame,[0,145],[-0.32,0.28],{extrapolateRight:'clamp'});
 return <group rotation={[0.08,turn,0]}>
  <mesh><boxGeometry args={[2.3,4.5,0.17]}/><meshStandardMaterial color="#17213c" metalness={0.6} roughness={0.23}/></mesh>
  <mesh position={[0,0,0.096]}><planeGeometry args={[2.08,4.2]}/><meshBasicMaterial color="#142f51"/></mesh>
  <mesh position={[0,1.25,0.104]}><planeGeometry args={[1.6,0.28]}/><meshBasicMaterial color="#6be8e3"/></mesh>
  <mesh position={[0,0.25,0.105]}><planeGeometry args={[1.55,1.3]}/><meshBasicMaterial color="#3979a9"/></mesh>
  <mesh position={[0,-0.9,0.106]}><planeGeometry args={[1.55,0.24]}/><meshBasicMaterial color="#e2f9ff"/></mesh>
 </group>;
};
export const Phone:React.FC=()=>{
 const frame=useCurrentFrame();const {width,height}=useVideoConfig();
 return <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:[0,0,8],fov:38}}>
  <ambientLight intensity={1.6}/><directionalLight position={[4,5,8]} intensity={3}/><PhoneMesh frame={frame}/>
 </ThreeCanvas>;
};
