import {pointAt,pointBounds,sampleCubic,union,type Box,type Curve,type Point} from '../src/geometry';
import {blink} from '../src/motion';
import {decorationPaths} from '../src/decorations';
import {asBrushConfig,canvasSize,clamp,defaultWebConfig,type PersonConfig,type WebConfig} from './model';
import {appendCapsules,brushProgress,buildWebBrush,joinCurves,strokeAt,visibleSamples,type InkSample,type PreparedBrush,type PreparedStroke} from './brush-engine';
import {cuteDecorationPaths,catEarAnchors} from './cute-elements';
import {continuousMotionTiming,prepareContinuousMotion,drawContinuousInk,drawContinuousParticles,type ContinuousMotion,type ContinuousGroup} from './continuous-motion';
import {isDecorationId} from './decoration-catalog';
import {referenceDecorationPaths} from './reference-decorations';

type Phase={start:number;end:number};
type Plan={lead:Phase;writing:Phase;returning:Phase;underline:Phase;leaving:Phase;decoration:Phase;reaction:Phase;wink:Phase;outro:Phase;activeEnd:number;introOutroEnabled:boolean};
export type Hit={index:0|1;target:'signature'|'decoration'};
export type HitArea=Hit&{bounds:Box};
type DecoStroke={id:string;curve?:Curve;eye?:Point;width:number;profile?:string;color?:string;filled?:boolean};
type PreparedDecoration={center:Point;radius:number;strokes:DecoStroke[];bounds:Box;earRoots?:{left:Point;right:Point}};
type PersonScene={index:0|1;config:PersonConfig;brush:PreparedBrush;plan:Plan;baseScale:number;scale:number;angle:number;tx:number;ty:number;center:Point;anchor:Point;decoration:PreparedDecoration;bounds:Box;signatureBounds:Box};
export type PreparedScene={width:number;height:number;duration:number;editingTime:number;hitAreas:HitArea[];warnings:string[];people:PersonScene[];continuous:ContinuousMotion|null;config:WebConfig};
const TAU=Math.PI*2;
const smooth=(n:number)=>{const u=clamp(n,0,1);return u*u*(3-2*u);};
const expand=(b:Box,pad:number):Box=>({minX:b.minX-pad,minY:b.minY-pad,maxX:b.maxX+pad,maxY:b.maxY+pad});
const corners=(b:Box):Point[]=>[{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}];
const rotate=(p:Point,a:number):Point=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});
const world=(p:Point,g:Pick<PersonScene,'angle'|'scale'|'tx'|'ty'>):Point=>{const q=rotate(p,g.angle);return {x:q.x*g.scale+g.tx,y:q.y*g.scale+g.ty};};
const worldBox=(b:Box,g:Pick<PersonScene,'angle'|'scale'|'tx'|'ty'>):Box=>pointBounds(corners(b).map(p=>world(p,g)));
const shiftBox=(b:Box,x:number,y:number):Box=>({minX:b.minX+x,minY:b.minY+y,maxX:b.maxX+x,maxY:b.maxY+y});

function effectivePerson(source:PersonConfig,enabled:boolean):PersonConfig{
 const person=structuredClone(source);
 // Geometry presets are fixed; only the visible size and position compose the scene.
 person.font={...person.font,family:'tyx-brush',size:240,penWidth:source.font.penWidth,pressure:.85,initialScale:1.15,initialOffsetX:0,initialOffsetY:0,terminalLength:1};
 if(!isDecorationId(person.decoration.id))person.decoration.id='none';
 person.decoration={...person.decoration,action:'wink',earFold:true,playful:true};
 person.underline={enabled:false,lift:false};
 person.comet={...person.comet,enabled:false,size:1.4};
 person.position.rotation=-6;
 return person;
}
function makePlan(config:WebConfig,person:PersonConfig):Plan{
 const enabled=config.animation.introOutroEnabled,lead=enabled?continuousMotionTiming.intro:0,outroStart=enabled?config.timing.duration-continuousMotionTiming.outro:config.timing.duration;
 const coreDuration=Math.max(.01,outroStart-lead),hold=enabled?0:Math.min(config.timing.hold,Math.max(1/30,coreDuration-1.4)),available=coreDuration-hold;
 const ornament=config.people.slice(0,config.mode==='couple'?2:1).some(p=>p.decoration.id!=='none'&&isDecorationId(p.decoration.id));
 // Use the active interval for writing followed by ornament drawing and reaction.
 const extra=ornament?(enabled?Math.min(.78,available*.28):available*.32):0,writingDuration=available-extra,writing={start:lead,end:lead+writingDuration};
 const decoration={start:writing.end,end:writing.end+extra*.74},reaction={start:decoration.end,end:decoration.end+extra*.26},empty={start:writing.end,end:writing.end};
 return {lead:{start:0,end:lead},writing,returning:empty,underline:empty,leaving:empty,decoration,reaction,wink:reaction,outro:{start:outroStart,end:config.timing.duration},activeEnd:outroStart,introOutroEnabled:enabled};
}

