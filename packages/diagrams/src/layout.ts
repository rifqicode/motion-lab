import type { Node, Edge, Scene } from '@studio/schema';

export interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface EdgeLayout {
  id: string;
  from: string;
  to: string;
  path: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  labelPoint: { x: number; y: number };
  pathLength?: number;
}

export interface SceneLayout {
  viewport: { width: number; height: number };
  safeArea: { minX: number; maxX: number; minY: number; maxY: number };
  nodes: Record<string, NodeBounds>;
  edges: Record<string, EdgeLayout>;
}

export const VIEWPORT_WIDTH = 1080;
export const VIEWPORT_HEIGHT = 1920;
export const SAFE_MARGIN_H = 80;
export const SAFE_MARGIN_TOP = 220; // safe from top header/title
export const SAFE_MARGIN_BOTTOM = 300; // safe for subtitles

export function computeLayout(
  scene: Pick<Scene, 'type' | 'nodes' | 'edges'>,
  viewportWidth = VIEWPORT_WIDTH,
  viewportHeight = VIEWPORT_HEIGHT
): SceneLayout {
  const minX = SAFE_MARGIN_H;
  const maxX = viewportWidth - SAFE_MARGIN_H;
  const minY = SAFE_MARGIN_TOP;
  const maxY = viewportHeight - SAFE_MARGIN_BOTTOM;

  const nodeBounds: Record<string, NodeBounds> = {};
  const nodes = scene.nodes;

  if (scene.type === 'comparison') {
    layoutComparison(nodes, minX, maxX, minY, maxY, nodeBounds);
  } else if (scene.type === 'focus-explain') {
    layoutFocusExplain(nodes, minX, maxX, minY, maxY, nodeBounds);
  } else {
    // Default: data-flow
    layoutDataFlow(nodes, minX, maxX, minY, maxY, nodeBounds);
  }

  // Handle explicit position overrides if present
  for (const node of nodes) {
    if (node.position) {
      const w = nodeBounds[node.id]?.width || 280;
      const h = nodeBounds[node.id]?.height || 140;
      const clampedX = Math.max(minX, Math.min(maxX - w, node.position.x));
      const clampedY = Math.max(minY, Math.min(maxY - h, node.position.y));
      nodeBounds[node.id] = {
        id: node.id,
        x: clampedX,
        y: clampedY,
        width: w,
        height: h,
        centerX: clampedX + w / 2,
        centerY: clampedY + h / 2,
      };
    }
  }

  // Compute Edge paths
  const edgeLayouts: Record<string, EdgeLayout> = {};
  for (const edge of scene.edges) {
    const fromNode = nodeBounds[edge.from];
    const toNode = nodeBounds[edge.to];
    if (fromNode && toNode) {
      edgeLayouts[edge.id] = computeEdgeLayout(edge, fromNode, toNode);
    }
  }

  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    safeArea: { minX, maxX, minY, maxY },
    nodes: nodeBounds,
    edges: edgeLayouts,
  };
}

