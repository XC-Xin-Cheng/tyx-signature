import {pointAt,type Point} from '../src/geometry';
import {appendCapsules,brushProgress,inkRadius,strokeAt,type InkSample,type PreparedBrush,type PreparedStroke} from './brush-engine';
import {ribbonReference} from './ribbon-reference';
import {referenceParticleTracks,referenceFishOutline,referenceEntryArcOutline,referenceDropletOutline,referenceBubbleOutline,referenceConnection,arcConnection,referenceRightGroup} from './particle-reference';

type Phase={start:number;end:number};
export type ContinuousGroup={index:0|1;brush:PreparedBrush;scale:number;angle:number;tx:number;ty:number;center:Point;plan:{writing:Phase;outro:Phase};config:{font:{penWidth:number;pressure:number};ink:{color:string};glow:{enabled:boolean;color:string;strength:number;radius:number}};particles?:boolean;radiusAt?:(stroke:PreparedStroke,u:number)=>number;colorAt?:(stroke:PreparedStroke)=>string|undefined;deformPoint?:(id:string,p:Point,time:number)=>Point;deformRadius?:(id:string,time:number)=>number;deformPhase?:Phase};
type Vertex=InkSample&{strokeU:number;targetU:number};
type InkChunk={id:number;group:ContinuousGroup;stroke:PreparedStroke;from:number;to:number;part:number;vertices:Vertex[];fullPath?:Path2D};
type RibbonKey={frame:number;center:Point;centerline:Point[];widths:number[];opacity:number};
type RibbonPart={id:string;color:string;keys:RibbonKey[];length:number;bucket:number;start:number;end:number;shadow:{color:string;offsetX:number;offsetY:number;opacity:number}};
export type ContinuousMotion={groups:ContinuousGroup[];width:number;height:number;chunks:InkChunk[];parts:RibbonPart[]};
type ParticleKey={frame:number;x:number;y:number;radius?:number;rotation?:number;opacity?:number;color?:string;trimStart?:number;trimEnd?:number;strokeWidth?:number;aspect?:number;fill?:number};
type ParticleTrack={id:string;kind:string;birth:number;death:number;keys:ParticleKey[];color?:string;attachToPen?:boolean;outline?:readonly Point[]};
const tracks=referenceParticleTracks as readonly ParticleTrack[];
const TAU=Math.PI*2;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=(n:number)=>{const u=clamp(n);return u*u*(3-2*u);};
const lerp=(a:number,b:number,u:number)=>a+(b-a)*u;
const mixPoint=(a:Point,b:Point,u:number):Point=>({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)});
const world=(p:Point,g:ContinuousGroup):Point=>({x:(p.x*Math.cos(g.angle)-p.y*Math.sin(g.angle))*g.scale+g.tx,y:(p.x*Math.sin(g.angle)+p.y*Math.cos(g.angle))*g.scale+g.ty});
export const continuousMotionTiming={intro:.8,outro:1.5,fps:30};

