import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {SceneGraphRenderer} from '../graph/SceneGraph';
import {IllustratedScene} from '../renderers/svg/IllustratedScene';
import {resolveAsset} from '../assets/registry';
import {reveal} from '../motion/presets';
import type {ShotProps} from '../director/shot';
export const GraphScene:React.FC<ShotProps>=({headline,subline,direction,graph})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 const isIllustrated=Boolean(graph?.objects.every(o=>resolveAsset(o.asset).type==='svg'));
 return <>
  {graph&&(isIllustrated?<IllustratedScene graph={graph}/>:<SceneGraphRenderer graph={graph} direction={direction}/>)}
  <div style={{position:'absolute',top:290,left:80,right:80,color:isIllustrated?'#352b2a':'white',fontSize:84,fontWeight:800,opacity:reveal(frame/fps,0.2,0.7)}}>{headline}</div>
  <div style={{position:'absolute',bottom:290,left:80,right:80,color:isIllustrated?'#7c4a31':'#9bd8dd',fontSize:36}}>{subline}</div>
 </>;
};
