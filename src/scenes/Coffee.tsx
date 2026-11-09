import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { ShotProps } from '../director/shot';

const ramp = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const Bean: React.FC<{ x: number; y: number; s?: number; r?: number }> = ({
  x,
  y,
  s = 1,
  r = 0,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <ellipse rx="93" ry="132" fill="url(#bean)" stroke="#9d623d" strokeWidth="3" />
    <path d="M 17 -118 C -65 -58 62 12 -12 119" fill="none" stroke="#24130c" strokeWidth="18" />
    <path d="M 26 -112 C -46 -50 77 20 1 115" fill="none" stroke="#b77b4c" strokeWidth="4" />
    {Array.from({ length: 18 }, (_, i) => (
      <path
        key={i}
        d={`M ${-65 + (i % 3) * 49} ${-83 + Math.floor(i / 3) * 31} l 13 7`}
        stroke="#dfaa71"
        opacity=".14"
        strokeWidth="2"
      />
    ))}
  </g>
);
const Grounds: React.FC<{ top?: number; opacity?: number }> = ({ top = 0, opacity = 1 }) => (
  <g opacity={opacity}>
    {Array.from({ length: 110 }, (_, i) => (
      <circle
        key={i}
        cx={315 + ((i * 67) % 450)}
        cy={top + ((i * 43) % 91)}
        r={3 + (i % 5)}
        fill={['#ae7947', '#694025', '#d29d62'][i % 3]}
      />
    ))}
  </g>
);
export const CoffeeScene: React.FC<ShotProps & { stage: 'bean' | 'extraction' | 'espresso' }> = ({
  headline,
  subline,
  stage,
}) => {
  const f = useCurrentFrame();
  const intro = 0.2 + 0.8 * ramp(f, 0, 34);
  const action = ramp(f, 65, 150);
  const exit = ramp(f, 278, 300);
  const zoom = 1 + 0.055 * ramp(f, 20, 190) - 0.025 * exit;
  const index = stage === 'bean' ? 0 : stage === 'extraction' ? 1 : 2;
  return (
    <AbsoluteFill
      style={{ background: '#17130f', fontFamily: 'Arial, sans-serif', color: '#f4e6ce' }}
    >
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at 50% 54%,#513322 0%,#251b14 44%,#17130f 75%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 98,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 23,
          letterSpacing: 5,
          color: '#d4ad7c',
        }}
      >
        <span>CATATAN KOPI</span>
        <span>0{index + 1} / 03</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 226,
          opacity: 0.65 + 0.35 * ramp(f, 0, 34),
          transform: `translateY(${(1 - intro) * 24}px)`,
        }}
      >
        <div style={{ fontSize: 23, letterSpacing: 6, color: '#c69662', marginBottom: 30 }}>
          {['GILING', 'EKSTRAKSI', 'SAJIKAN'][index]}
        </div>
        <div
          style={{
            fontSize: 94,
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: -4,
            whiteSpace: 'pre-line',
          }}
        >
          {headline}
        </div>
      </div>
      <svg
        viewBox="0 0 1080 1920"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <defs>
          <radialGradient id="bean" cx="32%" cy="24%">
            <stop stopColor="#c08b58" />
            <stop offset=".36" stopColor="#805030" />
            <stop offset=".85" stopColor="#492918" />
            <stop offset="1" stopColor="#2a170f" />
          </radialGradient>
          <linearGradient id="steel">
            <stop stopColor="#54483c" />
            <stop offset=".2" stopColor="#c2b5a0" />
            <stop offset=".4" stopColor="#eee2c9" />
            <stop offset=".56" stopColor="#92816a" />
            <stop offset="1" stopColor="#3c352d" />
          </linearGradient>
          <linearGradient id="liquid" x2="0" y2="1">
            <stop stopColor="#c88b3e" />
            <stop offset=".15" stopColor="#88451c" />
            <stop offset="1" stopColor="#321a10" />
          </linearGradient>
          <radialGradient id="crema">
            <stop stopColor="#f2cb80" />
            <stop offset=".65" stopColor="#ca903e" />
            <stop offset="1" stopColor="#8b4c21" />
          </radialGradient>
          <filter id="shadow" x="-100%" y="-200%" width="300%" height="500%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
        </defs>
        <ellipse
          cx="540"
          cy="1345"
          rx="300"
          ry="32"
          fill="#000"
          opacity=".4"
          filter="url(#shadow)"
        />
        <g opacity={intro} transform={`translate(540 1030) scale(${zoom}) translate(-540 -1030)`}>
          {stage === 'bean' && (
            <>
              <g transform={`translate(0 ${-32 * action})`}>
                <Bean x={530} y={895} s={1.57} r={-26 + 8 * action} />
                <Bean x={293} y={1059} s={0.66} r={33} />
                <Bean x={775} y={1010} s={0.8} r={-48} />
              </g>
              <g opacity={action} transform={`translate(0 ${22 * (1 - action)})`}>
                <path
                  d="M540 1135 V1205 m-10 -12 10 12 10 -12"
                  stroke="#d3a673"
                  fill="none"
                  strokeWidth="3"
                />
                <Grounds top={1240} />
              </g>
              <g opacity={ramp(f, 150, 175)}>
                <path d="M755 1250 H875 V1360" stroke="#a57c51" fill="none" />
                <text x="875" y="1400" textAnchor="end" fill="#dfc49e" fontSize="27">
                  Bubuk halus
                </text>
              </g>
            </>
          )}
          {stage === 'extraction' && (
            <>
              <path d="M290 760 H790 V836 Q540 877 290 836 Z" fill="url(#steel)" />
              <text
                x="540"
                y="730"
                textAnchor="middle"
                fill="#e7bd7c"
                fontSize="31"
                letterSpacing="3"
              >
                AIR PANAS + TEKANAN
              </text>
              {[390, 465, 540, 615, 690].map((x, i) => (
                <g key={x} opacity={ramp(f, 35 + i * 4, 65 + i * 4)}>
                  <path
                    d={`M${x} 868 V${880 + Math.round(100 * action)}`}
                    stroke="#d8c6a0"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <path
                    d={`M${x - 8} 948 l8 12 8 -12`}
                    fill="none"
                    stroke="#d8c6a0"
                    strokeWidth="3"
                  />
                </g>
              ))}
              <path
                d="M285 970 L335 1135 Q540 1200 745 1135 L795 970"
                fill="#39271a"
                stroke="url(#steel)"
                strokeWidth="16"
              />
              <Grounds top={982} />
              <path
                d="M320 1090 Q540 1130 760 1090"
                fill="none"
                stroke="#d0b893"
                strokeWidth="7"
                strokeDasharray="3 9"
              />
              <rect x="786" y="985" width="206" height="49" rx="22" fill="url(#steel)" />
              <path d="M540 1165 V1250" stroke="#b8a588" strokeWidth="42" />
              <path
                d={`M540 1244 Q535 1280 540 ${1245 + 95 * ramp(f, 100, 155)}`}
                stroke="#c18a43"
                strokeWidth="10"
                fill="none"
                opacity={ramp(f, 100, 115)}
              />
              <text x="540" y="1438" textAnchor="middle" fill="#d2ad7c" fontSize="27">
                Air melarutkan rasa &amp; aroma.
              </text>
            </>
          )}
          {stage === 'espresso' && (
            <>
              <ellipse cx="535" cy="1297" rx="331" ry="65" fill="url(#steel)" />
              <ellipse cx="535" cy="1284" rx="281" ry="38" fill="#8f7960" />
              <path
                d="M741 986 C949 917 940 1228 749 1182"
                fill="none"
                stroke="#d7c6aa"
                strokeWidth="38"
              />
              <path
                d="M287 977 L324 1210 Q535 1347 746 1210 L783 977 Z"
                fill="#b4a089"
                fillOpacity=".16"
                stroke="#ded1b7"
                strokeWidth="5"
              />
              <path
                d={`M307 ${1100 - 100 * action} L334 1196 Q535 1306 736 1196 L764 ${1100 - 100 * action} Z`}
                fill="url(#liquid)"
              />
              <ellipse cx="535" cy={1100 - 100 * action} rx={228} ry="64" fill="url(#crema)" />
              {Array.from({ length: 38 }, (_, i) => (
                <circle
                  key={i}
                  cx={360 + ((i * 47) % 350)}
                  cy={1090 - 100 * action + ((i * 17) % 61) - 24}
                  r={2 + (i % 5)}
                  fill={i % 2 ? '#f6d697' : '#a2662c'}
                  opacity=".6"
                />
              ))}
              <ellipse
                cx="535"
                cy="977"
                rx="248"
                ry="77"
                fill="none"
                stroke="#e5d4b5"
                strokeWidth="7"
              />
              <path
                d="M319 1015 L347 1180"
                stroke="#fff2d4"
                opacity=".3"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <g opacity={ramp(f, 140, 170)}>
                <path d="M770 942 L842 881 H918" stroke="#c29460" fill="none" strokeWidth="2" />
                <text x="918" y="853" textAnchor="end" fill="#e5c491" fontSize="29">
                  Crema
                </text>
              </g>
            </>
          )}
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 1558,
          opacity: ramp(f, 28, 55),
          fontSize: 34,
          lineHeight: 1.5,
          whiteSpace: 'pre-line',
          color: '#d7c4a8',
        }}
      >
        {subline}
      </div>
      <div
        style={{ position: 'absolute', left: 78, right: 78, bottom: 116, display: 'flex', gap: 15 }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ height: 3, flex: 1, background: i === index ? '#d8ac70' : '#514132' }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
export const BeanScene: React.FC<ShotProps> = (p) => <CoffeeScene {...p} stage="bean" />;
export const ExtractionScene: React.FC<ShotProps> = (p) => (
  <CoffeeScene {...p} stage="extraction" />
);
export const EspressoScene: React.FC<ShotProps> = (p) => <CoffeeScene {...p} stage="espresso" />;