/** Only the middle stretches. One continuous source clock drives every object's lifetime. */
export function referenceFrameAt(time:number,duration:number):number{
 if(time<=.8)return Math.max(0,time)*30;
 const outro=duration-1.5;
 if(time>=outro)return 150+(time-outro)*30;
 return 24+(time-.8)/Math.max(.001,outro-.8)*126;
}
export function naturalInkTime(group:ContinuousGroup,time:number):number{
 const phase=group.plan.writing,u=clamp((time-phase.start)/(phase.end-phase.start));
 return clamp(u+.022*Math.sin(TAU*u)-.012*Math.sin(TAU*2*u))*group.brush.duration;
}
function lineLength(points:readonly Point[]):number{let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return length;}
function sampleLine(points:readonly Point[],u:number):Point{
 if(!points.length)return {x:0,y:0};if(points.length===1)return points[0];
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)!+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
 const target=clamp(u)*lengths.at(-1)!;let i=1;while(i<lengths.length-1&&lengths[i]<target)i++;return mixPoint(points[i-1],points[i],(target-lengths[i-1])/Math.max(.00001,lengths[i]-lengths[i-1]));
}
function resampleKey(source:RibbonKey,count=40):RibbonKey{
 const length=lineLength(source.centerline),cumulative=[0];for(let i=1;i<source.centerline.length;i++)cumulative.push(cumulative.at(-1)!+Math.hypot(source.centerline[i].x-source.centerline[i-1].x,source.centerline[i].y-source.centerline[i-1].y));
 const centerline:Point[]=[],widths:number[]=[];
 for(let j=0;j<count;j++){
  const at=length*j/(count-1);let i=1;while(i<cumulative.length-1&&cumulative[i]<at)i++;
  const a=Math.max(0,i-1),b=Math.min(source.centerline.length-1,i),u=(at-(cumulative[a]??0))/Math.max(.00001,(cumulative[b]??0)-(cumulative[a]??0));
  centerline.push(mixPoint(source.centerline[a]??{x:0,y:0},source.centerline[b]??{x:0,y:0},u));widths.push(lerp(source.widths[a]??0,source.widths[b]??0,u));
 }
 return {...source,centerline,widths};
}
function prepareParts():RibbonPart[]{
 const parts:RibbonPart[]=[];
 ribbonReference.ribbons.forEach((ribbon,bucket)=>{
  const members=ribbon.parts.map(part=>{const keys=part.keyframes.map(key=>resampleKey({...key,opacity:key.opacity??1}));return {id:`${ribbon.id}/${part.id}`,color:part.color??ribbon.color,keys,length:Math.max(1,...keys.filter(key=>key.opacity>0).map(key=>lineLength(key.centerline))),bucket,start:0,end:1,shadow:ribbon.shadow};});
  const sum=members.reduce((n,p)=>n+p.length,0)||1;let cursor=0;
  for(const member of members){member.start=cursor;cursor+=member.length/sum;member.end=cursor;parts.push(member);}
 });
 return parts;
}
const sourceParts=prepareParts();
function sourceVertex(group:ContinuousGroup,stroke:PreparedStroke,u:number,targetU:number):Vertex{
 const raw=stroke.dot?pointAt(stroke.curve,.5):pointAt(stroke.curve,u),point=world(raw,group);
 const radius=(group.radiusAt?group.radiusAt(stroke,u):inkRadius(stroke,u,group.config.font.pressure))*group.scale*group.config.font.penWidth;
 return {...point,radius:stroke.dot?radius*.88:radius,u,strokeU:u,targetU};
}

/** Every actual ink segment receives one permanent destination among the five color families. */
export function prepareContinuousMotion(groups:ContinuousGroup[],width:number,height:number):ContinuousMotion{
 const lengths=groups.flatMap(group=>group.brush.strokes.map(stroke=>({group,stroke,length:Math.max(stroke.curve.length,stroke.dot?stroke.width*2:1)*group.scale}))),total=lengths.reduce((sum,item)=>sum+item.length,0)||1;
 const chunks:InkChunk[]=[],parts=sourceParts;let cursor=0;
 for(const {group,stroke,length} of lengths){
  const begin=cursor/total,end=(cursor+length)/total;cursor+=length;
  for(let partIndex=0;partIndex<parts.length;partIndex++){
   const part=parts[partIndex],a=(part.bucket+part.start)/5,b=(part.bucket+part.end)/5,lo=Math.max(a,begin),hi=Math.min(b,end);if(hi<=lo)continue;
   const from=(lo-begin)/(end-begin),to=(hi-begin)/(end-begin),count=Math.max(2,Math.ceil(stroke.curve.length*(to-from)/1.7)),vertices:Vertex[]=[];
   for(let i=0;i<=count;i++){const u=lerp(from,to,i/count),global=lerp(begin,end,u);vertices.push(sourceVertex(group,stroke,u,(global-a)/(b-a)));}
   chunks.push({id:chunks.length,group,stroke,from,to,part:partIndex,vertices});
  }
 }
 return {groups,width,height,chunks,parts};
}

