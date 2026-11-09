/** Choose frames only. This module does not start Chrome, render, or write files. */
export function planPreview(compositions, scenes, options) {
  const tasks = new Map();
  const add = (id, frames) => {
    const composition = compositions.find((item) => item.id === id);
    if (!composition) throw new Error(`Missing composition: ${id}`);
    const selected = tasks.get(id) ?? new Set();
    for (const frame of frames)
      selected.add(Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(frame))));
    tasks.set(id, selected);
  };
  if (!options.assetsOnly) {
    const film = compositions.find((item) => item.id === 'MotionLab');
    for (const shot of scenes) {
      const frames = [
        0,
        shot.duration * 0.25,
        shot.duration * 0.5,
        shot.duration * 0.75,
        shot.duration - 1,
      ];
      for (const cue of Object.values(shot.cues))
        frames.push(
          cue.start * film.fps,
          (cue.start + cue.end) * 0.5 * film.fps,
          cue.end * film.fps,
        );
      add(`Shot-${shot.id.replace(/[^a-zA-Z0-9-]/g, '-')}`, frames);
      add('MotionLab', [
        shot.from - 1,
        shot.from,
        shot.from + Math.floor(shot.duration * 0.5),
        shot.from + shot.duration - 1,
      ]);
    }
    if (options.variants)
      for (const composition of compositions.filter((item) => item.id.startsWith('MotionLab-')))
        add(
          composition.id,
          scenes.map((shot) => shot.from + Math.floor(shot.duration * 0.6)),
        );
  }
  for (const composition of compositions.filter((item) => item.id.startsWith('Gallery-')))
    add(composition.id, [0, composition.fps]);
  if (options.assetsOnly)
    for (const composition of compositions.filter((item) => item.id.startsWith('Asset-')))
      add(composition.id, [0, composition.fps]);
  if (options.only) {
    if (!tasks.has(options.only))
      throw new Error(`Requested composition not selected: ${options.only}`);
    for (const id of tasks.keys()) if (id !== options.only) tasks.delete(id);
  }
  return tasks;
}
