import {canvasSize,validateConfig,type WebConfig} from './model';
import {prepareScene,renderScene} from './renderer';
import {cancelled,withCancellation} from './audio';

const LONG_EDGE=960;
const FRAME_CENTISECONDS=5; // GIF timing is stored in hundredths of a second: 20 fps.
const ALPHA_THRESHOLD=128;

export type GifExportOptions={
  signal?:AbortSignal;
  onProgress?:(progress:number,stage:string)=>void;
};

export function exportGifSize(config:Pick<WebConfig,'canvas'>):{width:number;height:number}{
  const {width,height}=canvasSize(config.canvas.aspect),scale=LONG_EDGE/Math.max(width,height);
  return {width:Math.round(width*scale),height:Math.round(height*scale)};
}

type Codec=Pick<typeof import('gifenc'),'quantize'|'applyPalette'>;
type GifCodec=Codec&Pick<typeof import('gifenc'),'GIFEncoder'>;
function isCodec(value:unknown):value is GifCodec{
  if(value===null||(typeof value!=='object'&&typeof value!=='function'))return false;
  return ['GIFEncoder','quantize','applyPalette'].every(key=>typeof Reflect.get(value,key)==='function');
}
function indexFrame(rgba:Uint8ClampedArray,transparent:boolean,codec:Codec,scratch?:Uint8Array){
  if(!transparent){
    const palette=codec.quantize(rgba,256,{format:'rgb565'});
    return {palette,index:codec.applyPalette(rgba,palette,'rgb565')};
  }
  // Canvas exposes straight (unmatted) RGB. Quantize only visible pixels so
  // transparent black never darkens the palette or consumes an opaque color.
  // GIF cannot preserve partial alpha: use a fixed threshold, without a matte.
  const visible=scratch!;
  let length=0;
  for(let i=0;i<rgba.length;i+=4){
    if(rgba[i+3]<ALPHA_THRESHOLD)continue;
    visible[length++]=rgba[i];visible[length++]=rgba[i+1];visible[length++]=rgba[i+2];visible[length++]=255;
  }
  const index=new Uint8Array(rgba.length/4);
  // Reserve index 0 even when this particular frame contains no clear pixels.
  // The logical-screen background and every frame share that transparent index.
  if(!length)return {palette:[[0,0,0],[0,0,0]],index};
  const colors=visible.subarray(0,length),opaquePalette=codec.quantize(colors,255,{format:'rgb565'});
  const mapped=codec.applyPalette(colors,opaquePalette,'rgb565');
  let cursor=0;
  for(let i=0;i<index.length;i++)if(rgba[i*4+3]>=ALPHA_THRESHOLD)index[i]=mapped[cursor++]+1;
  return {palette:[[0,0,0],...opaquePalette],index};
}

/** Encode the shared Canvas timeline directly; no video codec, recording or audio is involved. */
export async function exportGif(input:WebConfig,options:GifExportOptions={}):Promise<Blob>{
  const {signal,onProgress}=options;
  cancelled(signal);
  const config=validateConfig(input);
  if(typeof document==='undefined')throw new Error('GIF 导出需要在浏览器中打开网站');
  const scene=prepareScene(config),size=exportGifSize(config);
  const totalCentiseconds=Math.round(scene.duration*100),frames=Math.ceil(totalCentiseconds/FRAME_CENTISECONDS);
  let source:HTMLCanvasElement|undefined,sample:HTMLCanvasElement|undefined,encoder:import('gifenc').Encoder|undefined;
  try{
    onProgress?.(0,'准备 GIF 编码器');
    // Keep the encoder out of the initial application bundle and size helper.
    const imported=await withCancellation(import('gifenc'),signal);
    // Browsers resolve the package's ESM entry; Node's CJS entry can expose
    // its getters only through default. Both refer to the same upstream API.
    const candidate:unknown=isCodec(imported)?imported:Reflect.get(imported,'default');
    if(!isCodec(candidate))throw new Error('无法加载 GIF 编码器，请刷新页面后重试');
    const codec=candidate;
    cancelled(signal);
    source=document.createElement('canvas');
    source.width=scene.width;source.height=scene.height;
    sample=document.createElement('canvas');
    sample.width=size.width;sample.height=size.height;
    const context=sample.getContext('2d',{alpha:true,willReadFrequently:true});
    if(!context)throw new Error('当前浏览器无法创建 GIF 画布，请更换系统浏览器后重试');
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality='high';
    encoder=codec.GIFEncoder();
    const scratch=config.canvas.transparent?new Uint8Array(size.width*size.height*4):undefined;
    for(let frame=0;frame<frames;frame++){
      cancelled(signal);
      const centisecond=frame*FRAME_CENTISECONDS;
      renderScene(source,scene,centisecond/100);
      context.setTransform(1,0,0,1,0,0);
      context.globalAlpha=1;context.globalCompositeOperation='source-over';
      context.clearRect(0,0,size.width,size.height);
      context.drawImage(source,0,0,size.width,size.height);
      const {data}=context.getImageData(0,0,size.width,size.height);
      const {palette,index}=indexFrame(data,config.canvas.transparent,codec,scratch);
      cancelled(signal);
      encoder.writeFrame(index,size.width,size.height,{
        palette,transparent:config.canvas.transparent,transparentIndex:0,dispose:2,repeat:0,
        delay:Math.min(FRAME_CENTISECONDS,totalCentiseconds-centisecond)*10,
      });
      onProgress?.(.04+.92*(frame+1)/frames,`制作 GIF ${frame+1} / ${frames} 帧`);
      // Yield after each frame so cancel and progress remain responsive. Only
      // one frame's pixels and the compressed output are retained at a time.
      await withCancellation(new Promise<void>(resolve=>setTimeout(resolve,0)),signal);
    }
    cancelled(signal);
    onProgress?.(.98,'整理 GIF 文件');
    encoder.finish();
    const bytes=encoder.bytesView();
    if(!bytes.byteLength)throw new Error('没有生成可用的 GIF 文件');
    const blob=new Blob([bytes],{type:'image/gif'});
    cancelled(signal);
    onProgress?.(1,'GIF 已准备好');
    return blob;
  }catch(error){
    cancelled(signal);
    if(error instanceof Error&&error.name==='AbortError')throw error;
    throw new Error(`GIF 导出失败：${error instanceof Error?error.message:'请刷新页面后重试'}`,{cause:error});
  }finally{
    encoder?.reset();
    if(source){source.width=1;source.height=1;}
    if(sample){sample.width=1;sample.height=1;}
  }
}