function visibleVertices(chunk:InkChunk,time:number):Vertex[]{
 const natural=naturalInkTime(chunk.group,time),p=brushProgress((natural-chunk.stroke.start)/chunk.stroke.duration);
 if(p<=0||p<chunk.from)return [];
 if(chunk.stroke.dot){const q=Math.sqrt(p),center=world(pointAt(chunk.stroke.curve,.5),chunk.group);return chunk.vertices.map(v=>({...v,x:center.x+(v.x-center.x)*q,y:center.y+(v.y-center.y)*q,radius:v.radius*q}));}
 if(p>=chunk.to){
  if(chunk.group.deformPoint&&chunk.group.deformPhase&&time>chunk.group.deformPhase.start&&time<chunk.group.deformPhase.end)return chunk.vertices.map(v=>({...v,...world(chunk.group.deformPoint!(chunk.stroke.id,pointAt(chunk.stroke.curve,v.strokeU),time),chunk.group),radius:v.radius*(chunk.group.deformRadius?.(chunk.stroke.id,time)??1)}));
  return chunk.vertices;
 }
 const visible=chunk.vertices.filter(v=>v.strokeU<p),u=(p-chunk.from)/(chunk.to-chunk.from),target=lerp(chunk.vertices[0].targetU,chunk.vertices.at(-1)!.targetU,u);visible.push(sourceVertex(chunk.group,chunk.stroke,p,target));return visible;
}
function hexMix(a:string,b:string,u:number):string{
 const read=(hex:string,index:number)=>parseInt(hex.slice(index,index+2),16)||0;return '#'+[1,3,5].map(index=>Math.round(lerp(read(a,index),read(b,index),u)).toString(16).padStart(2,'0')).join('');
}
function bracket<T extends {frame:number}>(keys:readonly T[],frame:number):{a:T;b:T;u:number}{
 let index=0;while(index<keys.length-1&&keys[index+1].frame<frame)index++;
 const a=keys[index],b=keys[Math.min(keys.length-1,index+1)];return {a,b,u:clamp((frame-a.frame)/Math.max(.00001,b.frame-a.frame))};
}
function partState(part:RibbonPart,frame:number):RibbonKey{
 const {a,b,u}=bracket(part.keys,frame);return {frame,center:mixPoint(a.center,b.center,u),opacity:lerp(a.opacity,b.opacity,u),centerline:a.centerline.map((p,index)=>mixPoint(p,b.centerline[index]??p,u)),widths:a.widths.map((w,index)=>lerp(w,b.widths[index]??w,u))};
}
function ribbonVertex(state:RibbonKey,u:number,motion:ContinuousMotion):InkSample{
 const at=clamp(u)*(state.centerline.length-1),index=Math.floor(at),next=Math.min(index+1,state.centerline.length-1),p=mixPoint(state.centerline[index],state.centerline[next],at-index),width=lerp(state.widths[index],state.widths[next],at-index),contain=Math.min(motion.width/ribbonReference.width,motion.height/ribbonReference.height);
 return {x:motion.width/2+(state.center.x+p.x)*contain,y:motion.height/2+(state.center.y+p.y)*contain,radius:Math.max(.015,width*contain/2),u};
}
function handoffScale(frame:number):number{
 const keys=[{frame:150,scale:1},{frame:155,scale:1.109},{frame:156,scale:1.12},{frame:158,scale:1.08},{frame:159,scale:1.052},{frame:160,scale:.884},{frame:161,scale:.363},{frame:162,scale:.22}],{a,b,u}=bracket(keys,frame);
 return lerp(a.scale,b.scale,ease(u));
}
function fillPath(context:CanvasRenderingContext2D,path:Path2D,color:string,glowColor:string,strength:number,radius:number,opacity=1):void{
 context.save();context.globalAlpha=opacity;
 if(strength>0){context.fillStyle=glowColor;context.shadowColor=glowColor;context.shadowBlur=radius;context.globalAlpha=opacity*strength*.43;context.fill(path);context.shadowBlur=radius*.25;context.globalAlpha=opacity*strength*.19;context.fill(path);}
 context.shadowBlur=0;context.globalAlpha=opacity;context.fillStyle=color;context.fill(path);context.restore();
}

