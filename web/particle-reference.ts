/** Deterministic vector particle tracks in 1920×1080 design coordinates at 30fps. */
export const REFERENCE_FPS=30;
export const REFERENCE_ANCHOR={x:407,y:648};
export type ReferencePoint={x:number;y:number};
export type ReferenceParticleKeyframe={
  frame:number;x:number;y:number;radius:number;rotation:number;opacity:number;
  color?:string;aspect?:number;fill?:number;trimStart?:number;trimEnd?:number;strokeWidth?:number;
};
export type ReferenceParticleTrack={
  id:string;kind:'fish'|'ribbon'|'ring'|'orb'|'droplet'|'sparkle';birth:number;death:number;color:string;
  keys:ReferenceParticleKeyframe[];attachToPen?:boolean;attachFrames?:{startFrame:number;endFrame:number};
  handoff?:'first-stroke';outline?:readonly ReferencePoint[];
};
type KeyExtras=Partial<Omit<ReferenceParticleKeyframe,'frame'|'x'|'y'|'radius'|'rotation'|'opacity'>>;
const at=(frame:number,x:number,y:number,radius:number,rotation=0,opacity=1,extra:KeyExtras={}):ReferenceParticleKeyframe=>({frame,x:x-REFERENCE_ANCHOR.x,y:y-REFERENCE_ANCHOR.y,radius,rotation,opacity,...extra});
const relative=(points:readonly (readonly [number,number])[]):ReferencePoint[]=>points.map(([x,y])=>({x:x-REFERENCE_ANCHOR.x,y:y-REFERENCE_ANCHOR.y}));

/** Thirty ordered contour points in normalized center-local coordinates: multiply by key.radius. */
export const referenceFishOutline:readonly ReferencePoint[]=[
  [-38.05,-8.98],[-33.05,-5.87],[-28.43,-2.98],[-23.24,-.17],[-18.17,2.90],[-12.87,2.02],
  [-9.97,-2.06],[-5.42,-4.98],[-1.07,-6.98],[3.18,-9.21],[7.95,-11.24],[12.56,-12.98],
  [17.91,-13.98],[23.43,-13.98],[28.65,-11.28],[31.95,-7.46],[32.95,-1.53],[30.97,4],
  [26.19,7.78],[20.77,10.02],[14.84,11.02],[8.62,10.69],[2.97,9.02],[-2.96,8.02],
  [-8.31,7.02],[-12.89,4.18],[-18.08,4.02],[-21.02,7.99],[-24.05,13.09],[-27.05,17.02],
].map(([x,y])=>({x:x/40,y:y/40}));

/** Anchor-relative design-pixel polyline. Ribbon keys trim this path; their x/y do not add another translation. */
export const referenceEntryArcOutline:readonly ReferencePoint[]=relative([
  [168,648],[172,669],[182,690],[198,711],[220,729],[247,744],[280,753],
  [315,757],[348,748],[374,730],[391,708],[402,683],[407,659],[407,648],
]);
export const referenceDropletOutline:readonly ReferencePoint[]=[
  {x:-.20,y:-1},{x:.35,y:-.94},{x:.78,y:-.58},{x:.98,y:-.08},{x:.81,y:.37},
  {x:.58,y:.78},{x:.10,y:.96},{x:-.42,y:.87},{x:-.88,y:.48},{x:-.98,y:-.05},{x:-.70,y:-.61},
];
export const referenceBubbleOutline:readonly ReferencePoint[]=[
  {x:0,y:-1},{x:.47,y:-.93},{x:.79,y:-.60},{x:.97,y:-.08},{x:.87,y:.45},
  {x:.49,y:.92},{x:.04,y:.73},{x:-.44,y:.91},{x:-.85,y:.55},{x:-1,y:.03},{x:-.82,y:-.52},{x:-.34,y:-.79},
];

/** These are geometric transfers, not opacity cuts: keep the same object and morph into the live first stroke. */
export const referenceConnection={trackId:'entry-fish',startFrame:23,endFrame:28};
export const arcConnection={trackId:'entry-arc',startFrame:22,endFrame:26};
export const referenceRightGroup={
  anchor:{x:1199,y:648},
  // The right group shares the flight geometry and uses a pink entry contour.
  anchorDelta:{x:792,y:0},fishColor:'#ffd2e9',plumeColor:'#45f7ef',
};

