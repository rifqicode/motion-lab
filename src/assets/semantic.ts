export const semanticAssets = {
  coffee_bean: {
    id: 'coffee_bean',
    type: 'svg',
    description: 'Original shaded roasted coffee beans with central creases and ground particles',
  },
  coffee_extraction: {
    id: 'coffee_extraction',
    type: 'svg',
    description:
      'Original sectional portafilter with grounds, pressure arrows, filter and espresso stream',
  },
  espresso: {
    id: 'espresso',
    type: 'svg',
    description: 'Original glass espresso cup, saucer and crema surface',
  },
  device: {
    id: 'device',
    type: 'procedural-3d',
    description: 'Smartphone with illuminated screen',
  },
  router: {
    id: 'router',
    type: 'procedural-3d',
    description: 'Wi-Fi router with antennae, status LEDs and directional data signal',
  },
  data_packet: {
    id: 'data_packet',
    type: 'svg',
    description: 'Glowing packet moving along the connection path',
  },
  earth: {
    id: 'earth',
    type: 'procedural-3d',
    description: 'Rotating spherical planet with network nodes',
  },
  network_connection: {
    id: 'network_connection',
    type: 'procedural-3d',
    description: 'Curved 3D arc anchored to two coordinates on a sphere',
  },
} as const;
export type SemanticAssetId = keyof typeof semanticAssets;
export const resolveSemanticAsset = (id: SemanticAssetId) => semanticAssets[id];
