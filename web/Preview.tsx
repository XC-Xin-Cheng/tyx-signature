import {useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {hitTest,renderScene,type PreparedScene} from './renderer';
import type {WebConfig} from './model';
import {audioEnvelope,audioWindow} from './audio';
import {Icon} from './ui';

type DragTarget='signature'|'decoration';
type PreviewProps={scene:PreparedScene;selected:0|1;config:WebConfig;audioUrl?:string;pauseToken:number;disabled?:boolean;repeat?:boolean;controlsTarget?:HTMLElement|null;onStartPlayback?:()=>void;onSelect:(i:0|1)=>void;onDrag:(index:0|1,target:DragTarget,dx:number,dy:number)=>void};

export function Preview({scene,config,audioUrl,pauseToken,disabled=false,repeat=true,controlsTarget=null,onStartPlayback,onSelect,onDrag}:PreviewProps){
  const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),audio=useRef<HTMLAudioElement>(null);
  const [display,setDisplay]=useState({width:640,height:360});
  const stageRoom=useRef({width:0,height:0});
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[freeDrag,setFreeDrag]=useState(false);
  const [completePreview,setCompletePreview]=useState(false),completePreviewRef=useRef(false);
  const clock=useRef(0),currentScene=useRef(scene),playingRef=useRef(false),musicEnabled=useRef(false);
  const latest=useRef({config,audioUrl,disabled,repeat,onStartPlayback,pauseToken});
  const anchor=useRef<{startedAt:number;offset:number;finishedAt:number|null}>({startedAt:0,offset:0,finishedAt:null});
  const drag=useRef<{id:number;x:number;y:number;index:0|1;target:DragTarget}|null>(null);
  const previousIdentity=useRef<string|null>(null),previousPauseToken=useRef(pauseToken);
  currentScene.current=scene;
  latest.current={config,audioUrl,disabled,repeat,onStartPlayback,pauseToken};
  const identity=JSON.stringify({mode:scene.config.mode,introOutroEnabled:scene.config.animation?.introOutroEnabled??true,people:scene.config.people.slice(0,scene.config.mode==='couple'?2:1).map(person=>({name:person.name,family:person.font.family}))});

  const setPlayback=useCallback((value:boolean)=>{playingRef.current=value;setPlaying(value);},[]);
  const resetAnchor=useCallback((offset:number)=>{anchor.current={startedAt:performance.now(),offset,finishedAt:null};},[]);
  const showFrame=useCallback((value:number)=>{
    const current=currentScene.current,t=completePreviewRef.current?current.editingTime:Math.max(0,Math.min(current.duration,value));
    clock.current=t;
    setTime(t);
    if(canvas.current)renderScene(canvas.current,current,t,completePreviewRef.current);
  },[]);
  const pause=useCallback(()=>{musicEnabled.current=false;setPlayback(false);audio.current?.pause();},[setPlayback]);
  const showComplete=useCallback(()=>{
    if(latest.current.disabled)return;
    pause();completePreviewRef.current=true;setCompletePreview(true);
    const editingTime=currentScene.current.editingTime;
    resetAnchor(editingTime);showFrame(editingTime);
  },[pause,resetAnchor,showFrame]);
  const syncAudio=useCallback((t:number,play:boolean)=>{
    const player=audio.current,props=latest.current;
    if(!player||!props.audioUrl)return;
    if(!play||!musicEnabled.current){player.pause();return;}
    if(!Number.isFinite(player.duration)){player.pause();return;}
    let window;
    try{window=audioWindow(player.duration,currentScene.current.duration,props.config.audio.start);}
    catch{player.pause();return;}
    if(t>=window.duration){player.pause();return;}
    const target=window.offset+t;
    if(Math.abs(player.currentTime-target)>.18)player.currentTime=target;
    const points=audioEnvelope(window.duration,props.config.audio);
    let volume=points[0].gain;
    for(let i=1;i<points.length;i++){
      const from=points[i-1],to=points[i];
      if(t<=to.time){const u=Math.max(0,Math.min(1,(t-from.time)/(to.time-from.time||1)));volume=from.gain+(to.gain-from.gain)*u;break;}
      volume=to.gain;
    }
    player.volume=Math.max(0,Math.min(1,volume));
    if(player.paused)void player.play().catch(()=>{});
  },[]);

  const fitDisplay=useCallback(()=>{
    const room=stageRoom.current;
    if(room.width<=0||room.height<=0)return;
    const current=currentScene.current,ratio=current.width/current.height;
    // ResizeObserver's content box already excludes the stage padding. Letter bounds never enter this fit.
    const width=Math.max(1,Math.floor(Math.min(room.width,room.height*ratio))),height=width/ratio;
    setDisplay(previous=>previous.width===width&&Math.abs(previous.height-height)<.01?previous:{width,height});
  },[]);
  useLayoutEffect(()=>{
    if(!stage.current)return;
    const observer=new ResizeObserver(([entry])=>{
      stageRoom.current={width:entry.contentRect.width,height:entry.contentRect.height};
      fitDisplay();
    });
    observer.observe(stage.current);
    return ()=>observer.disconnect();
  },[fitDisplay]);
  useLayoutEffect(()=>{fitDisplay();},[scene.width,scene.height,fitDisplay]);

  // Keep a complete design visible during edits; otherwise replay a new signature.
  useLayoutEffect(()=>{
    if(previousIdentity.current===identity)return;
    previousIdentity.current=identity;
    musicEnabled.current=false;
    audio.current?.pause();
    drag.current=null;
    const next=completePreviewRef.current?currentScene.current.editingTime:0;
    resetAnchor(next);
    showFrame(next);
    setPlayback(!latest.current.disabled&&!completePreviewRef.current);
  },[identity,resetAnchor,setPlayback,showFrame]);

  useLayoutEffect(()=>{
    if(completePreviewRef.current||drag.current){
      pause();resetAnchor(scene.editingTime);showFrame(scene.editingTime);
      return;
    }
    const previous=clock.current,next=Math.max(0,Math.min(scene.duration,previous));
    if(next!==previous||(anchor.current.finishedAt!==null&&next<scene.duration))resetAnchor(next);
    showFrame(next);
  },[scene,pause,resetAnchor,showFrame]);

  useEffect(()=>{
    if(previousPauseToken.current===pauseToken)return;
    previousPauseToken.current=pauseToken;
    pause();
  },[pauseToken,pause]);
  useEffect(()=>{
    if(!disabled)return;
    pause();
    const pointer=drag.current;
    drag.current=null;
    if(pointer&&canvas.current?.hasPointerCapture(pointer.id))canvas.current.releasePointerCapture(pointer.id);
  },[disabled,pause]);

  useEffect(()=>{
    if(!playing)return;
    let raf=0;
    const tick=(now:number)=>{
      if(!playingRef.current||latest.current.disabled)return;
      const duration=currentScene.current.duration,transport=anchor.current;
      if((currentScene.current.config.animation?.introOutroEnabled??true)&&latest.current.repeat){
        // One continuous scene clock drives writing, particles and the ink morph.
        const elapsed=transport.offset+(now-transport.startedAt)/1000,t=Math.max(0,elapsed%duration);
        transport.finishedAt=null;showFrame(t);syncAudio(t,true);
      }else if(transport.finishedAt!==null){
        syncAudio(duration,false);
        if(!latest.current.repeat)pause();
        else if(now-transport.finishedAt>=650){
          resetAnchor(0);showFrame(0);syncAudio(0,true);
        }
      }else{
        const t=Math.min(duration,transport.offset+(now-transport.startedAt)/1000);
        showFrame(t);
        syncAudio(t,t<duration);
        if(t>=duration){
          if(latest.current.repeat)transport.finishedAt=now;
          else pause();
        }
      }
      if(playingRef.current)raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf);audio.current?.pause();};
  },[playing,pause,resetAnchor,showFrame,syncAudio]);

  const toggle=useCallback(()=>{
    if(latest.current.disabled)return;
    if(playingRef.current){pause();return;}
    const wasComplete=completePreviewRef.current;
    completePreviewRef.current=false;setCompletePreview(false);
    latest.current.onStartPlayback?.();
    musicEnabled.current=true;
    const duration=currentScene.current.duration,t=wasComplete||clock.current>=duration-.01?0:clock.current;
    resetAnchor(t);showFrame(t);syncAudio(t,true);setPlayback(true);
  },[pause,resetAnchor,setPlayback,showFrame,syncAudio]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.code!=='Space'||(event.target as HTMLElement)?.closest('input,button,select,textarea,summary,a,audio,video,[contenteditable=true]'))return;
      event.preventDefault();toggle();
    };
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[toggle]);
  useEffect(()=>()=>{musicEnabled.current=false;audio.current?.pause();},[]);

  const down=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(disabled||!event.isPrimary||event.button!==0)return;
    const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*scene.width,y=(event.clientY-rect.top)/rect.height*scene.height;
    const hit=hitTest(scene,x,y);
    if(hit)onSelect(hit.index);
    if(!freeDrag||!hit)return;
    event.preventDefault();pause();resetAnchor(scene.editingTime);showFrame(scene.editingTime);
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,index:hit.index,target:hit.target};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent<HTMLCanvasElement>)=>{
    const pointer=drag.current;
    if(disabled||!pointer||pointer.id!==event.pointerId)return;
    const rect=event.currentTarget.getBoundingClientRect();
    onDrag(pointer.index,pointer.target,(event.clientX-pointer.x)/rect.width,(event.clientY-pointer.y)/rect.height);
    pointer.x=event.clientX;pointer.y=event.clientY;
  };
  const up=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(drag.current?.id===event.pointerId)drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <>
    <div className="canvas-stage" ref={stage}><div className={`canvas-surface ${freeDrag?'is-draggable':''}`} style={{width:display.width,height:display.height,aspectRatio:scene.width/scene.height}}>
      <canvas ref={canvas} width={scene.width} height={scene.height} role="img" aria-label={`${config.mode==='couple'?'情侣':'单人'}动态签名预览`} aria-describedby="signature-preview-help" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
    </div></div>
    {controlsTarget&&createPortal(<div className="canvas-tools" role="group" aria-label="设计查看"><button type="button" className="complete-preview-button" disabled={disabled} aria-pressed={completePreview} title="暂停动画，完整展示签名与装饰" onClick={showComplete}><Icon name="frame" size={16}/>完整展开</button><label className="free-drag"><input type="checkbox" aria-label="自由拖动" disabled={disabled} checked={freeDrag} onChange={event=>{const enabled=event.target.checked;pause();setFreeDrag(enabled);if(enabled){const editingTime=currentScene.current.editingTime;resetAnchor(editingTime);showFrame(editingTime);}}}/><Icon name="move" size={16}/>自由拖动</label></div>,controlsTarget)}
    <div className="canvas-caption"><span className="canvas-meta">{scene.width} × {scene.height}<span>30 fps</span></span></div>
    <div className="playbar" role="group" aria-label="动画播放"><div className="play-actions"><button className="play-button" disabled={disabled} aria-label={playing?'暂停':completePreview?'播放动画':time>=scene.duration-.01?'重新播放':'播放'} title={playing?'暂停':completePreview?'播放动画':time>=scene.duration-.01?'重新播放':'播放'} onClick={toggle}><Icon name={playing?'pause':time>=scene.duration-.01?'replay':'play'} size={18}/></button></div>
      <span className="time-label">{time.toFixed(1)}s</span><span className="timeline-control" style={{'--range-progress':time/scene.duration} as CSSProperties}><span className="range-rail" aria-hidden="true"><span className="range-fill"/></span><input className="timeline" type="range" disabled={disabled} aria-label="动画进度" aria-valuetext={`${time.toFixed(1)}秒，共${scene.duration.toFixed(1)}秒`} min={0} max={scene.duration} step={1/30} value={time} onChange={event=>{pause();completePreviewRef.current=false;setCompletePreview(false);const next=Number(event.target.value);resetAnchor(next);showFrame(next);}}/></span><span className="time-label">{scene.duration.toFixed(1)}s</span><span className="shortcut">空格 播放 / 暂停</span>
    </div>
    <p className="canvas-help" id="signature-preview-help" aria-live="polite">{completePreview?'完整设计已展开，调整时保持静止；点播放查看动画。':freeDrag?'拖动字迹或小图案时，会暂停在完成画面。':playing?musicEnabled.current?'正在循环播放，音乐会跟随选定片段。':'正在无声循环预览，可以随时暂停细看。':'点播放继续预览；选了音乐后，手动播放才会带上音乐。'}</p>
    {audioUrl&&<audio ref={audio} src={audioUrl} preload="metadata"/>}
  </>;
}
