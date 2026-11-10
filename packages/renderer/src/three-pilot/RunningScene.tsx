import React, {useEffect, useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {Arm, Ball, CharacterHead, Limb, RoundedBox, Shirt, Stroke, smooth, plan, type PilotPlan, type CameraView, type V3} from './Pilot.js';
import runningPlan from './running-plan.json' with {type: 'json'};

export const running = runningPlan;
const lerp = THREE.MathUtils.lerp;

function Leg({side, phase, settle, wounded, skinColor}: {side: number; phase: number; settle: number; wounded: number; skinColor: string}) {
  const hip = lerp(-Math.sin(phase) * 0.72, side < 0 ? -1.1 : -0.5, settle);
  const knee = lerp(0.3 + Math.max(0, -Math.sin(phase)) * 1.1, side < 0 ? 0.3 : 2.1, settle);
  return <group position={[side * 0.23,1.12,0]} rotation={[hip,0,0]}>
    <Limb from={[0,0,0]} to={[0,-0.43,0]} radius={0.15} color="#485650" />
    <Ball at={[0,-0.44,0]} scale={[0.115,0.12,0.115]} color={skinColor} />
    <group position={[0,-0.44,0]} rotation={[knee,0,0]}>
      <Limb from={[0,0,0]} to={[0,-0.48,0]} radius={0.092} color={skinColor} />
      <Ball at={[0,-0.5,0.08]} scale={[0.145,0.105,0.24]} color="#76543d" />
      {side < 0 && wounded > 0 && <group position={[0,-0.21,0.094]} scale={wounded}>
        <Ball scale={[0.064,0.092,0.009]} color="#c46a59" />
        <Stroke points={[[-0.026,0.036,0.009],[0.018,0.01,0.012],[-0.019,-0.027,0.01]]} color="#a54a42" radius={0.01} />
        <Ball at={[0.027,-0.086,0.008]} scale={[0.015,0.028,0.009]} color="#b74d43" />
      </group>}
    </group>
  </group>;
}

function Runner({time, scenePlan}: {time: number; scenePlan: PilotPlan}) {
  const trip = smooth(running.beats.trip, running.beats.landing, time);
  const settle = smooth(running.beats.landing - 0.3, running.beats.wound, time);
  const phase = Math.min(time, running.beats.trip) * Math.PI * 4;
  const movement = 1 - trip;
  const bob = Math.abs(Math.sin(phase)) * 0.075 * movement;
  const x = -0.95 + Math.min(time, running.beats.trip) * 0.53 + trip * 0.4;
  const pitch = Math.sin(trip * Math.PI) * 0.72 + settle * 0.22;
  const surprise = smooth(3.15,3.55,time) * (1 - smooth(5.0,5.8,time));
  const wound = smooth(running.beats.wound, running.beats.wound + 0.5, time);
  const blink = 1 - 0.9 * (smooth(1.4,1.47,time) - smooth(1.54,1.64,time));
  return <group position={[x,bob - settle * 0.57,0]} rotation={[0,lerp(1.15,0.5,settle),0]}>
    <group position={[0,1.12,0]} rotation={[pitch,0,0]}><group position={[0,-1.12,0]}>
      <Shirt color={scenePlan.palette.shirt} />
      <Ball at={[0,2.2,0]} scale={[0.17,0.24,0.16]} color={scenePlan.palette.skin} />
      <group position={[0,2.66,0]} rotation={[settle * 0.19,0,-0.035 * Math.sin(phase) * movement]}>
        <CharacterHead skinColor={scenePlan.palette.skin} blink={blink} surprise={surprise} doubt={settle * 0.65} reach={settle} />
      </group>
      {[-1,1].map(side => {
        const swing = Math.sin(phase + (side < 0 ? Math.PI : 0)) * movement;
        const elbow: V3 = [side * 0.56,1.63,lerp(-swing * 0.27,0.35,trip)];
        const hand: V3 = [lerp(side * 0.45,side * 0.39,settle),lerp(1.7 + swing * 0.1,0.92,settle),lerp(0.36 - swing * 0.18,0.58,trip)];
        return <Arm key={side} shoulder={[side * 0.4,2.0,0.06]} elbow={elbow} hand={hand} shirtColor={scenePlan.palette.shirt} skinColor={scenePlan.palette.skin} />;
      })}
    </group></group>
    <Leg side={-1} phase={phase} settle={settle} wounded={wound} skinColor={scenePlan.palette.skin} />
    <Leg side={1} phase={phase + Math.PI} settle={settle} wounded={0} skinColor={scenePlan.palette.skin} />
  </group>;
}

function Rock({at, scale = 1}: {at: V3; scale?: number}) {
  return <mesh position={at} scale={[0.26 * scale,0.17 * scale,0.23 * scale]} rotation={[0.2,0.4,-0.18]} castShadow><dodecahedronGeometry args={[1,1]} /><meshStandardMaterial color="#948879" roughness={0.95} /></mesh>;
}

function Track({time}: {time: number}) {
  return <group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.001,0]} receiveShadow><planeGeometry args={[12,2.0]} /><meshStandardMaterial color="#dfc5a0" roughness={1} /></mesh>
    <Rock at={[1.04,0.15,0.14]} />
    {[-3.4,-1.9,2.6,4.1].map((x,i) => <group key={x} position={[x,0,-1.5 - (i % 2) * 0.5]}>
      <Ball at={[0,0.08,0]} scale={[0.3,0.1,0.23]} color="#b9b49a" />
      <Ball at={[-0.09,0.24,0]} scale={[0.05,0.2,0.055]} color="#8eab94" />
      <Ball at={[0.065,0.19,0.01]} scale={[0.05,0.16,0.045]} color="#a0b397" />
    </group>)}
    {time > 3.6 && time < 5.4 && [0,1,2].map(i => {
      const p = smooth(3.6,5.4,time);
      return <Ball key={i} at={[1.15 + (i - 1) * p * 0.4,0.08 + p * 0.2,0.2]} scale={[0.08 * Math.sin(p*Math.PI),0.06 * Math.sin(p*Math.PI),0.06 * Math.sin(p*Math.PI)]} color="#eddbc0" />;
    })}
  </group>;
}

