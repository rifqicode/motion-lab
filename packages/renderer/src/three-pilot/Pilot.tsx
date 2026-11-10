import React, { useEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import defaultPlan from './scene-plan.json' with {type: 'json'};

type V3 = [number, number, number];
export type PilotPlan = typeof defaultPlan;
export const plan = defaultPlan;
const smooth = (a: number, b: number, t: number) => {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const mix = THREE.MathUtils.lerp;
const skin = '#dba577';
const hair = '#282b2a';

function Ball({ at = [0, 0, 0], scale = [1, 1, 1], color, radius = 1 }: {
  at?: V3; scale?: V3; color: string; radius?: number;
}) {
  return <mesh position={at} scale={scale} castShadow>
    <sphereGeometry args={[radius, 40, 28]} />
    <meshStandardMaterial color={color} roughness={0.88} />
  </mesh>;
}

function RoundedBox({ at, size, color, radius = 0.08 }: { at: V3; size: V3; color: string; radius?: number }) {
  const geometry = useMemo(() => {
    const [w, h, d] = size;
    const r = Math.min(radius, w / 2, h / 2, d / 2);
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(s, {depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: r, bevelThickness: r, curveSegments: 12});
    g.translate(0, 0, -d / 2 + r);
    g.computeVertexNormals();
    return g;
  }, [size[0], size[1], size[2], radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={at} geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.85} /></mesh>;
}

function Stroke({ points, color, radius = 0.018 }: { points: V3[]; color: string; radius?: number }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 8, false), [JSON.stringify(points), radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color={color} roughness={0.9} /></mesh>;
}

function Limb({ from, to, radius, color }: { from: V3; to: V3; radius: number; color: string }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={a.clone().add(b).multiplyScalar(0.5)} quaternion={rotation} castShadow>
    <capsuleGeometry args={[radius, Math.max(0.001, direction.length() - radius * 2), 8, 16]} />
    <meshStandardMaterial color={color} roughness={0.88} />
  </mesh>;
}

function Hand({ at, rotation = 0, skinColor = skin }: { at: V3; rotation?: number; skinColor?: string }) {
  return <group position={at} rotation={[0, rotation, 0]}>
    <Ball scale={[0.105, 0.055, 0.125]} color={skinColor} />
    {[-0.064, -0.022, 0.022, 0.064].map((x, i) => <Ball key={i} at={[x, -0.009, 0.105]} scale={[0.022, 0.027, i === 0 || i === 3 ? 0.069 : 0.085]} color={skinColor} />)}
    <Ball at={[0.098, -0.009, 0.016]} scale={[0.045, 0.033, 0.075]} color={skinColor} />
  </group>;
}

function Shirt({color}: {color: string}) {
  const geometry = useMemo(() => new THREE.LatheGeometry([
    [0, 1.05], [0.25, 1.05], [0.35, 1.1], [0.4, 1.25],
    [0.44, 1.56], [0.45, 1.8], [0.41, 2.0], [0.31, 2.13],
    [0.18, 2.2], [0, 2.2],
  ].map(([r,y]) => new THREE.Vector2(r,y)), 64), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} scale={[1,1,0.72]} castShadow>
      <meshStandardMaterial color={color} roughness={0.84} />
    </mesh>
    <mesh position={[0,2.205,0]} rotation={[Math.PI/2,0,0]} scale={[1,0.78,1]}>
      <torusGeometry args={[0.164,0.022,12,48]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  </group>;
}

function Arm({shoulder, elbow, hand, shirtColor, skinColor}: {shoulder: V3; elbow: V3; hand: V3; shirtColor: string; skinColor: string}) {
  const geometry = useMemo(() => {
    const path = new THREE.CatmullRomCurve3([shoulder, elbow, hand].map(point => new THREE.Vector3(...point)));
    const segments = 64;
    const radialSegments = 20;
    const tube = new THREE.TubeGeometry(path, segments, 0.105, radialSegments, false);
    const positions = tube.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const shirt = new THREE.Color(shirtColor), skin = new THREE.Color(skinColor);
    for (let ring = 0; ring <= segments; ring++) {
      const u = ring / segments;
      const center = path.getPointAt(u);
      const radius = u < 0.25 ? 0.168 : u < 0.3 ? mix(0.168, 0.148, (u - 0.25) / 0.05) : mix(0.105, 0.087, (u - 0.3) / 0.7);
      const color = u < 0.3 ? shirt : skin;
      for (let side = 0; side <= radialSegments; side++) {
        const index = ring * (radialSegments + 1) + side;
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, index).sub(center).multiplyScalar(radius / 0.105).add(center);
        positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
        colors.set([color.r, color.g, color.b], index * 3);
      }
    }
    tube.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tube.computeVertexNormals();
    return tube;
  }, [JSON.stringify([shoulder, elbow, hand]), shirtColor, skinColor]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} castShadow><meshStandardMaterial vertexColors roughness={0.86} /></mesh>
    <Hand at={hand} rotation={shoulder[0] < 0 ? -0.18 : 0} skinColor={skinColor} />
  </group>;
}

export function CharacterHead({skinColor = skin, doubt = 0, reach = 0, blink = 1, surprise = 0}: {skinColor?: string; doubt?: number; reach?: number; blink?: number; surprise?: number}) {
  return <group>
    <Ball scale={[0.48, 0.55, 0.405]} color={skinColor} />
    {[-1,1].map(side => <group key={side}>
      <Ball at={[side * 0.46, -0.01, 0]} scale={[0.085, 0.14, 0.09]} color={skinColor} />
      <Ball at={[side * 0.475, -0.01, 0.047]} scale={[0.034, 0.08, 0.03]} color="#c98e68" />
    </group>)}
    <mesh position={[0, 0.02, 0]} scale={[1, 1.1, 0.88]} castShadow><sphereGeometry args={[0.51, 48, 32, 0, Math.PI * 2, 0, 1.3]} /><meshStandardMaterial color={hair} roughness={0.95} /></mesh>
    {[-1,1].map(side => <Ball key={side} at={[side * 0.435, 0.16, -0.03]} scale={[0.065, 0.22, 0.2]} color={hair} />)}
    <group rotation={[0, 0, -0.2]}>
      <Ball at={[-0.09, 0.43, 0.12]} scale={[0.35, 0.17, 0.3]} color={hair} />
      <Ball at={[0.17, 0.42, 0.15]} scale={[0.23, 0.14, 0.26]} color={hair} />
    </group>
    {[-1, 1].map(side => <group key={side} position={[side * 0.17, 0.025, 0.365]}>
      <Ball scale={[0.068, 0.084 * blink, 0.025]} color="#f8f0df" />
      <Ball at={[0.009 * reach - 0.012 * doubt, -0.023 * reach + 0.012 * doubt, 0.022]} scale={[0.035, 0.053 * blink, 0.018]} color="#332d29" />
      <Ball at={[-0.009, 0.016, 0.036]} scale={[0.012, 0.014 * blink, 0.007]} color="#fff9ee" />
      <Stroke points={[[-0.075, 0.13 + (side < 0 ? 0.06 * doubt : 0) + surprise * 0.035, 0.005], [0, 0.155 + surprise * 0.035, 0.018], [0.075, 0.13 - (side < 0 ? 0.04 * doubt : 0) + surprise * 0.035, 0]]} color={hair} radius={0.022} />
    </group>)}
    <Ball at={[0, -0.09, 0.414]} scale={[0.075, 0.1, 0.073]} color={skinColor} />
    {surprise > 0.15 ? <Ball at={[0, -0.245, 0.36]} scale={[0.045, 0.045 + surprise * 0.025, 0.009]} color="#87533f" /> : <Stroke points={[[-0.105, -0.25 + 0.025 * doubt, 0.342], [0, -0.27 + 0.07 * doubt, 0.37], [0.105, -0.25, 0.342]]} color="#925e46" radius={0.014} />}
  </group>;
}

function Host({ time, scenePlan }: {time: number; scenePlan: PilotPlan}) {
  const skin = scenePlan.palette.skin;
  const beats = scenePlan.beats;
  const anticipation = smooth(Math.max(0, beats.reachStart - 0.35), beats.reachStart, time) * (1 - smooth(beats.reachStart, beats.reachStart + 0.3, time));
  const reach = smooth(beats.reachStart, beats.reachEnd, time);
  const doubt = smooth(beats.doubtStart, beats.doubtStart + 0.75, time);
  const breathe = Math.sin(time * 2.4) * 0.009;
  const headTilt = -0.095 * doubt;
  const hand: V3 = [mix(-0.62, -0.28, reach), mix(1.42, 1.48, reach) + Math.sin(reach * Math.PI) * 0.12, mix(0.58, 0.91, reach)];
  const shoulder = new THREE.Vector3(-0.4, 2.0, 0.06);
  const direction = new THREE.Vector3(...hand).sub(shoulder);
  const distance = direction.length();
  direction.normalize();
  const along = (0.48 ** 2 - 0.55 ** 2 + distance ** 2) / (2 * distance);
  const pole = new THREE.Vector3(-1, 0, 0);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, 0.48 ** 2 - along ** 2))).toArray() as V3;
  const blink = 1 - 0.93 * (smooth(1.95, 2.02, time) - smooth(2.08, 2.18, time) + smooth(4.7, 4.77, time) - smooth(4.85, 4.94, time));
  return <group>
    <RoundedBox at={[0, 0.89, -0.04]} size={[1.01, 0.17, 0.85]} color="#b38355" />
    <RoundedBox at={[0, 1.39, -0.37]} size={[0.94, 1.04, 0.15]} color="#ba8b5b" />
    {[-0.36, 0.36].map(x => <group key={x}>
      <Limb from={[x, 0.86, -0.05]} to={[x, 0.71, 0.4]} radius={0.155} color="#444e4e" />
      <Limb from={[x, 0.7, 0.4]} to={[x, 0.19, 0.47]} radius={0.12} color="#444e4e" />
      <Ball at={[x, 0.13, 0.59]} scale={[0.16, 0.12, 0.28]} color="#73533b" />
      <RoundedBox at={[x, 0.41, -0.3]} size={[0.09, 0.82, 0.1]} color="#a7764b" />
    </group>)}
    <group position={[0, breathe, 0]}>
      <Shirt color={scenePlan.palette.shirt} />
      <Ball at={[0, 2.2, 0]} scale={[0.17, 0.24, 0.16]} color={skin} />
      <Arm shoulder={shoulder.toArray() as V3} elbow={elbow} hand={hand} shirtColor={scenePlan.palette.shirt} skinColor={skin} />
      <Arm shoulder={[0.4,2.0,0.06]} elbow={[0.64,1.6,0.25]} hand={[0.67,1.39,0.7]} shirtColor={scenePlan.palette.shirt} skinColor={skin} />
      <group position={[0, 2.66 + anticipation * 0.012, -anticipation * 0.025]} rotation={[0.09 * reach - 0.05 * doubt - anticipation * 0.035, -0.045 * reach + 0.07 * doubt, headTilt]}>
        <CharacterHead skinColor={skin} doubt={doubt} reach={reach} blink={blink} />
      </group>
    </group>
  </group>;
}

