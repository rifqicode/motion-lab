# Local studio editor

## Reference layout refresh (2026-11-11)

Shot details now open on demand in a native dialog from the ordered shot list.
The dialog saves storyboard drafts and can open the existing Director chat with a
visible shot context. The selected shot snapshot (including unsaved/incomplete text)
travels through the optional validated `shotContext` message field; the server reuses
the project's existing brainstorm thread. Clearing context explicitly restores project
scope for the next turn. Ordinary discussion does not publish or generate a storyboard.
See `anti-slop/audit-002-2026-11-11.md` for the follow-up verification.

The approved reference uses a compact project/engine header, workflow shortcuts,
Director at left, portrait preview at center, and versions/comments/export at right.
Secondary context and activity/code panels remain available through keyboard-accessible
disclosure menus. Brief and Style retain their existing persistence and approval endpoints.
Shot buttons pause and seek to exact cumulative frame boundaries; the active shot and
summary follow the playhead. Message formatting supports headings, emphasis and code
without rendering agent HTML. Storyboard can expand for editing alongside its shot list.
Tablet layouts offer preview with an optional side panel; phone layouts show one selected
area while retaining the mounted preview connection. No new external assets or dependencies.

Verification and limitations: `anti-slop/audit-001-followup-2026-11-11.md` at repository root.

ST-04, canonical plan `.ai/plans/PLAN-20261110-web-studio-mvp.md` v1.0.

Design direction: a desktop creative workspace for reviewing generated portrait motion. ENERGY 1 / RHYTHM 2 / MOTION 1. Matte charcoal keeps attention on the video; warm amber identifies creation actions, the active shot, and frame anchors. System sans keeps compact editing controls readable without downloading fonts. Monospace is restricted to source and frame/time values. The repeated frame label ties comments to the timeline. The center preview receives most space; surrounding panels follow the actual brief/review workflow. The layout stacks at phone sizes and moves review below the two-column workspace on smaller laptops.

The application reads the per-session API token and preview origin from server-injected meta tags. The token stays in memory. Only the selected project ID is optionally stored in browser localStorage; project state remains in local files through the server. Preview runs in a separate-origin sandbox iframe using a transferred MessageChannel. All editing controls call actual server endpoints. The source viewer is read-only and shows full before/after files; it does not claim to be a line diff.

Supported controls: project creation/selection, brief save/approval, streamed Director chat, storyboard review/approval, generation/cancel, candidate preview/apply/discard, source comparison, frame comments, comment-driven revision requests, history preview/restore, per-shot activity/retry/cancel, visual QA requests, local voice-over, and explicit MP4 export/download.

Validation at implementation handoff: editor TypeScript check passed. Text/controls contrast computed with the antislop contrast checker. Browser interaction and responsive QA remain integration tasks owned by the main session; no browser pass is claimed here.

## ST-08 project style

The Style panel adds eight optional text fields scoped to the selected project. Fields have explicit labels, per-field limits, reference-note scope, and a local draft indicator. Drafts survive snapshot polling; changing projects resets the draft to that project's saved style. Saving calls the style endpoint, while discarding a draft restores the latest saved values. Active jobs lock editing; an open candidate blocks saving until applied or discarded. Unsaved style disables creative approval and generation in the Brief panel. The approval button now reviews Brief + Style together and browser hashing uses the shared, browser-safe `serializeBrief` module before Web Crypto SHA-256. Saved style affects future generation/revision, not existing preview code.

Parent integration/browser QA completed; see `.ai/research/QA-20261110-studio-m0.md` for actual actions, limitations, screenshots and delivery gate.

Generation progress uses an indeterminate bar, actual elapsed wall time and the current persisted job message. Activity shows real child-shot milestones instead of inferring a global stage or completion percentage. Cancellation remains available. Waiting motion becomes static when reduced motion is requested.

## MotionLab Director and storyboard

Director now offers explicit **Diskusi** and **Revisi video** modes in the same
conversation. Open a shot's detail and choose **Diskusikan shot ini** to scope a
revision to that shot; **Bahas seluruh video** clears the scope. Revision mode starts
from the applied version and produces a candidate for preview/apply/discard. It
patches existing source and preserves version history. Ordinary discussion remains
read-only. A candidate must be applied/discarded before another revision; unsaved
drafts and historical views block execution. Shot identity/order/count stay fixed.
The messages endpoint accepts `mode: 'revise'` with `expectedRevisionId` and optional
`shotContext`; omitted mode retains ordinary discussion behavior. Evidence and native
export verification: `anti-slop/audit-003-2026-11-11.md`.

Brainstorm is now named Director; existing conversation history, Brief and Style remain available. The Director action creates a structured draft, while ordinary chat does not silently edit the approved storyboard. A dedicated Storyboard tab presents the concept, hook, narrative, shared visual guidelines, ordered shot summaries and selected shot details. Frame durations are shown alongside seconds. Shot reorder retains IDs; dependencies and shared component descriptions are available in a technical disclosure.

Storyboard drafts survive snapshot polling and tab changes. Concurrent server edits preserve the local draft and require reloading the saved version before another save. Saving uses the draft's base hash. Approval and generation run sequentially against the displayed saved storyboard hash; unsaved story/style/storyboard drafts, open candidates, invalid fields and unavailable runtime prevent generation. Historical frame comments now resolve local shot frames to the correct global timeline position.

The existing charcoal/amber design is retained: amber marks the selected shot and primary approval action, system sans keeps long creative instructions readable, and a vertical ordered shot list fits the side panel and mobile layout. No new visual assets are introduced. Browser behavior and full workflow validation are recorded by the parent integration task; component tests cover storyboard prerequisites and validation gates.

## Live preview, activity, QA and export

The Audio tab adds local Indonesian voice-over to an applied video's shots. Run
`node scripts/chatterbox/setup.mjs` once to install the isolated runtime and download
the pinned model; see `scripts/chatterbox/README.md`. Generation runs offline on the
local GPU/CPU, without an agent login or external TTS API. Enter narration, choose
volume and whether to extend a shot when needed, then review the resulting candidate
before applying it. The checkpoint's default voice is used in this milestone.

Audio is sealed with the source snapshot and inherited by later visual revisions.
Replacing one narration retains other tracks and all visual files. History/restore
selects the audio of that version. Preview plays the same local tracks included in
MP4 export; export verifies that the expected audio stream exists. Narration that
cannot fit a fixed-duration shot fails rather than being silently clipped.

An active candidate uses the project's live preview session only after the server exposes a validated published build. The iframe identity is tied to project/session, so HMR build updates retain the same iframe and MessageChannel. History uses the immutable build route. Ready/update messages acknowledge the currently loaded duration; recovered runtime errors keep the last-good preview controls available. A partially failed generation can display its last published immutable snapshot while remaining ineligible for apply.

Activity shows persisted shot state, attempt, worker, changed files and diagnostics, with isolated retry/cancel actions. Snapshot updates are coalesced during SSE bursts; reconnect reloads current state and resets the replay cursor for server restarts. QA reports are filtered to the displayed build and distinguish compile/runtime evidence, geometry checks and semantic review. Missing/inconclusive visual checks are explicit; screenshots are not labeled proof of design quality.

The Export tab targets the accepted current revision and blocks export while a candidate is open. Production rendering starts only through its explicit action. Ready artifacts display verified metadata; MP4 download uses authenticated fetch and a temporary blob URL, keeping the Studio session token out of URLs. Parent integration owns real browser/runtime/export verification; local component tests do not establish those runtime results.
