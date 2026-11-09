import React from 'react';
import { float, reveal } from '../motion/presets';
export const Router: React.FC<{ t: number }> = ({ t }) => {
  const appear = reveal(t, 0.35, 0.85);
  return (
    <group
      scale={0.001 + appear * 0.999}
      position={[0, float(t, 1.6, 0.06), 0]}
      rotation={[0.08, -0.32 + float(t, 0.5, 0.06), 0]}
    >
      <mesh>
        <boxGeometry args={[2.65, 0.42, 1.18]} />
        <meshStandardMaterial color="#192b46" metalness={0.62} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.22, 0.15]}>
        <boxGeometry args={[2.45, 0.06, 0.9]} />
        <meshStandardMaterial color="#344c66" metalness={0.4} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.95, -0.38]} rotation={[0.14, 0, x * 0.12]}>
          <cylinderGeometry args={[0.045, 0.065, 1.65, 10]} />
          <meshStandardMaterial color="#0b1828" metalness={0.45} />
        </mesh>
      ))}
      {[-0.75, -0.42, -0.09, 0.24].map((x, i) => (
        <mesh key={i} position={[x, -0.04, 0.597]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color={i === 0 ? '#8affd7' : '#3c9bd2'} />
        </mesh>
      ))}
    </group>
  );
};