export {Ball, RoundedBox, Stroke, Limb, Shirt, Arm, smooth};
export type {V3};

function DiningTable() {
  return <group>
    <RoundedBox at={[0, 1.24, 0.83]} size={[2.24, 0.16, 1.22]} color="#c29a6b" radius={0.055} />
    <RoundedBox at={[0, 1.13, 0.83]} size={[2.02, 0.12, 1.02]} color="#ad8052" radius={0.025} />
    {[-0.93, 0.93].flatMap(x => [0.39, 1.28].map(z => <RoundedBox key={`${x}-${z}`} at={[x, 0.59, z]} size={[0.13, 1.16, 0.14]} color="#b88c5c" radius={0.025} />))}
    <mesh position={[0, 1.34, 0.99]} castShadow receiveShadow><cylinderGeometry args={[0.35, 0.29, 0.038, 64]} /><meshStandardMaterial color="#f1e7ce" roughness={0.8} /></mesh>
    <mesh position={[0, 1.365, 0.99]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.3, 0.02, 12, 64]} /><meshStandardMaterial color="#e4d8b8" roughness={0.85} /></mesh>
    <Ball at={[0, 1.52, 0.99]} scale={[0.115, 0.15, 0.115]} color="#fff7e5" />
    <mesh position={[-0.76, 1.46, 0.91]} castShadow receiveShadow><cylinderGeometry args={[0.105, 0.091, 0.26, 48]} /><meshStandardMaterial color="#4f9690" roughness={0.8} /></mesh>
    <mesh position={[-0.76, 1.593, 0.91]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.096, 0.013, 12, 48]} /><meshStandardMaterial color="#8bb3a2" roughness={0.8} /></mesh>
    <mesh position={[-0.76, 1.58, 0.91]}><cylinderGeometry args={[0.083, 0.083, 0.005, 48]} /><meshStandardMaterial color="#77513b" roughness={0.5} /></mesh>
    <mesh position={[-0.894, 1.46, 0.91]}><torusGeometry args={[0.065, 0.022, 12, 32]} /><meshStandardMaterial color="#4f9690" roughness={0.8} /></mesh>
  </group>;
}

