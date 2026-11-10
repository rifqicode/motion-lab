import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {InternetVideo} from './InternetVideo.js';
import type {InternetProject} from './types.js';

const empty:InternetProject={id:'how-internet-works',title:'Cara Internet Bekerja',fps:30,width:1080,height:1920,durationFrames:1,scenes:[]};
const Root=()=> <Composition id="InternetExplainer" component={InternetVideo} width={1080} height={1920} fps={30} durationInFrames={1} defaultProps={{project:empty}} calculateMetadata={({props})=>{
  const project=props.project as InternetProject;
  return {durationInFrames:project.durationFrames,fps:project.fps,width:project.width,height:project.height};
}}/>;
registerRoot(Root);
