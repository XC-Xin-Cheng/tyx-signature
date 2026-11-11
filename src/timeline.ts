import type {SignatureConfig} from './config';
import {SignatureError} from './errors';
export const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
export const between=(t:number,a:number,b:number)=>b<=a?(t>=b?1:0):smooth((t-a)/(b-a));
export const writingTiming={glyphGap:.018,wordGap:.09,deferDots:true,strokeEasing:(x:number)=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2};
export type Phase={start:number;end:number};
export function makePlan(c:SignatureConfig,naturalSeconds:number){
 const lead=c.comet.enabled ? .15 : 0;
 const deco=c.decoration.id==='none'?(c.comet.enabled&&c.underline.enabled ? .35 : 0):.65;
 const line=c.underline.enabled ? .35 : 0;
 const leave=c.comet.enabled&&c.underline.enabled ? .35 : 0;
 const wink=c.decoration.id==='cat'&&c.decoration.earFold ? .60 : c.decoration.action==='wink'&&['sun','cat'].includes(c.decoration.id) ? .30 : 0;
 const hold=.35;const overhead=lead+deco+line+leave+wink+hold;
 const draw=c.timing.mode==='duration'?c.timing.durationSeconds-overhead:naturalSeconds/c.timing.speed;
 if(draw<.3||naturalSeconds/draw>8)throw new SignatureError('DURATION_TOO_SHORT','当前姓名笔画较多，指定时长过短。','请增加时长，或改用指定速度模式。');
 let clock=0;const phase=(duration:number):Phase=>{const p={start:clock,end:clock+duration};clock+=duration;return p;};
 const phases={lead:phase(lead),writing:phase(draw),decoration:phase(deco),underline:phase(line),leaving:phase(leave),wink:phase(wink),hold:phase(hold)};
 const total=c.timing.mode==='duration'?c.timing.durationSeconds:Number(clock.toFixed(6));
 phases.hold.end=total;
 return {...phases,total,naturalSeconds,durationInFrames:Math.ceil(total*c.canvas.fps)};
}
export type Plan=ReturnType<typeof makePlan>;
export function naturalTime(t:number,plan:Plan){return clamp((t-plan.writing.start)/(plan.writing.end-plan.writing.start))*plan.naturalSeconds;}