function ThoughtBubble({time, start}: {time: number; start: number}) {
  const amount = smooth(start, start + 0.6, time);
  if (!amount) return null;
  return <group position={[0.66, 3.38 + Math.sin(time * 2) * 0.014, 0]} scale={amount}>
    <Ball at={[-0.3, -0.47, 0.06]} scale={[0.043, 0.043, 0.035]} color="#fff6df" />
    <Ball at={[-0.22, -0.32, 0.04]} scale={[0.065, 0.062, 0.04]} color="#fff6df" />
    <Ball scale={[0.36, 0.24, 0.1]} color="#fff6df" />
    {[[-0.25, 0.06], [-0.13, 0.18], [0.04, 0.2], [0.22, 0.12], [0.26, -0.06], [0.08, -0.17], [-0.13, -0.16]].map(([x,y],i) => <Ball key={i} at={[x,y,0]} scale={[0.13,0.13,0.095]} color="#fff6df" />)}
    <Ball at={[0, -0.06, 0.103]} scale={[0.22, 0.038, 0.033]} color="#e0b18e" />
    <Ball at={[0, -0.035, 0.115]} scale={[0.11, 0.085, 0.032]} color="#cb8167" />
    <Ball at={[0, 0.01, 0.131]} scale={[0.035, 0.031, 0.012]} color="#d49273" />
    <Stroke points={[[-0.13,0.07,0.1],[-0.15,0.13,0.1]]} color="#b7785c" radius={0.009} />
    <Stroke points={[[0,0.12,0.1],[0,0.18,0.1]]} color="#b7785c" radius={0.009} />
    <Stroke points={[[0.12,0.07,0.1],[0.15,0.12,0.1]]} color="#b7785c" radius={0.009} />
  </group>;
}

