import {buildBrush,brushProgress,parseStroke,type BrushStroke} from '../src/brush';
import {pointAt,pointBounds,sampleCubic,type Box,type Curve,type Point} from '../src/geometry';
import {initials,middle,endings,symbols,metrics,type PenGlyph} from '../assets/fonts/tyx-brush/positional';
import type {SignatureConfig} from '../src/config';
import type {Scheme} from './model';

export type InkSample=Point&{radius:number;u:number};
export type PreparedStroke=BrushStroke&{samples:InkSample[]};
export type PreparedBrush={strokes:PreparedStroke[];duration:number;box:Box;guide:ReturnType<typeof buildBrush>['guide']};
export {brushProgress};

export function joinCurves(curves:Curve[]):Curve{
 const points:Curve['points']=[];let length=0;
 for(const c of curves)for(const p of c.points){const prev=points.at(-1);if(prev)length+=Math.hypot(p.x-prev.x,p.y-prev.y);points.push({x:p.x,y:p.y,length});}
 return {points,length};
}
function transformCurve(curve:Curve,transform:(p:Curve['points'][number])=>Point):Curve{
 let length=0;const points:Curve['points']=[];
 for(const source of curve.points){const point=transform(source),last=points.at(-1);if(last)length+=Math.hypot(point.x-last.x,point.y-last.y);points.push({...point,length});}
 return {points,length};
}

/** Build TYX centerlines with positional letterforms and case-preserving advances. */
function originalLetterStrokes(config:SignatureConfig):{strokes:BrushStroke[];guide:PreparedBrush['guide']}{
 const characters=[...config.name],first=characters.findIndex(ch=>/[A-Za-z]/.test(ch)),last=characters.map(ch=>/[A-Za-z]/.test(ch)).lastIndexOf(true),factor=config.font.size/320;
 const strokes:BrushStroke[]=[],dots:BrushStroke[]=[];let cursor=0;
 characters.forEach((char,index)=>{
  if(char===' '){cursor+=62*factor;return;}
  const cap=initials[char],base=middle[char],isLead=index===first;
  const position:BrushStroke['position']=cap&&isLead?'initial':base&&index===last?'terminal':cap||base?'medial':'punctuation';
  const glyph:PenGlyph=symbols[char]??cap??base??(char==="'"?{advance:38,paths:['M 20 -157 C 28 -167 30 -181 29 -186']}:{advance:65,paths:['M 0 -57 C 19 -60 44 -60 65 -57']});
  const scale=isLead?config.font.initialScale:cap?.79:1,paths=[...(position==='terminal'&&glyph.terminalPaths?glyph.terminalPaths:glyph.paths)];
  if(position==='terminal'){
   const ending=endings[char],bare=parseStroke(paths[ending.stroke]),anchor=bare.points.at(-1)!,reach=config.font.terminalLength*Math.min(1,.55+characters.filter(ch=>/[A-Za-z]/.test(ch)).length*.075);
   paths[ending.stroke]+=ending.continuation.replace(/C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/g,(_match,x1,y1,x2,y2,x3,y3)=>'C '+[[x1,y1],[x2,y2],[x3,y3]].map(([x,y])=>`${anchor.x+(Number(x)-anchor.x)*reach} ${anchor.y+(Number(y)-anchor.y)*reach}`).join(' '));
  }
  paths.forEach((source,strokeIndex)=>{
   let data=source;
   if(position==='medial')data=data.replace(/C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/, (match,a,b,_x,_y,x,y)=>Number(y)===0?`C ${a} ${b} ${Number(x)-12} 7 ${x} ${y}`:match);
   if(base&&strokeIndex===0&&position==='medial')data=data.replace(/^M 0 0 C -?[\d.]+ -?[\d.]+/,'M 0 0 C 12 -7');
   const curve=transformCurve(parseStroke(data),p=>({x:cursor+p.x*factor*scale+(isLead?config.font.initialOffsetX:0),y:p.y*factor*scale+(isLead?config.font.initialOffsetY:0)}));
   const dot=glyph.dotIndices?.includes(strokeIndex)??false,width=config.font.size*(position==='terminal'?.034:.040)*config.font.penWidth*(isLead?Math.sqrt(config.font.initialScale):1);
   const stroke:BrushStroke={id:`brush-${index}-${strokeIndex}`,char,index:strokeIndex,curve,start:0,duration:dot?.10:Math.max(.075,Math.pow(curve.length,.76)/275),width,position,dot};
   (dot?dots:strokes).push(stroke);
  });
  cursor+=glyph.advance*factor*scale;
 });
 // Adjust the existing exit of a final capital, rather than appending a second
 // sweep across the word. The preceding letter geometry stays intact.
 if(/[A-Z]/.test(characters[last])){
  const terminal=strokes.filter(s=>s.id.startsWith(`brush-${last}-`)).at(-1);
  if(terminal){const anchor=pointAt(terminal.curve,.84);terminal.curve=transformCurve(terminal.curve,p=>p.length<terminal.curve.length*.84?p:{x:anchor.x+(p.x-anchor.x)*config.font.terminalLength,y:anchor.y+(p.y-anchor.y)*(.75+.25*config.font.terminalLength)});}
 }
 strokes.push(...dots);
 return {strokes,guide:{baseline:0,xHeight:metrics.xHeight*factor,hasDescenders:strokes.some(s=>/[fgjpqxyz,;]/.test(s.char)),bodyStart:0,bodyEnd:cursor}};
}

