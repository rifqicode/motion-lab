# Local studio (M0)

From the repository root:

```sh
pnpm install
pnpm studio:dev
```

Open http://127.0.0.1:4180. The preview uses a second loopback server on port 4181. Keep the terminal running; restart `studio:dev` after source edits. `pnpm studio:build` builds the web editor and server without starting them.

Prerequisites: Node.js 22+, pnpm, a ChatGPT-authenticated `codex` CLI, Docker with a running daemon, and a local image containing Node.js and Chromium. The default renderer uses the pre-existing pinned image described in `apps/worker/README.md`; the studio does not automatically pull it. `STUDIO_RUNTIME_IMAGE` can select a compatible local image. Codex inference uses the subscription and requires an internet connection; generated rendering containers have no external network.

Projects, source snapshots, build output, comments, and revision history live in `.studio/projects/`. No database or API key is required. Only one studio process may write to a project root. Stop the process cleanly before opening it elsewhere.

1. Create a project and brainstorm with Codex.
2. Edit the brief with the agreed story and visual direction, save, and approve it.
3. Generate a candidate. Review its source and silent preview before applying it.
4. Seek an accepted revision, add a frame comment, and request a code revision.
5. Review the new candidate, apply or discard it, or restore an earlier accepted revision.

This increment supports one silent 2D portrait shot (15–30 seconds, 720 × 1280, 30 fps). Audio, MP4 export, uploaded style/reference management, separate consultant review, multiple shots, and 3D remain later increments.

Optional environment variables: `STUDIO_PORT`, `STUDIO_PREVIEW_PORT`, `STUDIO_PROJECT_ROOT`, `STUDIO_RUNTIME_IMAGE`, and `STUDIO_REPO_ROOT`. The servers bind only to `127.0.0.1`; this is a local application.

Project editing style is configured in the editor's Style tab: mood, palette, typography, pacing, transitions, visual direction, reference notes and things to avoid. Save it, then approve Brief + Style before generation. Changes invalidate approval; resolve an open candidate before saving new style. Existing previews retain their source and styling. Reference links/notes are text context only; this increment does not fetch links, upload video or analyze reference media.

Projects without a style field load with empty defaults and keep their legacy brief approval. Creative threads now use versioned style-aware bindings: old Codex sessions are retained, while a new brainstorm session receives recent saved project conversation as context (up to 12 messages, 2,000 characters each). Implementation receives the current sealed source and shot metadata. This avoids the installed CLI retaining older developer-level dark-style instructions on resumed sessions.
