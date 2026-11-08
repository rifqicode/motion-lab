import React from 'react';
import * as THREE from 'three';
import {float,reveal} from '../motion/presets';
type Coord=[number,number];
const points:Coord[]=[[40.7,-74],[51.5,-0.1],[35.7,139.7],[1.3,103.8],[-33.9,151.2],[19.1,72.9],[37.8,-122.4]];
const spherePoint=([lat,lon]:Coord,r=1.62)=>{
 const a=lat*Math.PI/180,b=lon*Math.PI/180;
 return new THREE.Vector3(r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b));
};
const Arc:React.FC<{from:Coord;to:Coord;t:number;index:number}>=({from,to,t,index})=>{
 const start=spherePoint(from),end=spherePoint(to);
 const mid=start.clone().add(end).normalize().multiplyScalar(2.3);
 const curve=new THREE.QuadraticBezierCurve3(start,mid,end);
 const path=curve.getPoints(44);
 const visible=reveal(t,0.5+index*0.35,0.75);
 const count=Math.max(2,Math.floor(visible*path.length));
 const geometry=new THREE.BufferGeometry().setFromPoints(path.slice(0,count));
 const particle=curve.getPoint(Math.max(0.001,Math.min(0.999,(t*0.34+index*0.21)%1)));
 return <group>
  <primitive object={new THREE.Line(geometry,new THREE.LineBasicMaterial({color:"#69f8e9",transparent:true,opacity:0.82}))}/>
  {visible>0&&<mesh position={particle.toArray()}><sphereGeometry args={[0.042,8,8]}/><meshBasicMaterial color="#dffffa"/></mesh>}
 </group>;
};
export const Globe:React.FC<{t:number}>=({t})=><group rotation={[0.16,t*0.18+0.2,0]} position={[0,float(t,1.1,0.08),0]}>
 <mesh><sphereGeometry args={[1.59,48,32]}/><meshStandardMaterial color="#124768" metalness={0.35} roughness={0.5}/></mesh>
 <mesh scale={1.009}><sphereGeometry args={[1.59,28,18]}/><meshBasicMaterial color="#2d9ac0" wireframe transparent opacity={0.22}/></mesh>
 {points.map((p,i)=><mesh key={i} position={spherePoint(p).toArray()}><sphereGeometry args={[0.055,10,10]}/><meshBasicMaterial color="#b3fff6"/></mesh>)}
 {points.slice(1).map((p,i)=><Arc key={i} from={points[0]} to={p} t={t} index={i}/>)}
 </group>;
