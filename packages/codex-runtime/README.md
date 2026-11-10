# Codex runtime

Local stdio adapter for Codex app-server, tested against CLI 0.167.0. Authentication remains managed by the installed Codex CLI; the studio requires a ChatGPT login and does not extract credentials or fall back to API-key billing.

```ts
const runtime = new CodexRuntime({cwd: projectDirectory});
await runtime.start();
const status = await runtime.status();
const threadId = await runtime.createThread({role: 'brainstorm'});
const turn = await runtime.runTurn({
  threadId,
  prompt: 'Bantu jelaskan tujuan shot ini.',
  onDelta: text => publishChatDelta(text),
  signal: controller.signal,
});
await runtime.close();
```

Persist project-to-thread bindings in the caller. `resumeThread(id)` resumes exactly that ID, never the globally newest session. `runTurn` resolves only after a terminal Codex notification, not the turn-start acknowledgement. Cancelled results have status `interrupted` and empty text; failed turns reject with `CodexRuntimeError.code`. Only one active turn per thread is allowed.

`outputSchema` constrains the final response for source proposals. `images` are trusted local image paths supplied by the server, sent as native local-image inputs. The server must validate the final result and source paths before writing files. This package is not a filesystem project store, build runner, or security boundary for generated video execution.

The adapter disables shell/unified execution, code mode, plugins, apps, hooks, browser/computer/image tools and collaboration features. It discovers configured MCP server names through the local config API and disables them on each new/resumed studio thread. Tool restrictions use actual config, not instructions alone. `toolsRestricted` reports verification of the essential effective config switches; it is not a claim that an arbitrary future CLI exposes no additional tools. Unrecognized unsafe server requests are rejected. Version-specific protocol and tool-surface checks belong in integration QA.

For safe configuration overrides this version accepts alphanumeric, underscore and hyphen MCP names and fails closed on other names. Codex 0.167.0 rejects the old `untrusted` approval setting despite retaining it in its exported schema, so this adapter uses `on-request` and declines unexpected execution/file approvals. No approval bypass or unrestricted sandbox flag is used.

`status()` returns only connection state, auth type, a ChatGPT plan label and model summaries; it never returns email, access/refresh tokens, raw account/config objects or stderr. Event listeners receive selected user-visible lifecycle events, not private model reasoning.

Required local prerequisite: `codex login` with ChatGPT. Missing/expired login, unavailable models, incompatible protocol and process/turn failures are surfaced as errors. A separate render runtime is responsible for isolated builds and frame capture.

Integration note (CLI 0.167.0): exported resume parameters include developerInstructions, but real probes retained an older developer-level color direction after resume, including after reconnect. The studio uses new versioned project-role bindings when migrating to style-aware instructions, preserving old sessions and file-based messages rather than assuming resumed instructions changed.