function flattenPath(data:string):Curve{
 const tokens=data.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)??[];let i=0,current={x:0,y:0},origin=current;const curves:Curve[]=[];
 const number=()=>Number(tokens[i++]);
 while(i<tokens.length){
  const op=tokens[i++];
  if(op==='M'){current={x:number(),y:number()};origin=current;}
  else if(op==='L'){const end={x:number(),y:number()};curves.push(sampleCubic(current,current,end,end,20));current=end;}
  else if(op==='C'){const a={x:number(),y:number()},b={x:number(),y:number()},end={x:number(),y:number()};curves.push(sampleCubic(current,a,b,end,40));current=end;}
  else if(op==='Q'){const q={x:number(),y:number()},end={x:number(),y:number()};curves.push(sampleCubic(current,{x:current.x+(q.x-current.x)*2/3,y:current.y+(q.y-current.y)*2/3},{x:end.x+(q.x-end.x)*2/3,y:end.y+(q.y-end.y)*2/3},end,40));current=end;}
  else if(op==='Z'){curves.push(sampleCubic(current,current,origin,origin,12));current=origin;}
  else throw new Error('装饰笔迹无法读取');
 }
 return joinCurves(curves);
}
const ornamentSources:Record<string,readonly (DecoStroke&{d?:string})[]>={sun:decorationPaths.sun,heart:decorationPaths.heart,star:decorationPaths.star,'cat-ears':cuteDecorationPaths['cat-ears'],dog:cuteDecorationPaths.dog,paw:cuteDecorationPaths.paw,...referenceDecorationPaths};
const ornamentCache=new Map<string,DecoStroke[]>();
function ornamentStrokes(id:string):DecoStroke[]{
 const cached=ornamentCache.get(id);if(cached)return cached;
 const strokes=(ornamentSources[id]??[]).map(s=>({id:s.id,width:s.width,profile:s.profile,color:s.color,filled:s.filled,eye:s.eye,curve:s.curve??(s.d?flattenPath(s.d):undefined)}));ornamentCache.set(id,strokes);return strokes;
}
function mapCurve(curve:Curve,transform:(point:Point)=>Point):Curve{
 let length=0;const points:Curve['points']=[];
 for(const point of curve.points){const p=transform(point),last=points.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({...p,length});}return {points,length};
}
function strokeBounds(strokes:readonly DecoStroke[]):Box{
 const points=strokes.flatMap(s=>(s.curve?.points??(s.eye?[s.eye]:[])).flatMap(p=>[{x:p.x-s.width,y:p.y-s.width},{x:p.x+s.width,y:p.y+s.width}]));
 return points.length?pointBounds(points):{minX:0,minY:0,maxX:0,maxY:0};
}
function prepareDecoration(person:PersonConfig,brush:PreparedBrush):PreparedDecoration{
 const b=brush.box,w=b.maxX-b.minX,size=240,radius=clamp(w*.10,size*.17,size*.33)*person.decoration.scale;
 const source=ornamentStrokes(person.decoration.id),bounds=strokeBounds(source),unit=radius/50;
 let center={x:(b.minX+b.maxX)/2,y:b.minY-(bounds.maxY+8)*unit-size*.09},strokes=source,earRoots:PreparedDecoration['earRoots'];
 if(person.decoration.id==='cat-ears'){
  center={x:(b.minX+b.maxX)/2,y:b.minY};
  const ink=brush.strokes.flatMap(s=>s.samples),anchor=(left:boolean):Point=>{
   const x=left?b.minX+w*.13:b.maxX-w*.13,near=ink.filter(p=>Math.abs(p.x-x)<radius*.65),top=near.length?Math.min(...near.map(p=>p.y-p.radius)):b.minY;
   return {x:(x-center.x)/unit,y:(top-size*.025-center.y)/unit};
  };
  earRoots={left:anchor(true),right:anchor(false)};const roots=earRoots;
  strokes=source.map(s=>{const left=s.id.startsWith('left'),from=left?catEarAnchors.left:catEarAnchors.right,to=left?roots.left:roots.right;return {...s,curve:s.curve?mapCurve(s.curve,p=>({x:p.x-from.x+to.x,y:p.y-from.y+to.y})):undefined};});
 }
 return {center,radius,strokes,bounds:expand(strokeBounds(strokes),person.decoration.id==='sun'?3:13),earRoots};
}
const brushCache=new Map<string,PreparedBrush>();
function prepareBrush(person:PersonConfig,config:WebConfig):PreparedBrush{
 const key=person.name,cached=brushCache.get(key);if(cached){brushCache.delete(key);brushCache.set(key,cached);return cached;}
 const referencePerson={...person,font:{...person.font,penWidth:1}};
 const brush=buildWebBrush(asBrushConfig(referencePerson,config),'classic','tyx-brush');brushCache.set(key,brush);if(brushCache.size>12)brushCache.delete(brushCache.keys().next().value!);return brush;
}

