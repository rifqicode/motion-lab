export type MotionPreset='reveal'|'float'|'rotate'|'travel'|'none'|'slide'|'pulse';
export type MotionTrack={preset:MotionPreset;start:number;duration:number;amplitude:number};
export type Transform={x:number;y:number;z:number;scale:number;rotation:number;opacity:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const evaluateMotion=(track:MotionTrack,time:number):Transform=>{
 const p=clamp((time-track.start)/track.duration),active=time>=track.start;
 const ease=p*p*(3-2*p),t=Math.max(0,time-track.start);
 return {x:track.preset==='travel'?(ease*2-1)*2:track.preset==='slide'?(1-ease)*-track.amplitude:0,
 y:track.preset==='float'?Math.sin(t*2*Math.PI)*track.amplitude:0,z:0,
 scale:track.preset==='reveal'?Math.max(.001,ease):track.preset==='pulse'?1+Math.sin(t*2*Math.PI)*track.amplitude:1,
 rotation:track.preset==='rotate'?t*track.amplitude:0,
 opacity:active?(track.preset==='reveal'?ease:1):0};
};