function SkinLayer({color, top, bottom, depth}: {color: string; top: number; bottom: number; depth: number}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.15,bottom);
    shape.lineTo(1.15,bottom);
    shape.lineTo(1.15,top);
    shape.lineTo(0.21,top);
    shape.quadraticCurveTo(0.13,top - 0.03,0,top - 0.22);
    shape.quadraticCurveTo(-0.13,top - 0.03,-0.21,top);
    shape.lineTo(-1.15,top);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:0.025,bevelThickness:0.025,bevelSegments:3,curveSegments:24});
  }, [top,bottom,depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[0,0,-depth/2]} castShadow><meshStandardMaterial color={color} roughness={0.88} /></mesh>;
}

function Microbe({at, angle, index}: {at: V3; angle: number; index: number}) {
  return <group position={at} rotation={[0,0,angle]}>
    <Limb from={[0,-0.085,0]} to={[0,0.085,0]} radius={0.043} color={index % 2 ? '#9276a7' : '#796292'} />
    {[-1,1].flatMap(side => [-0.055,0,0.055].map(y => <Stroke key={`${side}-${y}`} points={[[side*0.035,y,0],[side*0.068,y+0.012,0],[side*0.077,y-0.006,0]]} color="#9276a7" radius={0.006} />))}
    <Ball at={[-0.012,0.03,0.039]} scale={[0.009,0.009,0.007]} color="#b7a0c6" />
  </group>;
}

function Cutaway({time}: {time: number}) {
  return <group position={[0,-0.7,0]}>
    <RoundedBox at={[0,0.82,0]} size={[2.3,0.23,0.75]} color="#d5a77c" radius={0.06} />
    <SkinLayer color="#e1ab94" top={1.65} bottom={0.9} depth={0.7} />
    <SkinLayer color="#c98877" top={1.78} bottom={1.51} depth={0.72} />
    <Stroke points={[[-0.17,1.74,0.38],[0,1.55,0.38],[0.17,1.74,0.38]]} color="#ab5d52" radius={0.025} />
    <Ball at={[0.07,1.69,0.4]} scale={[0.045,0.065,0.018]} color="#b9574d" />
    {[0,1,2,3].map(index => {
      const progress = smooth(running.beats.germs + index * 0.42,12.6 + index * 0.22,time);
      const startX = index % 2 ? 0.65 + index * 0.09 : -0.75 + index * 0.06;
      const x = lerp(startX,(index-1.5)*0.035,progress);
      const y = lerp(2.12 + (index%2)*0.24,1.32 + index*0.03,progress);
      return <Microbe key={index} index={index} at={[x,y + Math.sin(time*3 + index)*0.012,0.45]} angle={lerp(index%2 ? 0.7 : -0.7,0.15,progress)} />;
    })}
  </group>;
}