export function prepareScene(input:WebConfig):PreparedScene{
 const config=structuredClone(input),{width,height}=canvasSize(config.canvas.aspect),count=config.mode==='couple'?2:1,warnings:string[]=[],hitAreas:HitArea[]=[];
 const people:PersonScene[]=config.people.slice(0,count).map((source,index)=>{
  const person=effectivePerson(source,config.animation.introOutroEnabled),brush=prepareBrush(person,config),b=brush.box,size=240,w=b.maxX-b.minX,h=b.maxY-b.minY,plan=makePlan(config,person),decoration=prepareDecoration(person,brush);
  const anchor={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},angle=-6*Math.PI/180;
  // This reference is only a function of fixed glyph geometry and the artboard.
  // A size change scales around the ink center; ornaments/toggles never recenter it.
  const reference=expand(b,size*.62),rotated=pointBounds(corners(reference).map(p=>rotate(p,angle))),slotWidth=width*(count===2?.45:.88),slotHeight=height*.80;
  const bodyHeight=Math.min(height*(count===2?.24:.30),width*(count===2?.17:.36));
  const baseScale=Math.min(slotWidth/(rotated.maxX-rotated.minX),slotHeight/(rotated.maxY-rotated.minY),bodyHeight/Math.max(1,h));
  const scale=baseScale*person.position.scale,center={x:width*(count===2?(index===0?.255:.745):.5)+person.position.x*width,y:height*.53+person.position.y*height},turn=rotate(anchor,angle),tx=center.x-turn.x*scale,ty=center.y-turn.y*scale;
  const signatureBounds=b;
  const group:PersonScene={index:index as 0|1,config:person,brush,plan,baseScale,scale,angle,tx,ty,center,anchor,decoration,bounds:b,signatureBounds};
  const inkPad=person.glow.enabled?person.glow.radius*2.2:0;
  const widthPad=Math.max(0,person.font.penWidth-1)*Math.max(...brush.strokes.flatMap(stroke=>stroke.samples.map(sample=>sample.radius)));
  const boxes=[expand(worldBox(signatureBounds,group),(inkPad+widthPad)*scale)];
  hitAreas.push({index:group.index,target:'signature',bounds:expand(worldBox(b,group),14+widthPad*scale)});
  if(person.decoration.id!=='none'){
   const d=decoration,k=d.radius/50,local={minX:d.center.x+d.bounds.minX*k,minY:d.center.y+d.bounds.minY*k,maxX:d.center.x+d.bounds.maxX*k,maxY:d.center.y+d.bounds.maxY*k};
   const bounds=shiftBox(worldBox(local,group),person.decoration.offsetX*width,person.decoration.offsetY*height);boxes.push(expand(bounds,inkPad*scale));hitAreas.push({index:group.index,target:'decoration',bounds});
  }
  group.bounds=union(boxes);
  if(group.bounds.minX<8||group.bounds.minY<8||group.bounds.maxX>width-8||group.bounds.maxY>height-8)warnings.push(`第 ${index+1} 组接近画布边缘，可缩小一点或拖回画面。`);
  return group;
 });
 const editingTime=config.animation.introOutroEnabled?Math.max(0,config.timing.duration-continuousMotionTiming.outro):config.timing.duration;
 const continuous=config.animation.introOutroEnabled?prepareContinuousMotion(people.flatMap(group=>{const ornament=continuousDecoration(group,width,height);return ornament?[group,ornament]:[group];}),width,height):null;
 return {width,height,duration:config.timing.duration,editingTime,hitAreas,warnings,people,continuous,config};
}
export function hitTest(scene:PreparedScene,x:number,y:number):Hit|null{
 for(const area of [...scene.hitAreas].sort((a,b)=>(a.target==='decoration'?0:1)-(b.target==='decoration'?0:1))){const b=area.bounds;if(x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY)return {index:area.index,target:area.target};}return null;
}