function layoutDataFlow(
  nodes: Node[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  out: Record<string, NodeBounds>
) {
  const count = nodes.length;
  if (count === 0) return;

  const standardWidth = 320;
  const standardHeight = 150;
  const centerX = (minX + maxX) / 2;

  if (count <= 3) {
    // Vertical linear pipeline
    const totalAvailHeight = maxY - minY;
    const step = totalAvailHeight / (count + 1);

    nodes.forEach((node, idx) => {
      const centerY = minY + step * (idx + 1);
      const x = centerX - standardWidth / 2;
      const y = centerY - standardHeight / 2;
      out[node.id] = {
        id: node.id,
        x,
        y,
        width: standardWidth,
        height: standardHeight,
        centerX,
        centerY,
      };
    });
  } else {
    // Zig-zag / 2-column staggered pipeline
    const rows = Math.ceil(count / 2);
    const rowStep = (maxY - minY) / (rows + 0.5);
    const colLeft = minX + 60;
    const colRight = maxX - standardWidth - 60;

    nodes.forEach((node, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const x = col === 0 ? colLeft : colRight;
      const y = minY + (row + 0.5) * rowStep;

      out[node.id] = {
        id: node.id,
        x,
        y,
        width: standardWidth,
        height: standardHeight,
        centerX: x + standardWidth / 2,
        centerY: y + standardHeight / 2,
      };
    });
  }
}

function layoutComparison(
  nodes: Node[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  out: Record<string, NodeBounds>
) {
  const count = nodes.length;
  const standardWidth = 340;
  const standardHeight = 150;

  if (count === 2) {
    // Top vs Bottom comparison
    const centerX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const y1 = midY - 320;
    const y2 = midY + 120;

    out[nodes[0].id] = {
      id: nodes[0].id,
      x: centerX - standardWidth / 2,
      y: y1,
      width: standardWidth,
      height: standardHeight,
      centerX,
      centerY: y1 + standardHeight / 2,
    };

    out[nodes[1].id] = {
      id: nodes[1].id,
      x: centerX - standardWidth / 2,
      y: y2,
      width: standardWidth,
      height: standardHeight,
      centerX,
      centerY: y2 + standardHeight / 2,
    };
  } else {
    // 2-Group split (half top, half bottom)
    const mid = Math.ceil(count / 2);
    const topNodes = nodes.slice(0, mid);
    const bottomNodes = nodes.slice(mid);
    const midY = (minY + maxY) / 2;

    topNodes.forEach((node, idx) => {
      const step = (maxX - minX) / (topNodes.length + 1);
      const cx = minX + step * (idx + 1);
      const cy = minY + (midY - minY) / 2;
      out[node.id] = {
        id: node.id,
        x: cx - standardWidth / 2,
        y: cy - standardHeight / 2,
        width: standardWidth,
        height: standardHeight,
        centerX: cx,
        centerY: cy,
      };
    });

    bottomNodes.forEach((node, idx) => {
      const step = (maxX - minX) / (bottomNodes.length + 1);
      const cx = minX + step * (idx + 1);
      const cy = midY + (maxY - midY) / 2;
      out[node.id] = {
        id: node.id,
        x: cx - standardWidth / 2,
        y: cy - standardHeight / 2,
        width: standardWidth,
        height: standardHeight,
        centerX: cx,
        centerY: cy,
      };
    });
  }
}

function layoutFocusExplain(
  nodes: Node[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  out: Record<string, NodeBounds>
) {
  if (nodes.length === 0) return;

  const centerNode = nodes[0];
  const satellites = nodes.slice(1);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Hero node in center
  const heroWidth = 360;
  const heroHeight = 170;
  out[centerNode.id] = {
    id: centerNode.id,
    x: centerX - heroWidth / 2,
    y: centerY - heroHeight / 2,
    width: heroWidth,
    height: heroHeight,
    centerX,
    centerY,
  };

  // Satellite nodes in an orbit
  const satCount = satellites.length;
  if (satCount > 0) {
    const orbitRadiusX = 340;
    const orbitRadiusY = 400;
    const satWidth = 280;
    const satHeight = 130;

    satellites.forEach((node, idx) => {
      // distribute angle starting from -Math.PI / 2 (top)
      const angle = -Math.PI / 2 + (2 * Math.PI * idx) / satCount;
      const cx = centerX + orbitRadiusX * Math.cos(angle);
      const cy = centerY + orbitRadiusY * Math.sin(angle);

      out[node.id] = {
        id: node.id,
        x: cx - satWidth / 2,
        y: cy - satHeight / 2,
        width: satWidth,
        height: satHeight,
        centerX: cx,
        centerY: cy,
      };
    });
  }
}

function computeEdgeLayout(
  edge: Edge,
  from: NodeBounds,
  to: NodeBounds
): EdgeLayout {
  // Determine anchor attachment sides based on relative position
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;

  let fromPt: { x: number; y: number };
  let toPt: { x: number; y: number };

  if (Math.abs(dy) > Math.abs(dx)) {
    // Predominantly vertical flow
    if (dy > 0) {
      fromPt = { x: from.centerX, y: from.y + from.height };
      toPt = { x: to.centerX, y: to.y };
    } else {
      fromPt = { x: from.centerX, y: from.y };
      toPt = { x: to.centerX, y: to.y + to.height };
    }
  } else {
    // Predominantly horizontal flow
    if (dx > 0) {
      fromPt = { x: from.x + from.width, y: from.centerY };
      toPt = { x: to.x, y: to.centerY };
    } else {
      fromPt = { x: from.x, y: from.centerY };
      toPt = { x: to.x + to.width, y: to.centerY };
    }
  }

  // Smooth cubic bezier path
  const midX = (fromPt.x + toPt.x) / 2;
  const midY = (fromPt.y + toPt.y) / 2;

  let cp1: { x: number; y: number };
  let cp2: { x: number; y: number };

  if (Math.abs(dy) > Math.abs(dx)) {
    // Vertical control points
    const delta = Math.abs(toPt.y - fromPt.y) * 0.45;
    cp1 = { x: fromPt.x, y: fromPt.y + (dy > 0 ? delta : -delta) };
    cp2 = { x: toPt.x, y: toPt.y - (dy > 0 ? delta : -delta) };
  } else {
    // Horizontal control points
    const delta = Math.abs(toPt.x - fromPt.x) * 0.45;
    cp1 = { x: fromPt.x + (dx > 0 ? delta : -delta), y: fromPt.y };
    cp2 = { x: toPt.x - (dx > 0 ? delta : -delta), y: toPt.y };
  }

  const path = `M ${fromPt.x.toFixed(1)} ${fromPt.y.toFixed(1)} C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${toPt.x.toFixed(1)} ${toPt.y.toFixed(1)}`;

  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    path,
    fromPoint: fromPt,
    toPoint: toPt,
    labelPoint: { x: midX, y: midY },
  };
}
