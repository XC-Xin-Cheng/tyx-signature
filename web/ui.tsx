import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {iconPaths} from './icon-paths';

export type IconName=keyof typeof iconPaths;
export function Icon({name,size=18}:{name:IconName;size?:number}){
  return <svg className="ui-icon" data-icon={name} data-icon-family="phosphor" width={size} height={size} viewBox="0 0 256 256" fill="currentColor" stroke="none" aria-hidden="true" focusable="false">{iconPaths[name].map((path,index)=><path key={index} d={path}/>)}</svg>;
}
export function Range({title,value,min,max,step=.01,suffix='',onChange}:{title:string;value:number;min:number;max:number;step?:number;suffix?:string;onChange:(n:number)=>void}){
  const id=useId(),editing=useRef(false),dirty=useRef(false),lastValue=useRef(value);
  const decimalPlaces=(number:number)=>{
    const [digits,exponent='0']=String(number).toLowerCase().split('e');
    return Math.max(0,(digits.split('.')[1]?.length??0)-Number(exponent));
  };
  const precision=Math.min(12,Math.max(decimalPlaces(min),decimalPlaces(step)));
  // Saved designs can contain finer values than the control's editing step.
  const format=(number:number)=>String(Number(number.toFixed(12)));
  const [draft,setDraft]=useState(()=>format(value));
  const progress=Math.max(0,Math.min(1,(value-min)/(max-min||1)));
  lastValue.current=value;
  useEffect(()=>{if(!editing.current)setDraft(String(Number(value.toFixed(12))));},[value]);
  const parse=(text:string)=>{
    const trimmed=text.trim();
    if(!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed))return null;
    const number=Number(trimmed);
    return Number.isFinite(number)?number:null;
  };
  const commit=(text:string)=>{
    const parsed=parse(text);
    if(!dirty.current||parsed===null){setDraft(format(lastValue.current));dirty.current=false;return;}
    dirty.current=false;
    const candidate=parsed;
    const bounded=Math.max(min,Math.min(max,candidate));
    const snapped=step>0?min+Math.round((bounded-min)/step)*step:bounded;
    const lastStep=step>0?min+Math.floor((max-min)/step+1e-9)*step:max;
    const next=Number(Math.max(min,Math.min(lastStep,snapped)).toFixed(precision));
    setDraft(format(next));
    if(next!==value)onChange(next);
  };
  return <div className="range-field"><span className="range-header"><label className="range-title" htmlFor={id}>{title}</label><span className="range-value-box"><input
    className="range-value-input"
    type="text"
    inputMode="decimal"
    aria-label={`${title}数值`}
    aria-describedby={suffix?`${id}-unit`:undefined}
    autoComplete="off"
    spellCheck={false}
    value={draft}
    onFocus={()=>{editing.current=true;dirty.current=false;}}
    onChange={event=>{
      const text=event.target.value;
      dirty.current=true;
      setDraft(text);
      const number=parse(text);
      // Keep partial decimals and out-of-range drafts intact; only usable numbers reach the live design.
      if(number!==null&&number>=min&&number<=max&&number!==value)onChange(number);
    }}
    onBlur={event=>{editing.current=false;commit(event.currentTarget.value);}}
    onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.blur();}}}
  />{suffix&&<span className="range-value-suffix" id={`${id}-unit`}>{suffix}</span>}</span></span><span className="range-control" style={{'--range-progress':progress} as CSSProperties}><span className="range-rail" aria-hidden="true"><span className="range-fill"/></span><input id={id} type="range" aria-label={title} aria-valuetext={`${format(value)}${suffix}`} min={min} max={max} step={step} value={value} onChange={event=>{const next=Number(event.target.value);editing.current=false;dirty.current=false;setDraft(format(next));onChange(next);}}/></span></div>;
}
export function Toggle({title,checked,onChange}:{title:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="toggle-row" data-checked={checked}><span>{title}</span><input className="toggle" aria-label={title} aria-checked={checked} type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
export function ColorField({title,value,onChange,editable=false}:{title:string;value:string;onChange:(v:string)=>void;editable?:boolean}){
  const id=useId(),[draft,setDraft]=useState(value.toUpperCase());
  useEffect(()=>setDraft(value.toUpperCase()),[value]);
  const invalid=editable&&!/^#?[\da-f]{6}$/i.test(draft);
  if(!editable)return <label className="color-row"><span>{title}</span><span className="color-swatch" style={{background:value}}><input className="color-input" aria-label={`${title}颜色`} type="color" value={value} onChange={e=>onChange(e.target.value)}/></span><code>{value.toUpperCase()}</code></label>;
  return <div className="color-field"><div className="color-row"><label htmlFor={`${id}-picker`}>{title}</label><span className="color-swatch" style={{background:value}}><input id={`${id}-picker`} className="color-input" aria-label={title} type="color" value={value} onChange={event=>{setDraft(event.target.value.toUpperCase());onChange(event.target.value);}}/></span><input className="color-hex" aria-label={`${title} HEX 色号`} aria-invalid={invalid} aria-describedby={invalid?`${id}-error`:undefined} value={draft} maxLength={7} placeholder="#8FD8FF" spellCheck={false} autoComplete="off" autoCapitalize="characters" onBlur={()=>{if(invalid)setDraft(value.toUpperCase());}} onChange={event=>{const next=event.target.value;setDraft(next);if(/^#?[\da-f]{6}$/i.test(next))onChange(`${next.startsWith('#')?'':'#'}${next}`.toUpperCase());}}/></div>{invalid&&<p className="field-error caption-4" id={`${id}-error`}>请输入6位色号，例如 #8FD8FF。</p>}</div>;
}
export function Section({title,icon,children,collapsible=false}:{title:string;icon?:IconName;children:ReactNode;collapsible?:boolean}){
  const id=useId();
  const heading=<>{icon&&<Icon name={icon} size={15}/>}<span>{title}</span></>;
  if(collapsible)return <details className="panel-section section-accordion"><summary className="section-heading" aria-controls={`${id}-body`}>{heading}<Icon name="chevron" size={13}/></summary><div id={`${id}-body`} className="section-accordion-body">{children}</div></details>;
  return <section className="panel-section" aria-labelledby={id}><h2 id={id} className="section-heading">{heading}</h2>{children}</section>;
}
export function Details({title,children,open=false}:{title:string;children:ReactNode;open?:boolean}){
  const id=useId();
  return <details className="details-group" open={open||undefined}><summary aria-controls={id}>{title}<Icon name="chevron" size={14}/></summary><div id={id} className="details-body">{children}</div></details>;
}
export function UtilityMenu({children}:{children:ReactNode}){
  const root=useRef<HTMLDetailsElement>(null),id=useId();
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target)&&root.current)root.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&root.current?.open){root.current.open=false;root.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  return <details className="utility-menu" ref={root} onToggle={event=>setExpanded(event.currentTarget.open)}><summary className="utility-menu-trigger" aria-label="更多操作" aria-expanded={expanded} aria-controls={id} title="更多操作"><Icon name="more" size={20}/></summary><div id={id} className="utility-menu-panel" role="group" aria-label="设计文件操作" onClick={event=>{if((event.target as Element).closest('button')&&root.current)root.current.open=false;}}>{children}</div></details>;
}