function fillInk(context:CanvasRenderingContext2D,person:PersonConfig,scale:number,path:Path2D,time:number,color?:string):void{
 if(person.glow.enabled&&person.glow.strength>0){const breath=1+.04*Math.sin(time*1.65),inherited=context.globalAlpha,glow=color??person.glow.color;context.save();context.fillStyle=glow;context.shadowColor=glow;context.shadowBlur=person.glow.radius*scale;context.globalAlpha=inherited*person.glow.strength*.46*breath;context.fill(path);context.shadowBlur=person.glow.radius*scale*.28;context.globalAlpha=inherited*person.glow.strength*.22*breath;context.fill(path);context.restore();}
 context.fillStyle=color??person.ink.color;context.fill(path);
}
const strokePaths=new WeakMap<PreparedStroke,Map<number,Path2D>>(),prefixPaths=new WeakMap<PreparedBrush,Map<number,{count:number;path:Path2D}>>();
function appendStroke(path:Path2D,stroke:PreparedStroke,p:number,pressure:number,penWidth:number):void{
 if(stroke.dot){const a=pointAt(stroke.curve,.5),r=stroke.width*.32*Math.sqrt(p)*penWidth,angle=Math.PI*.195;path.moveTo(a.x+r*.8*Math.cos(angle),a.y+r*.8*Math.sin(angle));path.ellipse(a.x,a.y,r*.8,r*1.25,angle,0,TAU,true);}
 else{const samples=visibleSamples(stroke,p,pressure);appendCapsules(path,penWidth===1?samples:samples.map(sample=>({...sample,radius:sample.radius*penWidth})));}
}
function finishedPath(stroke:PreparedStroke,pressure:number,penWidth:number):Path2D{
 let widths=strokePaths.get(stroke);if(!widths){widths=new Map();strokePaths.set(stroke,widths);}
 let path=widths.get(penWidth);if(!path){path=new Path2D();appendStroke(path,stroke,1,pressure,penWidth);widths.set(penWidth,path);if(widths.size>3)widths.delete(widths.keys().next().value!);}return path;
}
function handwritingTime(group:PersonScene,time:number):number{const p=group.plan.writing,u=clamp((time-p.start)/(p.end-p.start),0,1);return clamp(u+.022*Math.sin(TAU*u)-.012*Math.sin(TAU*2*u),0,1)*group.brush.duration;}
function drawBrush(context:CanvasRenderingContext2D,group:PersonScene,time:number):void{
 const natural=handwritingTime(group,time),{brush,config}=group,penWidth=config.font.penWidth;let count=0;
 while(count<brush.strokes.length&&natural>=brush.strokes[count].start+brush.strokes[count].duration)count++;
 let widths=prefixPaths.get(brush);if(!widths){widths=new Map();prefixPaths.set(brush,widths);}
 let prefix=widths.get(penWidth);if(!prefix||prefix.count>count)prefix={count:0,path:new Path2D()};for(let i=prefix.count;i<count;i++)prefix.path.addPath(finishedPath(brush.strokes[i],config.font.pressure,penWidth));prefix.count=count;widths.set(penWidth,prefix);if(widths.size>3)widths.delete(widths.keys().next().value!);
 let path=prefix.path;const active=brush.strokes[count];if(active){const p=brushProgress((natural-active.start)/active.duration);if(p>0){path=new Path2D(prefix.path);appendStroke(path,active,p,config.font.pressure,penWidth);}}
 fillInk(context,config,group.scale,path,time);
}
function curveInk(curve:Curve,p:number,width:number,profile='brush',offset:Point={x:0,y:0}):InkSample[]{
 if(p<=0)return [];const count=Math.max(1,Math.ceil(curve.length*p/2));return Array.from({length:count+1},(_,i)=>{const u=p*i/count,a=pointAt(curve,u),w=profile==='round'?1:profile==='line'?Math.max(.025,Math.sin(Math.PI*Math.pow(u,.82)))*(.75+.25*u):profile==='taper'?Math.max(.025,(1-u)**.7):.28+.72*Math.sin(Math.PI*u)**.7;return {x:a.x+offset.x*smooth(u),y:a.y+offset.y*smooth(u),u,radius:Math.max(.02,width*.5*w)};});
}

