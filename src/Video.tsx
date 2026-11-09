import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { scenes } from './spec';
import { SceneView } from './scenes/SceneView';
import { styles } from './illustration/style';
export const Video: React.FC = () => (
  <AbsoluteFill
    style={{
      background: scenes[0]?.illustration
        ? styles[scenes[0].illustration.style].background
        : '#17130f',
    }}
  >
    {scenes.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.duration}>
        <SceneView {...s} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
