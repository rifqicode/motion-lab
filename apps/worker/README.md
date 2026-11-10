# Local generated-video worker

The studio uses this trusted runner to typecheck, build and render generated shot source inside a restricted local container. It never runs an unrelated application from the container image.

For the current local milestone, the default is the already installed `devlikeapro/waha:latest` image, because its filesystem contains Node 24 and `/usr/bin/chromium`. Set `STUDIO_RUNTIME_IMAGE` to another preinstalled image with compatible Node/Chromium tooling. The builder resolves the selected image to an immutable image ID and uses `--pull never`; it does not download images or start the image's original entrypoint.

This is a development runtime dependency, not a requirement that the studio use WAHA. A dedicated minimal image can replace it without changing project/source contracts. Availability of the Docker executable alone does not prove that the daemon, image or browser works; `status()` and actual build results are separate evidence.

Each job mounts only the pinned dependency tree, CLI/renderer dependency links and package metadata, these trusted runtime files, the selected read-only source snapshot and a dedicated writable build-output directory. The repository, home directory, Codex credentials and Docker socket are not mounted. The container is non-root, has no external network, a read-only root filesystem, dropped capabilities, no privilege escalation, process/memory/CPU caps and temporary scratch storage. It can still use its own loopback interface to serve Remotion frames.

Before generating any bundle, a fixture verifies that a host file outside the mounted directories is hidden, source and container-root writes are denied, and an external TCP connection cannot be established. Results are included in the build record. Generated-code static checks improve diagnostics but do not replace this OS boundary.

Build artifacts include separate Player-preview and Remotion-render bundles from the same source snapshot, five smoke-frame PNGs, hashes and the exact runtime image ID. Comments are captured from the immutable render bundle at the requested frame. No fixture screenshot is used as proof that an AI model generated source.
