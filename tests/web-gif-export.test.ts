import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {exportGif,exportGifSize} from '../web/gif-export';
import {defaultWebConfig} from '../web/model';

function globals(t:TestContext,values:Record<string,unknown>){
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
}

function fixture(){
  const config=defaultWebConfig();
  config.mode='single';config.people[0].name='A';config.people[0].decoration.id='none';
  config.people[0].glow.enabled=false;config.animation.introOutroEnabled=false;
  config.canvas.transparent=true;config.timing.duration=3.1;
  return config;
}

function browser(t:TestContext,failRead=false){
  class Path{
    moveTo(){}lineTo(){}arc(){}ellipse(){}quadraticCurveTo(){}bezierCurveTo(){}closePath(){}addPath(){}
  }
  const canvases:{width:number;height:number;clears:number;reads:number}[]=[];
  class Canvas{
    width=300;height=150;clears=0;reads=0;
    context=new Proxy<Record<string,unknown>>({
      clearRect:()=>{this.clears++;},
      getImageData:(_x:number,_y:number,width:number,height:number)=>{
        if(failRead)throw new Error('pixel read failed');
        const data=new Uint8ClampedArray(width*height*4);
        if(this.reads++%2===0){
          // Straight RGB must stay white despite partial alpha. Hidden colored
          // pixels must stay clear, while genuine opaque black must stay visible.
          data.set([255,255,255,192,255,0,255,127,0,0,0,255]);
        }
        return {data,width,height};
      },
    },{get:(target,key)=>Reflect.get(target,key)??(()=>{})});
    constructor(){canvases.push(this);}
    getContext(){return this.context;}
  }
  globals(t,{document:{createElement:()=>new Canvas()},Path2D:Path,VideoEncoder:undefined,VideoFrame:undefined,isSecureContext:false});
  return canvases;
}

type GifFrame={width:number;height:number;delay:number;dispose:number;transparent:boolean;transparentIndex:number;palette:number[][];minimumCodeSize:number;data:Uint8Array};
function parseGif(bytes:Uint8Array){
  const word=(at:number)=>bytes[at]|bytes[at+1]<<8;
  assert.equal(new TextDecoder().decode(bytes.subarray(0,6)),'GIF89a');
  const width=word(6),height=word(8),background=bytes[11];
  let cursor=13;
  const palette=(length:number)=>Array.from({length},()=>{const color=Array.from(bytes.subarray(cursor,cursor+3));cursor+=3;return color;});
  const globalPalette=bytes[10]&128?palette(1<<((bytes[10]&7)+1)):[];
  const blocks=()=>{const data:number[]=[];for(let size=bytes[cursor++];size;size=bytes[cursor++]){data.push(...bytes.subarray(cursor,cursor+size));cursor+=size;}return Uint8Array.from(data);};
  let control={delay:0,dispose:0,transparent:false,transparentIndex:0},repeat:number|undefined;
  const frames:GifFrame[]=[];
  while(cursor<bytes.length){
    const marker=bytes[cursor++];
    if(marker===0x3b)break;
    if(marker===0x21){
      const label=bytes[cursor++];
      if(label===0xf9){
        assert.equal(bytes[cursor++],4);const packed=bytes[cursor++];
        control={delay:word(cursor)*10,dispose:packed>>2&7,transparent:!!(packed&1),transparentIndex:bytes[cursor+2]};cursor+=4;
      }else if(label===0xff){
        const size=bytes[cursor++],application=new TextDecoder().decode(bytes.subarray(cursor,cursor+size));cursor+=size;
        const data=blocks();if(application==='NETSCAPE2.0')repeat=data[1]|data[2]<<8;
      }else blocks();
      continue;
    }
    assert.equal(marker,0x2c);
    const frameWidth=word(cursor+4),frameHeight=word(cursor+6),flags=bytes[cursor+8];cursor+=9;
    const colors=flags&128?palette(1<<((flags&7)+1)):globalPalette;
    const minimumCodeSize=bytes[cursor++],data=blocks();
    frames.push({width:frameWidth,height:frameHeight,...control,palette:colors,minimumCodeSize,data});
  }
  return {width,height,background,repeat,frames};
}

