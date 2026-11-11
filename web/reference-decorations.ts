import {sampleCubic,type Box,type Curve,type Point} from '../src/geometry';
import type {CuteDecorationPath} from './cute-elements';

export type ReferenceDecorationPath=Omit<CuteDecorationPath,'profile'>&{
  profile?:'brush'|'taper'|'round';
  color?:string;
  filled?:boolean;
};
type Cubic=readonly [number,number,number,number,number,number,number,number];

/** One continuous pen movement. Disconnected marks are always separate entries below. */
function curve(...segments:Cubic[]):Curve{
  const points:Curve['points']=[];
  let length=0;
  for(const segment of segments){
    const sampled=sampleCubic(
      {x:segment[0],y:segment[1]},{x:segment[2],y:segment[3]},
      {x:segment[4],y:segment[5]},{x:segment[6],y:segment[7]},40,
    );
    for(const point of sampled.points){
      const previous=points.at(-1),distance=previous?Math.hypot(point.x-previous.x,point.y-previous.y):0;
      if(previous&&distance<1e-8)continue;
      length+=distance;
      points.push({x:point.x,y:point.y,length});
    }
  }
  return {points,length};
}

function oval(x:number,y:number,rx:number,ry:number,degrees=0):Curve{
  const k=.55228475;
  const result=curve(
    [rx,0,rx,k*ry,k*rx,ry,0,ry],
    [0,ry,-k*rx,ry,-rx,k*ry,-rx,0],
    [-rx,0,-rx,-k*ry,-k*rx,-ry,0,-ry],
    [0,-ry,k*rx,-ry,rx,-k*ry,rx,0],
  );
  const angle=degrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return {...result,points:result.points.map(point=>({
    x:x+point.x*cos-point.y*sin,y:y+point.x*sin+point.y*cos,length:point.length,
  }))};
}
const line=(id:string,width:number,...segments:Cubic[]):ReferenceDecorationPath=>({id,width,profile:'round',curve:curve(...segments)});
const shape=(id:string,path:Curve,color?:string):ReferenceDecorationPath=>({id,width:6,profile:'round',curve:path,filled:true,...(color?{color}:{})});
const eye=(id:string,x:number,y:number,width=9):ReferenceDecorationPath=>({id,width,profile:'round',eye:{x,y}});
const pink='#F5AFC7',blue='#A3D8ED';

// The raised paw has an open wrist. Its four soft toes are one outline, not circles joined with straight bridges.
const raisedPaw=curve(
  [-31,45,-30,29,-30,15,-29,7],
  [-29,7,-49,3,-48,-20,-31,-25],
  [-31,-25,-29,-48,-14,-52,-6,-43],
  [-6,-43,-3,-39,-2,-37,0,-37],
  [0,-37,2,-37,3,-40,7,-44],
  [7,-44,17,-55,30,-47,31,-25],
  [31,-25,50,-19,48,3,30,7],
  [30,7,31,18,32,33,33,45],
);
const pawOutline=():ReferenceDecorationPath=>({id:'paw-outline',width:7,profile:'round',curve:raisedPaw});
const flatCatOutline=():ReferenceDecorationPath[]=>[
  line('head-top',6.8,
    [-48,-2,-47,-21,-46,-38,-35,-38],
    [-35,-38,-31,-38,-27,-34,-22,-31],
    [-22,-31,-10,-35,10,-35,22,-31],
    [22,-31,27,-34,34,-39,39,-36],
    [39,-36,47,-32,48,-15,49,-2],
  ),
  line('head-bottom',6.8,
    [-48,22,-46,40,-25,42,0,42],
    [0,42,25,42,46,40,48,22],
  ),
  line('whisker-left-top',6.4,[-55,8,-52,8,-47,9,-43,9]),
  line('whisker-left-bottom',6.4,[-54,21,-51,20,-47,18,-44,18]),
  line('whisker-right-top',6.4,[55,8,52,8,47,9,43,9]),
  line('whisker-right-bottom',6.4,[54,21,51,20,47,18,44,18]),
];
const tinyW=(y=17,width=5):ReferenceDecorationPath[]=>[
  line('mouth-left',width,[-8,y,-9,y+8,-1,y+9,0,y+3]),
  line('mouth-right',width,[0,y+3,1,y+9,9,y+8,8,y]),
];
const squeezedEyes=(y=6):ReferenceDecorationPath[]=>[
  line('left-eye',6,[-25,y,-21,y+2,-17,y+4,-14,y+6],[-14,y+6,-17,y+8,-21,y+11,-25,y+13]),
  line('right-eye',6,[25,y,21,y+2,17,y+4,14,y+6],[14,y+6,17,y+8,21,y+11,25,y+13]),
];