export type CameraView = 'scene' | 'portrait' | 'side';

function Camera({time, pushIn, duration, view}: {time: number; pushIn: number; duration: number; view: CameraView}) {
  const { camera } = useThree();
  const push = smooth(0, duration, time) * pushIn;
  if (view === 'portrait') {
    camera.position.set(0.35, 2.85, 6.1 - push * 0.4);
    camera.lookAt(0, 2.32, 0.05);
  } else if (view === 'side') {
    camera.position.set(5.1 - push * 0.2, 3.3, 8.7 - push * 0.5);
    camera.lookAt(0, 1.83, 0.25);
  } else {
    camera.position.set(1.05 - push * 0.25, 3.25 - push * 0.08, 10 - push);
    camera.lookAt(0, 1.83, 0.25);
  }
  camera.updateMatrixWorld();
  return null;
}

export function Pilot({scenePlan = plan, cameraView = 'scene', onReady}: {scenePlan?: PilotPlan; cameraView?: CameraView; onReady?: () => void}) {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const time = frame / fps;
  return <ThreeCanvas width={width} height={height} shadows camera={{fov: 32, near: 0.1, far: 60}} gl={{antialias: true, alpha: false, preserveDrawingBuffer: true}} onCreated={({gl}) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    onReady?.();
  }}>
    <color attach="background" args={[scenePlan.palette.background]} />
    <fog attach="fog" args={[scenePlan.palette.background, 12, 28]} />
    <Camera time={time} pushIn={scenePlan.camera.pushIn} duration={scenePlan.durationSeconds} view={cameraView} />
    <hemisphereLight args={['#fff6e8', '#a28f79', 2.2]} />
    <directionalLight position={[-3.5, 7, 5]} intensity={2.6} color="#fff6eb" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={5} shadow-camera-bottom={-4} shadow-normalBias={0.025} shadow-bias={0.0001} shadow-radius={8} shadow-blurSamples={12} />
    <directionalLight position={[4, 3, -3]} intensity={1.1} color="#ffead4" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.015, 0]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color={scenePlan.palette.background} roughness={1} /></mesh>
    <Host time={time} scenePlan={scenePlan} />
    <DiningTable />
    <ThoughtBubble time={time} start={scenePlan.beats.bubbleStart} />
  </ThreeCanvas>;
}
