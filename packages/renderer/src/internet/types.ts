export interface InternetScene {
  id: string;
  chapter: string;
  title: string[];
  summary: string;
  narration: string;
  direction: string;
  source_ids: string[];
  durationFrames: number;
  audioSeconds: number;
  audioFile: string;
  captions: Array<{start: number; end: number; text: string}>;
}

export interface InternetProject {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  scenes: InternetScene[];
}
