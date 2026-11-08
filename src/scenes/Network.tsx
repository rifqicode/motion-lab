import React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {ease,stagger} from '../motion/presets';
const nodes=[{x:160,label:'BROWSER'},{x:540,label:'DNS'},{x:920,label:'SERVER'}];
export const Network:React.FC=()=>{
 const f=useCurrentFrame();
 return <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0}}>
  <text x="540" y="560" fill="#eaf9ff" textAnchor="middle" fontSize="65" fontWeight="700">How requests travel</text>
  <path d="M160 940 H920" stroke="#1d5677" strokeWidth="13" strokeLinecap="round"/>
  <path d="M160 940 H920" stroke="#65e7e3" strokeWidth="13" strokeLinecap="round" strokeDasharray="760" strokeDashoffset={760*(1-ease(f,22,95))}/>
  {nodes.map((n,i)=><g key={n.label} opacity={ease(f,stagger(i,15),24)}>
   <circle cx={n.x} cy="940" r="76" fill="#153956" stroke="#64e9e2" strokeWidth="6"/>
   <circle cx={n.x} cy="940" r="24" fill="#a9fff5"/>
   <text x={n.x} y="1075" textAnchor="middle" fontSize="32" fill="#eaf9ff">{n.label}</text>
  </g>)}
  <circle cx={interpolate(ease(f,22,95),[0,1],[160,920])} cy="940" r="18" fill="#ffffff"/>
 </svg>;
};
