import React from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Router } from '../assets/Router';
import { reveal } from '../motion/presets';
import { shotCamera, type ShotProps } from '../director/shot';
export const Network: React.FC<ShotProps> = ({ headline, subline, direction }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const progress = reveal(t, 1.25, 2.4);
  return (
    <>
      <ThreeCanvas
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: shotCamera(t, direction, 7.5), fov: 40 }}
      >
        <ambientLight intensity={1.8} />
        <directionalLight position={[4, 5, 7]} intensity={3} color="#c4fff8" />
        <pointLight position={[-3, 1, 4]} intensity={45} color="#4b9fff" />
        <Router t={t} />
      </ThreeCanvas>
      <svg
        width="1080"
        height="1920"
        viewBox="0 0 1080 1920"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id="packet" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#4a90ff" />
            <stop offset="1" stopColor="#81fff0" />
          </linearGradient>
        </defs>
        <text x="90" y="350" fill="#76e8de" fontSize="30" letterSpacing="7" fontWeight="700">
          02 / THE CONNECTION
        </text>
        {headline.split('\n').map((line, i) => (
          <text key={i} x="90" y={460 + i * 100} fill="#fff" fontSize="84" fontWeight="800">
            {line}
          </text>
        ))}
        <path d="M150 1240 Q540 1470 930 1240" fill="none" stroke="#285474" strokeWidth="11" />
        <path
          d="M150 1240 Q540 1470 930 1240"
          fill="none"
          stroke="url(#packet)"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
        <circle
          cx={150 + 780 * progress}
          cy={1240 + 230 * 4 * progress * (1 - progress)}
          r="16"
          fill="#d7fffa"
          opacity={reveal(t, 1.25, 0.3)}
        />
        <text x="540" y="1530" textAnchor="middle" fill="#a5d3df" fontSize="32">
          {subline}
        </text>
      </svg>
    </>
  );
};