const decoSchedules=new WeakMap<PreparedDecoration,Phase[]>();
function decorationSchedule(d:PreparedDecoration):Phase[]{
 const cached=decoSchedules.get(d);if(cached)return cached;const weights=d.strokes.map(s=>s.curve?Math.max(2.5,s.curve.length**.78):3.3),sum=weights.reduce((a,b)=>a+b,0)||1;let clock=0;const phases=weights.map(w=>{const start=clock;clock+=w/sum;return {start,end:clock};});decoSchedules.set(d,phases);return phases;
}
type DecorationMesh={strokes:PreparedStroke[];sources:Map<string,DecoStroke>};
// Meshes depend only on authored local strokes, not position, paint or timing.
// Fixed ornaments share these source arrays across scenes and picker thumbnails.
const decorationMeshes=new WeakMap<readonly DecoStroke[],DecorationMesh>();
function sampleRadius(stroke:PreparedStroke,u:number):number{
 const at=clamp(u,0,1)*(stroke.samples.length-1),index=Math.floor(at),next=Math.min(index+1,stroke.samples.length-1);return stroke.samples[index].radius+(stroke.samples[next].radius-stroke.samples[index].radius)*(at-index);
}
function partialDecorationSamples(stroke:PreparedStroke,p:number):InkSample[]{
 if(p<=0)return [];if(p>=1)return stroke.samples;
 const samples=stroke.samples.filter(sample=>sample.u<p);samples.push({...pointAt(stroke.curve,p),u:p,radius:sampleRadius(stroke,p)});return samples;
}
/** Filled marks use the same small capsules in every render path, including morphing. */
function filledDecorationParts(points:readonly Point[]):{curve:Curve;samples:InkSample[]}[]{
 if(points.length<3)return [];
 const bounds=pointBounds([...points]),rows=Math.max(1,Math.ceil((bounds.maxY-bounds.minY)/.7)),step=(bounds.maxY-bounds.minY)/rows;if(step<=0)return [];
 const parts:{curve:Curve;samples:InkSample[]}[]=[];
 for(let row=0;row<rows;row++){
  const y=bounds.minY+(row+.5)*step,crossings:number[]=[];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))crossings.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
  crossings.sort((a,b)=>a-b);
  for(let i=0;i+1<crossings.length;i+=2){
   const left=crossings[i],right=crossings[i+1],radius=Math.min(step*.56,(right-left)/2);if(radius<=.001)continue;
   const a={x:left+radius,y},b={x:Math.max(left+radius+.0001,right-radius),y},length=Math.hypot(b.x-a.x,b.y-a.y),curve:Curve={points:[{...a,length:0},{...b,length}],length};
   parts.push({curve,samples:[{...a,u:0,radius},{...b,u:1,radius}]});
  }
 }
 return parts;
}
function decorationMesh(d:PreparedDecoration):DecorationMesh{
 const cached=decorationMeshes.get(d.strokes);if(cached)return cached;
 const schedule=decorationSchedule(d),strokes:PreparedStroke[]=[],sources=new Map<string,DecoStroke>();
 d.strokes.forEach((source,index)=>{
  const phase=schedule[index];let parts:{curve:Curve;samples:InkSample[]}[]=[];
  if(source.eye){const radius=source.width/2;parts=filledDecorationParts(Array.from({length:48},(_,i)=>({x:source.eye!.x+radius*Math.cos(TAU*i/48),y:source.eye!.y+radius*Math.sin(TAU*i/48)})));}
  else if(source.curve)parts=source.filled?filledDecorationParts(source.curve.points):[{curve:source.curve,samples:curveInk(source.curve,1,source.width,source.profile)}];
  parts.forEach((part,partIndex)=>{
   const id=parts.length===1?source.id:`${source.id}~${partIndex}`,start=phase.start+(phase.end-phase.start)*partIndex/parts.length,duration=Math.max(.000001,(phase.end-phase.start)/parts.length);
   strokes.push({id,char:'',index:strokes.length,curve:part.curve,samples:part.samples,start,duration,width:source.width,position:'punctuation',dot:false});sources.set(id,source);
  });
 });
 const mesh={strokes,sources};decorationMeshes.set(d.strokes,mesh);return mesh;
}
const around=(p:Point,anchor:Point,angle:number):Point=>{const q=rotate({x:p.x-anchor.x,y:p.y-anchor.y},angle);return {x:q.x+anchor.x,y:q.y+anchor.y};};
const beat=(u:number)=>u<=0||u>=1?0:Math.sin(Math.PI*u)**2;
const spring=(u:number)=>u<=0||u>=1?0:Math.sin(TAU*u)*Math.sin(Math.PI*u)**2;
const eyeCenters=new WeakMap<PreparedDecoration,Map<string,Point>>();
function eyeCenter(d:PreparedDecoration,id:string):Point|undefined{
 let centers=eyeCenters.get(d);if(!centers){centers=new Map();for(const stroke of d.strokes){if(!stroke.id.includes('eye'))continue;const bounds=stroke.curve?pointBounds(stroke.curve.points):null,center=stroke.eye??(bounds?{x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2}:null);if(center)centers.set(stroke.id,center);}eyeCenters.set(d,centers);}return centers.get(id);
}
function reactionPoint(group:PersonScene,id:string,p:Point,time:number):Point{
 const phase=group.plan.reaction;if(time<=phase.start||time>=phase.end||phase.end<=phase.start)return p;
 const u=(time-phase.start)/(phase.end-phase.start),kind=group.config.decoration.id,left=id.startsWith('left'),side=left?1:-1;
 const eye=id.includes('right')?eyeCenter(group.decoration,id):undefined;if(eye)p={x:p.x,y:eye.y+(p.y-eye.y)*Math.max(.12,1-blink(time,phase))};
 if(kind==='cat-ears'&&id.includes('ear')){const anchor=left?group.decoration.earRoots!.left:group.decoration.earRoots!.right;return around(p,anchor,side*.22*spring(clamp((u-(left?0:.13))/.85,0,1)));}
 if(kind==='dog'||kind==='puppy-face'){let q=p;if(id.includes('floppy-ear')||id.includes('ear'))q=around(q,left?{x:-34,y:-22}:{x:38,y:-20},side*.20*spring(clamp((u-(left?0:.11))/.86,0,1)));return around(q,{x:0,y:16},-.055*beat(u));}
 if(kind==='rabbit-face'&&id.includes('ear'))return around(p,left?{x:-19,y:-21}:{x:19,y:-21},side*.13*spring(clamp((u-(left?0:.1))/.88,0,1)));
 if(kind==='cat-round'||kind==='cat-squint'||kind==='panda-face')return around(p,{x:0,y:27},-.045*beat(u));
 if(kind==='paw-wave'||kind==='paw-striped'||kind==='paw-beans')return around(p,{x:0,y:48},.12*spring(u));
 if(kind.startsWith('face-')&&id.includes('sweat'))return {x:p.x+.6*beat(u),y:p.y+3*beat(u)};
 if(kind==='paw'){const press=beat(u);return {x:p.x*(1+.065*press),y:55+(p.y-55)*(1-.10*press)+3*press};}
 if(kind==='heart'){const pulse=beat(u);return {x:p.x*(1+.055*pulse),y:p.y*(1+.08*pulse)};}
 if(kind==='star'){const pulse=beat(u);return around({x:p.x*(1+.05*pulse),y:p.y*(1+.05*pulse)},{x:0,y:0},.065*spring(u));}
 return p;
}
export function decorationPoint(scene:PreparedScene,index:0|1,strokeId:string,u:number,time:number):Point|null{
 const group=scene.people.find(g=>g.index===index),stroke=group?.decoration.strokes.find(s=>s.id===strokeId);if(!group||!stroke)return null;const raw=stroke.curve?pointAt(stroke.curve,clamp(u,0,1)):stroke.eye;if(!raw)return null;const p=reactionPoint(group,stroke.id,raw,time),d=group.decoration,q=world({x:d.center.x+p.x*d.radius/50,y:d.center.y+p.y*d.radius/50},group);return {x:q.x+group.config.decoration.offsetX*scene.width,y:q.y+group.config.decoration.offsetY*scene.height};
}
function drawDecoration(context:CanvasRenderingContext2D,scene:Pick<PreparedScene,'width'|'height'>,group:PersonScene,time:number):void{
 const {decoration:d,config,plan}=group;if(!d.strokes.length||time<plan.decoration.start)return;
 const center=world(d.center,group),scale=d.radius/50*group.scale,mesh=decorationMesh(d),phase=plan.decoration,u=phase.end<=phase.start?(time>=phase.end?1:0):clamp((time-phase.start)/(phase.end-phase.start),0,1),natural=clamp(u+.022*Math.sin(TAU*u)-.012*Math.sin(TAU*2*u),0,1),paths=new Map<string,Path2D>();
 context.save();context.translate(center.x+config.decoration.offsetX*scene.width,center.y+config.decoration.offsetY*scene.height);context.rotate(group.angle);context.scale(scale,scale);
 for(const stroke of mesh.strokes){
  const p=brushProgress((natural-stroke.start)/stroke.duration);if(p<=0)continue;const source=mesh.sources.get(stroke.id)!,key=source.color??'',path=paths.get(key)??new Path2D();paths.set(key,path);
  appendCapsules(path,partialDecorationSamples(stroke,p).map(sample=>({...sample,...reactionPoint(group,source.id,sample,time)})));
 }
 for(const [color,path] of paths)fillInk(context,config,group.scale,path,time,color||undefined);context.restore();
}

