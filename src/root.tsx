import { AssetGallery, AssetInspector } from './illustration/AssetGallery';
import { illustrationAssets } from './illustration/registry';
import { filmVariants } from './render/variants';
import { styles } from './illustration/style';
import React from 'react';
import { Composition } from 'remotion';
import { Video } from './Video';

import { scenes, video } from './spec';
import { SceneView } from './scenes/SceneView';
export const Root: React.FC = () => (
  <>
    <Composition
      id="MotionLab"
      component={Video}
      durationInFrames={video.durationInFrames}
      fps={video.fps}
      width={video.width}
      height={video.height}
    />
    {filmVariants
      .filter((v) => v.width !== video.width || v.height !== video.height)
      .map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={Video}
          durationInFrames={video.durationInFrames}
          fps={video.fps}
          width={v.width}
          height={v.height}
        />
      ))}
    {Object.keys(styles).map((style) => (
      <Composition
        key={style}
        id={`Gallery-${style}`}
        component={AssetGallery}
        defaultProps={{ style: style as keyof typeof styles }}
        durationInFrames={120}
        fps={60}
        width={1500}
        height={2100}
      />
    ))}
    {Object.values(illustrationAssets).map((a) => (
      <Composition
        key={a.id}
        id={`Asset-${a.id}`}
        component={AssetInspector}
        defaultProps={{ assetId: a.id, style: 'education', bounds: true }}
        durationInFrames={(a.layers.length + 1) * 60}
        fps={60}
        width={700}
        height={700}
      />
    ))}
    {scenes.map((shot) => {
      const Preview: React.FC = () => <SceneView {...shot} />;
      return (
        <Composition
          key={shot.id}
          id={`Shot-${shot.id.replace(/[^a-zA-Z0-9-]/g, '-')}`}
          component={Preview}
          durationInFrames={shot.duration}
          fps={video.fps}
          width={video.width}
          height={video.height}
        />
      );
    })}
  </>
);
