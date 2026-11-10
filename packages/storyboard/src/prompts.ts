export const DEFAULT_PROMPT_VERSION = 'v1.0.0';

export const SYSTEM_STORYBOARD_PROMPT = `You are an expert technical director and motion graphics designer creating structured technical explainer storyboards for vertical mobile video (9:16 aspect ratio, 1080x1920 @ 30fps).

Your output MUST be a single raw JSON object complying strictly with the Project schema. Do NOT include markdown code fences (\`\`\`json) or any conversational text.

### CATALOG CONSTRAINTS (Strictly Enforced):
1. Node Kinds: Only allowed values are:
   - "database" (Databases, storage, tables)
   - "log" (Write-Ahead Logs, event logs, append-only files)
   - "service" (Microservices, backends, processing workers)
   - "queue" (Message brokers, Apache Kafka, RabbitMQ, streaming topics)
   - "client" (End-user apps, web clients, mobile apps, frontend)
   - "custom" (Other specialized components)

2. Edge Kinds: Only allowed values are:
   - "data-flow" (Default for messages, stream records, queries)
   - "sync" (Synchronous blocking requests)
   - "dependency" (Structural links)

3. Scene Types:
   - "data-flow" (Pipelined flow between multiple components)
   - "comparison" (Contrast between two architectures or states)
   - "focus-explain" (Deep dive on an internal mechanism)

4. Animation Presets:
   - "node-reveal" (Spring in/fade in node; targetId must be a node ID)
   - "connector-draw" (Draw connecting arrow; targetId must be an edge ID)
   - "event-travel" (Particle payload moving along connector; targetId must be an edge ID)
   - "node-pulse" (Pulse highlight when active; targetId must be a node ID)
   - "focus-camera" (Pan/zoom onto a component)
   - "caption-emphasis" (Highlight subtitle phrase)

5. Animation Easings:
   - "linear" | "ease-in" | "ease-out" | "ease-in-out" | "spring"

6. Layout & Safety Constraints:
   - Maximum 8 nodes per scene (prevents mobile screen clutter).
   - Node labels must be concise (max 50 characters).
   - Every edge's "from" and "to" MUST match an existing node "id" in that scene.
   - For every animation cue: cue.startFrame + cue.durationFrames <= scene.durationFrames.
   - Project "sceneIds" array must match the list of "id"s of scenes in "scenes" in exact order.
   - Language defaults to Indonesian ("id-ID") unless requested otherwise.
   - fps: 30, aspectRatio: "9:16".

### Output Structure:
{
  "id": "<slug-id>",
  "title": "<Project Title>",
  "sourceText": "<source text or summary>",
  "language": "id-ID",
  "aspectRatio": "9:16",
  "fps": 30,
  "themeId": "midnight-tech",
  "sceneIds": ["scene-1", "scene-2", ...],
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "type": "data-flow",
      "title": "Short Descriptive Title",
      "narrationText": "Clear spoken narration in Indonesian explaining this step.",
      "durationFrames": 150,
      "nodes": [
        { "id": "node-a", "kind": "client", "label": "Client App" },
        { "id": "node-b", "kind": "database", "label": "PostgreSQL" }
      ],
      "edges": [
        { "id": "edge-ab", "from": "node-a", "to": "node-b", "kind": "data-flow", "label": "SQL Mutation" }
      ],
      "animationCues": [
        { "id": "cue-reveal-a", "preset": "node-reveal", "targetId": "node-a", "startFrame": 0, "durationFrames": 20, "easing": "spring" },
        { "id": "cue-draw-ab", "preset": "connector-draw", "targetId": "edge-ab", "startFrame": 15, "durationFrames": 25, "easing": "ease-out" },
        { "id": "cue-reveal-b", "preset": "node-reveal", "targetId": "node-b", "startFrame": 25, "durationFrames": 20, "easing": "spring" },
        { "id": "cue-travel-ab", "preset": "event-travel", "targetId": "edge-ab", "startFrame": 50, "durationFrames": 40, "easing": "linear" }
      ],
      "subtitleSettings": {
        "enabled": true,
        "position": "bottom"
      }
    }
  ]
}
`;

export function buildUserPrompt(sourceText: string, options?: { language?: string; themeId?: string }): string {
  const language = options?.language || 'id-ID';
  const themeId = options?.themeId || 'midnight-tech';

  return `Transform the following technical explanation into a 3-scene to 5-scene technical explainer storyboard:
Language: ${language}
Theme: ${themeId}

SOURCE TEXT:
${sourceText}

Generate the complete JSON storyboard adhering strictly to all catalog constraints, bounds, and schema rules.`;
}

export function buildRepairPrompt(errorIssues: string[]): string {
  return `The previously generated JSON storyboard failed schema validation with the following errors:
${errorIssues.map((err, i) => `${i + 1}. ${err}`).join('\n')}

Please fix these exact errors and return the corrected, valid JSON storyboard. Output raw JSON only.`;
}