/** Catalog previews paint the actual ornament at its completed, resting pose. */
export function renderDecorationThumbnail(canvas:HTMLCanvasElement,id:string,source:PersonConfig,background:string):void{
 const context=canvas.getContext('2d',{alpha:false});if(!context)return;
 const width=canvas.width,height=canvas.height;
 context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.shadowBlur=0;context.fillStyle=background;context.fillRect(0,0,width,height);
 if(!isDecorationId(id)||id==='none'||width<=0||height<=0)return;
 const config=defaultWebConfig();config.animation.introOutroEnabled=false;
 const person=effectivePerson(source,false);person.decoration={...person.decoration,id,offsetX:0,offsetY:0};
 const brush=prepareBrush(person,config),decoration=prepareDecoration(person,brush);if(!decoration.strokes.length)return;
 const bounds=strokeBounds(decoration.strokes),padding=Math.max(10,Math.min(width,height)*.12),fit=Math.min((width-padding*2)/Math.max(1,bounds.maxX-bounds.minX),(height-padding*2)/Math.max(1,bounds.maxY-bounds.minY)),unit=decoration.radius/50,scale=fit/Math.max(.001,unit),center={x:width/2,y:height/2};
 const group:PersonScene={index:0,config:person,brush,plan:makePlan(config,person),baseScale:scale,scale,angle:0,tx:center.x-decoration.center.x*scale-(bounds.minX+bounds.maxX)*fit/2,ty:center.y-decoration.center.y*scale-(bounds.minY+bounds.maxY)*fit/2,center,anchor:{x:0,y:0},decoration,bounds,signatureBounds:brush.box};
 drawDecoration(context,{width,height},group,config.timing.duration);
}

