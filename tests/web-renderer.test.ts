import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {asBrushConfig,defaultWebConfig,type WebConfig} from '../web/model';
import {prepareScene,hitTest,penPosition,decorationPoint,renderScene,renderDecorationThumbnail} from '../web/renderer';
import {buildWebBrush,brushProgress,strokeAt,visibleSamples} from '../web/brush-engine';
import {naturalInkTime,referenceFrameAt} from '../web/continuous-motion';
import {ACTIVE_DECORATION_IDS} from '../web/decoration-catalog';
import {referenceDecorationPaths} from '../web/reference-decorations';
import {pointAt} from '../src/geometry';

function fixture():WebConfig{
 const config=defaultWebConfig();config.mode='single';
 for(const person of config.people){person.position={x:0,y:0,scale:1,rotation:-6};person.decoration={...person.decoration,id:'none',scale:1,offsetX:0,offsetY:0};person.glow.enabled=false;person.font.penWidth=1;}
 return config;
}
function close(actual:number,expected:number){assert.ok(Math.abs(actual-expected)<1e-7,`${actual} vs ${expected}`);}

// Canvas call recording is a contract test, not a browser rasterization test.
type Command=[string,...(number|boolean)[]];
class RecordedPath{
 commands:Command[]=[];
 constructor(source?:RecordedPath){if(source)this.commands=source.commands.map(command=>[...command]);}
 moveTo(...args:number[]){this.commands.push(['moveTo',...args]);}
 lineTo(...args:number[]){this.commands.push(['lineTo',...args]);}
 arc(...args:(number|boolean)[]){this.commands.push(['arc',...args]);}
 ellipse(...args:(number|boolean)[]){this.commands.push(['ellipse',...args]);}
 quadraticCurveTo(...args:number[]){this.commands.push(['quadraticCurveTo',...args]);}
 closePath(){this.commands.push(['closePath']);}
 addPath(path:RecordedPath){this.commands.push(...path.commands);}
}
type Matrix=[number,number,number,number,number,number];
type Paint={color:string;alpha:number;shadow:number;matrix:Matrix;commands:Command[]};
class CanvasRecorder{
 fillStyle='#000000';strokeStyle='#000000';shadowColor='#000000';shadowBlur=0;globalAlpha=1;globalCompositeOperation='source-over';lineWidth=1;lineCap='butt';lineJoin='miter';
 matrix:Matrix=[1,0,0,1,0,0];path=new RecordedPath();fills:Paint[]=[];strokes:Paint[]=[];backgrounds:{color:string;args:number[]}[]=[];stack:Record<string,unknown>[]=[];
 setTransform(a:number,b:number,c:number,d:number,e:number,f:number){this.matrix=[a,b,c,d,e,f];}
 transform(a:number,b:number,c:number,d:number,e:number,f:number){const [x,y,z,w,u,v]=this.matrix;this.matrix=[x*a+z*b,y*a+w*b,x*c+z*d,y*c+w*d,x*e+z*f+u,y*e+w*f+v];}
 translate(x:number,y:number){this.transform(1,0,0,1,x,y);}
 rotate(angle:number){this.transform(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0);}
 scale(x:number,y:number){this.transform(x,0,0,y,0,0);}
 save(){this.stack.push({matrix:[...this.matrix],fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,shadowColor:this.shadowColor,shadowBlur:this.shadowBlur,globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,lineWidth:this.lineWidth,lineCap:this.lineCap,lineJoin:this.lineJoin});}
 restore(){const state=this.stack.pop();assert.ok(state,'balanced Canvas state');Object.assign(this,state);}
 beginPath(){this.path=new RecordedPath();}
 moveTo(...args:number[]){this.path.moveTo(...args);}
 lineTo(...args:number[]){this.path.lineTo(...args);}
 arc(...args:(number|boolean)[]){this.path.arc(...args);}
 quadraticCurveTo(...args:number[]){this.path.quadraticCurveTo(...args);}
 closePath(){this.path.closePath();}
 paint(path:RecordedPath,color:string):Paint{return {color,alpha:this.globalAlpha,shadow:this.shadowBlur,matrix:[...this.matrix],commands:path.commands.map(command=>[...command])};}
 fill(path=this.path){this.fills.push(this.paint(path,this.fillStyle));}
 stroke(){this.strokes.push(this.paint(this.path,this.strokeStyle));}
 fillRect(...args:number[]){this.backgrounds.push({color:this.fillStyle,args});}
}
const originalPath=Object.getOwnPropertyDescriptor(globalThis,'Path2D');
Object.defineProperty(globalThis,'Path2D',{value:RecordedPath,writable:true,configurable:true});
test.after(()=>{if(originalPath)Object.defineProperty(globalThis,'Path2D',originalPath);else Reflect.deleteProperty(globalThis,'Path2D');});
function recording(width=180,height=112){
 const context=new CanvasRecorder();
 // Only the Canvas calls exercised by the renderer are implemented here.
 const canvas={width,height,getContext:()=>context} as unknown as HTMLCanvasElement;
 return {canvas,context};
}
function frameHash(scene:ReturnType<typeof prepareScene>,time:number,complete=false){const {canvas,context}=recording();renderScene(canvas,scene,time,complete);return createHash('sha256').update(JSON.stringify({fills:context.fills,strokes:context.strokes,backgrounds:context.backgrounds})).digest('hex');}

