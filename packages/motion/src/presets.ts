import type { AnimationCue, Scene } from '@studio/schema';
import type { SceneLayout, EdgeLayout } from '@studio/diagrams';
import { applyEasing, clamp, interpolate } from './easing.js';

export interface NodeMotionState {
  opacity: number;
  scale: number;
  pulseGlow: number;
}

export interface EdgeMotionState {
  drawProgress: number;
  particlePosition: { x: number; y: number } | null;
  isActive: boolean;
}

export interface CameraMotionState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface FrameMotionState {
  frame: number;
  nodes: Record<string, NodeMotionState>;
  edges: Record<string, EdgeMotionState>;
  camera: CameraMotionState;
  captionEmphasis: Record<string, { scale: number; highlightProgress: number }>;
}

export function evaluateNodeReveal(
  frame: number,
  cue: AnimationCue
): { opacity: number; scale: number } {
  const { startFrame, durationFrames, easing } = cue;
  if (frame < startFrame) {
    return { opacity: 0, scale: 0.7 };
  }
  if (frame >= startFrame + durationFrames) {
    return { opacity: 1, scale: 1 };
  }
  const t = (frame - startFrame) / durationFrames;
  const easeProgress = applyEasing(t, easing || 'spring');
  return {
    opacity: clamp(interpolate(t, [0, 0.4], [0, 1]), 0, 1),
    scale: 0.7 + 0.3 * easeProgress,
  };
}

export function evaluateConnectorDraw(
  frame: number,
  cue: AnimationCue
): { drawProgress: number } {
  const { startFrame, durationFrames, easing } = cue;
  if (frame < startFrame) {
    return { drawProgress: 0 };
  }
  if (frame >= startFrame + durationFrames) {
    return { drawProgress: 1 };
  }
  const t = (frame - startFrame) / durationFrames;
  const eased = applyEasing(t, easing || 'ease-in-out');
  return { drawProgress: clamp(eased, 0, 1) };
}

// Parses cubic bezier 'M x0 y0 C x1 y1, x2 y2, x3 y3'
export function computeCubicBezierPoint(
  t: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const x = uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3;
  const y = uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * x2 + ttt * y3;
  return { x, y };
}

export function evaluateEventTravel(
  frame: number,
  cue: AnimationCue,
  edgeLayout?: EdgeLayout
): { particlePosition: { x: number; y: number } | null; isActive: boolean } {
  const { startFrame, durationFrames } = cue;
  if (frame < startFrame || frame > startFrame + durationFrames || !edgeLayout) {
    return { particlePosition: null, isActive: false };
  }

  const t = (frame - startFrame) / durationFrames;
  // Match path pattern: M x0 y0 C x1 y1, x2 y2, x3 y3
  const regex = /M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/;
  const match = edgeLayout.path.match(regex);

  if (match) {
    const [, x0, y0, x1, y1, x2, y2, x3, y3] = match.map(Number);
    const point = computeCubicBezierPoint(t, x0, y0, x1, y1, x2, y2, x3, y3);
    return { particlePosition: point, isActive: true };
  }

  // Fallback linear interpolation between from and to points
  const x = edgeLayout.fromPoint.x + (edgeLayout.toPoint.x - edgeLayout.fromPoint.x) * t;
  const y = edgeLayout.fromPoint.y + (edgeLayout.toPoint.y - edgeLayout.fromPoint.y) * t;
  return { particlePosition: { x, y }, isActive: true };
}

export function evaluateNodePulse(
  frame: number,
  cue: AnimationCue
): { scale: number; pulseGlow: number } {
  const { startFrame, durationFrames } = cue;
  if (frame < startFrame || frame > startFrame + durationFrames) {
    return { scale: 1, pulseGlow: 0 };
  }
  const t = (frame - startFrame) / durationFrames;
  const wave = Math.sin(t * Math.PI);
  return {
    scale: 1 + 0.08 * wave,
    pulseGlow: wave,
  };
}

