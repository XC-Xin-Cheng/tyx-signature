import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {audioEnvelope,audioWindow,prepareAudio,withCancellation} from '../web/audio';
import {checkExportSupport,exportVideo} from '../web/export';
import {defaultWebConfig} from '../web/model';

function globals(t:TestContext,values:Record<string,unknown>){
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
}

function browser(t:TestContext){
  const canvases:{width:number;height:number}[]=[];
  const context=new Proxy<Record<string,unknown>>({},{get:(target,key)=>Reflect.get(target,key)??(()=>{})});
  class Canvas{width=300;height=150;constructor(){canvases.push(this);}getContext(){return context;}}
  class Encoder{static async isConfigSupported(config:unknown){return {supported:true,config};}}
  globals(t,{
    document:{createElement:()=>new Canvas()},isSecureContext:true,HTMLCanvasElement:Canvas,
    VideoEncoder:Encoder,AudioEncoder:Encoder,VideoFrame:class {},OfflineAudioContext:class {},
  });
  return canvases;
}

test('music clip uses the requested offset and pads a short source with silence',()=>{
  assert.deepEqual(audioWindow(3.5,8,1.25),{offset:1.25,duration:2.25});
  assert.throws(()=>audioWindow(3.5,8,3.5),/起点/);
});

test('fades stay ordered and reach zero when a short music clip ends',()=>{
  const points=audioEnvelope(1,{start:0,volume:.7,fadeIn:2,fadeOut:2});
  assert.deepEqual(points,[{time:0,gain:0},{time:.5,gain:.7},{time:1,gain:0}]);
  const full=audioEnvelope(8,{start:0,volume:.4,fadeIn:1,fadeOut:2});
  assert.deepEqual(full,[{time:0,gain:0},{time:1,gain:.4},{time:6,gain:.4},{time:8,gain:0}]);
});

test('cancel during an outstanding browser operation rejects promptly and ignores its late result',async()=>{
  const controller=new AbortController();
  let finish:((value:string)=>void)|undefined;
  const operation=new Promise<string>(resolve=>{finish=resolve;});
  const pending=withCancellation(operation,controller.signal);
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  finish?.('late result');
});

test('already cancelled operations still consume a browser rejection',async()=>{
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(withCancellation(Promise.reject(new Error('late decode failure')),controller.signal),{name:'AbortError'});
});

test('invalid clip durations and nonfinite offsets never reach browser scheduling',()=>{
  for(const duration of [NaN,Infinity,0,-1]){
    assert.throws(()=>audioWindow(5,duration,0));
    assert.throws(()=>audioEnvelope(duration,{start:0,volume:.7,fadeIn:0,fadeOut:0}));
  }
  for(const start of [NaN,Infinity,-Infinity])assert.throws(()=>audioWindow(5,3,start));
});

test('export rejects unsupported environments and honors cancellation before browser work',async()=>{
  const support=await checkExportSupport(defaultWebConfig());
  assert.equal(support.supported,false);assert.match(support.reason??'',/HTTPS|localhost/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(exportVideo(defaultWebConfig(),{signal:controller.signal}),{name:'AbortError'});
});

test('an unreadable music file releases the already allocated export canvas',async t=>{
  const canvases=browser(t);
  const file=new File(['bad'],'unreadable.wav');
  Object.defineProperty(file,'arrayBuffer',{value:()=>Promise.reject(new Error('file read failed'))});
  await assert.rejects(exportVideo(defaultWebConfig(),{audioFile:file}),/file read failed/);
  assert.equal(canvases.length,1);
  assert.deepEqual([canvases[0].width,canvases[0].height],[1,1]);
});

test('cancelling during audio file reading releases the export canvas promptly',async t=>{
  const canvases=browser(t),controller=new AbortController();
  let began:()=>void=()=>{};const started=new Promise<void>(resolve=>{began=resolve;});
  let finish:(value:ArrayBuffer)=>void=()=>{};
  const file=new File(['pending'],'pending.wav');
  Object.defineProperty(file,'arrayBuffer',{value:()=>{began();return new Promise<ArrayBuffer>(resolve=>{finish=resolve;});}});
  const pending=exportVideo(defaultWebConfig(),{audioFile:file,signal:controller.signal});
  await started;controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual([canvases[0].width,canvases[0].height],[1,1]);
  finish(new ArrayBuffer(0));
});

function audioGraph(t:TestContext,startThrows=false){
  const calls={stopped:0,sourceDisconnected:0,gainDisconnected:0};
  let began:()=>void=()=>{};const started=new Promise<void>(resolve=>{began=resolve;});
  let finish:()=>void=()=>{};
  const gain={gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return gain;},disconnect(){calls.gainDisconnected++;}};
  const source={buffer:null,connect(){return gain;},start(){if(startThrows)throw new Error('source unavailable');},stop(){calls.stopped++;},disconnect(){calls.sourceDisconnected++;}};
  class Context{
    destination={};
    async decodeAudioData(){return {duration:.5};}
    createBufferSource(){return source;}
    createGain(){return gain;}
    startRendering(){began();return new Promise<void>(resolve=>{finish=resolve;});}
  }
  globals(t,{OfflineAudioContext:Context});
  return {calls,started,finish:()=>finish()};
}

test('cancelling an offline audio render stops and disconnects its graph',async t=>{
  const graph=audioGraph(t),controller=new AbortController();
  const pending=prepareAudio(new File(['audio'],'clip.wav'),defaultWebConfig().audio,3,controller.signal);
  await graph.started;controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual(graph.calls,{stopped:1,sourceDisconnected:1,gainDisconnected:1});
  graph.finish();
});

test('an audio scheduling error still disconnects both created nodes',async t=>{
  const graph=audioGraph(t,true);
  await assert.rejects(prepareAudio(new File(['audio'],'clip.wav'),defaultWebConfig().audio,3),/source unavailable/);
  assert.equal(graph.calls.sourceDisconnected,1);assert.equal(graph.calls.gainDisconnected,1);
});

test('MP4 cancellation awaits encoder cleanup before releasing the canvas and returning',async t=>{
  const canvases=browser(t),controller=new AbortController();
  const {CanvasSource,Output}=await import('mediabunny');
  let encoded:()=>void=()=>{},releaseFrame:()=>void=()=>{},cancelling:()=>void=()=>{},releaseCleanup:()=>void=()=>{};
  const frameStarted=new Promise<void>(resolve=>{encoded=resolve;});
  const cleanupStarted=new Promise<void>(resolve=>{cancelling=resolve;});
  const cleanupBarrier=new Promise<void>(resolve=>{releaseCleanup=resolve;});
  t.after(()=>{releaseFrame();releaseCleanup();});
  t.mock.method(CanvasSource.prototype,'add',()=>{encoded();return new Promise<void>(resolve=>{releaseFrame=resolve;});});
  const cancel=Output.prototype.cancel;
  let cancelCalls=0;
  t.mock.method(Output.prototype,'cancel',function(this:import('mediabunny').Output){
    cancelCalls++;const pending=cancel.call(this);cancelling();
    return pending.then(()=>cleanupBarrier);
  });
  let settled=false;
  const pending=exportVideo(defaultWebConfig(),{signal:controller.signal});
  const result=assert.rejects(pending,{name:'AbortError'}).finally(()=>{settled=true;});
  await frameStarted;controller.abort();await cleanupStarted;
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(settled,false,'returning before encoder cleanup completes would leak pending work');
  releaseCleanup();await result;
  assert.equal(cancelCalls,1);
  assert.deepEqual([canvases[0].width,canvases[0].height],[1,1]);
  releaseFrame();
});
