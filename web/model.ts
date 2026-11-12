import {z} from 'zod';
import type {SignatureConfig} from '../src/config';
import defaultDesign from './default-design.json';
import {STORED_DECORATION_IDS} from './decoration-catalog';

const color = z.string().regex(/^#[\da-f]{6}$/i, '请选择有效的颜色');
const finite = (min:number,max:number) => z.number().finite().min(min).max(max);
export const fontFamilies = [
  {id:'tyx-brush',name:'TYX Brush · 原作连笔'},
] as const;
export const personSchema = z.object({
  name:z.string().max(40,'最多输入 40 个字符'),
  // Retain old values when reading saved designs; the website uses the authored glyphs directly.
  scheme:z.enum(['classic','loop','sweep']).default('classic'),
  position:z.object({x:finite(-.45,.45),y:finite(-.45,.45),scale:finite(.45,1.5),rotation:finite(-20,20)}),
  font:z.object({family:z.enum(['tyx-brush','tyx-soft']).default('tyx-brush'),size:finite(48,320),penWidth:finite(.5,2),pressure:finite(0,1),initialScale:finite(1,1.6),initialOffsetX:finite(-120,120),initialOffsetY:finite(-120,120),terminalLength:finite(.5,1.8)}),
  ink:z.object({color}),
  glow:z.object({enabled:z.boolean(),color,strength:finite(0,1),radius:finite(0,48)}),
  decoration:z.object({id:z.enum(STORED_DECORATION_IDS),scale:finite(.5,1.5),offsetX:finite(-.45,.45),offsetY:finite(-.45,.45),action:z.enum(['wink','none']),earFold:z.boolean(),playful:z.boolean().default(true)}),
  underline:z.object({enabled:z.boolean(),lift:z.boolean()}),
  comet:z.object({enabled:z.boolean(),color,size:finite(.5,3)}),
}).strict();
export const webSchema = z.object({
  version:z.literal(2),
  mode:z.enum(['single','couple']),
  people:z.tuple([personSchema,personSchema]),
  canvas:z.object({aspect:z.enum(['landscape','portrait','square']),background:color,transparent:z.boolean().default(false)}),
  timing:z.object({duration:finite(3,15),writingRatio:finite(.35,.8),hold:finite(.2,3)}),
  animation:z.object({introOutroEnabled:z.boolean().default(true)}).strict().default({introOutroEnabled:true}),
  effects:z.object({sparkles:z.boolean(),hearts:z.boolean(),intensity:finite(0,1)}),
  audio:z.object({start:finite(0,3600),volume:finite(0,1),fadeIn:finite(0,3),fadeOut:finite(0,3)}),
}).strict().superRefine((c,ctx)=>{
  for(let i=0;i<(c.mode==='couple'?2:1);i++){
    const name=c.people[i].name,prefix=c.mode==='couple'?`${i===0?'第一':'第二'}位：`:'';
    if(!name||!/[a-z]/i.test(name))ctx.addIssue({code:'custom',path:['people',i,'name'],message:`${prefix}至少输入一个英文字母`});
    else if(!/^[ -~]+$/.test(name))ctx.addIssue({code:'custom',path:['people',i,'name'],message:`${prefix}请使用键盘可输入的英文字母、数字与符号`});
  }
  if(c.timing.duration-c.timing.hold<2)ctx.addIssue({code:'custom',path:['timing','hold'],message:'请为书写和收尾保留至少 2 秒，缩短定格或增加总时长'});
});
export type PersonConfig=z.infer<typeof personSchema>;
export type WebConfig=z.infer<typeof webSchema>;
export type Scheme=PersonConfig['scheme'];
export const STORAGE_KEY='tyx-signature.website.v7';
const LEGACY_STORAGE_KEYS=['tyx-signature.website.v6','tyx-signature.website.v5','tyx-signature.website.v4','tyx-signature.website.v3','tyx-signature.website.v2'];
export const canvasSize=(aspect:WebConfig['canvas']['aspect']) => aspect==='portrait'?{width:1080,height:1920}:aspect==='square'?{width:1080,height:1080}:{width:1920,height:1080};

export function defaultPerson(index=0):PersonConfig{
  return personSchema.parse(structuredClone(defaultDesign.people[index===0?0:1]));
}
export function defaultWebConfig():WebConfig{
  return webSchema.parse(structuredClone(defaultDesign));
}
function simplifyDesign(config:WebConfig):WebConfig{
  for(const person of config.people){
    person.scheme='classic';
    person.font.family='tyx-brush';
    // Fold the previous two size controls into the sole scale value once.
    person.position.scale=clamp(person.position.scale*person.font.size/240,.45,1.5);
    person.font.size=240;
    person.font.pressure=.85;
    person.font.initialScale=1.15;
    person.font.initialOffsetX=0;
    person.font.initialOffsetY=0;
    person.font.terminalLength=1;
    person.position.rotation=-6;
    if(['cat','rabbit','bow'].includes(person.decoration.id))person.decoration.id='none';
    person.decoration.action='wink';
    person.decoration.earFold=true;
    person.decoration.playful=true;
  }
  return config;
}
export function validateConfig(value:unknown):WebConfig{
  const result=webSchema.safeParse(value);
  if(!result.success)throw new Error(result.error.issues.map(i=>i.message).filter((v,i,a)=>a.indexOf(v)===i).join('；'));
  return simplifyDesign(result.data);
}
export function parseConfigFile(text:string):WebConfig{
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new Error('配置文件不是有效的 JSON，请重新选择导出的配置文件');}
  return validateConfig(value);
}
export function loadConfig(storage:Pick<Storage,'getItem'>):{config:WebConfig;warning?:string}{
  try{
    const raw=storage.getItem(STORAGE_KEY);
    if(raw)return {config:parseConfigFile(raw)};
    const legacy=LEGACY_STORAGE_KEYS.map(key=>storage.getItem(key)).find(Boolean);
    if(!legacy)return {config:defaultWebConfig()};
    // Structural compatibility is shared with file import. A new storage key
    // must not replace an existing user's names, colors, timing or choices.
    return {config:parseConfigFile(legacy)};
  }catch{return {config:defaultWebConfig(),warning:'上次的本地配置无法读取，已打开默认方案。你可以重新导入保存的配置。'};}
}
export function saveConfig(storage:Pick<Storage,'setItem'>,config:WebConfig){
  storage.setItem(STORAGE_KEY,JSON.stringify(validateConfig(config)));
}
export function asBrushConfig(person:PersonConfig,web:WebConfig):SignatureConfig{
  const {family,...font}=person.font;
  const legacyDecoration=['sun','cat','heart','star','none'].includes(person.decoration.id)?person.decoration.id as SignatureConfig['decoration']['id']:'none';
  return {schemaVersion:1,name:person.name,font:{...font,id:'tyx-brush',weight:400},ink:person.ink,glow:person.glow,
    decoration:{...person.decoration,id:legacyDecoration,offsetX:0,offsetY:0},underline:person.underline,comet:person.comet,
    timing:{mode:'duration',durationSeconds:web.timing.duration,speed:1},canvas:{...canvasSize(web.canvas.aspect),fps:30},
    background:{mode:web.canvas.transparent?'transparent':'solid',color:web.canvas.background},seed:7};
}
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
