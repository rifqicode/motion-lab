# Local studio editor

ST-04, canonical plan `.ai/plans/PLAN-20261110-web-studio-mvp.md` v1.0.

Design direction: a desktop creative workspace for reviewing generated portrait motion. ENERGY 1 / RHYTHM 2 / MOTION 1. Matte charcoal keeps attention on the video; warm amber identifies creation actions, the active shot, and frame anchors. System sans keeps compact editing controls readable without downloading fonts. Monospace is restricted to source and frame/time values. The repeated frame label ties comments to the timeline. The center preview receives most space; surrounding panels follow the actual brief/review workflow. The layout stacks at phone sizes and moves review below the two-column workspace on smaller laptops.

The application reads the per-session API token and preview origin from server-injected meta tags. The token stays in memory. Only the selected project ID is optionally stored in browser localStorage; project state remains in local files through the server. Preview runs in a separate-origin sandbox iframe using a transferred MessageChannel. All editing controls call actual server endpoints. The source viewer is read-only and shows full before/after files; it does not claim to be a line diff.

Supported: project creation/selection, brief save/approval, streamed brainstorm chat, generation/cancel, candidate preview/apply/discard, source comparison, frame comments, comment-driven revision requests, and history preview/restore. The silent one-shot scope is visible in the UI. No audio or export controls are advertised.

Validation at implementation handoff: editor TypeScript check passed. Text/controls contrast computed with the antislop contrast checker. Browser interaction and responsive QA remain integration tasks owned by the main session; no browser pass is claimed here.

## ST-08 project style

The Style panel adds eight optional text fields scoped to the selected project. Fields have explicit labels, per-field limits, reference-note scope, and a local draft indicator. Drafts survive snapshot polling; changing projects resets the draft to that project's saved style. Saving calls the style endpoint, while discarding a draft restores the latest saved values. Active jobs lock editing; an open candidate blocks saving until applied or discarded. Unsaved style disables creative approval and generation in the Brief panel. The approval button now reviews Brief + Style together and browser hashing uses the shared, browser-safe `serializeBrief` module before Web Crypto SHA-256. Saved style affects future generation/revision, not existing preview code.

Parent integration/browser QA completed; see `.ai/research/QA-20261110-studio-m0.md` for actual actions, limitations, screenshots and delivery gate.

Generation progress: the footer shows an indeterminate bar, actual elapsed wall time, and the active worker stage (code, validation, preview bundle, render bundle, frame checks, candidate). The bar never claims a completion percentage or ETA. Completed steps are distinguished from the active step; cancellation remains available. The short repeating motion signals waiting, and becomes static when reduced motion is requested. Mobile stages wrap instead of overflowing.
