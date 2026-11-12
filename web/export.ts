import {canvasSize,validateConfig,type WebConfig} from './model';
import {prepareScene,renderScene} from './renderer';
import {cancelled,prepareAudio,withCancellation} from './audio';

const FPS=30;
const VIDEO_BITRATE=8_000_000;
const AUDIO_BITRATE=192_000;
const CODECS=['avc1.640028','avc1.4d0028','avc1.420028'];
const SWITCH_BROWSER='请换用较新的系统浏览器，或在电脑上的 Chrome、Edge 中导出。';

type Support={supported:boolean;reason?:string};
type EncoderSupport=Support&{codec?:string};
export type ExportOptions={
  audioFile?:File|null;
  signal?:AbortSignal;
  onProgress?:(progress:number,stage:string)=>void;
};

async function detectSupport(config:WebConfig,withAudio:boolean):Promise<EncoderSupport>{
  if(typeof document==='undefined'||!globalThis.isSecureContext){
    return {supported:false,reason:'视频导出需要 HTTPS 网站或本机 localhost 页面。'};
  }
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined'){
    return {supported:false,reason:`当前浏览器没有可用的视频编码能力。${SWITCH_BROWSER}`};
  }
  if(withAudio&&typeof OfflineAudioContext==='undefined'){
    return {supported:false,reason:`当前浏览器不能处理音乐，可移除音乐后导出。${SWITCH_BROWSER}`};
  }
  const {canEncodeVideo,canEncodeAudio,Quality}=await import('mediabunny');
  const {width,height}=canvasSize(config.canvas.aspect);
  let selected:string|undefined;
  for(const codec of CODECS){
    try{
      // Mediabunny's check includes size and quality; the native check also includes our actual frame rate.
      const native=await VideoEncoder.isConfigSupported({codec,width,height,bitrate:VIDEO_BITRATE,framerate:FPS,latencyMode:'quality',hardwareAcceleration:'no-preference'});
      if(native.supported&&await canEncodeVideo('avc',{width,height,quality:new Quality({bitrate:VIDEO_BITRATE}),fullCodecString:codec,latencyMode:'quality',hardwareAcceleration:'no-preference'})){
        selected=codec;
        break;
      }
    }catch{/* Another AVC profile may still be usable on this device. */}
  }
  if(!selected)return {supported:false,reason:`当前设备不能导出 ${width} × ${height}、30 帧的 MP4。${SWITCH_BROWSER}`};
  if(withAudio&&!await canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000,quality:new Quality({bitrate:AUDIO_BITRATE})})){
    return {supported:false,reason:`当前浏览器不能把音乐编码进 MP4，可移除音乐后导出。${SWITCH_BROWSER}`};
  }
  return {supported:true,codec:selected};
}

export async function checkExportSupport(input:WebConfig,audioFile?:File|null):Promise<Support>{
  try{
    const config=validateConfig(input);
    const result=await detectSupport(config,!!audioFile);
    return {supported:result.supported,reason:result.reason};
  }catch(error){
    return {supported:false,reason:error instanceof Error?error.message:'无法检查导出能力，请刷新页面后重试'};
  }
}

export async function exportVideo(input:WebConfig,options:ExportOptions={}):Promise<Blob>{
  const {signal,audioFile,onProgress}=options;
  cancelled(signal);
  // H.264 has no alpha channel: render onto the user's retained background
  // even if this API is called with a transparent GIF design.
  const config=validateConfig(structuredClone(input));
  config.canvas.transparent=false;
  onProgress?.(0,'检查导出能力');
  const support=await withCancellation(detectSupport(config,!!audioFile),signal);
  cancelled(signal);
  if(!support.supported||!support.codec)throw new Error(support.reason??`当前浏览器无法导出 MP4。${SWITCH_BROWSER}`);
  cancelled(signal);
  const scene=prepareScene(config);
  const frames=Math.round(scene.duration*FPS);
  const duration=frames/FPS;
  const canvas=document.createElement('canvas');
  canvas.width=scene.width;
  canvas.height=scene.height;
  let output:import('mediabunny').Output|undefined;
  let cancellation:Promise<void>|undefined;
  const releaseOutput=()=>{
    if(!output||output.state==='finalized')return Promise.resolve();
    return cancellation??=output.cancel().catch(()=>{});
  };
  const abort=()=>{void releaseOutput();};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    let audio:AudioBuffer|undefined;
    if(audioFile){
      onProgress?.(.02,'准备音乐');
      audio=await prepareAudio(audioFile,config.audio,duration,signal);
    }
    cancelled(signal);
    const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality}=await import('mediabunny');
    cancelled(signal);
    const target=new BufferTarget();
    output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
    const videoSource=new CanvasSource(canvas,{
      codec:'avc',quality:new Quality({bitrate:VIDEO_BITRATE}),fullCodecString:support.codec,
      latencyMode:'quality',hardwareAcceleration:'no-preference',alpha:'discard',keyFrameInterval:1,
    });
    output.addVideoTrack(videoSource,{frameRate:FPS});
    const audioSource=audio?new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:AUDIO_BITRATE})}):undefined;
    if(audioSource)output.addAudioTrack(audioSource);
    cancelled(signal);
    await withCancellation(output.start(),signal);
    if(audioSource&&audio){
      onProgress?.(.06,'编码音乐');
      await withCancellation(audioSource.add(audio),signal);
      audioSource.close();
      audio=undefined;
    }
    for(let frame=0;frame<frames;frame++){
      cancelled(signal);
      renderScene(canvas,scene,frame/FPS);
      await withCancellation(videoSource.add(frame/FPS,1/FPS),signal);
      onProgress?.(.1+.84*(frame+1)/frames,`制作视频 ${frame+1} / ${frames} 帧`);
      // Give touch, progress painting and cancel events time to run; this does not set animation timing.
      if(frame%4===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    cancelled(signal);
    videoSource.close();
    onProgress?.(.96,'整理 MP4 文件');
    await withCancellation(output.finalize(),signal);
    cancelled(signal);
    if(!target.buffer?.byteLength)throw new Error('导出没有生成可用的视频文件，请重试');
    const blob=new Blob([target.buffer],{type:'video/mp4'});
    onProgress?.(1,'视频已准备好');
    return blob;
  }catch(error){
    cancelled(signal);
    if(error instanceof Error&&error.name==='AbortError')throw error;
    const message=error instanceof Error?error.message:'视频编码失败';
    throw new Error(`导出失败：${message}。请重试，或换用系统浏览器、电脑。`,{cause:error});
  }finally{
    signal?.removeEventListener('abort',abort);
    // Await an in-flight abort as well as failures during setup or encoding.
    await releaseOutput();
    canvas.width=1;
    canvas.height=1;
  }
}
