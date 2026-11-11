import type {WebConfig} from './model';

type AudioSettings=WebConfig['audio'];
export type EnvelopePoint={time:number;gain:number};

function validDuration(duration:number){
  if(!Number.isFinite(duration)||duration<=0)throw new Error('音频片段时长必须是大于零的有效数值');
}

export function audioWindow(sourceDuration:number,outputDuration:number,start:number){
  if(!Number.isFinite(sourceDuration)||sourceDuration<=0)throw new Error('这段音频没有可用的声音数据，请选择其他文件');
  validDuration(outputDuration);
  if(!Number.isFinite(start))throw new Error('音乐起点必须是有效数值');
  if(start>=sourceDuration)throw new Error('音乐起点超出了音频长度，请把起点调小');
  return {offset:Math.max(0,start),duration:Math.min(outputDuration,sourceDuration-Math.max(0,start))};
}

/** Keep both fades inside the audible clip, including when the music ends before the video. */
export function audioEnvelope(duration:number,settings:AudioSettings):EnvelopePoint[]{
  validDuration(duration);
  const requested=settings.fadeIn+settings.fadeOut;
  const fit=requested>duration?duration/requested:1;
  const fadeIn=settings.fadeIn*fit,fadeOut=settings.fadeOut*fit;
  const points:EnvelopePoint[]=[{time:0,gain:fadeIn>0?0:settings.volume}];
  if(fadeIn>0)points.push({time:fadeIn,gain:settings.volume});
  if(duration-fadeOut>fadeIn)points.push({time:duration-fadeOut,gain:settings.volume});
  points.push({time:duration,gain:fadeOut>0?0:settings.volume});
  return points;
}

export function cancelled(signal?:AbortSignal){
  if(signal?.aborted)throw new DOMException('已取消导出','AbortError');
}

/** Reject promptly during decoding/rendering, even though the browser work itself cannot be aborted. */
export function withCancellation<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
  if(!signal)return promise;
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('已取消导出','AbortError'));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    if(signal.aborted)abort();
  });
}

export async function prepareAudio(file:File,settings:AudioSettings,duration:number,signal?:AbortSignal):Promise<AudioBuffer>{
  cancelled(signal);
  validDuration(duration);
  if(typeof OfflineAudioContext==='undefined')throw new Error('当前浏览器不能处理音乐，请移除音乐后导出，或换用系统浏览器、电脑');
  const context=new OfflineAudioContext(2,Math.round(duration*48000),48000);
  const bytes=await withCancellation(file.arrayBuffer(),signal);
  let decoded:AudioBuffer;
  try{decoded=await withCancellation(context.decodeAudioData(bytes),signal);}
  catch(error){
    cancelled(signal);
    throw new Error('无法读取这段音乐，请选择 MP3、WAV、M4A 等当前浏览器支持的音频文件',{cause:error});
  }
  cancelled(signal);
  const window=audioWindow(decoded.duration,duration,settings.start);
  const source=context.createBufferSource(),gain=context.createGain();
  try{
    source.buffer=decoded;
    source.connect(gain).connect(context.destination);
    const points=audioEnvelope(window.duration,settings);
    gain.gain.setValueAtTime(points[0].gain,0);
    for(const point of points.slice(1))gain.gain.linearRampToValueAtTime(point.gain,point.time);
    source.start(0,window.offset,window.duration);
    const result=await withCancellation(context.startRendering(),signal);
    cancelled(signal);
    return result;
  }finally{
    // Rendering itself cannot be aborted, so silence and release its graph even
    // when a file, scheduling operation or cancellation has already failed.
    try{source.stop();}catch{/* It may not have started, or may already have ended. */}
    source.disconnect();
    gain.disconnect();
  }
}
