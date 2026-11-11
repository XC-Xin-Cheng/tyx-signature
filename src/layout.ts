import type {SignatureConfig} from './config';
import {SignatureError} from './errors';
import {union,pointBounds,sampleCubic,type Point,type Box} from './geometry';
export const rotate=(p:Point,degrees=4)=>{const a=-degrees*Math.PI/180;return {x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)};};
export type BrushGuide={baseline:number;xHeight:number;hasDescenders:boolean;bodyStart:number;bodyEnd:number};
export function place(c:SignatureConfig,word:Box,start:Point,tail:Point,inkPoints?:Point[],guide?:BrushGuide){
 const rotation=guide?6:4,turn=(p:Point)=>rotate(p,rotation);
 const corners=(inkPoints??[{x:word.minX,y:word.minY},{x:word.maxX,y:word.minY},{x:word.minX,y:word.maxY},{x:word.maxX,y:word.maxY}]).map(turn);
 const w=pointBounds(corners);
 const width=w.maxX-w.minX,height=w.maxY-w.minY;
 const radius=width*(c.decoration.id==='cat'?.125:.085)*c.decoration.scale;
 const decoBottom=c.decoration.id==='sun'?85:c.decoration.id==='cat'?38:58;
 const localTop=(x:number)=>{const samples=corners.filter(p=>Math.abs(p.x-x)<radius*1.37);return samples.length?Math.min(...samples.map(p=>p.y)):w.minY;};
 const center=(w.minX+w.maxX)/2;
 // Place the ornament in actual whitespace, favouring the word centre and right shoulder.
 const options=[center,center+width*.12,center+width*.22,center-width*.10];
 const automatic=options.reduce((best,x)=>localTop(x)-Math.abs(x-center)*.12>localTop(best)-Math.abs(best-center)*.12?x:best,center);
 const decoX=automatic+c.decoration.offsetX*width,bodyTop=localTop(decoX),gap=Math.max(c.font.size*.055,height*.035);
 const requestedY=bodyTop-decoBottom*radius/50-gap+c.decoration.offsetY*height;
 const deco={x:decoX,y:Math.min(requestedY,bodyTop-decoBottom*radius/50-gap*.45),radius};
 let line;
 if(guide){
  const span=guide.bodyEnd-guide.bodyStart,h=guide.xHeight,base=guide.baseline;
  const startX=guide.bodyStart+span*(guide.hasDescenders?.28:.12),endX=guide.bodyEnd+span*.065;
  const y=base+h*(guide.hasDescenders?.90:.49);
  line=sampleCubic(turn({x:startX,y}),turn({x:startX+span*.24,y:base+h*(guide.hasDescenders?.42:.29)}),turn({x:endX-span*.23,y:base+h*(guide.hasDescenders?.36:.26)}),turn({x:endX,y:base+h*(guide.hasDescenders?.49:.42)}));
 }else{
  // Fonts without authored body metrics stay below their complete visible ink.
  const base=w.maxY+Math.max(c.font.size*.12,height*.12);
  line=sampleCubic({x:w.minX+width*.10,y:base+c.font.size*.035},{x:w.minX+width*.38,y:base},{x:w.maxX-width*.18,y:base},{x:w.maxX+width*.035,y:base+c.font.size*.025});
 }
 const exit=line.points.at(-1)!;
 const leaving=sampleCubic(exit,{x:exit.x+110,y:exit.y-110},{x:exit.x+65,y:deco.y-radius*.8},{x:deco.x+radius*1.25,y:deco.y-radius*.9});
 const glow=c.glow.enabled?c.glow.radius*2:0;
 const boxes:Box[]=[w];
 if(c.decoration.id!=='none')boxes.push({minX:deco.x-radius*(c.decoration.id==='cat'?1.35:1.8),minY:deco.y-radius*(c.decoration.id==='cat'?.92:1.8),maxX:deco.x+radius*(c.decoration.id==='cat'?1.35:1.8),maxY:deco.y+radius*decoBottom/50});
 if(c.underline.enabled)boxes.push(pointBounds(line.points));
 if(c.comet.enabled&&c.underline.enabled)boxes.push({minX:Math.min(...leaving.points.map(p=>p.x)),minY:Math.min(...leaving.points.map(p=>p.y)),maxX:Math.max(...leaving.points.map(p=>p.x)),maxY:Math.max(...leaving.points.map(p=>p.y))});
 const all=union(boxes);const size={w:all.maxX-all.minX+2*glow,h:all.maxY-all.minY+2*glow};
 const scale=Math.min(c.canvas.width*.82*(c.font.size/240)/width,(c.canvas.width*.94)/size.w,(c.canvas.height*.90)/size.h);
 if(c.font.size*scale<36)throw new SignatureError('LAYOUT_TOO_SMALL','当前姓名适配后会过小，难以辨认。','请缩短姓名或增大画幅。');
 const tx=c.canvas.width/2-(all.minX+all.maxX)/2*scale,ty=c.canvas.height/2-(all.minY+all.maxY)/2*scale;
 const overlap=c.decoration.id!=='none'&&deco.y+decoBottom*radius/50>bodyTop;
 return {scale,tx,ty,word:w,deco,line,leaving,rotation,start:turn(start),tail:turn(tail),overlap};
}