test('unit-scale names fit each artboard; deliberate enlargement warns instead of recentering',()=>{
 for(const aspect of ['landscape','portrait','square'] as const)for(const names of [['A','X'],['TYX','SM'],['M'.repeat(40),'i'],['Liuxin','Tangyanxiang']])for(const mode of ['single','couple'] as const){
  const config=fixture();config.canvas.aspect=aspect;config.mode=mode;config.people[0].name=names[0];config.people[1].name=names[1];const scene=prepareScene(config);assert.equal(scene.people.length,mode==='single'?1:2);
  for(const person of scene.people){const b=person.bounds;assert.ok(b.minX>=0&&b.minY>=0&&b.maxX<=scene.width&&b.maxY<=scene.height,JSON.stringify({aspect,names,mode,b}));}
 }
 const c=fixture(),base=prepareScene(c);c.people[0].position.scale=1.5;c.people[0].position.x=.45;const next=prepareScene(c);assert.equal(next.people[0].baseScale,base.people[0].baseScale);close(next.people[0].scale/base.people[0].scale,1.5);assert.ok(next.warnings.length>0);
});

test('retired family and scheme values keep original input without adding alternative ornament strokes',()=>{
 for(const name of ['A','TYX','Liuxin',"O'Neil-Smith"]){const c=fixture();c.people[0].name=name;const source=asBrushConfig(c.people[0],c),authored=buildWebBrush(source,'classic');for(const scheme of ['classic','loop','sweep'] as const)for(const family of ['tyx-brush','tyx-soft'] as const){const brush=buildWebBrush(source,scheme,family);assert.deepEqual(brush,authored);assert.ok(!brush.strokes.some(stroke=>stroke.id.startsWith('scheme-')));}assert.equal(prepareScene(c).config.people[0].name,name);}
});

test('the pen samples actual nonlinear writing and supports reverse seeking',()=>{
 const scene=prepareScene(fixture()),g=scene.people[0],time=g.plan.writing.start+(g.plan.writing.end-g.plan.writing.start)*.43,pen=strokeAt(g.brush,naturalInkTime(g,time)),local=pointAt(pen.stroke.curve,pen.progress),cos=Math.cos(g.angle),sin=Math.sin(g.angle),position=penPosition(scene,0,time);
 assert.deepEqual(position,{x:(local.x*cos-local.y*sin)*g.scale+g.tx,y:(local.x*sin+local.y*cos)*g.scale+g.ty});for(const t of [scene.duration,2,0,4,1])penPosition(scene,0,t);assert.deepEqual(penPosition(scene,0,time),position);assert.equal(penPosition(scene,0,scene.duration),null);
 const partial=visibleSamples(pen.stroke,.37,.85);assert.ok(partial.every(p=>p.u<=.37));assert.deepEqual({x:partial.at(-1)!.x,y:partial.at(-1)!.y},pointAt(pen.stroke.curve,.37));assert.equal(brushProgress(-1),0);assert.equal(brushProgress(2),1);
});

test('signature and ornament dragging apply exact canvas-normalized deltas',()=>{
 for(const id of ACTIVE_DECORATION_IDS){
  const c=fixture();c.people[0].decoration.id=id;const base=prepareScene(c),moved=structuredClone(c);moved.people[0].position.x+=.08;moved.people[0].position.y-=.06;const next=prepareScene(moved),a=base.hitAreas.find(h=>h.target==='signature')!.bounds,b=next.hitAreas.find(h=>h.target==='signature')!.bounds;close(b.minX-a.minX,base.width*.08);close(b.minY-a.minY,-base.height*.06);if(id==='none')continue;
  const ornament=structuredClone(c);ornament.people[0].decoration.offsetX+=.04;ornament.people[0].decoration.offsetY+=.08;const d=prepareScene(ornament),before=base.hitAreas.find(h=>h.target==='decoration')!.bounds,after=d.hitAreas.find(h=>h.target==='decoration')!.bounds;assert.deepEqual(d.hitAreas.find(h=>h.target==='signature')!.bounds,a);close(after.minX-before.minX,base.width*.04);close(after.minY-before.minY,base.height*.08);assert.deepEqual(hitTest(d,(after.minX+after.maxX)/2,(after.minY+after.maxY)/2),{index:0,target:'decoration'});
 }
});