/** The same prepared source vertices are painted before, during and after the morph. */
export function drawContinuousInk(context:CanvasRenderingContext2D,motion:ContinuousMotion,time:number,duration:number):void{
 const frame=referenceFrameAt(time,duration),morph=ease((frame-156)/6),outro=frame>=150,inkScale=outro?handoffScale(frame):1;
 const paths=new Map<string,{path:Path2D;color:string;glow:string;strength:number;radius:number;opacity:number}>();
 const shadows=new Map<string,{path:Path2D;part:RibbonPart;opacity:number}>();
 const states=outro?motion.parts.map(part=>partState(part,Math.max(162,Math.min(184,frame)))):[];
 const vanish=frame>184?clamp(185-frame):1;
 for(const chunk of motion.chunks){
  const source=visibleVertices(chunk,time);if(!source.length)continue;
  const part=motion.parts[chunk.part],style=chunk.group.config,accent=chunk.group.colorAt?.(chunk.stroke),sourceColor=accent??style.ink.color,sourceGlow=accent??style.glow.color,color=outro?hexMix(sourceColor,part.color,morph):sourceColor,key=morph>=1?part.id:`${chunk.group.index}/${part.id}/${color}`;
  const opacity=vanish*(outro?lerp(1,states[chunk.part].opacity,morph):1);if(opacity<=.0001)continue;
  let vertices:InkSample[]=source;
  if(outro)vertices=source.map(v=>{
   const center=chunk.group.center,sourcePoint={x:center.x+(v.x-center.x)*inkScale,y:center.y+(v.y-center.y)*inkScale},target=ribbonVertex(states[chunk.part],v.targetU,motion);
   return {...mixPoint(sourcePoint,target,morph),radius:lerp(v.radius*inkScale,target.radius,morph),u:v.u};
  });
  let entry=paths.get(key);
  if(!entry){entry={path:new Path2D(),color,glow:outro?hexMix(sourceGlow,part.color,morph):sourceGlow,strength:style.glow.enabled?style.glow.strength*(1-morph):0,radius:lerp(style.glow.radius*chunk.group.scale,0,morph),opacity};paths.set(key,entry);}
  if(!outro&&source===chunk.vertices){if(!chunk.fullPath){chunk.fullPath=new Path2D();appendCapsules(chunk.fullPath,chunk.vertices);}entry.path.addPath(chunk.fullPath);}
  else appendCapsules(entry.path,vertices);
  if(outro&&morph>0){let shadow=shadows.get(part.id);if(!shadow){shadow={path:new Path2D(),part,opacity};shadows.set(part.id,shadow);}appendCapsules(shadow.path,vertices);}
 }
 const contain=Math.min(motion.width/ribbonReference.width,motion.height/ribbonReference.height);
 for(const shadow of shadows.values()){context.save();context.translate(shadow.part.shadow.offsetX*contain*morph,shadow.part.shadow.offsetY*contain*morph);context.globalAlpha=shadow.opacity*shadow.part.shadow.opacity*morph;context.fillStyle=shadow.part.shadow.color;context.fill(shadow.path);context.restore();}
 for(const entry of paths.values())fillPath(context,entry.path,entry.color,entry.glow,entry.strength,entry.radius,entry.opacity);
}

