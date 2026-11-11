import React,{useMemo} from 'react';
import {initials,middle,endings,metrics,type PenGlyph} from '../assets/fonts/tyx-brush/positional';
import {pointAt,pathOf,pointBounds,type Curve,type Point,type Box} from './geometry';
import {sampleCubic} from './geometry';
import {writingTiming} from './timeline';
import type {SignatureConfig} from './config';
export type BrushStroke={id:string;char:string;index:number;curve:Curve;start:number;duration:number;width:number;position:'initial'|'medial'|'terminal'|'punctuation';dot:boolean};
export const brushProgress=(u:number)=>{const t=Math.max(0,Math.min(1,u));return t-.065*Math.sin(t*Math.PI*2);};
export function parseStroke(d:string):Curve{
 const tokens=d.match(/[MLC]|-?\d*\.?\d+/g)??[];let i=0,x=0,y=0,length=0;const points:Curve['points']=[];
 const add=(p:Point)=>{const last=points.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({...p,length});x=p.x;y=p.y;};
 const num=()=>Number(tokens[i++]);
 while(i<tokens.length){const op=tokens[i++];if(op==='M')add({x:num(),y:num()});else if(op==='L'){const end={x:num(),y:num()},sx=x,sy=y;for(let k=1;k<=24;k++)add({x:sx+(end.x-sx)*k/24,y:sy+(end.y-sy)*k/24});}else if(op==='C'){const sampled=sampleCubic({x,y},{x:num(),y:num()},{x:num(),y:num()},{x:num(),y:num()},64);sampled.points.slice(1).forEach(add);}else throw new Error('笔刷路径命令无效');}
 return {points,length};
}
const mapCurve=(c:Curve,fn:(p:Point)=>Point):Curve=>{let length=0;const points:Curve['points']=[];for(const p of c.points){const v=fn(p),prev=points.at(-1);if(prev)length+=Math.hypot(v.x-prev.x,v.y-prev.y);points.push({...v,length});}return {points,length};};
export function buildBrush(c:SignatureConfig){
 const strokes:BrushStroke[]=[],deferred:BrushStroke[]=[];const factor=c.font.size/320;let cursor=0,clock=0;
 const letters=[...c.name],first=letters.findIndex(ch=>/[A-Za-z]/.test(ch)),last=letters.map(ch=>/[A-Za-z]/.test(ch)).lastIndexOf(true);
 letters.forEach((char,i)=>{
  if(char===' '){cursor+=62*factor;return;}
  const cap=initials[char],base=middle[char];
  const position:BrushStroke['position']=cap&&i===first?'initial':base&&i===last?'terminal':cap||base?'medial':'punctuation';
  const glyph:PenGlyph=cap??base??(char==="'"?{advance:38,paths:['M 20 -157 C 28 -167 30 -181 29 -186']}:{advance:65,paths:['M 0 -57 C 19 -60 44 -60 65 -57']});
  const isLead=i===first;
  const capScale=isLead?c.font.initialScale:cap?.79:1;
  const paths=[...(position==='terminal'&&glyph.terminalPaths?glyph.terminalPaths:glyph.paths)];
  if(isLead&&char==='T'){
   // A signature T needs a broad canopy and a descending main stroke.
   paths[0]='M -65 -120 C -206 -111 -230 -128 -153 -177 C -44 -242 149 -291 266 -292 C 318 -292 325 -272 295 -254';
   paths[1]='M 102 -244 C 62 -174 -17 -11 -50 74 C -58 95 -63 108 -62 113';
  }
  if(position==='terminal'){
   const ending=endings[char],bare=parseStroke(paths[ending.stroke]),anchor=bare.points.at(-1)!;
   const letterCount=letters.filter(ch=>/[A-Za-z]/.test(ch)).length;
   const length=c.font.terminalLength*Math.min(1,.55+letterCount*.075);
   const continuation=ending.continuation.replace(/C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/g,(_m,x1,y1,x2,y2,x3,y3)=>
    'C '+[[x1,y1],[x2,y2],[x3,y3]].map(([x,y])=>`${anchor.x+(Number(x)-anchor.x)*length} ${anchor.y+(Number(y)-anchor.y)*length}`).join(' '));
   paths[ending.stroke]+=continuation;
  }
  paths.forEach((source,j)=>{
   let d=source;
   // Medial joins share an upward exit/entry tangent at the baseline.
   // Terminal forms keep the authored tangent into their individual flourish.
   if(position==='medial'){
    d=d.replace(/C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/, (match,a,b,_x,_y,x,y)=>Number(y)===0?`C ${a} ${b} ${Number(x)-12} 7 ${x} ${y}`:match);
   }
   if(base&&j===0&&position==='medial')d=d.replace(/^M 0 0 C -?[\d.]+ -?[\d.]+/,'M 0 0 C 12 -7');
   const curve=mapCurve(parseStroke(d),p=>({x:cursor+(p.x)*factor*capScale+(isLead?c.font.initialOffsetX:0),y:p.y*factor*capScale+(isLead?c.font.initialOffsetY:0)}));
   const dot=glyph.dotIndices?.includes(j)??false;
   const stroke:BrushStroke={id:`brush-${i}-${j}`,char,index:j,curve,start:0,duration:dot ? .10 : Math.max(.08,Math.pow(curve.length,.8)/360),width:c.font.size*(position==='terminal'?.065:.085)*c.font.penWidth*(isLead?Math.sqrt(c.font.initialScale)*1.10:1)*(isLead&&char==='T'&&j===0?.92:1),position,dot};
   if(dot)deferred.push(stroke);else strokes.push(stroke);
  });
  // The wide T canopy overlaps the following letter; its stem is not a full-width box.
  cursor+=(isLead&&char==='T'?18:glyph.advance)*factor*capScale;
 });
 strokes.push(...deferred);
 for(const s of strokes){s.start=clock;clock+=s.duration+.006;}
 const points:Point[]=strokes.flatMap(s=>s.curve.points.flatMap(p=>[{x:p.x-s.width/2,y:p.y-s.width/2},{x:p.x+s.width/2,y:p.y+s.width/2}]));
 const box=pointBounds(points);
 return {strokes,points,box,duration:clock,guide:{baseline:0,xHeight:metrics.xHeight*factor,hasDescenders:strokes.some(s=>/[fgjpqxyz]/.test(s.char)||(s.position==='terminal'&&s.char==='b')),bodyStart:0,bodyEnd:cursor}};
}
function pressure(s:BrushStroke,u:number,c:SignatureConfig){
 const before=pointAt(s.curve,Math.max(0,u-.014)),after=pointAt(s.curve,Math.min(1,u+.014)),dy=after.y-before.y,len=Math.hypot(after.x-before.x,dy)||1;
 const end=s.position==='initial'&&s.char==='T'&&s.index===1?.72:s.position==='medial'?.48:.025;
 const start=s.position==='initial'&&s.char==='T'&&s.index===0?.08:.48;
 const taper=Math.min(1,start+u*18,end+(1-u)*18);
 const nib=(.48+.52*Math.max(0,dy/len))*(.95+.05*Math.sin(u*Math.PI*3))*taper;
 return s.width/2*((1-c.font.pressure)*.78+c.font.pressure*nib);
}
const finished=new WeakMap<BrushStroke,Map<string,string>>();
/** A union of same-winding round capsules remains filled at self crossings. */
export function brushRibbon(s:BrushStroke,progress:number,c:SignatureConfig,padding=0){
 if(progress<=0)return '';
 const key=c.font.pressure+':'+padding;
 if(progress>=1&&finished.get(s)?.has(key))return finished.get(s)!.get(key)!;
 const end=Math.min(1,progress),count=Math.max(1,Math.ceil(s.curve.length*end/Math.max(.6,c.font.size*.007)));
 const fmt=(x:number)=>x.toFixed(2);let d='';
 const disk=(p:Point,r:number)=>`M ${fmt(p.x+r)} ${fmt(p.y)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2*r)} 0 a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2*r)} 0 Z `;
 let a=pointAt(s.curve,0),ra=pressure(s,0,c)+padding;d+=disk(a,ra);
 for(let i=1;i<=count;i++){
  const u=end*i/count,b=pointAt(s.curve,u),rb=pressure(s,u,c)+padding,n=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/n,ny=(b.x-a.x)/n;
  d+=pathOf([{x:a.x+nx*ra,y:a.y+ny*ra},{x:b.x+nx*rb,y:b.y+ny*rb},{x:b.x-nx*rb,y:b.y-ny*rb},{x:a.x-nx*ra,y:a.y-ny*ra}])+' Z '+disk(b,rb);
  a=b;ra=rb;
 }
 if(progress>=1){let cache=finished.get(s);if(!cache){cache=new Map();finished.set(s,cache);}cache.set(key,d);}
 return d;
}
export function BrushInk({strokes,time,config,padding=0}:{strokes:BrushStroke[];time:number;config:SignatureConfig;padding?:number}){
 const paths=useMemo(()=>strokes.map(s=>{
  const p=brushProgress((time-s.start)/s.duration);
  if(p<=0)return null;
  if(s.dot){const center=pointAt(s.curve,.5),r=(s.width*.32+padding)*Math.sqrt(p);return <ellipse data-letter={s.char} data-position={s.position} key={s.id} cx={center.x} cy={center.y} rx={r*.8} ry={r*1.25} transform={`rotate(35 ${center.x} ${center.y})`}/>;}
  return <path data-letter={s.char} data-position={s.position} key={s.id} d={brushRibbon(s,p,config,padding)} fillRule="nonzero"/>;
 }),[strokes,time,config,padding]);
 return <g transform="rotate(-6)" fill="currentColor" stroke="none">{paths}</g>;
}
