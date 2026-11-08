import React from 'react';
import {Composition} from 'remotion';
import {Video} from './Video';
import {VIDEO} from './render/config';
export const Root:React.FC=()=> <Composition id="MotionLab" component={Video} durationInFrames={VIDEO.durationInFrames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>;
