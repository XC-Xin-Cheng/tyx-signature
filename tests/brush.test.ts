import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrush,brushRibbon,parseStroke} from '../src/brush';
import {initials,middle,endings,symbols} from '../assets/fonts/tyx-brush/positional';
import {defaultConfig,parseConfig} from '../src/config';
import {place,rotate} from '../src/layout';
import {foldEar} from '../src/motion';
const config={...defaultConfig,font:{...defaultConfig.font,id:'tyx-brush' as const}};
test('26 initial capitals and 26 terminal lowercase have positional variants',()=>{
 assert.equal(Object.keys(initials).length,26);assert.equal(Object.keys(middle).length,26);assert.equal(Object.keys(endings).length,26);
 for(const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){const b=buildBrush({...config,name:ch+'in'});assert.ok(b.strokes.filter(s=>s.char===ch).every(s=>s.position==='initial'));}
 for(const ch of 'abcdefghijklmnopqrstuvwxyz'){const b=buildBrush({...config,name:'Ai'+ch});assert.ok(b.strokes.some(s=>s.char===ch&&s.position==='terminal'));const final=b.strokes.find(s=>s.char===ch&&s.index===endings[ch].stroke&&s.position==='terminal')!;assert.ok(final.curve.length>parseStroke((middle[ch].terminalPaths??middle[ch].paths)[endings[ch].stroke]).length*config.font.size/320);}
 const long=buildBrush({...config,name:'M'.repeat(40)});assert.ok(Number.isFinite(long.box.maxX));
});
test('lower oval joins remain tangent and the pen union has round capsules',()=>{
 for(const [ch,join] of [['g',[-46,191]],['y',[-65,203]]] as const){const curve=parseStroke(middle[ch].paths[0]),i=curve.points.findIndex(p=>Math.hypot(p.x-join[0],p.y-join[1])<.001);assert.ok(i>0);const a=curve.points[i-1],b=curve.points[i],d=curve.points[i+1],angle=Math.atan2(d.y-b.y,d.x-b.x)-Math.atan2(b.y-a.y,b.x-a.x);assert.ok(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<.2);}
 const b=buildBrush({...config,name:'Liuxin'}),s=b.strokes[0];assert.equal(brushRibbon(s,0,config),'');assert.match(brushRibbon(s,.5,config),/ a /);assert.equal(brushRibbon(s,.5,config),brushRibbon(s,.5,config));
 assert.ok(b.strokes.filter(s=>s.char==='i'&&s.index===1).every(s=>s.dot));
});
test('underline stays below the body for names with and without lower loops',()=>{
 for(const name of ['Liuxin','Tangyan','Tangyanxiang','Zhongxinyu','Chen Ming','Jacob','Az']){const c={...config,name},b=buildBrush(c),l=place(c,b.box,b.points[0],b.points.at(-1)!,b.points,b.guide);assert.ok(l.scale>0);assert.equal(l.overlap,false);for(const p of l.line.points){const unrotated={x:p.x*Math.cos(l.rotation*Math.PI/180)-p.y*Math.sin(l.rotation*Math.PI/180),y:p.x*Math.sin(l.rotation*Math.PI/180)+p.y*Math.cos(l.rotation*Math.PI/180)};assert.ok(unrotated.y>b.guide.xHeight*.20,name);}}
});
test('every keyboard symbol glyph builds as standalone punctuation strokes',()=>{
 const expected='0123456789 .,:;!?"\'-&/$@#%+=*~_()<>[]{}|\\^`'.replace(/ /g,'');
 assert.deepEqual([...Object.keys(symbols)].sort().join(''),[...expected].sort().join(''));
 for(const [ch,glyph] of Object.entries(symbols)){
  assert.ok(glyph.advance>0,ch);
  const b=buildBrush({...config,name:`a${ch}b`}),own=b.strokes.filter(s=>s.char===ch);
  assert.ok(own.length>0,ch);
  assert.ok(own.every(s=>s.position==='punctuation'),ch);
  own.forEach(s=>assert.ok(Number.isFinite(s.curve.length)&&s.curve.length>0,ch));
 }
 const bang=buildBrush({...config,name:'a!b'}).strokes.filter(s=>s.char==='!');
 assert.ok(bang.some(s=>s.dot&&s.index===1));
 // Lookalikes must stay visually distinct from letters: different advance and shape.
 for(const [digit,letter] of [['0','o'],['1','l'],['2','z'],['5','s'],['8','o']] as const){
  assert.notEqual(symbols[digit].advance,middle[letter].advance,`${digit} vs ${letter}`);
 }
 for(const name of ['TYX & Mei!','Rin.2','Ty 2026 #1','a_b~c']){
  const parsed=parseConfig({name});assert.equal(parsed.name,name);
  assert.ok(buildBrush({...config,name:name}).strokes.length>0,name);
 }
 assert.throws(()=>parseConfig({name:'A\nB'}));
});