function RunningCamera({time, view, motion}: {time: number; view: CameraView; motion: number}) {
  const {camera} = useThree();
  if (time >= running.beats.cutaway) {
    const push = smooth(8.8,14,time) * motion;
    camera.position.set(view === 'side' ? 3.8 : view === 'portrait' ? 0 : 1.4,view === 'portrait' ? 1.6 : 2.1,(view === 'side' ? 9.5 : view === 'portrait' ? 8.3 : 8.8) - push * 0.6);
    camera.lookAt(0,0.82,0.1);
  } else {
    const x = -0.95 + Math.min(time,3.2)*0.53 + smooth(3.2,4.5,time)*0.4;
    const settle = smooth(4.2,5.5,time);
    const trip = smooth(3.2,4.5,time);
    const pitch = Math.sin(trip * Math.PI) * 0.72 + settle * 0.22;
    const followX = x + Math.sin(pitch) * 0.7;
    const injuryCloseup = smooth(5.8,7.0,time);
    if (view === 'portrait') {
      camera.position.set(x + 1.6,3.1 - settle * 0.3,6.2);
      camera.lookAt(x,2.15 - settle * 0.4,0);
    } else {
      const close = view === 'scene' ? injuryCloseup : 0;
      camera.position.set(lerp(followX + (view === 'side' ? 5.2 : 2.1),x + 0.85,close),lerp(3.1,1.5,close),lerp(view === 'side' ? 8.3 : 9.8 - motion*0.4*smooth(0,8,time),4.5,close));
      camera.lookAt(lerp(followX,x+0.15,close),lerp(1.65 - settle * 0.25,0.55,close),0.15*close);
    }
  }
  camera.updateMatrixWorld();
  return null;
}

export function RunningScene({scenePlan = plan, cameraView = 'scene', onReady}: {scenePlan?: PilotPlan; cameraView?: CameraView; onReady?: () => void}) {
  const {width,height,fps} = useVideoConfig();
  const time = useCurrentFrame()/fps;
  const cutaway = time >= running.beats.cutaway;
  const fade = time < 8.8 ? smooth(8.3,8.8,time) : 1 - smooth(8.8,9.3,time);
  const caption = time < 3.2 ? 'Lari santai.' : time < 5.5 ? 'Ups, ada batu!' : time < 8.8 ? 'Ada lecet kecil di kaki.' : 'Melihat lebih dekat';
  return <AbsoluteFill>
    <ThreeCanvas width={width} height={height} shadows camera={{fov:32,near:0.1,far:60}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true}} onCreated={({gl}) => {gl.toneMapping=THREE.ACESFilmicToneMapping; gl.toneMappingExposure=1.1; gl.shadowMap.type=THREE.PCFSoftShadowMap;onReady?.();}}>
      <color attach="background" args={[scenePlan.palette.background]} />
      <fog attach="fog" args={[scenePlan.palette.background,15,35]} />
      <RunningCamera time={time} view={cameraView} motion={scenePlan.camera.pushIn} />
      <hemisphereLight args={['#fff6e8','#a28f79',2.2]} />
      <directionalLight position={[-3.5,7,5]} intensity={2.6} color="#fff6eb" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-5} shadow-normalBias={0.025} />
      <directionalLight position={[4,3,-3]} intensity={1.1} color="#ffead4" />
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.015,0]} receiveShadow><planeGeometry args={[200,200]} /><meshStandardMaterial color={scenePlan.palette.background} roughness={1} /></mesh>
      {cutaway ? <Cutaway time={time} /> : <><Track time={time} /><Runner time={time} scenePlan={scenePlan} /></>}
    </ThreeCanvas>
    <div style={{position:'absolute',top:time >= 5.5 && time < 8.8 ? undefined : 88,bottom:time >= 5.5 && time < 8.8 ? 88 : undefined,left:50,right:50,textAlign:'center',color:'#493f36',fontFamily:'system-ui,sans-serif',fontSize:27,fontWeight:600,pointerEvents:'none'}}>{caption}</div>
    {cutaway && <div style={{position:'absolute',bottom:135,left:65,right:65,textAlign:'center',fontFamily:'system-ui,sans-serif',fontSize:21,color:'#493f36',lineHeight:1.5,pointerEvents:'none'}}>Ilustrasi diperbesar<br /><span style={{fontSize:18,fontWeight:400}}>Bentuk dan ukuran kuman disederhanakan.</span></div>}
    {fade > 0 && <AbsoluteFill style={{backgroundColor:scenePlan.palette.background,opacity:fade,pointerEvents:'none'}} />}
  </AbsoluteFill>;
}
