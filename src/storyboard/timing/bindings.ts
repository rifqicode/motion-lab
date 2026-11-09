import type { Illustration, IllustrationNode, Track, ColorTrack } from '../../illustration/schema';
import { resolveCues, type CueDefinitions, type ResolvedCues } from './cues';

export type CueBinding = { path: string; cue: string; property?: string; subtree?: boolean };

function collectNodePaths(nodes: IllustrationNode[], parentPath = '', paths = new Set<string>()) {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath}/${node.id}` : node.id;
    paths.add(path);
    collectNodePaths(node.children, path, paths);
  }
  return paths;
}

function selectBinding(bindings: CueBinding[], nodePath: string, property?: string) {
  // The last matching binding wins, so a child/property can override a subtree rule.
  return [...bindings].reverse().find((binding) => {
    const matchesPath =
      binding.path === nodePath || (binding.subtree && nodePath.startsWith(`${binding.path}/`));
    return matchesPath && (!binding.property || binding.property === property);
  });
}

function cueReference(time: number, cueId: string, cues: ResolvedCues) {
  return { cue: cueId, edge: 'start', offset: time - cues[cueId].start };
}

function bindTracks(
  tracks: (Track | ColorTrack)[],
  nodePath: string,
  bindings: CueBinding[],
  cues: ResolvedCues,
) {
  return tracks.map((track) => {
    const binding = selectBinding(bindings, nodePath, track.property);
    if (!binding) return track;
    return {
      ...track,
      keys: track.keys.map((key) => ({ ...key, time: cueReference(key.time, binding.cue, cues) })),
    };
  });
}

function bindNode(
  node: IllustrationNode,
  nodePath: string,
  bindings: CueBinding[],
  cues: ResolvedCues,
): unknown {
  const binding = selectBinding(bindings, nodePath);
  return {
    ...node,
    tracks: bindTracks(node.tracks, nodePath, bindings, cues),
    colorTracks: bindTracks(node.colorTracks, nodePath, bindings, cues),
    layerTracks: Object.fromEntries(
      Object.entries(node.layerTracks).map(([layerId, tracks]) => [
        layerId,
        bindTracks(tracks, nodePath, bindings, cues),
      ]),
    ),
    follow:
      node.follow && binding
        ? { ...node.follow, start: cueReference(node.follow.start, binding.cue, cues) }
        : node.follow,
    morph:
      node.morph && binding
        ? { ...node.morph, start: cueReference(node.morph.start, binding.cue, cues) }
        : node.morph,
    children: node.children.map((child) =>
      bindNode(child, `${nodePath}/${child.id}`, bindings, cues),
    ),
  };
}

/** Keep cue references live until compileStoryboard; do not pre-parse this result. */
export function referenceIllustration(
  illustration: Illustration,
  definitions: CueDefinitions,
  bindings: CueBinding[],
): unknown {
  const cues = resolveCues(definitions);
  const paths = collectNodePaths(illustration.nodes);
  for (const binding of bindings) {
    if (!paths.has(binding.path)) throw new Error(`Unknown cue binding path: ${binding.path}`);
    if (!Object.hasOwn(cues, binding.cue)) throw new Error(`Unknown cue binding: ${binding.cue}`);
  }
  return {
    ...illustration,
    nodes: illustration.nodes.map((node) => bindNode(node, node.id, bindings, cues)),
  };
}
