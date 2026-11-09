import {storyboard} from './storyboard/example';
import {compileStoryboard} from './storyboard/compile';
export const {board,scenes,durationInFrames}=compileStoryboard(storyboard);
