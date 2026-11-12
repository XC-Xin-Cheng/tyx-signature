export type AppearanceMode='light'|'dark'|'system';
export type ResolvedTheme='light'|'dark';
export const APPEARANCE_KEY='tyx-signature.appearance.v1';
export const SYSTEM_THEME_QUERY='(prefers-color-scheme: dark)';

export function parseAppearance(value:unknown):AppearanceMode{
  return value==='light'||value==='dark'?value:'system';
}
export function readAppearance(storage:Pick<Storage,'getItem'>):AppearanceMode{
  try{return parseAppearance(storage.getItem(APPEARANCE_KEY));}catch{return 'system';}
}
export function saveAppearance(storage:Pick<Storage,'setItem'>,mode:AppearanceMode):boolean{
  try{storage.setItem(APPEARANCE_KEY,mode);return true;}catch{return false;}
}
export function resolveAppearance(mode:AppearanceMode,systemDark:boolean):ResolvedTheme{
  return mode==='system'?(systemDark?'dark':'light'):mode;
}
export function applyAppearance(document:Document,mode:AppearanceMode,systemDark:boolean):void{
  const theme=resolveAppearance(mode,systemDark),root=document.documentElement;
  root.dataset.theme=theme;root.dataset.themeMode=mode;root.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#171717':'#ffffff');
}
