export const validateVideoMetadata = (stream, expected) => {
  if (!stream) throw new Error('No video stream');
  const [numerator, denominator = 1] = String(stream.avg_frame_rate).split('/').map(Number);
  const fps = numerator / denominator,
    duration = Number(stream.duration),
    frames = Number(stream.nb_frames);
  if (
    !Number.isFinite(fps) ||
    !Number.isFinite(duration) ||
    !Number.isFinite(frames) ||
    stream.width !== expected.width ||
    stream.height !== expected.height ||
    Math.abs(fps - expected.fps) > 0.01 ||
    Math.abs(duration - expected.durationInFrames / expected.fps) > 0.1 ||
    frames !== expected.durationInFrames ||
    stream.codec_name !== 'h264'
  )
    throw new Error(`Unexpected output: ${JSON.stringify(stream)}`);
  return stream;
};
