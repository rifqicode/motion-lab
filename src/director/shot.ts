import type {SceneGraph} from '../graph/schema';
import type {Storyboard} from '../storyboard/schema';
import {semanticAssets,type SemanticAssetId} from '../assets/semantic';
import {cameraPush,float,reveal} from '../motion/presets';
export type ShotDirection=Storyboard['shots'][number]['direction'];
export type ResolvedAsset={id:SemanticAssetId;type:string;description:string};
export type ShotProps={headline:string;subline?:string;direction?:ShotDirection;assets?:ResolvedAsset[];graph?:SceneGraph};
const isSemanticAsset=(id:string):id is SemanticAssetId=>Object.prototype.hasOwnProperty.call(semanticAssets,id);
export const resolveShotAssets=(assets:Storyboard['shots'][number]['assets']):ResolvedAsset[]=>
 assets.map(asset=>{
  if(!isSemanticAsset(asset.id)) throw new Error(`Unknown semantic asset: ${asset.id}`);
  const resolved=semanticAssets[asset.id];
  if(resolved.type!==asset.type) throw new Error(`Asset ${asset.id} type mismatch: ${asset.type} vs ${resolved.type}`);
  return resolved;
 });
export const shotCamera=(time:number,direction:ShotDirection|undefined,baseDistance:number):[number,number,number]=>{
 const camera=direction?.camera??'static';
 const intensity=direction?.energy==='high'?1.35:direction?.energy==='calm'?0.65:1;
 switch(camera){
  case 'push':return [0,0,cameraPush(time,0,4,baseDistance,baseDistance-1.2*intensity)];
  case 'track':return [float(time,0.45,0.48*intensity),0,baseDistance];
  case 'orbit':return [Math.sin(time*0.23*intensity)*1.1,0,baseDistance-Math.cos(time*0.23*intensity)*0.25];
  default:return [0,0,baseDistance];
 }
};
export const shotFade=(frame:number,duration:number,fps:number,direction:ShotDirection|undefined)=>{
 if(direction?.transition==='cut') return 1;
 const time=frame/fps;
 return Math.min(reveal(time,0,0.65),reveal((duration-frame)/fps,0,0.65));
};
