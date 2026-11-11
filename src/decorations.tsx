import React from 'react';
import {between,type Phase} from './timeline';
import {sampleCubic,pointAt,pathOf,type Curve,type Point} from './geometry';
type DecoPath={id:string;d?:string;width:number;curve?:Curve;profile?:'brush'|'taper';eye?:Point};
// Centerline samples retain pen order; filled ribbons give ears and whiskers a tapered nib.
const curve=(segments:number[][]):Curve=>{
 const points:Curve['points']=[];let length=0;
 for(const s of segments){const sampled=sampleCubic({x:s[0],y:s[1]},{x:s[2],y:s[3]},{x:s[4],y:s[5]},{x:s[6],y:s[7]},48);
  for(const p of sampled.points){const last=points.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({...p,length});}}
 return {points,length};
};
function pressurePath(c:Curve,p:number,width:number,profile='brush'){
 const end=pointAt(c,p),pts=[...c.points.filter(v=>v.length<c.length*p),{...end,length:c.length*p}];
 const left:Point[]=[],right:Point[]=[];
 pts.forEach((v,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],d=Math.hypot(b.x-a.x,b.y-a.y)||1,u=v.length/c.length;
 const w=width*.5*(profile==='taper'?Math.max(.025,Math.pow(1-u,.7)):(.28+.72*Math.pow(Math.sin(Math.PI*u),.7)));
 left.push({x:v.x-(b.y-a.y)/d*w,y:v.y+(b.x-a.x)/d*w});right.push({x:v.x+(b.y-a.y)/d*w,y:v.y-(b.x-a.x)/d*w});});
 return pathOf([...left,...right.reverse()])+' Z';
}
export const decorationPaths:Record<string,DecoPath[]>={
 sun:[{id:'face',d:'M 0 -48 C 31 -49 51 -22 49 7 C 47 38 25 50 -4 49 C -35 48 -50 28 -49 0 C -48 -28 -28 -49 0 -48',width:3.7},{id:'left-eye',d:'M -28 1 C -25 -11 -16 -12 -12 -1',width:3.2},{id:'right-eye',d:'M 13 -2 C 16 -14 25 -15 29 -4',width:3.2},{id:'smile',d:'M -10 17 C -3 29 13 29 18 15',width:3.4},...Array.from({length:8},(_,i)=>{const a=-Math.PI/2+i*Math.PI/4;return {id:`ray-${i}`,d:`M ${Math.cos(a)*65} ${Math.sin(a)*65} L ${Math.cos(a)*85} ${Math.sin(a)*85}`,width:5};})],
 cat:[
  {id:'left-ear',curve:curve([[-42,-4,-40,-19,-40,-42,-34,-43],[-34,-43,-29,-44,-11,-23,-5,-13]]),width:4.5},
  {id:'right-ear',curve:curve([[7,-11,16,-28,26,-45,30,-43],[30,-43,37,-42,41,-20,40,-8]]),width:4.4},
  {id:'left-eye',eye:{x:-10,y:5},width:6.5}, {id:'right-eye',eye:{x:15,y:4},width:6.5},
  {id:'whisker-left-up',curve:curve([[-65,4,-53,6,-29,12,-17,15]]),width:5.4,profile:'taper'},
  {id:'whisker-left-down',curve:curve([[-55,37,-43,31,-27,24,-18,20]]),width:5,profile:'taper'},
  {id:'whisker-right-up',curve:curve([[64,-5,54,0,36,8,22,14]]),width:5.9,profile:'taper'},
  {id:'whisker-right-down',curve:curve([[60,23,49,22,34,19,25,19]]),width:4.7,profile:'taper'},
 ],
 heart:[{id:'heart',curve:curve([[0,51,-18,32,-62,6,-53,-25],[-53,-25,-45,-55,-12,-56,0,-29],[0,-29,15,-59,48,-51,54,-25],[54,-25,63,6,18,34,0,51]]),width:4.8}],
 star:[
  {id:'wandering-star',curve:curve([[-8,-49,-5,-60,1,-56,6,-46],[6,-46,10,-35,15,-23,18,-16],[18,-16,31,-18,51,-25,54,-18],[54,-18,56,-14,35,2,28,8],[28,8,31,20,41,42,34,45],[34,45,29,48,12,34,0,29],[0,29,-10,39,-25,55,-30,51],[-30,51,-36,48,-28,22,-26,14],[-26,14,-36,8,-59,-3,-56,-9],[-56,-9,-54,-15,-29,-15,-21,-18],[-21,-18,-18,-31,-13,-45,-8,-49]]),width:5.4},
  {id:'star-smile',d:'M -9 8 Q -1 18 9 7',width:2.6},
  {id:'star-eye-left',eye:{x:-12,y:-3},width:2.3}, {id:'star-eye-right',eye:{x:11,y:-4},width:2.3},
  {id:'sparkle',curve:curve([[66,-44,64,-38,63,-33,61,-29],[61,-29,66,-30,70,-30,75,-29],[75,-29,70,-26,67,-22,65,-17],[65,-17,65,-23,63,-26,61,-29]]),width:2.5},
 ],
};
const foldedLeft=curve([[-42,-4,-40,-18,-35,-35,-27,-29],[-27,-29,-18,-22,-12,-13,-16,-9],[-16,-9,-20,-5,-31,-15,-32,-22]]);
export function Decoration({id,time,phase,x,y,radius,lid,ear=0}:{id:string;time:number;phase:Phase;x:number;y:number;radius:number;lid:number;ear?:number}){
 if(id==='none'||time<phase.start)return null;
 const paths=decorationPaths[id]??[],slot=(phase.end-phase.start)/Math.max(1,paths.length);
 return <g transform={`translate(${x} ${y}) scale(${radius/50})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
  {paths.map((p,i)=>{const progress=between(time,phase.start+i*slot,phase.start+(i+1)*slot);if(progress<=0)return null;
   if(p.eye)return <ellipse key={p.id} data-decoration={p.id} cx={p.eye.x} cy={p.eye.y} rx={p.width/2} ry={p.width*.72*Math.max(.12,p.id==='right-eye'?1-lid:1)*progress} fill="currentColor" stroke="none"/>;
   if(p.curve){
    const bent=p.id==='left-ear'&&ear!==0?{...p.curve,points:p.curve.points.map(v=>{const q=pointAt(foldedLeft,v.length/p.curve!.length);return {...v,x:v.x+(q.x-v.x)*ear,y:v.y+(q.y-v.y)*ear};})}:p.curve;
    return <path key={p.id} data-decoration={p.id} data-fold={p.id==='left-ear'?ear:undefined} d={pressurePath(bent,progress,p.width,p.profile)} fill="currentColor" stroke="none"/>;
   }
   const d=p.id==='right-eye'?`M 13 -2 C 16 ${-14+13*lid} 25 ${-15+12*lid} 29 -4`:p.d;
   return <path key={p.id} data-decoration={p.id} d={d} strokeWidth={p.width} pathLength="1" strokeDasharray="1 1" strokeDashoffset={1-progress}/>;
  })}
 </g>;
}
