# Asset sourcing and generation

Choose an asset representation based on motion needs:
- Procedural Three.js: abstract networks, packets, geometric systems, objects that need controllable depth and motion.
- SVG: crisp diagrams, arrows, labels, simple shapes.
- Transparent raster: illustrations and visual textures that do not require full 3D rotation.
- GLB/GLTF: complex 3D objects requiring genuine camera orbit or articulated motion.

Reuse and cache assets; record their source, license and generation prompt where relevant. Generated images and models need human/agent visual inspection before use. For local media use `public/` and Remotion `staticFile()`.

The current graph renderer supports a small hardcoded asset set; the semantic catalog is not a general-purpose runtime loader. A missing coffee grinder or coffee bean is not magically produced by the JSON schema. Implement and test the adapter before referencing new assets.

Prefer consistent lighting, palette and perspective across shots over a mix of unrelated generated styles.
