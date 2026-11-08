import {Easing,interpolate,spring} from 'remotion';
export const ease=(frame:number,start:number,duration:number)=>interpolate(frame,[start,start+duration],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
export const pop=(frame:number,fps:number,delay=0)=>spring({frame:frame-delay,fps,config:{damping:16,stiffness:110,mass:0.8}});
export const stagger=(index:number,spacing=8)=>index*spacing;
