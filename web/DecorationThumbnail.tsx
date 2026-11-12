import {useLayoutEffect,useRef} from 'react';
import type {PersonConfig} from './model';
import {renderDecorationThumbnail} from './renderer';

/** The picker paints the same paths and ink as the exported design. */
export function DecorationThumbnail({id,person,background,transparent=false}:{id:string;person:PersonConfig;background:string;transparent?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useLayoutEffect(()=>{
    if(canvas.current)renderDecorationThumbnail(canvas.current,id,person,background,transparent);
  },[id,background,transparent,person.name,person.decoration.scale,person.ink.color,person.glow.enabled,person.glow.color,person.glow.strength,person.glow.radius]);
  return <canvas className={`decoration-thumbnail ${transparent?'is-transparent':''}`} ref={canvas} width={180} height={112} aria-hidden="true"/>;
}
