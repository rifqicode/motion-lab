import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Pilot, plan, type PilotPlan} from './Pilot.js';
import {RunningScene, running} from './RunningScene.js';

const Root = () => <><Composition id="RunningAccident" component={RunningScene} width={720} height={1280} fps={running.fps} durationInFrames={running.durationSeconds * running.fps} defaultProps={{scenePlan:{...plan,durationSeconds:running.durationSeconds}}} /><Composition id="ThreePilot" component={Pilot} width={720} height={1280} fps={plan.fps} durationInFrames={plan.durationSeconds * plan.fps} defaultProps={{scenePlan: plan}} calculateMetadata={({props}) => {
  const current = props.scenePlan as PilotPlan;
  return {fps: current.fps, durationInFrames: Math.round(current.durationSeconds * current.fps)};
}} /></>;
registerRoot(Root);
