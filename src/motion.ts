import {between,clamp,type Phase} from './timeline';
import {pointAt,sampleCubic,type Curve,type Point} from './geometry';
export function pullOffset(curve:Curve,time:number,phase:Phase,maxPull=86):Point {
 if(time<=phase.start||time>=phase.end||phase.end<=phase.start)return {x:0,y:0};
 const origin=curve.points[0];
 // Find the break point from the actual path, not a separately timed oscillation.
 let lo=0,hi=1;
 for(let i=0;i<22;i++){const m=(lo+hi)/2,p=pointAt(curve,m);if(Math.hypot(p.x-origin.x,p.y-origin.y)<maxPull)lo=m;else hi=m;}
 const breakU=(lo+hi)/2;
 let l=0,h=1;for(let i=0;i<22;i++){const m=(l+h)/2;if(m*m*(3-2*m)<breakU)l=m;else h=m;}
 const breakT=phase.start+(phase.end-phase.start)*(l+h)/2;
 const position=(t:number)=>pointAt(curve,between(t,phase.start,phase.end));
 if(time<=breakT){const q=position(time);return {x:q.x-origin.x,y:q.y-origin.y};}
 const atBreak=position(breakT),before=position(breakT-.001),after=position(breakT+.001),elapsed=time-breakT;
 const omega=20/Math.max(.2,phase.end-phase.start),fade=1-between(time,phase.end-.065,phase.end);
 const relax=(x:number,v:number)=>(x+(v+omega*x)*elapsed)*Math.exp(-omega*elapsed)*fade;
 return {x:relax(atBreak.x-origin.x,(after.x-before.x)/.002),y:relax(atBreak.y-origin.y,(after.y-before.y)/.002)};
}
export function routeTo(start:Point,end:Point){return sampleCubic(start,{x:start.x+80,y:start.y-80},{x:end.x-70,y:end.y+30},end);}
export function tailPoints(route:Curve,time:number,phase:Phase){
 const progress=between(time,phase.start,phase.end),old=between(time-.035,phase.start,phase.end);
 const a=Math.max(0,Math.min(old,progress-.006));
 return Array.from({length:18},(_,i)=>pointAt(route,a+(progress-a)*i/17));
}
export function blink(time:number,phase:Phase){
 const t=clamp((time-phase.start)/(phase.end-phase.start||1));
 return t<.25?between(t,0,.25):t<.5?1:1-between(t,.5,1);
}

export function foldEar(time:number,phase:Phase){
 if(time<=phase.start||time>=phase.end)return 0;
 const u=(time-phase.start)/(phase.end-phase.start);
 if(u<.35)return between(u,0,.35);
 if(u<.52)return 1;
 if(u<.88)return 1-1.06*between(u,.52,.88);
 return -.06*(1-between(u,.88,1));
}