function particleState(track:ParticleTrack,frame:number):ParticleKey|null{
 if(frame<track.birth||frame>track.death||!track.keys.length)return null;const {a,b,u}=bracket(track.keys,frame);
 return {frame,x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u),radius:lerp(a.radius??3,b.radius??3,u),rotation:lerp(a.rotation??0,b.rotation??0,u),opacity:lerp(a.opacity??1,b.opacity??1,u),color:a.color??b.color??track.color,trimStart:lerp(a.trimStart??0,b.trimStart??0,u),trimEnd:lerp(a.trimEnd??1,b.trimEnd??1,u),strokeWidth:lerp(a.strokeWidth??3,b.strokeWidth??3,u),aspect:lerp(a.aspect??1,b.aspect??1,u),fill:lerp(a.fill??0,b.fill??0,u)};
}
function penWorld(group:ContinuousGroup,time:number):{point:Point;stroke:PreparedStroke;progress:number}{
 const natural=naturalInkTime(group,time),pen=strokeAt(group.brush,natural);return {point:world(pen.point,group),stroke:pen.stroke,progress:pen.progress};
}
function firstInkShape(group:ContinuousGroup,count:number,from:number,to:number):Point[]{
 const stroke=group.brush.strokes[0],points:Point[]=[];
 for(let i=0;i<count;i++){const side=i<count/2?1:-1,at=i<count/2?i/(count/2-1):(count-1-i)/(count/2-1),u=lerp(from,to,at),p=pointAt(stroke.curve,u),a=pointAt(stroke.curve,Math.max(0,u-.01)),b=pointAt(stroke.curve,Math.min(1,u+.01)),d=Math.hypot(b.x-a.x,b.y-a.y)||1,r=inkRadius(stroke,u,group.config.font.pressure)*group.config.font.penWidth;points.push(world({x:p.x-(b.y-a.y)/d*r*side,y:p.y+(b.x-a.x)/d*r*side},group));}return points;
}
function tracePolygon(context:CanvasRenderingContext2D,points:readonly Point[]):void{if(!points.length)return;context.beginPath();context.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))context.lineTo(p.x,p.y);context.closePath();}