/** Prepare timed TYX strokes with deterministic pressure samples. */
export function buildWebBrush(config:SignatureConfig,_scheme:Scheme,_family:'tyx-brush'|'tyx-soft'='tyx-brush'):PreparedBrush{
 const handwriting={...config,font:{...config.font,initialScale:1+(config.font.initialScale-1)*.45}};
 const original=originalLetterStrokes(handwriting),strokes=original.strokes,size=config.font.size;
 let clock=0;
 const prepared=strokes.map((source,index)=>{
  // Prepare timing objects without mutating the source strokes.
  const previous=strokes[index-1],letterChanged=previous&&previous.id.split('-')[1]!==source.id.split('-')[1];
  const previousEnd=previous?.curve.points.at(-1),start=source.curve.points[0],lift=previousEnd?Math.hypot(start.x-previousEnd.x,start.y-previousEnd.y):0;
  if(index>0)clock+=source.dot?.065:lift<3?.009:letterChanged?.065:.035;
  const duration=source.dot?.10:Math.max(.075,Math.pow(source.curve.length,.76)/275)*(1+.055*Math.sin(index*1.7));
  const stroke={...source,start:clock,duration};clock+=stroke.duration;
  const count=Math.max(2,Math.ceil(stroke.curve.length/Math.max(1.3,size*.007)));
  const samples=Array.from({length:count+1},(_,i)=>{const u=i/count;return {...pointAt(stroke.curve,u),u,radius:inkRadius(stroke,u,config.font.pressure)};});
  return {...stroke,samples};
 });
 const points=prepared.flatMap(s=>s.samples.flatMap(p=>[{x:p.x-p.radius,y:p.y-p.radius},{x:p.x+p.radius,y:p.y+p.radius}]));
 return {strokes:prepared,duration:clock+.025,box:pointBounds(points),guide:original.guide};
}

export function inkRadius(s:BrushStroke,u:number,pressure:number):number{
 if(s.dot)return s.width*.32;
 const before=pointAt(s.curve,Math.max(0,u-.014)),after=pointAt(s.curve,Math.min(1,u+.014));
 const dy=after.y-before.y,len=Math.hypot(after.x-before.x,dy)||1;
 const end=s.position==='medial'?.52:.07,start=.42;
 const taper=Math.min(1,start+u*18,end+(1-u)*18);
 const nib=(.67+.33*Math.max(0,dy/len))*(.98+.02*Math.sin(u*Math.PI*3))*taper;
 return Math.max(.015,s.width/2*((1-pressure)*.78+pressure*nib));
}

export function strokeAt(brush:PreparedBrush,naturalTime:number):{stroke:PreparedStroke;progress:number;point:Point}{
 let stroke=brush.strokes[0];
 for(const candidate of brush.strokes){if(candidate.start>naturalTime)break;stroke=candidate;}
 const progress=brushProgress((naturalTime-stroke.start)/stroke.duration);
 return {stroke,progress,point:pointAt(stroke.curve,stroke.dot?.5:progress)};
}

/** A path made of same-winding capsules remains filled at self crossings. */
export function appendCapsules(context:Pick<CanvasRenderingContext2D,'moveTo'|'lineTo'|'closePath'|'arc'>,samples:readonly InkSample[]):void{
 if(!samples.length)return;
 const disk=(p:InkSample)=>{context.moveTo(p.x+p.radius,p.y);context.arc(p.x,p.y,p.radius,0,Math.PI*2,true);};
 let a=samples[0];disk(a);
 for(let i=1;i<samples.length;i++){
  const b=samples[i],distance=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/distance,ny=(b.x-a.x)/distance;
  context.moveTo(a.x+nx*a.radius,a.y+ny*a.radius);
  context.lineTo(b.x+nx*b.radius,b.y+ny*b.radius);
  context.lineTo(b.x-nx*b.radius,b.y-ny*b.radius);
  context.lineTo(a.x-nx*a.radius,a.y-ny*a.radius);context.closePath();disk(b);a=b;
 }
}

export function visibleSamples(stroke:PreparedStroke,progress:number,pressure:number):InkSample[]{
 if(progress<=0)return [];
 if(progress>=1)return stroke.samples;
 const cut=Math.floor(progress*(stroke.samples.length-1)),samples=stroke.samples.slice(0,cut+1);
 samples.push({...pointAt(stroke.curve,progress),u:progress,radius:inkRadius(stroke,progress,pressure)});
 return samples;
}
