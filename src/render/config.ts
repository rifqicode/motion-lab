import { z } from 'zod';
// Default delivery format for mobile short-form content.
export const MOBILE_VIDEO = { width: 1080, height: 1920, fps: 60 } as const;
// Internal composition guides, not official platform UI specifications.
export const MOBILE_SAFE_AREA = { top: 150, right: 160, bottom: 320, left: 80 } as const;
export const videoSettingsSchema = z
  .object({
    width: z.number().int().min(240).max(7680).default(MOBILE_VIDEO.width),
    height: z.number().int().min(240).max(7680).default(MOBILE_VIDEO.height),
    fps: z.number().int().min(1).max(120).default(MOBILE_VIDEO.fps),
    durationSeconds: z.number().finite().positive().optional(),
  })
  .strict();
export const VIDEO = {
  ...MOBILE_VIDEO,
  durationSeconds: 15,
  durationInFrames: 900,
};
export const FORMATS = {
  portrait: { width: MOBILE_VIDEO.width, height: MOBILE_VIDEO.height },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
} as const;