test('size, thickness and animation preserve fixed layout; thickness changes actual ink radii and cached paths',()=>{
 const c=fixture();c.people[0].font.penWidth=.5;const thin=prepareScene(c),g=thin.people[0];c.people[0].font.penWidth=2;const thick=prepareScene(c);assert.equal(g.brush,thick.people[0].brush);assert.deepEqual(g.center,thick.people[0].center);assert.equal(g.baseScale,thick.people[0].baseScale);
 const a=thin.continuous!.chunks.find(chunk=>chunk.group.particles!==false)!,b=thick.continuous!.chunks.find(chunk=>chunk.group.particles!==false)!;close(b.vertices[0].radius/a.vertices[0].radius,4);c.people[0].position.scale=1.5;c.animation.introOutroEnabled=false;const off=prepareScene(c);assert.deepEqual(off.people[0].center,g.center);assert.equal(off.people[0].baseScale,g.baseScale);assert.equal(off.continuous,null);
 const radii=(width:number)=>{const config=fixture();config.animation.introOutroEnabled=false;config.people[0].font.penWidth=width;const scene=prepareScene(config),r=recording();renderScene(r.canvas,scene,scene.duration);return r.context.fills[0].commands.filter(command=>command[0]==='arc').map(command=>Number(command[3]));};const small=radii(.5),large=radii(2);assert.ok(small.length>0);close(large[0]/small[0],4);assert.deepEqual(radii(.5),small);
});

test('all 19 choices have finite paths and matching hit areas on every artboard, with one shared outro family',()=>{
 assert.equal(ACTIVE_DECORATION_IDS.length,19);
 for(const aspect of ['landscape','portrait','square'] as const)for(const id of ACTIVE_DECORATION_IDS){const c=fixture();c.mode='couple';c.canvas.aspect=aspect;c.people.forEach(person=>person.decoration.id=id);const scene=prepareScene(c);assert.deepEqual(scene.people[0].plan.writing,scene.people[1].plan.writing);assert.equal(scene.continuous!.parts.length,7);for(const g of scene.people){assert.equal(g.config.decoration.id,id);assert.equal(g.decoration.strokes.length>0,id!=='none');assert.equal(scene.hitAreas.filter(area=>area.index===g.index&&area.target==='decoration').length,id==='none'?0:1);}assert.ok(scene.continuous!.chunks.every(chunk=>chunk.vertices.every(v=>[v.x,v.y,v.radius].every(Number.isFinite)&&v.radius>0)));}
 for(const id of ['cat','rabbit','bow'] as const){const c=fixture();c.people[0].decoration.id=id;const scene=prepareScene(c);assert.equal(scene.people[0].config.decoration.id,'none');assert.equal(scene.people[0].decoration.strokes.length,0);}
});

test('thumbnail and ordinary rendering paint identical complete ornament paths, solid marks and accent colors',()=>{
 for(const id of ACTIVE_DECORATION_IDS){const c=fixture();c.animation.introOutroEnabled=false;c.people[0].decoration.id=id;const scene=prepareScene(c),main=recording(),thumb=recording();renderScene(main.canvas,scene,scene.duration);renderDecorationThumbnail(thumb.canvas,id,c.people[0],c.canvas.background);const painted=(r:CanvasRecorder)=>r.fills.map(fill=>({color:fill.color,commands:fill.commands}));assert.deepEqual(painted(thumb.context),painted(main.context).slice(1),id);for(const path of referenceDecorationPaths[id]??[]){if(path.color)assert.ok(thumb.context.fills.some(fill=>fill.color===path.color&&fill.commands.length>0),`${id}/${path.id}`);if(path.filled)assert.ok(path.curve&&path.curve.points.length>2);}}
});