/** Reference-inspired original pen paths, in the same radius-50 coordinate system as the signature ornaments. */
export const referenceDecorationPaths:Record<string,ReferenceDecorationPath[]>={
  'paw-wave':[
    pawOutline(),
  ],
  'paw-striped':[
    pawOutline(),
    line('wrist-stripe-top',6.6,[-29,15,-22,16,-13,17,-5,17]),
    line('wrist-stripe-bottom',6.6,[-30,31,-24,32,-17,33,-9,32]),
  ],
  'paw-beans':[
    pawOutline(),
    shape('toe-outer-left',oval(-25,-16,4.8,5.6,-12)),
    shape('toe-inner-left',oval(-12,-33,4.8,5.5,-5)),
    shape('toe-inner-right',oval(12,-33,4.8,5.5,5)),
    shape('toe-outer-right',oval(26,-16,4.8,5.6,12)),
    shape('palm-pad',curve(
      [-11,3,-15,-4,-7,-13,0,-12],
      [0,-12,7,-13,15,-4,12,3],
      [12,3,9,7,4,4,0,5],
      [0,5,-5,5,-9,7,-11,3],
    )),
  ],
  'cat-round':[
    ...flatCatOutline(),
    eye('left-eye',-17,23,10),
    eye('right-eye',17,23,10),
  ],
  'cat-squint':[
    ...flatCatOutline(),
    ...squeezedEyes(9),
    ...tinyW(16,4.8),
  ],
  'rabbit-face':[
    line('left-ear',6.5,
      [-33,-18,-39,-31,-35,-53,-23,-56],
      [-23,-56,-9,-59,-9,-39,-11,-24],
    ),
    line('right-ear',6.5,
      [12,-24,10,-40,17,-61,29,-57],
      [29,-57,43,-53,38,-30,34,-18],
    ),
    line('left-cheek-outline',6.5,[-42,-4,-49,5,-49,22,-38,27]),
    line('right-cheek-outline',6.5,[42,-4,49,5,49,22,38,27]),
    ...squeezedEyes(4),
    shape('button-nose',oval(0,21,3.2,1.8)),
  ],
  'panda-face':[
    shape('left-ear',curve(
      [-39,-17,-44,-25,-41,-40,-29,-40],
      [-29,-40,-21,-40,-13,-34,-13,-29],
      [-13,-29,-19,-25,-29,-19,-39,-17],
    )),
    shape('right-ear',curve(
      [39,-17,44,-25,41,-40,29,-40],
      [29,-40,21,-40,13,-34,13,-29],
      [13,-29,19,-25,29,-19,39,-17],
    )),
    line('left-cheek-outline',6.5,[-41,-5,-48,3,-49,17,-41,25]),
    line('right-cheek-outline',6.5,[41,-5,48,3,49,17,41,25]),
    eye('left-eye',-18,7,8.6),
    line('right-eye',5.8,[22,3,19,5,16,7,14,9],[14,9,16,11,20,14,23,15]),
    ...tinyW(9,4.7),
  ],
  'puppy-face':[
    line('left-floppy-ear',6.5,
      [-34,-15,-46,-8,-53,3,-47,11],
      [-47,11,-42,18,-34,16,-29,10],
    ),
    line('right-floppy-ear',6.5,
      [34,-15,46,-8,53,3,47,11],
      [47,11,42,18,34,16,29,10],
    ),
    eye('left-eye',-15,7,8.4),
    eye('right-eye',16,7,8.4),
    shape('button-nose',oval(0,13,3.6,2.7)),
    line('nose-stem',4.5,[0,15,0,16,0,18,0,20]),
    line('mouth-left',4.8,[0,19,-2,25,-7,25,-9,20]),
    line('mouth-right',4.8,[0,19,2,25,8,25,9,19]),
  ],
  'face-sleepy':[
    line('left-brow',4.8,[-30,-31,-25,-30,-20,-29,-16,-29]),
    line('right-brow',4.8,[16,-29,21,-29,26,-30,31,-32]),
    shape('left-eye-fill',curve(
      [-35,-10,-28,-11,-21,-11,-16,-10],
      [-16,-10,-16,-2,-16,11,-25,12],
      [-25,12,-34,14,-37,2,-35,-10],
    )),
    shape('right-eye-fill',curve(
      [16,-10,23,-11,31,-11,36,-10],
      [36,-10,36,-2,36,11,27,12],
      [27,12,18,14,15,2,16,-10],
    )),
    line('left-eye-lid',6.8,[-43,-11,-34,-12,-23,-12,-13,-11]),
    line('right-eye-lid',6.8,[13,-11,24,-12,34,-12,43,-11]),
    ...tinyW(22,4.8),
    {...line('blush-left',7,[-44,21,-38,20,-30,20,-24,21]),color:pink},
  ],
  'face-owo':[
    {id:'left-eye',width:6.3,profile:'round',curve:oval(-35,0,10,11,-5)},
    {id:'right-eye',width:6.3,profile:'round',curve:oval(35,0,10,11,5)},
    line('mouth',6.2,
      [-17,-14,-18,2,-15,12,-7,12],
      [-7,12,0,12,0,2,0,-6],
      [0,-6,0,2,1,12,9,12],
      [9,12,18,11,18,1,18,-13],
    ),
  ],
  'face-smile':[
    line('left-eye',6.7,[-38,0,-37,-22,-17,-24,-15,0]),
    line('right-eye',6.7,[15,0,16,-23,37,-23,38,0]),
    line('mouth-left',5.6,[-13,23,-9,34,-1,34,0,28]),
    line('mouth-right',5.6,[0,28,4,35,13,32,17,24]),
    shape('sweat-drop',curve(
      [40,-47,34,-33,30,-17,39,-17],
      [39,-17,49,-17,48,-33,45,-44],
      [45,-44,44,-50,42,-52,40,-47],
    ),blue),
  ],
  'face-shy':[
    line('left-eye',6.7,[-40,-19,-31,-15,-24,-10,-18,-7],[-18,-7,-25,-7,-34,-6,-42,-3]),
    line('right-eye',6.7,[40,-19,31,-15,24,-10,18,-7],[18,-7,25,-7,34,-6,42,-3]),
    {...line('blush-left-a',4.4,[-40,13,-38,10,-36,7,-33,4]),color:pink},
    {...line('blush-left-b',4.4,[-32,17,-29,13,-27,10,-24,7]),color:pink},
    {...line('blush-left-c',4.4,[-24,19,-21,16,-19,13,-17,11]),color:pink},
    {...line('blush-right-a',4.4,[17,13,20,10,22,7,24,5]),color:pink},
    {...line('blush-right-b',4.4,[25,17,28,13,30,10,33,7]),color:pink},
    {...line('blush-right-c',4.4,[34,18,36,16,38,13,40,11]),color:pink},
    {id:'mouth',width:5.2,profile:'round',curve:oval(0,23,7.8,13)},
  ],
};

/** Shared bounds for the actual renderer and its gallery; accents and eye ellipses are included. */
export const referenceDecorationBounds:Record<string,Box>=Object.fromEntries(
  Object.entries(referenceDecorationPaths).map(([id,paths])=>{
    const bounds:Box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for(const path of paths){
      const points=path.curve?.points??(path.eye?[path.eye]:[]),padding=path.width*.75+1;
      for(const point of points){
        bounds.minX=Math.min(bounds.minX,point.x-padding);
        bounds.minY=Math.min(bounds.minY,point.y-padding);
        bounds.maxX=Math.max(bounds.maxX,point.x+padding);
        bounds.maxY=Math.max(bounds.maxY,point.y+padding);
      }
    }
    return [id,bounds];
  }),
);
