import type { Palette } from '../style';
export type RenderContext = {
  time: number;
  fps: number;
  palette: Palette;
  prefix: string;
  camera: { x: number; y: number; zoom: number };
};
