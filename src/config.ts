import {z} from 'zod';
import catalog from '../assets/fonts/catalog.json';
import {SignatureError} from './errors';
const hex=z.string().regex(/^#[0-9a-f]{6}$/i,'请使用六位十六进制颜色，例如 #ffffff。');
export const fontIds=['tangerine','italianno','ems-allure','tyx-brush'] as const;
export const signatureSchema=z.object({
 schemaVersion:z.literal(1).default(1),
 name:z.string().min(1).max(40).regex(/^[A-Za-z '\-]+$/,'请只使用英文字母、普通空格、英文撇号或连字符。').refine(s=>/[A-Za-z]/.test(s),'姓名中至少需要一个英文字母。').describe('英文或拼音姓名，保留输入大小写'),
 font:z.object({id:z.enum(fontIds).default('tangerine').describe('字体：Tangerine / Italianno / EMS Allure / TYX Brush'),size:z.number().min(48).max(320).default(240).describe('字号，按设计画幅像素计算'),weight:z.literal(400).default(400),penWidth:z.number().min(.5).max(2).default(1).describe('单线字体笔宽倍数；轮廓字体必须为 1。'),pressure:z.number().min(0).max(1).default(1).describe('沿笔段粗细变化的保留程度'),initialScale:z.number().min(1).max(1.6).default(1.3).describe('TYX Brush 整段首字母大小；不改变大小写'),initialOffsetX:z.number().min(-120).max(120).default(0).describe('TYX Brush 首字母左右偏移，设计像素；正数向右'),initialOffsetY:z.number().min(-120).max(120).default(0).describe('TYX Brush 首字母上下偏移，设计像素；正数向下'),terminalLength:z.number().min(.5).max(1.8).default(1).describe('TYX Brush 末字母收笔长度倍数')}).strict().prefault({}),
 ink:z.object({color:hex.default('#f5fffd')}).strict().prefault({}),
 glow:z.object({enabled:z.boolean().default(true),color:hex.default('#59e6d7'),strength:z.number().min(0).max(1).default(.65),radius:z.number().min(0).max(48).default(18)}).strict().prefault({}),
 timing:z.object({mode:z.enum(['duration','speed']).default('duration'),durationSeconds:z.number().min(3).max(15).default(5),speed:z.number().min(.5).max(2).default(1)}).strict().prefault({}),
 canvas:z.object({width:z.number().int().min(320).max(3840).default(1920),height:z.number().int().min(320).max(3840).default(1080),fps:z.number().int().refine(n=>n===30||n===60,'帧率请选择 30 或 60。').default(60)}).strict().prefault({}),
 background:z.object({mode:z.enum(['solid','transparent']).default('solid'),color:hex.default('#000000')}).strict().prefault({}),
 decoration:z.object({id:z.enum(['sun','cat','heart','star','none']).default('sun'),scale:z.number().min(.5).max(1.5).default(1),offsetX:z.number().min(-.4).max(.4).default(0),offsetY:z.number().min(-.4).max(.4).default(0),action:z.enum(['wink','none']).default('wink'),earFold:z.boolean().default(true)}).strict().prefault({}),
 underline:z.object({enabled:z.boolean().default(true),lift:z.boolean().default(true)}).strict().prefault({}),
 comet:z.object({enabled:z.boolean().default(true),color:hex.default('#f07cda'),size:z.number().min(.5).max(3).default(1.6)}).strict().prefault({}),
 seed:z.number().int().min(0).max(2147483647).default(7),
}).strict();
export type SignatureConfig=z.infer<typeof signatureSchema>;
export const defaultConfig=signatureSchema.parse({name:'Chen Ming'});
export function parseConfig(input:unknown):SignatureConfig {
 const result=signatureSchema.safeParse(input,{error:(issue)=>{
  if(issue.code==='invalid_type')return {message:'参数类型不正确，请按参数说明填写。'};
  if(issue.code==='too_small')return {message:issue.origin==='string'?`至少需要 ${issue.minimum} 个字符。`:`数值不能小于 ${issue.minimum}。`};
  if(issue.code==='too_big')return {message:issue.origin==='string'?`最多允许 ${issue.maximum} 个字符。`:`数值不能大于 ${issue.maximum}。`};
  if(issue.code==='invalid_value')return {message:issue.values.length===1?`该参数必须为 ${JSON.stringify(issue.values[0])}。`:`请选择可用选项：${issue.values.join('、')}。`};
  if(issue.code==='unrecognized_keys')return {message:`存在未知字段：${issue.keys.join('、')}。`};
  return {message:issue.message??'参数不符合要求，请参照参数说明修改。'};
 }});
 if(!result.success)throw new SignatureError('CONFIG_INVALID',result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('\n'),'请修改 signature.json 中指出的字段；上次保存的配置会保留。');
 const c=result.data;const font=catalog.find(f=>f.id===c.font.id)!;
 if(font.kind!=='stroke'&&c.font.penWidth!==1)throw new SignatureError('FONT_WIDTH_UNAVAILABLE',`${font.label} 使用真实轮廓，笔宽倍数 penWidth 必须为 1。`,'如需改变笔宽，请选择 EMS Allure 或 TYX Brush。');
 const missing=[...new Set([...c.name].filter(ch=>ch!==' '&&!font.coverage.includes(ch)))];
 if(missing.length)throw new SignatureError('FONT_MISSING_GLYPH',`${font.label} 缺少以下字符的运笔数据：${missing.join(' ')}`,'请选其他内置字体或修改姓名；程序不会擅自替换字符。');
 return c;
}
export const fontInfo=(id:string)=>catalog.find(f=>f.id===id)!;
export function mergeConfig(base:unknown,patch:unknown):unknown {
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch;
 const out:Record<string,unknown>={...(base as Record<string,unknown>)};
 for(const [key,val] of Object.entries(patch)){
  if(['__proto__','prototype','constructor'].includes(key))throw new SignatureError('CONFIG_INVALID','配置中包含不允许的字段名。');
  out[key]=val&&typeof val==='object'&&!Array.isArray(val)?mergeConfig(out[key]??{},val):val;
 }
 return out;
}