/** All tracks keep their own birth/death clock; finishing the intro clears no objects. */
export function drawContinuousParticles(context:CanvasRenderingContext2D,motion:ContinuousMotion,time:number,duration:number):void{
 const frame=referenceFrameAt(time,duration),contain=Math.min(motion.width/1920,motion.height/1080);
 for(const group of motion.groups){
  if(group.particles===false)continue;
  const start=world(group.brush.strokes[0].curve.points[0],group);
  for(const track of tracks){
   const state=particleState(track,frame);if(!state)continue;const radius=(state.radius??3)*contain,color=group.index===1&&track.kind==='fish'?referenceRightGroup.fishColor:state.color??(track.kind==='orb'||track.kind==='droplet'?'#76f4f4':'#fff8ff'),alpha=state.opacity??1;
   if(alpha<=0)continue;const center={x:start.x+state.x*contain,y:start.y+state.y*contain};
   context.save();context.globalAlpha=alpha;context.shadowColor=color;context.shadowBlur=radius*(track.kind==='orb'?2.1:1.2);context.fillStyle=color;context.strokeStyle=color;
   if(track.kind==='fish'){
    const connection=clamp((frame-referenceConnection.startFrame)/(referenceConnection.endFrame-referenceConnection.startFrame)),angle=state.rotation??0,shape=referenceFishOutline as readonly Point[],pen=penWorld(group,time),prefix=pen.stroke===group.brush.strokes[0]?Math.max(.008,Math.min(.24,pen.progress)):.24,target=firstInkShape(group,shape.length,0,prefix);
    const points=shape.map((p,i)=>{const x=p.x*radius,y=p.y*radius,raw={x:center.x+x*Math.cos(angle)-y*Math.sin(angle),y:center.y+x*Math.sin(angle)+y*Math.cos(angle)};return mixPoint(raw,target[i],ease(connection));});
    context.fillStyle=hexMix(color,group.config.ink.color,ease(connection));context.shadowBlur*=1-ease(connection);tracePolygon(context,points);context.fill();
   }else if(track.kind==='ribbon'){
    const connection=clamp((frame-arcConnection.startFrame)/(arcConnection.endFrame-arcConnection.startFrame)),polyline=referenceEntryArcOutline as readonly Point[],count=32,points:Point[]=[],pen=penWorld(group,time),prefix=pen.stroke===group.brush.strokes[0]?Math.max(.005,Math.min(.11,pen.progress)):.11;
    for(let i=0;i<count;i++){const u=lerp(state.trimStart??0,state.trimEnd??1,i/(count-1)),p=sampleLine(polyline,u),raw={x:start.x+(p.x+state.x)*contain,y:start.y+(p.y+state.y)*contain},target=world(pointAt(group.brush.strokes[0].curve,i/(count-1)*prefix),group);points.push(mixPoint(raw,target,ease(connection)));}
    context.lineCap='round';context.lineJoin='round';context.strokeStyle=hexMix(color,group.config.ink.color,ease(connection));context.shadowBlur*=1-ease(connection);context.lineWidth=lerp((state.strokeWidth??3)*contain,group.brush.strokes[0].width*group.scale*group.config.font.penWidth*.63,ease(connection));context.beginPath();context.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))context.lineTo(p.x,p.y);context.stroke();
   }else{
    context.translate(center.x,center.y);context.rotate(state.rotation??0);
    if(track.kind==='ring'){const shape=referenceBubbleOutline as readonly Point[],aspect=state.aspect??1;tracePolygon(context,shape.map(p=>({x:p.x*radius,y:p.y*radius*aspect})));context.lineWidth=Math.max(.7,radius*.14);context.globalAlpha=alpha*(1-(state.fill??0)*.45);context.stroke();if((state.fill??0)>0){context.globalAlpha=alpha*(state.fill??0);context.fill();}}
    else if(track.kind==='sparkle'){context.beginPath();context.moveTo(-radius,0);context.quadraticCurveTo(0,0,0,-radius*1.6);context.quadraticCurveTo(0,0,radius,0);context.quadraticCurveTo(0,0,0,radius*1.6);context.quadraticCurveTo(0,0,-radius,0);context.fill();}
    else{const shape=track.outline??referenceDropletOutline;tracePolygon(context,shape.map(p=>({x:p.x*radius,y:p.y*radius*(state.aspect??1)})));context.fill();context.globalAlpha=alpha*.80;context.shadowBlur=radius*.5;context.fillStyle='#fbffff';context.beginPath();context.arc(-radius*.18,-radius*.21,radius*.36,0,TAU);context.fill();}
   }
   context.restore();
  }
  // The entry arc's leading point continues as the actual pen, while cyan
  // plumes retain their separate reference trajectories beside the letters.
  if(time>=group.plan.writing.start&&time<=group.plan.writing.end){
   const pen=penWorld(group,time),tail:Point[]=[];for(let i=0;i<12;i++){const natural=naturalInkTime(group,time-.055*(1-i/11));const u=brushProgress((natural-pen.stroke.start)/pen.stroke.duration);tail.push(world(pointAt(pen.stroke.curve,pen.stroke.dot?.5:u),group));}
   const fade=ease((frame-arcConnection.startFrame)/Math.max(1,arcConnection.endFrame-arcConnection.startFrame))*(1-ease((time-group.plan.writing.end+.12)/.12));
   context.save();context.globalAlpha=fade*.78;context.strokeStyle='#fffaff';context.shadowColor=group.config.glow.color;context.shadowBlur=5*group.scale;context.lineWidth=Math.max(.8,group.scale*1.45);context.lineCap='round';context.beginPath();context.moveTo(tail[0].x,tail[0].y);for(const p of tail.slice(1))context.lineTo(p.x,p.y);context.stroke();context.beginPath();context.arc(pen.point.x,pen.point.y,Math.max(1,group.scale*1.8),0,TAU);context.fillStyle='#ffffff';context.fill();context.restore();
  }
 }
}
