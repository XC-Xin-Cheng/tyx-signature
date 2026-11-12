import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {APPEARANCE_KEY,parseAppearance,readAppearance,resolveAppearance,saveAppearance} from '../web/theme';

test('appearance preference stays separate from the saved signature and recovers from blocked storage',()=>{
  const storage=new Map([['tyx-signature.website.v7','saved signature']]);
  const adapter={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}};
  assert.equal(readAppearance(adapter),'system');
  assert.equal(saveAppearance(adapter,'dark'),true);
  assert.equal(storage.get(APPEARANCE_KEY),'dark');
  assert.equal(readAppearance(adapter),'dark');
  assert.equal(storage.get('tyx-signature.website.v7'),'saved signature');
  assert.equal(readAppearance({getItem:()=>{throw new Error('blocked');}}),'system');
  assert.equal(saveAppearance({setItem:()=>{throw new Error('quota');}},'light'),false);
  for(const bad of [null,undefined,'','auto','Dark','{"mode":"dark"}'])assert.equal(parseAppearance(bad),'system');
});

test('system changes select its color scheme while explicit modes stay fixed',()=>{
  for(const systemDark of [false,true]){
    assert.equal(resolveAppearance('system',systemDark),systemDark?'dark':'light');
    assert.equal(resolveAppearance('light',systemDark),'light');
    assert.equal(resolveAppearance('dark',systemDark),'dark');
  }
});

test('the before-paint bootstrap restores saved modes and follows the OS even when storage is unavailable',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const script=html.match(/<script id="appearance-init">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'before-paint appearance bootstrap is present');
  for(const stored of ['light','dark','system','invalid',null])for(const dark of [false,true])for(const blocked of [false,true]){
    const root={dataset:{} as Record<string,string>,style:{colorScheme:''}};
    const meta={content:''};
    runInNewContext(script,{
      window:{localStorage:{getItem:(key:string)=>{assert.equal(key,APPEARANCE_KEY);if(blocked)throw new Error('blocked');return stored;}},matchMedia:(query:string)=>{assert.equal(query,'(prefers-color-scheme: dark)');return {matches:dark};}},
      document:{documentElement:root,querySelector:()=>({setAttribute:(_key:string,value:string)=>{meta.content=value;}})},
    });
    const mode=blocked?'system':parseAppearance(stored),theme=resolveAppearance(mode,dark);
    assert.equal(root.dataset.themeMode,mode);assert.equal(root.dataset.theme,theme);assert.equal(root.style.colorScheme,theme);
    assert.equal(meta.content,theme==='dark'?'#171717':'#ffffff');
  }
});