export function evaluateFocusCamera(
  frame: number,
  cue: AnimationCue,
  layout: SceneLayout
): CameraMotionState {
  const { startFrame, durationFrames, targetId, params } = cue;
  const targetZoom = params?.zoom ?? 1.25;

  if (frame < startFrame) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  const targetNode = layout.nodes[targetId];
  const targetX = targetNode ? (layout.viewport.width / 2 - targetNode.centerX) : 0;
  const targetY = targetNode ? (layout.viewport.height / 2 - targetNode.centerY) : 0;

  if (frame >= startFrame + durationFrames) {
    return { scale: targetZoom, translateX: targetX, translateY: targetY };
  }

  const t = (frame - startFrame) / durationFrames;
  const eased = applyEasing(t, cue.easing || 'ease-in-out');

  return {
    scale: 1 + (targetZoom - 1) * eased,
    translateX: targetX * eased,
    translateY: targetY * eased,
  };
}

export function evaluateCaptionEmphasis(
  frame: number,
  cue: AnimationCue
): { scale: number; highlightProgress: number } {
  const { startFrame, durationFrames } = cue;
  if (frame < startFrame) {
    return { scale: 1, highlightProgress: 0 };
  }
  if (frame >= startFrame + durationFrames) {
    return { scale: 1, highlightProgress: 1 };
  }
  const t = (frame - startFrame) / durationFrames;
  const wave = Math.sin(t * Math.PI);
  return {
    scale: 1 + 0.1 * wave,
    highlightProgress: clamp(t * 1.5, 0, 1),
  };
}

export function resolveMotionState(
  frame: number,
  fps: number,
  scene: Scene,
  layout: SceneLayout
): FrameMotionState {
  const nodeStates: Record<string, NodeMotionState> = {};
  const edgeStates: Record<string, EdgeMotionState> = {};
  let cameraState: CameraMotionState = { scale: 1, translateX: 0, translateY: 0 };
  const captionEmphasis: Record<string, { scale: number; highlightProgress: number }> = {};

  // Check if nodes have reveal cues
  const nodesWithReveal = new Set(
    scene.animationCues.filter((c) => c.preset === 'node-reveal').map((c) => c.targetId)
  );

  // Initialize node states
  for (const node of scene.nodes) {
    nodeStates[node.id] = {
      opacity: nodesWithReveal.has(node.id) ? 0 : 1,
      scale: nodesWithReveal.has(node.id) ? 0.7 : 1,
      pulseGlow: 0,
    };
  }

  // Check if edges have connector-draw cues
  const edgesWithDraw = new Set(
    scene.animationCues.filter((c) => c.preset === 'connector-draw').map((c) => c.targetId)
  );

  // Initialize edge states
  for (const edge of scene.edges) {
    edgeStates[edge.id] = {
      drawProgress: edgesWithDraw.has(edge.id) ? 0 : 1,
      particlePosition: null,
      isActive: false,
    };
  }

  // Evaluate animation cues
  for (const cue of scene.animationCues) {
    switch (cue.preset) {
      case 'node-reveal': {
        if (nodeStates[cue.targetId]) {
          const res = evaluateNodeReveal(frame, cue);
          nodeStates[cue.targetId].opacity = res.opacity;
          nodeStates[cue.targetId].scale = res.scale;
        }
        break;
      }
      case 'connector-draw': {
        if (edgeStates[cue.targetId]) {
          const res = evaluateConnectorDraw(frame, cue);
          edgeStates[cue.targetId].drawProgress = res.drawProgress;
        }
        break;
      }
      case 'event-travel': {
        const edgeLayout = layout.edges[cue.targetId];
        if (edgeStates[cue.targetId]) {
          const res = evaluateEventTravel(frame, cue, edgeLayout);
          if (res.particlePosition) {
            edgeStates[cue.targetId].particlePosition = res.particlePosition;
            edgeStates[cue.targetId].isActive = res.isActive;
          }
        }
        break;
      }
      case 'node-pulse': {
        if (nodeStates[cue.targetId]) {
          const res = evaluateNodePulse(frame, cue);
          if (res.pulseGlow > 0) {
            nodeStates[cue.targetId].pulseGlow = res.pulseGlow;
            nodeStates[cue.targetId].scale = res.scale;
          }
        }
        break;
      }
      case 'focus-camera': {
        cameraState = evaluateFocusCamera(frame, cue, layout);
        break;
      }
      case 'caption-emphasis': {
        captionEmphasis[cue.targetId] = evaluateCaptionEmphasis(frame, cue);
        break;
      }
    }
  }

  return {
    frame,
    nodes: nodeStates,
    edges: edgeStates,
    camera: cameraState,
    captionEmphasis,
  };
}
