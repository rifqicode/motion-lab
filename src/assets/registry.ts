import {semanticAssets} from './semantic';
export type AssetDefinition={id:string;type:'procedural-3d'|'svg'|'text'|'image';description:string;src?:string};
const builtins:Record<string,AssetDefinition>=Object.fromEntries(Object.values(semanticAssets).map(a=>[a.id,{...a}]));
export const assetRegistry:Record<string,AssetDefinition>={...builtins,
 'coffee-bean':{id:'coffee-bean',type:'svg',description:'Layered illustrated coffee bean'},
 'coffee-cup':{id:'coffee-cup',type:'svg',description:'Illustrated espresso cup'},
 'coffee-stream':{id:'coffee-stream',type:'svg',description:'Animated extraction stream'}
};
export const resolveAsset=(id:string)=>{const asset=assetRegistry[id];if(!asset)throw new Error('Unknown asset: '+id);return asset;};