test('solid and accent geometry survive into the continuous source mesh and complete editing pose',()=>{
 for(const [id,paths] of Object.entries(referenceDecorationPaths)){const c=fixture();c.people[0].decoration.id=id as WebConfig['people'][0]['decoration']['id'];const scene=prepareScene(c),ornament=scene.continuous!.groups.find(g=>g.particles===false)!;for(const path of paths){const pieces=ornament.brush.strokes.filter(stroke=>stroke.id===path.id||stroke.id.startsWith(`${path.id}~`));assert.ok(pieces.length>0,`${id}/${path.id}`);for(const piece of pieces){assert.equal(ornament.colorAt?.(piece),path.color);assert.ok(piece.samples.every(p=>p.radius>0&&Number.isFinite(p.radius)));}if(path.filled||path.eye)assert.ok(pieces.length>1,'solid marks must be filled, not merely traced around their outlines');}const r=recording();renderScene(r.canvas,scene,scene.editingTime,true);for(const color of new Set(paths.map(path=>path.color).filter(Boolean)))assert.ok(r.context.fills.some(fill=>fill.color.toLowerCase()===color?.toLowerCase()),`${id}: ${color}`);}
});

test('chosen background persists through writing, morph, final fade and complete editing pose',()=>{
 for(const background of ['#ffffff','#7c3a80','#111820'])for(const enabled of [true,false]){const c=fixture();c.canvas.background=background;c.animation.introOutroEnabled=enabled;c.people[0].decoration.id='face-sleepy';const scene=prepareScene(c);for(const time of [0,.8,scene.editingTime,scene.duration-.5,scene.duration]){const r=recording();renderScene(r.canvas,scene,time);assert.deepEqual(r.context.backgrounds,[{color:background,args:[0,0,scene.width,scene.height]}]);}const r=recording();renderScene(r.canvas,scene,scene.duration,true);assert.equal(r.context.backgrounds[0].color,background);assert.ok(r.context.fills.some(fill=>fill.commands.length>0));}
});

test('writing and short ornament reaction meet the outro directly without a full-ink blackout',()=>{
 for(const duration of [3,5,6.5,15])for(const id of ['none','cat-round'] as const){const c=fixture();c.timing.duration=duration;c.people[0].decoration.id=id;const scene=prepareScene(c),plan=scene.people[0].plan;close(id==='none'?plan.writing.end:plan.reaction.end,plan.outro.start);close(referenceFrameAt(plan.outro.start,duration),150);close(referenceFrameAt(duration,duration),195);for(const frame of [150,155,156,157,158,159,160,161,162]){const r=recording();renderScene(r.canvas,scene,plan.outro.start+(frame-150)/30);assert.ok(r.context.fills.some(fill=>fill.alpha>.1&&fill.commands.length>0),`${duration}/${id}/${frame}`);}}
});

test('arbitrary forward and reverse rendering is deterministic',()=>{
 for(const enabled of [true,false]){const c=fixture();c.animation.introOutroEnabled=enabled;c.people[0].decoration.id='panda-face';const scene=prepareScene(c),time=scene.people[0].plan.reaction.start+.05,expected=frameHash(scene,time);for(const t of [scene.duration,0,2,scene.editingTime])frameHash(scene,t);assert.equal(frameHash(scene,time),expected);}
});

test('ornament reactions occur after drawing and return to the exact authored pose',()=>{
 for(const [id,stroke] of [['cat-ears','left-ear'],['paw-wave','paw-outline'],['rabbit-face','left-ear'],['puppy-face','left-floppy-ear'],['panda-face','left-ear']] as const){const c=fixture();c.people[0].decoration.id=id;const scene=prepareScene(c),phase=scene.people[0].plan.reaction;assert.ok(scene.people[0].decoration.strokes.some(path=>path.id===stroke),`${id}: gesture source`);const at=(time:number)=>decorationPoint(scene,0,stroke,.4,time),rest=at(phase.start);assert.deepEqual(at(phase.end),rest);assert.notDeepEqual(at(phase.start+(phase.end-phase.start)*.3),rest,id);}
});

test('moving or recoloring reuses the fixed ornament mesh instead of rebuilding every filled scanline',()=>{
 const c=fixture();c.people[0].decoration.id='panda-face';const base=prepareScene(c);c.people[0].position.x=.03;c.people[0].ink.color='#ffcccc';const next=prepareScene(c);const mesh=(scene:ReturnType<typeof prepareScene>)=>scene.continuous!.groups.find(g=>g.particles===false)!.brush.strokes;assert.equal(mesh(base),mesh(next));
});

test('prepared scenes isolate exports from later edits',()=>{const c=fixture(),copy=structuredClone(c),scene=prepareScene(c);assert.deepEqual(c,copy);c.people[0].name='Changed';assert.equal(scene.config.people[0].name,copy.people[0].name);assert.equal(hitTest(scene,-50,-50),null);});

