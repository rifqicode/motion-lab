# Asset representation

For the illustration-first workflow, read [SVG asset creation](svg-assets.md) and [consistency](asset-consistency.md). Agent-authored layered vector data is the initial generation mechanism and requires no paid provider. Code-native vectors live under `src/illustration/assets`; external media goes in `public/` and uses `staticFile()`.

Use procedural Three.js or GLB when genuine camera orbit, depth or articulation adds explanatory value. The original graph renderer supports router, earth, device and data_packet. Its semantic catalog is not a universal model loader. Preserve its schema and adapters when adding 2D features.

A flattened raster can be a background, texture or deliberate cutout. It does not provide independent illustration layers automatically. Inspect any generated media before use and record source, license and generation prompt when applicable.