test('case is retained and reference lowercase endings sweep right without added lower loops',()=>{
 for(const name of ['Liuxin','liuxin','LIUXIN','tAngYaN'])assert.deepEqual([...new Set(buildBrush({...config,name}).strokes.map(s=>s.char))],[...new Set([...name])]);
 for(const ch of 'abcdefghijklmnopqrstuvwxyz'){const bare=middle[ch].terminalPaths??middle[ch].paths,extension=bare[endings[ch].stroke]+endings[ch].continuation,curve=parseStroke(extension),end=curve.points.at(-1)!;assert.ok(end.x>middle[ch].advance,ch);}
 const upperL=parseStroke(initials.L.paths[0]);assert.ok(upperL.points.at(-1)!.x>200);assert.ok(upperL.points.at(-1)!.y<0);
});


test('leading emphasis changes only the first letter and preserves following capital proportions',()=>{
 const make=(initialScale:number)=>buildBrush({...config,name:'Chen Ming',font:{...config.font,initialScale}});
 const plain=make(1),bold=make(1.3);
 const span=(b:ReturnType<typeof buildBrush>,ch:string)=>{const pts=b.strokes.filter(s=>s.char===ch).flatMap(s=>s.curve.points);return {height:Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)),width:Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x))};};
 assert.ok(Math.abs(span(bold,'C').height/span(plain,'C').height-1.3)<1e-8);
 assert.ok(Math.abs(span(bold,'M').height-span(plain,'M').height)<1e-8);
 assert.ok(Math.abs(span(bold,'M').width-span(plain,'M').width)<1e-8);
 for(const name of ['tangyan','TYXSM','Chen Ming'])assert.equal(parseConfig({name}).name,name);
 const legacy=parseConfig({name:'Tangyan',font:{id:'tyx-brush',size:248}});assert.equal(legacy.font.initialScale,1.3);assert.equal(legacy.font.terminalLength,1);
});

test('tail length changes only the final flourish, retaining lower-loop geometry',()=>{
 for(const name of ['Tangyang','Tangyany','Liuxin']){
  const make=(terminalLength:number)=>buildBrush({...config,name,font:{...config.font,terminalLength}});
  const a=make(.5),b=make(1.8),last=name.at(-1)!,index=endings[last].stroke;
  const stroke=(m:ReturnType<typeof make>)=>m.strokes.find(s=>s.char===last&&s.position==='terminal'&&s.index===index)!;
  const short=stroke(a).curve.points,long=stroke(b).curve.points;
  assert.ok(long.at(-1)!.x>short.at(-1)!.x);
  const bare=parseStroke((middle[last].terminalPaths??middle[last].paths)[index]);
  assert.deepEqual(short.slice(0,bare.points.length),long.slice(0,bare.points.length));
  const geometry=(m:ReturnType<typeof make>)=>m.strokes.filter(s=>s.position!=='terminal').map(s=>({id:s.id,curve:s.curve,width:s.width}));
  assert.deepEqual(geometry(a),geometry(b));
 }
});


test('signature T places the following bowl beside the stem rather than after its canopy',()=>{
 const b=buildBrush({...config,name:'Tangyan'}),stem=b.strokes.find(s=>s.char==='T'&&s.index===1)!,a=b.strokes.find(s=>s.char==='a')!;
 const shoulder=stem.curve.points[0],bowlTop=a.curve.points.reduce((best,p)=>p.y<best.y?p:best);
 assert.ok(Math.abs(shoulder.x-bowlTop.x)<config.font.size*.15);
 assert.ok(a.curve.points[0].x>stem.curve.points.at(-1)!.x);
});


test('custom leading position moves all first-letter strokes and dots without changing later letters',()=>{
 for(const name of ['Tangyanxiang','Chen Ming','iX',"'Liuxin"]){
  const plain=buildBrush({...config,name}),shifted=buildBrush({...config,name,font:{...config.font,initialOffsetX:36,initialOffsetY:-24}}),first=name.match(/[A-Za-z]/)![0];
  assert.equal(plain.strokes.length,shifted.strokes.length);
  for(let i=0;i<plain.strokes.length;i++){
   const a=plain.strokes[i],b=shifted.strokes[i],dx=a.char===first?36:0,dy=a.char===first?-24:0;
   assert.equal(a.curve.points.length,b.curve.points.length);
   a.curve.points.forEach((p,j)=>{assert.ok(Math.abs(b.curve.points[j].x-p.x-dx)<1e-8);assert.ok(Math.abs(b.curve.points[j].y-p.y-dy)<1e-8);});
  }
 }
 const old=parseConfig({name:'Tangyan',font:{id:'tyx-brush'}});assert.equal(old.font.initialOffsetX,0);assert.equal(old.font.initialOffsetY,0);
 assert.throws(()=>parseConfig({name:'Tangyan',font:{initialOffsetX:121}}));
});
