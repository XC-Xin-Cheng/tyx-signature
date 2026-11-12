import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {canvasSize,clamp,defaultWebConfig,loadConfig,parseConfigFile,saveConfig,validateConfig,type PersonConfig,type WebConfig} from './model';
import {prepareScene,type PreparedScene} from './renderer';
import {Preview} from './Preview';
import {ColorField,Details,Icon,Range,Section,Toggle,UtilityMenu} from './ui';
import {MorphNav} from './MorphNav';
import {DecorationThumbnail} from './DecorationThumbnail';
import {ThemeSelector} from './ThemeSelector';
import {categoryForDecoration,decorationCatalog,decorationCategories,type DecorationCategory} from './decoration-catalog';
import './style.css';

type Tab='signature'|'decoration'|'export';
type OutputFormat='mp4'|'gif';
type Job={status:'idle'|'checking'|'working'|'done'|'error'|'cancelled';progress:number;stage:string;url?:string;fileName?:string;format?:OutputFormat;transparent?:boolean};
const idle:Job={status:'idle',progress:0,stage:''};
function downloadText(text:string,name:string){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function directFontConfig(config:WebConfig):WebConfig{
  const next=structuredClone(config);
  next.people.forEach(person=>{person.scheme='classic';person.font.family='tyx-brush';person.font.size=240;});
  return next;
}
function App(){
  const [initial]=useState(()=>{
    try{const loaded=loadConfig(window.localStorage);return {...loaded,config:directFontConfig(loaded.config)};}
    catch{return {config:defaultWebConfig(),warning:'浏览器暂时无法保存配置，你仍可设计并下载作品。'};}
  });
  const [config,setConfig]=useState<WebConfig>(initial.config);
  const [selected,setSelected]=useState<0|1>(0),[tab,setTab]=useState<Tab>('signature');
  const [format,setFormat]=useState<OutputFormat>(initial.config.canvas.transparent?'gif':'mp4');
  const [decorationCategory,setDecorationCategory]=useState<DecorationCategory>(()=>categoryForDecoration(initial.config.people[0].decoration.id)??'pets');
  const [previewControlsTarget,setPreviewControlsTarget]=useState<HTMLDivElement|null>(null);
  const [notice,setNotice]=useState(initial.warning??''),[saved,setSaved]=useState('已在此浏览器保存');
  const [audioFile,setAudioFile]=useState<File|null>(null),[audioUrl,setAudioUrl]=useState<string>(),[audioDuration,setAudioDuration]=useState(0);
  const [job,setJob]=useState<Job>(idle),[pauseToken,setPauseToken]=useState(0);
  const audition=useRef<HTMLAudioElement>(null),importInput=useRef<HTMLInputElement>(null);
  const abort=useRef<AbortController|null>(null),lastUrl=useRef<string|undefined>(undefined),lastGood=useRef<PreparedScene|null>(null);
  const [undo,setUndo]=useState<{config:WebConfig;audio:File|null}|null>(null);
  const prepared=useMemo(()=>{
    try{return {scene:prepareScene(validateConfig(config)),error:''};}
    catch(error){return {scene:null,error:error instanceof Error?error.message:'暂时无法绘制，请检查参数'};}
  },[config]);
  if(prepared.scene)lastGood.current=prepared.scene;
  const scene=prepared.scene??lastGood.current,person=config.people[selected];
  const busy=job.status==='checking'||job.status==='working';
  const invalidName=!/[a-z]/i.test(person.name)||!/^[ -~]+$/.test(person.name);
  const update=(fn:(next:WebConfig)=>void)=>setConfig(current=>{const next=structuredClone(current);fn(next);return next;});
  const changePerson=(fn:(next:PersonConfig)=>void)=>update(next=>fn(next.people[selected]));
  useEffect(()=>{const category=categoryForDecoration(person.decoration.id);if(category)setDecorationCategory(category);},[selected,person.decoration.id]);
  useEffect(()=>{if(config.canvas.transparent)setFormat('gif');},[config.canvas.transparent]);
  useEffect(()=>{
    if(prepared.error){setSaved('修改尚未保存');return;}
    setSaved('正在保存…');
    const timer=setTimeout(()=>{try{saveConfig(window.localStorage,config);setSaved('已在此浏览器保存');}catch{setSaved('本地保存不可用');}},300);
    return ()=>clearTimeout(timer);
  },[config,prepared.error]);
  useEffect(()=>{
    if(!audioFile){setAudioUrl(undefined);setAudioDuration(0);return;}
    const url=URL.createObjectURL(audioFile);setAudioUrl(url);
    return ()=>URL.revokeObjectURL(url);
  },[audioFile]);
  useEffect(()=>{
    if(lastUrl.current){URL.revokeObjectURL(lastUrl.current);lastUrl.current=undefined;}
    setJob(current=>current.status==='done'?idle:current);
  },[config,audioFile,format]);
  useEffect(()=>()=>{abort.current?.abort();if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);},[]);
  const reset=()=>{
    setUndo({config:structuredClone(config),audio:audioFile});setConfig(defaultWebConfig());
    setSelected(0);setAudioFile(null);setNotice('已恢复初始设计，可以撤销。');
  };
  const importFile=async(file?:File)=>{
    if(!file)return;
    try{
      if(file.size>1024*1024)throw new Error('配置文件过大，请选择本工具导出的 JSON 配置');
      setConfig(directFontConfig(parseConfigFile(await file.text())));setSelected(0);setAudioFile(null);
      setNotice('配置已导入。若需要音乐，请重新选择音频文件。');
    }catch(error){setNotice(error instanceof Error?error.message:'配置导入失败');}
    finally{if(importInput.current)importInput.current.value='';}
  };
  const chooseAudio=(file?:File)=>{
    if(!file||busy)return;
    if(file.size>200*1024*1024){setNotice('这段音频超过 200 MB，请选择较短的音频片段。');return;}
    setAudioFile(file);setAudioDuration(0);update(next=>{next.audio.start=0;});
  };
  const generate=async()=>{
    if(busy||prepared.error)return;
    const outputFormat:OutputFormat=config.canvas.transparent?'gif':format;
    setPauseToken(value=>value+1);audition.current?.pause();
    setJob({status:'checking',progress:0,stage:outputFormat==='gif'?'正在准备 GIF…':'正在检查当前浏览器…'});
    const controller=new AbortController();abort.current=controller;
    try{
      const snapshot=validateConfig(structuredClone(config));
      const onProgress=(progress:number,stage:string)=>setJob({status:'working',progress:clamp(progress,0,1),stage});
      let blob:Blob;
      if(outputFormat==='gif'){
        const {exportGif}=await import('./gif-export');
        if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
        blob=await exportGif(snapshot,{signal:controller.signal,onProgress});
      }else{
        const {checkExportSupport,exportVideo}=await import('./export');
        const support=await checkExportSupport(snapshot,audioFile);
        if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
        if(!support.supported)throw new Error(support.reason??'当前浏览器无法导出 MP4，请换系统浏览器或电脑重试。');
        setJob({status:'working',progress:0,stage:'准备绘制…'});
        blob=await exportVideo(snapshot,{audioFile,signal:controller.signal,onProgress});
      }
      if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
      if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);
      const url=URL.createObjectURL(blob);lastUrl.current=url;
      const names=snapshot.people.slice(0,snapshot.mode==='couple'?2:1).map(next=>next.name.replace(/[^a-z0-9-]/gi,'')).join('-');
      setJob({status:'done',progress:1,stage:outputFormat==='gif'?'GIF 已生成，可以下载了。':'视频已生成，可以下载了。',url,format:outputFormat,transparent:outputFormat==='gif'&&snapshot.canvas.transparent,fileName:'tyx-'+(names||'signature')+'-'+snapshot.canvas.aspect+'.'+outputFormat});
    }catch(error){
      if(controller.signal.aborted||(error instanceof DOMException&&error.name==='AbortError'))setJob({status:'cancelled',progress:0,stage:'已取消，设计已保留。'});
      else setJob({status:'error',progress:0,stage:error instanceof Error?error.message:'导出失败，请重试。'});
    }finally{abort.current=null;}
  };
  const ratio=canvasSize(config.canvas.aspect),gifScale=960/Math.max(ratio.width,ratio.height);
  const outputSize=format==='gif'?{width:Math.round(ratio.width*gifScale),height:Math.round(ratio.height*gifScale)}:ratio;
  const personPicker=config.mode==='couple'&&<div className="person-tabs" role="group" aria-label="编辑哪一组签名">
    {([0,1] as const).map(index=><button key={index} className={['person-tab',selected===index?'active':''].join(' ')} aria-pressed={selected===index} onClick={()=>setSelected(index)}>
      <span className="person-dot" style={{background:config.people[index].ink.color,borderColor:config.people[index].glow.color}}/>
      {index===0?'第一位':'第二位'}<span className="mini-label">{config.people[index].name||'未命名'}</span>
    </button>)}
  </div>;
  return <div className="app-shell">
    <a className="skip-link" href="#signature-workspace">跳到签名编辑区</a>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="pen" size={22}/></span><div className="brand-copy"><h1 className="brand-title">tyx <span>· 签名动画</span></h1><span className="brand-subtitle">把名字，写成自己的样子</span></div></div>
      <div className="top-actions">
        <span className="save-state" role="status" aria-label={saved} title={saved}><span className={['save-dot',prepared.error?'is-unsaved':''].join(' ')} aria-hidden="true"/><span className="save-state-label">{saved}</span></span>
        <ThemeSelector/>
        <UtilityMenu>
          <button disabled={busy||!!prepared.error} onClick={()=>downloadText(JSON.stringify(validateConfig(config),null,2),'tyx-signature.json')}><Icon name="file" size={15}/>下载配置</button>
          <button disabled={busy} onClick={()=>importInput.current?.click()}><Icon name="upload" size={15}/>导入配置</button>
          <button disabled={busy} onClick={reset}><Icon name="reset" size={15}/>重置设计</button>
        </UtilityMenu>
      </div>
    </header>
    <main className="workspace" id="signature-workspace" tabIndex={-1}>
      <MorphNav active={tab} onActiveChange={setTab} busy={busy} footer={<div className="inspector-view-tools" ref={setPreviewControlsTarget}/>}>
        <fieldset className="inspector-fields" disabled={busy} aria-label={tab==='signature'?'签名设置':tab==='decoration'?'装饰设置':'导出设置'}>
          {tab==='signature'&&<div className="inspector-cards">
            <section className="inspector-group" aria-label="签名与装饰调整">
              <div className="group-label">你的签名</div>
              <Toggle title="情侣签名" checked={config.mode==='couple'} onChange={value=>{update(next=>{next.mode=value?'couple':'single';});if(!value)setSelected(0);}}/>
              {personPicker}
              <Section title={config.mode==='couple'?(selected===0?'第一位的签名':'第二位的签名'):'写下你的名字'} icon="pen">
                <label className="field"><span className="field-label">英文名字或拼音</span><input className="name-input" aria-label="签名姓名" aria-invalid={invalidName} aria-describedby={invalidName?'signature-name-error':undefined} value={person.name} maxLength={40} placeholder="例如 TYX、Li Xin" spellCheck={false} autoComplete="off" onChange={event=>changePerson(next=>{next.name=event.target.value;})}/></label>
                {invalidName&&<p className="field-error caption-4" id="signature-name-error">请输入英文字母、数字或键盘符号，至少包含一个字母。</p>}
              </Section>
              <ColorField key={'signature-color-'+selected} title="签名颜色" value={person.ink.color} editable onChange={value=>changePerson(next=>{next.ink.color=value;next.glow.color=value;})}/>
              <div className="two-field-row">
                <Range title="签名大小" value={person.position.scale} min={.45} max={1.5} step={.05} suffix="×" onChange={value=>changePerson(next=>{next.position.scale=value;})}/>
                <Range title="笔迹粗细" value={person.font.penWidth} min={.5} max={2} step={.05} suffix="×" onChange={value=>changePerson(next=>{next.font.penWidth=value;})}/>
              </div>
              {person.decoration.id!=='none'?<Range title="装饰大小" value={person.decoration.scale} min={.5} max={1.5} step={.05} suffix="×" onChange={value=>changePerson(next=>{next.decoration.scale=value;})}/>:<button className="button secondary" onClick={()=>setTab('decoration')}><Icon name="sparkle" size={15}/>选择装饰图案</button>}
              <Toggle title="开头与收尾动画" checked={config.animation.introOutroEnabled} onChange={value=>update(next=>{next.animation.introOutroEnabled=value;})}/>
            </section>
            <section className="inspector-group" aria-label="画面与节奏调整">
              <h2 className="group-title">画面与节奏</h2>
              <div className="field-label">画幅</div>
              <div className="format-switch" role="group" aria-label="画面比例">
                {([['landscape','横屏','16:9'],['portrait','竖屏','9:16'],['square','方形','1:1']] as const).map(([id,label,size])=><button type="button" className="format-option" key={id} aria-pressed={config.canvas.aspect===id} onClick={()=>update(next=>{next.canvas.aspect=id;})}>{label}<small>{size}</small></button>)}
              </div>
              <Range title="动画时长" value={config.timing.duration} min={3} max={15} step={.5} suffix="秒" onChange={value=>update(next=>{next.timing.duration=value;next.timing.hold=Math.min(next.timing.hold,value-2);})}/>
              <ColorField title="背景" value={config.canvas.background} onChange={value=>update(next=>{next.canvas.background=value;})}/>
              <Toggle title="透明背景" checked={config.canvas.transparent} onChange={value=>{update(next=>{next.canvas.transparent=value;});if(value)setFormat('gif');}}/>
              {config.canvas.transparent&&<p className="export-note">已使用透明背景，导出格式为 GIF。</p>}
            </section>
          </div>}
          {tab==='decoration'&&<div className="inspector-cards">
            <section className="inspector-group">
              <div className="group-label">给名字一点表情</div>
              {personPicker}
              <Section title="装饰图案" icon="sparkle">
                <div className="decoration-library-head"><span className="caption-5">当前：{decorationCatalog.find(item=>item.id===person.decoration.id)?.label??'无装饰'}</span><button type="button" className="decoration-clear" aria-pressed={person.decoration.id==='none'} onClick={()=>changePerson(next=>{next.decoration.id='none';})}><Icon name="none" size={14}/>无装饰</button></div>
                <div className="decoration-categories" role="group" aria-label="装饰分类">{decorationCategories.map(category=><button type="button" className="decoration-category" key={category.id} aria-pressed={decorationCategory===category.id} onClick={()=>setDecorationCategory(category.id)}>{category.label}</button>)}</div>
                <div className="decoration-grid" role="group" aria-label={decorationCategories.find(category=>category.id===decorationCategory)?.label+'图案'}>{decorationCatalog.filter(item=>item.category===decorationCategory).map(item=><button type="button" key={item.id} className={['decoration-choice',person.decoration.id===item.id?'selected':''].join(' ')} aria-pressed={person.decoration.id===item.id} onClick={()=>changePerson(next=>{next.decoration.id=item.id;})}><DecorationThumbnail id={item.id} person={person} background={config.canvas.background} transparent={config.canvas.transparent}/><span>{item.label}</span></button>)}</div>
              </Section>
              <p className="export-note">图案大小和位置在“签名”页与画布中调整。</p>
            </section>
          </div>}
          {tab==='export'&&<div className="inspector-cards">
            <section className="inspector-group">
              <h2 className="group-title">带走你的签名</h2>
              <div className="format-switch" role="group" aria-label="导出格式">
                <button type="button" className="output-choice" aria-pressed={format==='mp4'} disabled={config.canvas.transparent} title={config.canvas.transparent?'透明背景请使用 GIF；关闭透明背景后可选择 MP4':'普通视频，可选配乐'} onClick={()=>setFormat('mp4')}>MP4<small>视频</small></button>
                <button type="button" className="output-choice" aria-pressed={format==='gif'} onClick={()=>setFormat('gif')}>GIF<small>动图</small></button>
              </div>
              <p className="export-note">{format==='gif'?(config.canvas.transparent?'透明动图，可叠加使用；GIF 不包含音频。':'循环动图，使用当前背景色；GIF 不包含音频。'):'普通视频，支持配乐。画幅、时长和背景在“签名”页调整。'}</p>
              <div className="export-inline-summary">{format.toUpperCase()} · {outputSize.width} × {outputSize.height} · {format==='gif'?20:30} 帧/秒</div>
            </section>
            {format==='mp4'&&<section className="inspector-group setting-card-audio" aria-label="背景音乐">
              <h2 className="group-title">背景音乐 <small>可选</small></h2>
              <label className="audio-attach" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();chooseAudio(event.dataTransfer.files[0]);}}><Icon name="music" size={16}/><span>{audioFile?'更换音乐':'添加音乐'}<small>本机音频文件</small></span><Icon name="upload" size={14}/><input className="file-input" aria-label="上传音乐" type="file" accept="audio/*" onChange={event=>{chooseAudio(event.target.files?.[0]);event.target.value='';}}/></label>
              {audioFile&&<div className="audio-card"><strong>{audioFile.name}</strong><button className="icon-button" aria-label="移除音乐" onClick={()=>setAudioFile(null)}><Icon name="close" size={13}/></button>{audioUrl&&<audio key={audioUrl} ref={audition} onPlay={()=>setPauseToken(value=>value+1)} src={audioUrl} controls preload="metadata" onLoadedMetadata={event=>setAudioDuration(event.currentTarget.duration)} onError={()=>setNotice('无法读取这段音频，请换一段浏览器能播放的音频。')}/>}</div>}
              {audioFile&&<Details title="音乐设置"><div className="advanced-grid">
                <Range title="音乐起点" value={config.audio.start} min={0} max={Math.max(1,Math.min(3600,audioDuration||60))} step={.1} suffix="秒" onChange={value=>update(next=>{next.audio.start=value;})}/>
                <Range title="音乐音量" value={config.audio.volume} min={0} max={1} step={.05} onChange={value=>update(next=>{next.audio.volume=value;})}/>
                <Range title="淡入" value={config.audio.fadeIn} min={0} max={3} step={.05} suffix="秒" onChange={value=>update(next=>{next.audio.fadeIn=value;})}/>
                <Range title="淡出" value={config.audio.fadeOut} min={0} max={3} step={.05} suffix="秒" onChange={value=>update(next=>{next.audio.fadeOut=value;})}/>
              </div></Details>}
            </section>}
          </div>}
        </fieldset>
        {tab==='export'&&<div className="export-inline-actions">
          {job.status!=='idle'&&<div className={['export-progress',job.status==='error'?'notice error':''].join(' ')} data-status={job.status} role="status"><span>{job.stage}</span>{busy&&<div className="progress-track" role="progressbar" aria-label="文件生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress*100)}><span style={{transform:'scaleX('+job.progress+')'}}/></div>}</div>}
          {job.status==='done'&&job.url&&<div className={['export-result',job.transparent?'is-transparent':''].join(' ')}>{job.format==='gif'?<img src={job.url} className="export-result-image" alt={job.transparent?'透明 GIF 导出结果':'GIF 导出结果'}/>:<video src={job.url} controls playsInline preload="metadata" className="export-result-video"/>}</div>}
          <div className="export-actions">
            {busy?<button className="button secondary" onClick={()=>{abort.current?.abort();setJob(current=>({...current,stage:'正在取消…'}));}}>取消导出</button>:<>
              {job.status==='done'&&job.url&&<a className="button primary" href={job.url} download={job.fileName}><Icon name="download" size={15}/>{job.format==='gif'?'下载 GIF':'下载视频'}</a>}
              <button className={['button',job.status==='done'?'secondary':'primary'].join(' ')} disabled={!!prepared.error} onClick={()=>void generate()}><Icon name="download" size={15}/>{job.status==='done'?'重新生成':'生成 '+format.toUpperCase()}</button>
            </>}
          </div>
        </div>}
      </MorphNav>
      <section className="canvas-column" aria-label="作品预览">
        {(notice||prepared.error)&&<div className={['notice',prepared.error?'error':'warning'].join(' ')} role={prepared.error?'alert':'status'}><span>{prepared.error||notice}</span>{undo&&<button disabled={busy} onClick={()=>{setConfig(undo.config);setAudioFile(undo.audio);setUndo(null);setNotice('已撤销重置。');}}>撤销</button>}{!prepared.error&&<button className="notice-close" aria-label="关闭提示" onClick={()=>{setNotice('');setUndo(null);}}><Icon name="close" size={14}/></button>}</div>}
        {scene?<Preview disabled={busy} controlsTarget={previewControlsTarget} onStartPlayback={()=>audition.current?.pause()} scene={scene} selected={selected} config={config} audioUrl={audioUrl} pauseToken={pauseToken} onSelect={setSelected} onDrag={(index,target,dx,dy)=>{
          if(busy)return;setSelected(index);update(next=>{const moving=next.people[index];if(target==='signature'){moving.position.x=clamp(moving.position.x+dx,-.45,.45);moving.position.y=clamp(moving.position.y+dy,-.45,.45);}else{moving.decoration.offsetX=clamp(moving.decoration.offsetX+dx,-.45,.45);moving.decoration.offsetY=clamp(moving.decoration.offsetY+dy,-.45,.45);}});
        }}/>:<div className="canvas-empty"><Icon name="pen" size={32}/><h2 className="title-3">写下名字，开始设计</h2><p className="body-6">在签名设置中输入英文名字或拼音，即可生成预览。</p></div>}
        {!!scene?.warnings?.length&&<div className="notice warning" role="status">{scene.warnings.join('；')}</div>}
      </section>
    </main>
    <input className="sr-only" ref={importInput} type="file" accept="application/json,.json" aria-label="导入签名配置文件" onChange={event=>void importFile(event.target.files?.[0])}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
