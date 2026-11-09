import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {Router} from '../assets/Router';
import {Globe} from '../assets/Globe';
import {evaluateMotion} from '../core/timeline/evaluate';
import {resolveAsset} from '../assets/registry';
import {shotCamera,type ShotDirection} from '../director/shot';
import type {SceneGraph as Graph} from './schema';
const Device:React.FC=()=> <group><mesh><boxGeometry args={[1.5,2.8,0.18]}/><meshStandardMaterial color="#233a58" metalness={0.5}/></mesh><mesh position={[0,0,0.1]}><planeGeometry args={[1.3,2.5]}/><meshBasicMaterial color="#3a9bb3"/></mesh></group>;
const Object3D:React.FC<{object:Graph['objects'][number];time:number}>=({object,time})=>{
 const motion=evaluateMotion(object.motion,time);
 if(motion.opacity===0)return null;
 const position:[number,number,number]=[object.position[0]+motion.x,object.position[1]+motion.y,object.position[2]+motion.z];
 const scale=object.scale*motion.scale;
 const rotation:[number,number,number]=[0,motion.rotation,0];
 const elapsed=Math.max(0,time-object.motion.start);
 return <group position={position} scale={scale} rotation={rotation}>
  {object.asset==='router'?<Router t={elapsed+1}/>:object.asset==='earth'?<Globe t={elapsed}/>:object.asset==='device'?<Device/>:<mesh position={[0,0,0]}><sphereGeometry args={[0.13,16,12]}/><meshBasicMaterial color="#8affee"/></mesh>}
 </group>;
};
export const SceneGraphRenderer:React.FC<{graph:Graph;direction?:ShotDirection}>=({graph,direction})=>{
 const frame=useCurrentFrame();const {fps,width,height}=useVideoConfig();const time=frame/fps;
 for(const object of graph.objects){if(resolveAsset(object.asset).type==='svg')throw new Error('SVG asset requires IllustratedScene: '+object.asset);}
 return <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:shotCamera(time,direction,9),fov:42}}>
  <ambientLight intensity={2}/><directionalLight position={[4,6,7]} intensity={3}/><pointLight position={[-4,2,4]} intensity={35} color="#478eff"/>
  {graph.objects.map(object=><Object3D key={object.id} object={object} time={time}/>)}
 </ThreeCanvas>;
};