// Decode only the few pixels needed to check index semantics; independent of
// gifenc's palette mapping, so a black matte or wrong transparent index fails.
function firstPixels(frame:GifFrame,count:number){
  const clear=1<<frame.minimumCodeSize,end=clear+1;
  let dictionary:number[][]=[],next=end+1,size=frame.minimumCodeSize+1,bit=0,previous:number[]|undefined;
  const reset=()=>{dictionary=Array.from({length:clear},(_,index)=>[index]);next=end+1;size=frame.minimumCodeSize+1;previous=undefined;};
  const pixels:number[]=[];reset();
  while(pixels.length<count){
    let code=0;for(let i=0;i<size;i++,bit++)code|=(frame.data[bit>>3]>>(bit&7)&1)<<i;
    if(code===clear){reset();continue;}if(code===end)break;
    const entry=dictionary[code]??(code===next&&previous?[...previous,previous[0]]:undefined);
    assert.ok(entry,'valid LZW index');pixels.push(...entry);
    if(previous){dictionary[next++]=[...previous,entry[0]];if(next===1<<size&&size<12)size++;}
    previous=entry;
  }
  return pixels.slice(0,count);
}

test('GIF dimensions retain each aspect ratio with a 960px long edge',()=>{
  const config=defaultWebConfig();
  for(const [aspect,size] of [['landscape',{width:960,height:540}],['portrait',{width:540,height:960}],['square',{width:960,height:960}]] as const){
    config.canvas.aspect=aspect;assert.deepEqual(exportGifSize(config),size);
  }
});

test('transparent GIF loops, clears every frame, and keeps true RGB without WebCodecs',async t=>{
  const canvases=browser(t),config=fixture(),before=JSON.stringify(config),progress:number[]=[];
  const blob=await exportGif(config,{onProgress:value=>progress.push(value)});
  assert.equal(blob.type,'image/gif');assert.equal(JSON.stringify(config),before);
  const gif=parseGif(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual([gif.width,gif.height,gif.background,gif.repeat],[960,540,0,0]);
  assert.equal(gif.frames.length,62);assert.equal(gif.frames.reduce((total,frame)=>total+frame.delay,0),3100);
  for(const frame of gif.frames){
    assert.deepEqual([frame.width,frame.height,frame.delay,frame.dispose,frame.transparent,frame.transparentIndex],[960,540,50,2,true,0]);
  }
  const first=gif.frames[0],indices=firstPixels(first,3);
  assert.notEqual(indices[0],0);assert.deepEqual(first.palette[indices[0]],[255,255,255]);
  assert.equal(indices[1],0,'a sub-threshold colored pixel must be transparent');
  assert.notEqual(indices[2],0);assert.deepEqual(first.palette[indices[2]],[0,0,0]);
  assert.deepEqual(firstPixels(gif.frames[1],3),[0,0,0],'a later clear frame must not retain prior ink');
  assert.equal(canvases[1].reads,62);assert.equal(canvases[1].clears,62);
  assert.equal(progress.at(-1),1);assert.ok(progress.every((value,index)=>index===0||value>=progress[index-1]));
  for(const canvas of canvases)assert.deepEqual([canvas.width,canvas.height],[1,1]);
});

test('GIF cancellation before setup and after a frame releases allocated canvases',async t=>{
  const canvases=browser(t),config=fixture(),already=new AbortController();already.abort();
  await assert.rejects(exportGif(config,{signal:already.signal}),{name:'AbortError'});
  assert.equal(canvases.length,0);
  const controller=new AbortController();
  await assert.rejects(exportGif(config,{signal:controller.signal,onProgress:(_value,stage)=>{if(stage.startsWith('制作 GIF'))controller.abort();}}),{name:'AbortError'});
  assert.equal(canvases.length,2);assert.equal(canvases[1].reads,1);
  for(const canvas of canvases)assert.deepEqual([canvas.width,canvas.height],[1,1]);
});

test('GIF pixel-read failures release both canvases and preserve the failure reason',async t=>{
  const canvases=browser(t,true);
  await assert.rejects(exportGif(fixture()),/GIF 导出失败.*pixel read failed/);
  assert.equal(canvases.length,2);
  for(const canvas of canvases)assert.deepEqual([canvas.width,canvas.height],[1,1]);
});
