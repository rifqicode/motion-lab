import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {evaluateMotion} from '../../core/timeline/evaluate';
import {resolveAsset} from '../../assets/registry';
import type {SceneGraph} from '../../graph/schema';
const Illustration:React.FC<{id:string}>=({id})=>{
 if(id==='coffee-bean')return <g><ellipse rx="55" ry="85" fill="#9c5a32" stroke="#4c291c" strokeWidth="6" transform="rotate(24)"/><path d="M-10 -65 Q 40 -20 -8 65" fill="none" stroke="#4c291c" strokeWidth="9" strokeLinecap="round"/></g>;
 if(id==='coffee-cup')return <g><path d="M-105 -60 H90 L75 65 Q0 105 -75 65Z" fill="#fff1d6" stroke="#563827" strokeWidth="7"/><path d="M90 -35 Q160 -45 145 25 Q130 65 78 38" fill="none" stroke="#563827" strokeWidth="12"/><ellipse cy="-55" rx="98" ry="22" fill="#794327"/></g>;
 if(id==='coffee-stream')return <path d="M0 -105 Q-15 -25 0 75" stroke="#8a4b26" strokeWidth="20" strokeLinecap="round" fill="none"/>;
 return null;
};
export const IllustratedScene:React.FC<{graph:SceneGraph}>=({graph})=>{
 const frame=useCurrentFrame();const {fps,width,height}=useVideoConfig();const time=frame/fps;
 return <svg viewBox="-540 -960 1080 1920" width={width} height={height} style={{position:'absolute',inset:0}}>
  {graph.objects.map(object=>{const asset=resolveAsset(object.asset);if(asset.type!=='svg')return null;
   const m=evaluateMotion(object.motion,time);if(m.opacity===0)return null;
   return <g key={object.id} opacity={m.opacity} transform={`translate(${object.position[0]+m.x} ${object.position[1]+m.y}) rotate(${(m.rotation)*180/Math.PI}) scale(${object.scale*m.scale})`}>
    <Illustration id={asset.id}/>
   </g>;
  })}
 </svg>;
};
