export const semanticAssets={
 device:{id:'device',type:'procedural-3d',description:'Smartphone with illuminated screen'},
 router:{id:'router',type:'procedural-3d',description:'Wi-Fi router with antennae, status LEDs and directional data signal'},
 data_packet:{id:'data_packet',type:'svg',description:'Glowing packet moving along the connection path'},
 earth:{id:'earth',type:'procedural-3d',description:'Rotating spherical planet with network nodes'},
 network_connection:{id:'network_connection',type:'procedural-3d',description:'Curved 3D arc anchored to two coordinates on a sphere'}
} as const;
export type SemanticAssetId=keyof typeof semanticAssets;
export const resolveSemanticAsset=(id:SemanticAssetId)=>semanticAssets[id];
