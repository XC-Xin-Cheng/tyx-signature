export const ACTIVE_DECORATION_IDS=[
  'none','sun','cat-ears','dog','paw','heart','star',
  'paw-wave','paw-striped','paw-beans',
  'cat-round','cat-squint','rabbit-face','panda-face','puppy-face',
  'face-sleepy','face-owo','face-smile','face-shy',
] as const;

// Read old designs without reintroducing the retired full-body ornaments.
export const STORED_DECORATION_IDS=[...ACTIVE_DECORATION_IDS,'cat','rabbit','bow'] as const;
export type DecorationId=typeof ACTIVE_DECORATION_IDS[number];
export type DecorationCategory='pets'|'paws'|'expressions'|'accents';
export const decorationCategories:{id:DecorationCategory;label:string}[]=[
  {id:'pets',label:'萌宠'},
  {id:'paws',label:'爪爪'},
  {id:'expressions',label:'表情'},
  {id:'accents',label:'点缀'},
];
export const decorationCatalog:{id:Exclude<DecorationId,'none'>;label:string;category:DecorationCategory}[]=[
  {id:'cat-ears',label:'猫耳',category:'pets'},
  {id:'cat-round',label:'圆圆猫',category:'pets'},
  {id:'cat-squint',label:'挤挤眼猫',category:'pets'},
  {id:'rabbit-face',label:'小兔脸',category:'pets'},
  {id:'panda-face',label:'眨眼熊猫',category:'pets'},
  {id:'puppy-face',label:'垂耳狗',category:'pets'},
  {id:'dog',label:'小狗',category:'pets'},
  {id:'paw',label:'软软爪印',category:'paws'},
  {id:'paw-wave',label:'举爪',category:'paws'},
  {id:'paw-striped',label:'条纹小爪',category:'paws'},
  {id:'paw-beans',label:'豆豆小爪',category:'paws'},
  {id:'face-sleepy',label:'慵懒脸',category:'expressions'},
  {id:'face-owo',label:'圆眼脸',category:'expressions'},
  {id:'face-smile',label:'嘿嘿笑',category:'expressions'},
  {id:'face-shy',label:'害羞脸',category:'expressions'},
  {id:'sun',label:'太阳',category:'accents'},
  {id:'heart',label:'爱心',category:'accents'},
  {id:'star',label:'星星',category:'accents'},
];
const activeIds=new Set<string>(ACTIVE_DECORATION_IDS);
export function isDecorationId(id:string):id is DecorationId{return activeIds.has(id);}
export function categoryForDecoration(id:string):DecorationCategory|null{
  return decorationCatalog.find(item=>item.id===id)?.category??null;
}
