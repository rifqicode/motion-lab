// Compiles the selected storyboard once into validated shots and video metadata.
import { storyboard } from './storyboard/example';
import { compileStoryboard } from './storyboard/compile';
export const { board, scenes, video } = compileStoryboard(storyboard);