// Optional ornament ink joins the same source mesh, so it cannot remain behind
// or pop away when the signature contracts into the five reference colors.
function continuousDecoration(group:PersonScene,width:number,height:number):ContinuousGroup|null{
 const d=group.decoration;if(!d.strokes.length)return null;const mesh=decorationMesh(d),strokes=mesh.strokes;
 const center=world(d.center,group),unit=d.radius/50;
 const brush:PreparedBrush={strokes,duration:1,box:d.bounds,guide:group.brush.guide};
 return {index:group.index,brush,scale:group.scale*unit,angle:group.angle,tx:center.x+group.config.decoration.offsetX*width,ty:center.y+group.config.decoration.offsetY*height,center:group.center,plan:{writing:group.plan.decoration,outro:group.plan.outro},config:{...group.config,font:{...group.config.font,penWidth:1},glow:{...group.config.glow,radius:group.config.glow.radius/Math.max(.01,unit)}},particles:false,
  radiusAt:sampleRadius,colorAt:stroke=>mesh.sources.get(stroke.id)?.color,
  deformPoint:(id,p,time)=>reactionPoint(group,mesh.sources.get(id)?.id??id,p,time),deformPhase:group.plan.reaction};
}

function localPen(group:PersonScene,time:number):Point|null{
 const {plan,brush}=group;if(time<plan.writing.start||time>=plan.writing.end)return null;
 if(time<plan.writing.end){const natural=handwritingTime(group,time),active=strokeAt(brush,natural),next=brush.strokes[brush.strokes.indexOf(active.stroke)+1];if(next&&natural>active.stroke.start+active.stroke.duration+.012&&natural<next.start)return null;return active.point;}
 return null;
}
export function penPosition(scene:PreparedScene,index:0|1,time:number):Point|null{const group=scene.people.find(g=>g.index===index);if(!group)return null;const p=localPen(group,time);return p?world(p,group):null;}
function drawEffects(context:CanvasRenderingContext2D,scene:PreparedScene,time:number):void{
 const effects=scene.config.effects;if(!scene.config.animation.introOutroEnabled||!effects.sparkles||effects.intensity<=0)return;
 for(const group of scene.people){const amount=smooth((time-group.plan.writing.end)/.6)*effects.intensity;if(amount<=0)continue;const b=group.brush.box,w=b.maxX-b.minX,h=b.maxY-b.minY,points=[{x:b.minX-w*.08,y:b.minY-h*.22},{x:b.maxX+w*.11,y:b.minY-h*.35},{x:b.minX+w*.47,y:b.minY-h*.55}];context.save();context.translate(group.tx,group.ty);context.rotate(group.angle);context.scale(group.scale,group.scale);for(let i=0;i<points.length;i++){const p=points[i],pulse=((Math.sin(time*(1.3+i*.17)+i*2.1+group.index*.7)+1)/2)**2,r=240*(.008+.005*pulse);context.globalAlpha=amount*(.13+.37*pulse);context.fillStyle=['#ffd1e3','#fff9ff','#c8d8ff'][i];context.shadowColor=context.fillStyle;context.shadowBlur=240*.025*group.scale;context.beginPath();context.moveTo(p.x-r,p.y);context.quadraticCurveTo(p.x,p.y,p.x,p.y-r*1.5);context.quadraticCurveTo(p.x,p.y,p.x+r,p.y);context.quadraticCurveTo(p.x,p.y,p.x,p.y+r*1.5);context.quadraticCurveTo(p.x,p.y,p.x-r,p.y);context.fill();}context.restore();}
}
export function renderScene(canvas:HTMLCanvasElement,scene:PreparedScene,time:number,complete=false):void{
 if(canvas.width!==scene.width)canvas.width=scene.width;if(canvas.height!==scene.height)canvas.height=scene.height;const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('当前浏览器无法创建签名画布，请换用系统浏览器。');const t=complete?scene.editingTime:clamp(Number.isFinite(time)?time:0,0,scene.duration);
 const enabled=scene.config.animation.introOutroEnabled;
 context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.shadowBlur=0;context.fillStyle=scene.config.canvas.background;context.fillRect(0,0,scene.width,scene.height);
 if(enabled&&scene.continuous){drawContinuousInk(context,scene.continuous,t,scene.duration);if(!complete)drawContinuousParticles(context,scene.continuous,t,scene.duration);return;}
 for(const group of scene.people){context.save();context.translate(group.tx,group.ty);context.rotate(group.angle);context.scale(group.scale,group.scale);drawBrush(context,group,t);context.restore();drawDecoration(context,scene,group,t);}
}
