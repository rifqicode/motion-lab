import React from 'react';
import {Easing,useCurrentFrame,useVideoConfig} from 'remotion';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>Easing.inOut(Easing.cubic)(clamp(x));
const nodes=[{x:200,y:900,label:'DEVICE'},{x:550,y:760,label:'ROUTER'},{x:870,y:1050,label:'CLOUD'}];
const path='M200 900 C330 600 440 600 550 760 S770 1180 870 1050';
export const Network:React.FC<{headline:string;subline?:string}>=({headline,subline})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();const t=frame/fps;
 const travel=smooth((t-0.8)/2.6);
 return <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0}}>
  <defs>
   <linearGradient id="line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#3d8fff"/><stop offset="1" stopColor="#77fff0"/></linearGradient>
   <filter id="glow"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <text x="90" y="385" fill="#76e8de" fontSize="30" letterSpacing="7" fontWeight="700">02 / THE CONNECTION</text>
  <text x="90" y="485" fill="#fff" fontSize="88" fontWeight="800">{headline.split('\n').map((line,i)=><React.Fragment key={i}>{i>0&&' '}{line}</React.Fragment>)}</text>
  <path d={path} stroke="#1c3c62" strokeWidth="17" fill="none"/>
  <path d={path} stroke="#45e6f2" strokeWidth="28" fill="none" opacity=".6" filter="url(#glow)" strokeDasharray="1250" strokeDashoffset={1250*(1-travel)}/>
  <path d={path} stroke="url(#line)" strokeWidth="9" strokeLinecap="round" fill="none" strokeDasharray="1250" strokeDashoffset={1250*(1-travel)}/>
  {nodes.map((n,i)=>{const p=smooth((t-i*0.72)/0.7);return <g key={n.label} opacity={p} transform={`translate(${n.x} ${n.y}) scale(${0.65+0.35*p})`}>
   <circle r={85+Math.sin(t*3+i)*6} fill="none" stroke="#53dfe5" strokeWidth="3" opacity=".45"/>
   <circle r="62" fill="#123c5a" stroke="#7ff8ef" strokeWidth="6"/>
   <circle r="17" fill="#b9fff9"/>
   <text y="130" textAnchor="middle" fill="#e8ffff" fontSize="30" fontWeight="700">{n.label}</text>
  </g>})}
  {Array.from({length:16},(_,i)=>{const x=100+(i*167)%880;const y=680+(i*233)%600;return <circle key={i} cx={x} cy={y+Math.sin(t+i)*14} r={2+i%3} fill="#73dfe8" opacity={0.15+0.25*Math.sin(t+i)**2}/>})}
  <text x="540" y="1490" textAnchor="middle" fill="#9ac8d7" fontSize="32">{subline}</text>
 </svg>;
};
