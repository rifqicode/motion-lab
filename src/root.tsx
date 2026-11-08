import React from 'react';
import {Composition} from 'remotion';
import {Video} from './Video';
export const Root: React.FC = () => <Composition id="MotionLab" component={Video} durationInFrames={450} fps={30} width={1080} height={1920} />;
