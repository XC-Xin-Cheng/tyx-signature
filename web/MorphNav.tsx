import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';
import {Icon,type IconName} from './ui';

export type CreativePanel='signature'|'decoration'|'export';
const panels:{id:CreativePanel;label:string;icon:IconName}[]=[
  {id:'signature',label:'签名',icon:'pen'},
  {id:'decoration',label:'装饰',icon:'sparkle'},
  {id:'export',label:'导出',icon:'download'},
];
const BAR_HEIGHT=56;
const CURVE='cubic-bezier(0.22,1,0.36,1)';
type Snapshot={panel:CreativePanel;node:ReactNode;open:boolean;width:number;height:number};
type ExitSnapshot=Snapshot&{id:number};
type LayoutBox={left:number;top:number;width:number;height:number};
type ButtonLayout={center:number};
function matrixOf(element:Element):{a:number;d:number;e:number;f:number}{
  const transform=getComputedStyle(element).transform;
  if(transform==='none'||typeof DOMMatrixReadOnly==='undefined')return {a:1,d:1,e:0,f:0};
  const matrix=new DOMMatrixReadOnly(transform);return {a:matrix.a,d:matrix.d,e:matrix.e,f:matrix.f};
}

/** Layout settles immediately; only the empty surface scales, keeping all text undistorted. */
export function MorphNav({active,onActiveChange,children,footer,busy=false}:{active:CreativePanel;onActiveChange:(panel:CreativePanel)=>void;children:ReactNode;footer?:ReactNode;busy?:boolean}){
  const [open,setOpen]=useState(true),[bodyHeight,setBodyHeight]=useState(260);
  const [viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.innerHeight}));
  const [room,setRoom]=useState({width:360,height:600}),[exiting,setExiting]=useState<ExitSnapshot|null>(null);
  const [footerHeight,setFooterHeight]=useState(0),footerElement=useRef<HTMLDivElement>(null),hasFooter=Boolean(footer);
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const root=useRef<HTMLDivElement>(null),shell=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),bar=useRef<HTMLDivElement>(null),measure=useRef<HTMLDivElement>(null),currentPanel=useRef<HTMLDivElement>(null),exitPanel=useRef<HTMLDivElement>(null),pill=useRef<HTMLSpanElement>(null),toggleButton=useRef<HTMLButtonElement>(null);
  const triggers=useRef<Partial<Record<CreativePanel,HTMLButtonElement|null>>>({});
  const previous=useRef<Snapshot>({panel:active,node:children,open:true,width:360,height:260});
  const shellLayout=useRef<LayoutBox|null>(null),buttonLayouts=useRef(new Map<string,ButtonLayout>());
  const barLayout=useRef<{left:number;indicatorLeft:number;indicatorWidth:number}|null>(null);
  const surfaceAnimation=useRef<Animation|null>(null),pillAnimation=useRef<Animation|null>(null),panelAnimation=useRef<Animation|null>(null),exitAnimation=useRef<Animation|null>(null),buttonAnimations=useRef(new Map<string,Animation>());
  const exitTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),exitId=useRef(0);
  const mobile=viewport.width<=760;
  const reservedFooter=hasFooter?footerHeight+12:0;
  const maxBody=mobile?Math.max(260,Math.min(680,viewport.height*.85)):Math.max(120,Math.min(room.height-BAR_HEIGHT-reservedFooter,viewport.height-120-reservedFooter));
  const width=Math.min(room.width,open?(mobile?room.width:360):284);
  const visibleBody=open?Math.min(maxBody,bodyHeight):0,height=BAR_HEIGHT+visibleBody;

  useEffect(()=>{
    const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});
    window.addEventListener('resize',resize,{passive:true});return ()=>window.removeEventListener('resize',resize);
  },[]);
  useEffect(()=>{
    const query=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(query.matches);
    query.addEventListener('change',change);return ()=>query.removeEventListener('change',change);
  },[]);
  useLayoutEffect(()=>{
    const element=root.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>{
      const next={width:Math.max(1,entry.contentRect.width),height:Math.max(1,entry.contentRect.height)};
      setRoom(current=>current.width===next.width&&current.height===next.height?current:next);
    });
    observer.observe(element);return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(busy){onActiveChange('export');setOpen(true);}},[busy,onActiveChange]);
  useLayoutEffect(()=>{
    const element=footerElement.current;if(!element)return;
    const update=()=>{const next=Math.ceil(element.getBoundingClientRect().height);setFooterHeight(current=>current===next?current:next);};
    const observer=new ResizeObserver(update);observer.observe(element);update();return ()=>observer.disconnect();
  },[hasFooter]);
  useEffect(()=>{
    if(!open)return;
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();setOpen(false);triggers.current[active]?.focus();}};
    document.addEventListener('keydown',escape);return ()=>document.removeEventListener('keydown',escape);
  },[open,active,busy]);

  useLayoutEffect(()=>{
    const before=previous.current;
    if(before.open&&(before.panel!==active||!open)){
      setExiting({...before,id:++exitId.current});clearTimeout(exitTimer.current);
      exitTimer.current=setTimeout(()=>setExiting(null),300);
    }
    previous.current={panel:active,node:children,open,width,height:visibleBody};
  },[active,children,open,width,visibleBody]);
  useLayoutEffect(()=>{
    const element=measure.current;if(!element)return;
    const update=()=>{const next=Math.max(0,Math.ceil(element.getBoundingClientRect().height));setBodyHeight(current=>current===next?current:next);};
    const observer=new ResizeObserver(update);observer.observe(element);update();return ()=>observer.disconnect();
  },[active,viewport.width]);

  useLayoutEffect(()=>{
    const element=shell.current,visual=surface.current;if(!element||!visual)return;
    const box=element.getBoundingClientRect(),next={left:box.left,top:box.top,width:box.width,height:box.height},before=shellLayout.current;
    shellLayout.current=next;
    if(!before||!next.width||!next.height||typeof visual.animate!=='function')return;
    // The matrix still describes the previous surface animation. Apply it to
    // the previous layout box, not the newly committed dimensions, when retargeting.
    const matrix=matrixOf(visual),old={left:before.left+matrix.e,top:before.top+matrix.f,width:before.width*matrix.a,height:before.height*matrix.d};
    surfaceAnimation.current?.cancel();
    if(Math.abs(old.left-next.left)<.1&&Math.abs(old.top-next.top)<.1&&Math.abs(old.width-next.width)<.1&&Math.abs(old.height-next.height)<.1)return;
    const frames:Keyframe[]=reduced?[{opacity:.75},{opacity:1}]:[
      {transform:`translate(${old.left-next.left}px,${old.top-next.top}px) scale(${old.width/next.width},${old.height/next.height})`},
      {transform:'translate(0px,0px) scale(1,1)'},
    ];
    surfaceAnimation.current=visual.animate(frames,{duration:reduced?200:500,easing:CURVE});
  },[width,height,reduced]);

  useLayoutEffect(()=>{
    const update=()=>{
      const container=bar.current,indicator=pill.current,button=triggers.current[active];if(!container||!indicator||!button)return;
      if(reduced)pillAnimation.current?.cancel();
      const left=container.getBoundingClientRect().left,next={left,indicatorLeft:button.offsetLeft,indicatorWidth:button.offsetWidth},previousBar=barLayout.current;
      const entries:[string,HTMLButtonElement][]=[];
      for(const panel of panels){const trigger=triggers.current[panel.id];if(trigger)entries.push([panel.id,trigger]);}
      if(toggleButton.current)entries.push(['toggle',toggleButton.current]);
      for(const [id,trigger] of entries){
        const center=left+trigger.offsetLeft+trigger.offsetWidth/2,prior=buttonLayouts.current.get(id),matrix=matrixOf(trigger);
        buttonLayouts.current.set(id,{center});
        if(!prior)continue;
        const dx=prior.center+matrix.e-center;buttonAnimations.current.get(id)?.cancel();
        if(!reduced&&Math.abs(dx)>.1&&typeof trigger.animate==='function')buttonAnimations.current.set(id,trigger.animate([{transform:`translateX(${dx}px)`},{transform:'translateX(0px)'}],{duration:500,easing:CURVE}));
      }
      if(previousBar&&previousBar.left===next.left&&previousBar.indicatorLeft===next.indicatorLeft&&previousBar.indicatorWidth===next.indicatorWidth)return;
      const matrix=matrixOf(indicator),from=`translateX(${(previousBar?.left??left)-left+matrix.e}px) scaleX(${matrix.a})`,to=`translateX(${next.indicatorLeft}px) scaleX(${next.indicatorWidth/100})`;
      pillAnimation.current?.cancel();indicator.style.transform=to;barLayout.current=next;
      if(previousBar&&typeof indicator.animate==='function')pillAnimation.current=indicator.animate(reduced?[{opacity:.6},{opacity:1}]:[{transform:from},{transform:to}],{duration:reduced?200:500,easing:CURVE});
    };
    const observer=new ResizeObserver(update);if(bar.current)observer.observe(bar.current);Object.values(triggers.current).forEach(button=>{if(button)observer.observe(button);});update();return ()=>observer.disconnect();
  },[active,width,reduced]);

  useLayoutEffect(()=>{
    panelAnimation.current?.cancel();const element=currentPanel.current;if(!element||!open||typeof element.animate!=='function')return;
    panelAnimation.current=element.animate(reduced?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0px)'}],{duration:reduced?200:500,easing:CURVE});
  },[active,open,reduced]);
  useLayoutEffect(()=>{
    exitAnimation.current?.cancel();const element=exitPanel.current;if(!element||!exiting||typeof element.animate!=='function')return;
    exitAnimation.current=element.animate(reduced?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'translateY(0px)'},{opacity:0,transform:'translateY(-8px)'}],{duration:300,easing:CURVE,fill:'forwards'});
  },[exiting,reduced]);
  useEffect(()=>()=>{
    clearTimeout(exitTimer.current);surfaceAnimation.current?.cancel();pillAnimation.current?.cancel();panelAnimation.current?.cancel();exitAnimation.current?.cancel();for(const animation of buttonAnimations.current.values())animation.cancel();
  },[]);

  const choose=(panel:CreativePanel)=>{if(busy){setOpen(true);return;}if(panel!==active)onActiveChange(panel);setOpen(true);};
  const navigate=(event:KeyboardEvent<HTMLButtonElement>,panel:CreativePanel)=>{
    if(busy)return;const index=panels.findIndex(item=>item.id===panel);let next:number|undefined;
    if(event.key==='ArrowRight')next=(index+1)%panels.length;if(event.key==='ArrowLeft')next=(index+panels.length-1)%panels.length;if(event.key==='Home')next=0;if(event.key==='End')next=panels.length-1;
    if(next===undefined)return;event.preventDefault();const id=panels[next].id;onActiveChange(id);setOpen(true);triggers.current[id]?.focus();
  };
  return <div className={`morph-nav ${open?'is-open':''}`} ref={root}>
    <div className="morph-shell" ref={shell} data-panel={active} data-open={open} style={{width,height}}>
      <div className="morph-surface" ref={surface} aria-hidden="true" style={{transformOrigin:'0 0'}}/>
      <div className="morph-nav-bar" ref={bar} role="group" aria-label="创作设置">
        <span className="morph-active-pill" ref={pill} aria-hidden="true" style={{left:0,width:100,transform:'translateX(8px) scaleX(1)',transformOrigin:'0 50%'}}/>
        {panels.map(panel=><button key={panel.id} ref={element=>{triggers.current[panel.id]=element;}} className={`morph-trigger ${active===panel.id?'is-active':''}`} disabled={busy&&panel.id!=='export'} aria-expanded={open&&active===panel.id} aria-controls="signature-creative-panel" onClick={()=>choose(panel.id)} onKeyDown={event=>navigate(event,panel.id)}><Icon name={panel.icon} size={16}/><span>{panel.label}</span>{busy&&panel.id==='export'&&<span className="nav-busy-dot" aria-label="正在导出"/>}</button>)}
        <button className={`morph-open-button ${open?'is-open':''}`} ref={toggleButton} disabled={busy} aria-label={open?'收起设置':'展开设置'} aria-expanded={open} aria-controls="signature-creative-panel" onClick={()=>setOpen(value=>!value)}><span className="morph-toggle-icon is-close" aria-hidden="true"><Icon name="close" size={16}/></span><span className="morph-toggle-icon is-expand" aria-hidden="true"><Icon name="chevron" size={16}/></span></button>
      </div>
      <div className="morph-body" id="signature-creative-panel" role="region" aria-label={`${panels.find(panel=>panel.id===active)?.label}设置`} aria-hidden={!open} inert={!open}>
        <div className="morph-panel-current" ref={currentPanel} key={active} data-panel={active} style={{maxHeight:maxBody}}><div className="morph-panel-measure" ref={measure}>{children}</div></div>
      </div>
      {exiting&&<div className="morph-panel-exit" ref={exitPanel} key={`exit-${exiting.id}`} data-panel={exiting.panel} aria-hidden="true" inert style={{top:BAR_HEIGHT,width:exiting.width,height:exiting.height}}>{exiting.node}</div>}
    </div>
    {hasFooter&&<div className="morph-footer" ref={footerElement}>{footer}</div>}
  </div>;
}
