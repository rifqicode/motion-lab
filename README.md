# AI Technical Explainer Studio

A local-first, reproducible pipeline that transforms technical concepts into animated, narrated, vertical (9:16) explainers for developers.

Built with **Remotion**, **React / SVG**, **Zod**, and **TypeScript**.

---

## 📦 Monorepo Architecture

```text
content-generator/
├── apps/
│   └── cli/                # @studio/cli: Studio CLI tool (validate, render)
├── packages/
│   ├── schema/             # @studio/schema: Canonical Zod schemas & validator contracts
│   ├── themes/             # @studio/themes: Visual tokens & themes (midnight-tech, clean-light, hand-drawn)
│   ├── diagrams/           # @studio/diagrams: SVG diagram components & 3 auto-layout engines
│   ├── motion/             # @studio/motion: 6 pure frame-math animation presets
│   └── renderer/           # @studio/renderer: Remotion 1080x1920 compositions, sequencers & captions
└── out/                    # Render output directory
```

---

## 🚀 Quickstart

### Local 3D character preview

Run `pnpm preview:3d` and open **http://localhost:4173** to review the Three.js character without rendering an MP4. The preview includes playback, a seekable timeline, three camera views, shirt color, and playback speed. Changes in these controls are temporary preview settings.

For a standalone file, run `pnpm preview:3d:build` and open `out/three-preview/index.html` in a browser with WebGL2 support. Code, styles, and procedural geometry are embedded; no API key, network connection, or server is needed for the built HTML. Choose between the silent six-second egg scene and a 14-second running/stumble scene with a mild scrape and schematic skin cutaway.

The reusable agent workflow is documented in `skills/local-three-video/SKILL.md`.

### 1. Install & Build

```bash
pnpm install
pnpm build
```

### 2. Run Test Suite

Run all unit tests across schemas, layouts, themes, and motion presets:

```bash
pnpm test
```

### 3. Validate Storyboard

Validate any storyboard project against the canonical schema:

```bash
pnpm studio validate --project examples/postgres-cdc
# Or point directly to JSON:
pnpm studio validate --project examples/postgres-cdc/project.json
```

### 4. Render Video to MP4

Render the PostgreSQL CDC golden sample (1080×1920, 30fps H.264 MP4):

```bash
# Render specific frame range (e.g., Scene 1: frames 0-149)
pnpm studio render --project examples/postgres-cdc --out ./out/cdc-scene1.mp4 --frames 0-149

# Render full video
pnpm studio render --project examples/postgres-cdc --out ./out/cdc-full.mp4
```

---

## 🎨 Layouts, Themes & Motion

- **Layouts (9:16 Mobile Optimized):**
  - `horizontal-data-flow`: Vertical & staggered downward pipeline with safe-area bounds.
  - `comparison`: Split comparison layout.
  - `focus-explain`: Central hero node with orbiting satellite nodes.
- **Themes:**
  - `midnight-tech`: Dark aesthetic, cyan/purple accents, glowing highlights.
  - `clean-light`: Light slate aesthetic with deep blue accents.
  - `hand-drawn`: Chalkboard tones with sketchy contours.
- **Motion Presets (100% Pure Frame Math):**
  - `node-reveal`: Spring overshoot and opacity reveal.
  - `connector-draw`: Eased dash-offset stroke drawing.
  - `event-travel`: Exact cubic Bézier particle calculation.
  - `node-pulse`: Harmonic scale & glow oscillation.
  - `focus-camera`: Pan & zoom camera transformation matrix.
  - `caption-emphasis`: Dynamic subtitle text highlight.

---

## 📋 Status & Next Phases

- **Phase 0 & 1 Complete:**
  - ✅ Monorepo & Zod schemas.
  - ✅ Pure SVG diagram components & auto-layout engines.
  - ✅ Pure frame-based motion presets.
  - ✅ Remotion 1080x1920 30fps compositions with header & subtitle overlays.
  - ✅ CLI `validate` and `render` commands.
  - ✅ Golden sample (`examples/postgres-cdc/project.json`).
  - ✅ 100% test coverage for schemas, layouts, and motion determinism.
- **Phase 2 (Upcoming):**
  - AI storyboard generation adapter with structured LLM output and schema repair.
- **Phase 3 (Upcoming):**
  - Indonesian TTS narration provider integration, WhisperX forced alignment, and word-level anchor mapping.
