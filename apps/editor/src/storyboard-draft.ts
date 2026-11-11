import type {Storyboard} from '@studio/studio-core/storyboard';

export interface StoryboardDraftBase {projectId: string; saved: string; hash: string | null}

export function syncStoryboardDraft(current: Storyboard | null, previous: StoryboardDraftBase,
  projectId: string, saved: string, hash: string | null): {draft: Storyboard | null; base: StoryboardDraftBase} {
  const currentText = JSON.stringify(current);
  if (previous.projectId === projectId && currentText !== previous.saved && currentText !== saved) return {draft: current, base: previous};
  return {draft: currentText === saved ? current : JSON.parse(saved) as Storyboard | null, base: {projectId, saved, hash}};
}