export const referenceParticleTracks:readonly ReferenceParticleTrack[]=[
  {id:'entry-fish',kind:'fish',birth:1,death:28,color:'#fff0f8',outline:referenceFishOutline,handoff:'first-stroke',keys:[
    at(1,168,870,0,6.34,0),at(2,184,845,19,6.34,.55),at(3,220,820,38,5.40),
    at(4,272,761,40,5.44),at(5,320,696,40,5.46),at(6,350,626,40,5.32),
    at(7,340,560,40,4.80),at(8,295,536,40,4.13),at(9,274,538,40,3.53),
    at(10,256,539,40,3.26),at(11,218,542,40,2.97),at(12,174,562,40,2.36),
    at(13,148,604,40,1.71),at(14,149,650,40,1.30),at(16,170,692,40,1.19),
    at(18,203,704,40,.93),at(20,277,704,40,.59),at(21,320,693,40,.41),
    at(22,364,674,40,.20),at(23,401,645,40,0),at(24,421,611,40,-.19),
    at(25,431,590,40,-.40),at(26,436,578,40,-.48),at(27,437,573,40,-.52),at(28,435,573,40,-.56),
  ]},
  {id:'entry-arc',kind:'ribbon',birth:1,death:26,color:'#fff9f5',outline:referenceEntryArcOutline,handoff:'first-stroke',keys:[
    at(1,407,648,1,0,0,{trimStart:0,trimEnd:.01,strokeWidth:1}),
    at(3,407,648,1,0,1,{trimStart:0,trimEnd:.14,strokeWidth:6}),
    at(6,407,648,1,0,1,{trimStart:.02,trimEnd:.37,strokeWidth:8}),
    at(9,407,648,1,0,1,{trimStart:.10,trimEnd:.66,strokeWidth:8}),
    at(12,407,648,1,0,1,{trimStart:.32,trimEnd:.82,strokeWidth:7}),
    at(15,407,648,1,0,1,{trimStart:.61,trimEnd:.93,strokeWidth:6}),
    at(18,407,648,1,0,1,{trimStart:.78,trimEnd:.97,strokeWidth:5}),
    at(21,407,648,1,0,1,{trimStart:.91,trimEnd:.995,strokeWidth:4}),
    at(23,407,648,1,0,1,{trimStart:.97,trimEnd:1,strokeWidth:3}),
    at(26,407,648,1,0,1,{trimStart:.995,trimEnd:1,strokeWidth:3}),
  ]},
  {id:'early-cloud-core',kind:'ring',birth:2,death:18,color:'#fffdf6',keys:[
    at(2,480,687,2,0,0,{fill:1}),at(3,510,660,27,0,1,{fill:.85}),at(4,516,646,29,0,1,{fill:.78}),
    at(6,522,605,29,0,1,{fill:.62}),at(8,546,569,27,0,1,{fill:.48}),at(10,563,541,26,0,.9,{fill:.28}),
    at(12,562,508,25,0,.75,{fill:.10}),at(14,558,487,25,0,.25,{fill:0}),at(18,558,449,16,0,0,{fill:0}),
  ]},
  {id:'early-cloud-dot-a',kind:'sparkle',birth:1,death:21,color:'#fffef7',keys:[
    at(1,394,698,5,0,.4),at(3,433,685,11),at(6,446,672,10),at(9,464,661,10),
    at(12,474,639,9,0,.8),at(15,478,619,6,0,.4),at(18,483,600,3,0,.12),at(21,488,585,1,0,0),
  ]},
  {id:'early-cloud-dot-b',kind:'sparkle',birth:1,death:22,color:'#fffef7',keys:[
    at(1,414,699,5,0,.4),at(3,471,692,10),at(6,485,695,9),at(9,509,698,9),
    at(12,537,692,8,0,.75),at(16,557,689,5,0,.3),at(20,569,684,2,0,.08),at(22,574,681,1,0,0),
  ]},
  {id:'early-cloud-dot-c',kind:'ring',birth:4,death:23,color:'#fffdf8',keys:[
    at(4,533,660,2,0,0),at(6,552,634,7),at(9,566,621,7),at(12,583,601,8,0,.8),
    at(15,612,582,8,0,.55),at(18,632,570,5,0,.15),at(23,653,548,2,0,0),
  ]},
  {id:'early-cloud-dot-d',kind:'ring',birth:5,death:24,color:'#fffdf8',keys:[
    at(5,548,651,10,0,.6),at(8,578,655,10),at(12,603,662,9,0,.8),at(16,616,677,8,0,.55),
    at(20,633,701,4,0,.12),at(24,642,717,1,0,0),
  ]},
  {id:'anchor-orbit-ring',kind:'ring',birth:18,death:156,color:'#ebe6ff',keys:[
    at(18,190,511,0,0,0),at(19,191,510,13,0,.8),at(22,214,531,13),at(25,266,588,13),
    at(28,318,648,13),at(31,345,679,13),at(34,326,659,13),at(37,296,627,13),
    at(40,298,632,13),at(44,307,645,13),at(48,311,654,13),at(56,312,663,13),
    at(64,315,673,13),at(80,333,677,13),at(96,372,674,13),at(112,390,673,13),
    at(124,402,672,13),at(136,403,672,13),at(150,379,675,13),at(155,373,674,13),at(156,373,674,0,0,0),
  ]},
  {id:'cyan-plume-head',kind:'orb',birth:21,death:60,color:'#39f8ee',outline:referenceDropletOutline,attachToPen:false,keys:[
    at(21,414,735,0,0,0),at(22,413,732,5,0,.25),at(24,406,721,12,0,.6),
    at(26,398,704,24,-.2,1,{aspect:.88}),at(27,393,694,30,-.25,1,{aspect:1}),
    at(30,383,653,26,-.5,1,{aspect:1.65}),at(33,380,620,29,-.45,1,{aspect:1.37}),
    at(36,383,593,30,-.2,1,{aspect:1.4}),at(39,385,553,25,.2,1,{aspect:1.3}),
    at(42,387,532,29,.5,.95,{aspect:1.35}),at(45,393,501,23,.4,.88),
    at(48,394,475,22,.2,.8),at(51,392,463,13,0,.65),at(54,393,447,9,0,.45),
    at(57,396,441,5,0,.25),at(60,397,433,0,0,0),
  ]},
  {id:'cyan-plume-drop-a',kind:'droplet',birth:31,death:56,color:'#28eee9',outline:referenceDropletOutline,attachToPen:false,keys:[
    at(31,384,690,0,0,0),at(33,383,678,5,0,.9,{aspect:2.1}),at(36,382,666,5,.2,.8,{aspect:1.5}),
    at(39,377,656,5,.35,.7),at(42,375,648,3,.3,.6),at(47,372,634,2,0,.35),at(56,368,613,0,0,0),
  ]},
  {id:'cyan-plume-drop-b',kind:'droplet',birth:35,death:57,color:'#30f6ef',outline:referenceDropletOutline,attachToPen:false,keys:[
    at(35,373,641,0,0,0),at(39,366,613,10,.6,.9),at(42,362,597,11,.8,.9),
    at(45,350,588,8,.4,.8),at(48,360,577,7,.1,.65),at(51,365,573,4,0,.4),at(57,371,564,0,0,0),
  ]},
  {id:'cyan-plume-drop-c',kind:'droplet',birth:41,death:58,color:'#35f4ed',outline:referenceDropletOutline,attachToPen:false,keys:[
    at(41,411,566,0,0,0),at(45,412,554,5,-.2,.8,{aspect:1.5}),at(48,410,548,7,-.35,.65),
    at(51,411,542,5,-.3,.45),at(54,414,537,2,0,.2),at(58,418,529,0,0,0),
  ]},
  {id:'writing-bubble-a',kind:'ring',birth:26,death:54,color:'#f1eee7',outline:referenceBubbleOutline,keys:[
    at(26,525,621,0,0,0),at(28,526,610,15,.15,.45,{aspect:1.4}),
    at(30,521,549,20,-.15,.8,{aspect:2}),at(32,520,507,25,-.2,.8,{aspect:1.7}),
    at(34,517,463,23,.15,.72,{aspect:1.4}),at(36,512,433,22,.2,.65,{aspect:1.3}),
    at(40,512,398,19,-.1,.55,{aspect:1.15}),at(44,501,390,15,.2,.35),
    at(48,498,383,10,.1,.18),at(54,495,365,0,0,0),
  ]},
  {id:'writing-bubble-b',kind:'ring',birth:30,death:55,color:'#f4f0e9',outline:referenceBubbleOutline,keys:[
    at(30,573,661,0,0,0),at(32,573,656,8,0,.3,{aspect:1.8}),
    at(34,590,587,16,.3,.65,{aspect:1.65}),at(38,595,493,20,.4,.7,{aspect:1.6}),
    at(42,592,454,21,.6,.55),at(46,582,429,16,.2,.35),at(50,575,415,8,0,.15),at(55,568,402,0,0,0),
  ]},
  {id:'writing-bubble-c',kind:'ring',birth:28,death:53,color:'#f2eee8',outline:referenceBubbleOutline,keys:[
    at(28,514,630,0,0,0),at(31,514,606,6,0,.4,{aspect:1.3}),at(34,516,584,8,.2,.65),
    at(38,520,569,8,-.3,.6),at(42,525,549,7,.2,.5),at(47,532,533,5,.4,.3),at(53,538,521,0,0,0),
  ]},
  {id:'late-white-cloud-core',kind:'ring',birth:49,death:66,color:'#fffef3',keys:[
    at(49,622,590,0,0,0,{fill:1}),at(50,627,579,21,0,.8,{fill:1}),at(52,627,557,27,0,1,{fill:.9}),
    at(54,651,528,25,0,1,{fill:.65}),at(56,680,501,25,0,.95,{fill:.4}),
    at(58,687,469,25,0,.85,{fill:.2}),at(60,683,443,25,0,.6,{fill:0}),
    at(63,692,413,18,0,.2,{fill:0}),at(66,701,382,0,0,0,{fill:0}),
  ]},
  {id:'late-white-cloud-dot-a',kind:'sparkle',birth:51,death:67,color:'#fffdf5',keys:[
    at(51,610,605,0,0,0),at(54,637,562,6),at(58,656,552,6,0,.75),at(62,678,539,5,0,.4),at(67,700,518,0,0,0),
  ]},
  {id:'late-white-cloud-dot-b',kind:'sparkle',birth:51,death:68,color:'#fffdf5',keys:[
    at(51,656,609,0,0,0),at(54,671,567,7),at(58,694,552,7,0,.75),at(62,736,533,6,0,.4),at(68,766,509,0,0,0),
  ]},
  {id:'late-white-cloud-dot-c',kind:'ring',birth:51,death:68,color:'#fffdf5',keys:[
    at(51,590,605,0,0,0),at(54,580,599,6),at(58,591,589,6,0,.75),at(62,593,546,5,0,.4),at(68,601,511,0,0,0),
  ]},
  {id:'cyan-echo-head',kind:'orb',birth:111,death:150,color:'#5cebdc',outline:referenceDropletOutline,attachToPen:false,keys:[
    at(111,149,714,0,0,0),at(114,164,694,9,-.2,.4),at(117,186,659,12,-.2,.8,{aspect:2.3}),
    at(120,193,636,16,-.25,.9,{aspect:1.8}),at(123,195,606,20,-.3,1,{aspect:1.8}),
    at(126,194,561,17,-.2,1,{aspect:1.8}),at(129,189,533,20,.15,.95,{aspect:1.9}),
    at(132,182,506,22,.3,.85),at(135,175,488,16,.2,.75),at(138,170,468,16,.1,.55),
    at(141,167,452,13,0,.4),at(144,164,435,8,0,.25),at(148,140,409,3,0,.1),at(150,134,399,0,0,0),
  ]},
];
