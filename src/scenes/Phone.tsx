import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {interpolate,useCurrentFrame,useVideoConfig,Easing} from 'remotion';
const smooth=(t:number)=>Easing.inOut(Easing.cubic)(Math.max(0,Math.min(1,t)));
const Device:React.FC<{t:number}>=({t})=>{
 const enter=smooth(t/1.1);const spin=-0.85+smooth(t/3.8)*1.05;
 return <group position={[0,-0.3+(1-enter)*-2+Math.sin(t*2)*0.07,0]} rotation={[0.1+Math.sin(t)*0.045,spin,0.08*Math.sin(t*1.4)]} scale={0.7+enter*0.3}>
  <mesh><boxGeometry args={[2.35,4.7,0.22]}/><meshStandardMaterial color="#192b46" metalness={0.8} roughness={0.18}/></mesh>
  <mesh position={[0,0,0.116]}><planeGeometry args={[2.15,4.46]}/><meshBasicMaterial color="#071b30"/></mesh>
  <mesh position={[0,1.6,0.123]}><planeGeometry args={[1.75,0.35]}/><meshBasicMaterial color="#56e8d7"/></mesh>
  <mesh position={[0,0.35,0.124]}><planeGeometry args={[1.72,1.9]}/><meshBasicMaterial color="#17688c"/></mesh>
  <mesh position={[0,-1.15,0.125]}><planeGeometry args={[1.72,0.25]}/><meshBasicMaterial color="#91ecdc"/></mesh>
  <mesh position={[0,-1.65,0.125]}><planeGeometry args={[1.3,0.14]}/><meshBasicMaterial color="#4d7596"/></mesh>
 </group>;
};
export const Phone:React.FC=()=>{
 const f=useCurrentFrame();const {fps,width,height}=useVideoConfig();const t=f/fps;
 const appear=smooth((t-0.45)/0.8);
 return <>
  <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0}} camera={{position:[Math.sin(t*0.25)*0.5,0,8.5-Math.min(t,4)*0.28],fov:37}}>
   <ambientLight intensity={1.8}/><directionalLight position={[5,6,8]} intensity={3.2} color="#b8fff7"/><pointLight position={[-4,-2,3]} intensity={50} color="#317cff"/>
   <Device t={t}/>
  </ThreeCanvas>
  <div style={{position:'absolute',top:360,left:92,right:92,opacity:appear,transform:`translateY(${(1-appear)*45}px)`}}>
   <div style={{fontSize:30,letterSpacing:7,color:'#78eee7',fontWeight:700}}>01 / THE SPARK</div>
   <div style={{fontSize:90,lineHeight:1.08,fontWeight:800,color:'#fff',marginTop:22}}>Every tap<br/>starts a journey.</div>
  </div>
  <div style={{position:'absolute',top:1190,right:90,width:280,textAlign:'right',opacity:smooth((t-2)/0.6),color:'#a3c9dc',fontSize:30}}>A single request.<br/>Infinite possibilities.</div>
 </>;
};
