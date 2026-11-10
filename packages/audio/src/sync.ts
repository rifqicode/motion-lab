import type { Scene, AnimationCue } from '@studio/schema';

/**
 * Calculates scene duration in frames based on probed audio duration in ms.
 * Includes a 1-second (1000ms) safety padding for natural speech decay and transitions.
 */
export function calculateSceneDurationFrames(
  audioDurationMs: number,
  fps = 30
): number {
  return Math.ceil(((audioDurationMs + 1000) / 1000) * fps);
}

/**
 * Syncs scene durationFrames with the audio duration and adjusts animation cues
 * so no cue ends after the scene duration.
 */
export function syncSceneDuration(
  scene: Scene,
  audioDurationMs: number,
  fps = 30
): Scene {
  const newDurationFrames = calculateSceneDurationFrames(audioDurationMs, fps);

  const adjustedCues: AnimationCue[] = scene.animationCues.map((cue) => {
    let startFrame = cue.startFrame;
    let durationFrames = cue.durationFrames;

    // If cue starts at or after scene end, pull it back
    if (startFrame >= newDurationFrames) {
      startFrame = Math.max(0, newDurationFrames - Math.min(24, Math.floor(newDurationFrames / 2)));
    }

    // If cue ends after scene end, clamp duration
    if (startFrame + durationFrames > newDurationFrames) {
      durationFrames = Math.max(1, newDurationFrames - startFrame);
    }

    return {
      ...cue,
      startFrame,
      durationFrames,
    };
  });

  return {
    ...scene,
    durationFrames: newDurationFrames,
    animationCues: adjustedCues,
  };
}
