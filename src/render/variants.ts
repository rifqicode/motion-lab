import { FORMATS } from './config';
export const filmVariants = Object.entries(FORMATS).map(([name, size]) => ({
  id: `MotionLab-${name}`,
  name,
  ...size,
}));
