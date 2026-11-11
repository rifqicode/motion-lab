import {z} from 'zod';
import {SourceProposalSchema, StoryboardSchema, StudioError, validateSourcePath, type SourceProposal, type Storyboard, type ShotSpec} from '@studio/studio-core';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
const design = z.object({colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8), typography: z.string().min(1).max(8000), spacing: z.string().min(1).max(8000), motionStyle: z.string().min(1).max(8000)}).strict();
export const DirectorRevisionPlanSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  sharedInstructions: z.string().max(8000),
  designSystem: design.nullable(),
  updates: z.array(z.object({shotId: id, instructions: z.string().trim().min(1).max(8000), durationFrames: z.number().int().min(1).max(2700)}).strict()).max(12),
}).strict();
export type DirectorRevisionPlan = z.infer<typeof DirectorRevisionPlanSchema>;

export const DIRECTOR_REVISION_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'sharedInstructions', 'designSystem', 'updates'],
  properties: {
    summary: {type: 'string'}, sharedInstructions: {type: 'string'},
    designSystem: {anyOf: [{type: 'null'}, {type: 'object', additionalProperties: false, required: ['colors', 'typography', 'spacing', 'motionStyle'], properties: {colors: {type: 'array', items: {type: 'string'}}, typography: {type: 'string'}, spacing: {type: 'string'}, motionStyle: {type: 'string'}}}]},
    updates: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['shotId', 'instructions', 'durationFrames'], properties: {shotId: {type: 'string'}, instructions: {type: 'string'}, durationFrames: {type: 'integer'}}}},
  },
};

export function revisionStoryboard(base: Storyboard, input: unknown, selectedShotId?: string) {
  const plan = DirectorRevisionPlanSchema.parse(input);
  const ids = plan.updates.map(item => item.shotId);
  if (!ids.length && !plan.sharedInstructions.trim()) throw new StudioError('EMPTY_REVISION', 'Director belum mengusulkan perubahan.');
  if (new Set(ids).size !== ids.length || ids.some(id => !base.shots.some(shot => shot.id === id))) throw new StudioError('INVALID_SHOT', 'Rencana revisi memiliki shot duplikat atau tidak dikenal.');
  if (selectedShotId && (plan.sharedInstructions.trim() || ids.length !== 1 || ids[0] !== selectedShotId || plan.designSystem && JSON.stringify(plan.designSystem) !== JSON.stringify(base.designSystem)))
    throw new StudioError('SHOT_OWNERSHIP', 'Revisi shot hanya boleh mengubah shot yang dipilih.');
  if (plan.designSystem && JSON.stringify(plan.designSystem) !== JSON.stringify(base.designSystem) && !plan.sharedInstructions.trim()) throw new StudioError('SHARED_OWNERSHIP', 'Perubahan design system memerlukan patch shared yang eksplisit.');
  const board = StoryboardSchema.parse({...base, designSystem: plan.designSystem ?? base.designSystem, shots: base.shots.map(shot => {
    const update = plan.updates.find(item => item.shotId === shot.id);
    return update ? {...shot, durationFrames: update.durationFrames, motionInstructions: update.instructions} : shot;
  })});
  return {plan, board};
}

const PatchSchema = z.object({
  baseRevisionId: id, shotId: id, summary: z.string().trim().min(1).max(4000),
  edits: z.array(z.object({path: z.string().max(240), oldText: z.string().min(1).max(65_536), newText: z.string().max(65_536)}).strict()).max(20),
}).strict();

export const SHOT_PATCH_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['baseRevisionId', 'shotId', 'summary', 'edits'],
  properties: {baseRevisionId: {type: 'string'}, shotId: {type: 'string'}, summary: {type: 'string'}, edits: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['path', 'oldText', 'newText'], properties: {path: {type: 'string'}, oldText: {type: 'string'}, newText: {type: 'string'}}}}},
};

export const PATCH_INSTRUCTIONS = `This is an incremental revision of an existing video, not initial generation. Return only JSON edits matching the patch schema. Copy each oldText exactly from the supplied existing source; it must occur exactly once. Change only the requested details. Do not replace an entire file, add/delete files, rebuild the composition, or redesign unrelated content. Keep existing layout, assets, shared imports, typography, colors and narrative unless the creator explicitly requests that change. The existing source is authoritative; storyboard metadata supplies the requested timing and revision intent. A duration change must retime frame-based motion to the new duration, using durationInFrames where appropriate. If only the duration needs changing and existing duration-based code already adapts correctly, edits may be empty; the server accepts this only when that shot's duration actually changes. baseRevisionId must match the supplied accepted revision.`;

export function applyRevisionPatch(input: unknown, baseRevisionId: string, shotId: string, files: readonly {path: string; content: string}[], shots: ShotSpec[], shared = false, allowTimingOnly = false): SourceProposal {
  const patch = PatchSchema.parse(input);
  if (patch.baseRevisionId !== baseRevisionId || patch.shotId !== shotId) throw new StudioError('STALE_PROPOSAL', 'Patch tidak cocok dengan versi atau shot yang direvisi.');
  const originals = new Map(files.map(file => [file.path, file.content]));
  const changed = new Map<string, string>();
  for (const edit of patch.edits) {
    validateSourcePath(edit.path);
    const owns = shared ? edit.path.startsWith('src/shared/') : edit.path === `src/shots/${shotId}.tsx` || edit.path.startsWith(`src/shots/${shotId}/`);
    if (!owns) throw new StudioError('SHOT_OWNERSHIP', 'Patch mencoba mengubah file di luar scope revisi.');
    const original = originals.get(edit.path);
    if (original === undefined) throw new StudioError('INVALID_PATCH', 'Patch hanya boleh mengubah file yang sudah ada.');
    const current = changed.get(edit.path) ?? original;
    const first = current.indexOf(edit.oldText);
    if (first < 0 || first !== current.lastIndexOf(edit.oldText) || edit.oldText === current) throw new StudioError('INVALID_PATCH', 'Anchor patch harus unik dan tidak boleh mengganti seluruh file.');
    changed.set(edit.path, current.slice(0, first) + edit.newText + current.slice(first + edit.oldText.length));
  }
  const changedFiles = [...changed].filter(([path, content]) => content !== originals.get(path)).map(([path, content]) => ({path, content}));
  if (!changedFiles.length && !(allowTimingOnly && patch.edits.length === 0)) throw new StudioError('EMPTY_PROPOSAL', 'Patch tidak mengubah source video.');
  return SourceProposalSchema.parse({baseRevisionId, summary: patch.summary, shots, changedFiles, deletedFiles: []});
}
