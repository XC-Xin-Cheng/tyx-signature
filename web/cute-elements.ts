import {sampleCubic,type Box,type Curve,type Point} from '../src/geometry';

export type CuteDecorationPath={
  id:string;
  width:number;
  curve?:Curve;
  profile?:'brush'|'taper';
  eye?:Point;
};
type Cubic=readonly [number,number,number,number,number,number,number,number];

/** Authored centerlines retain the pen's order and can be sampled at any playback time. */
function curve(...segments:Cubic[]):Curve{
  const points:Curve['points']=[];
  let length=0;
  for(const segment of segments){
    const sampled=sampleCubic(
      {x:segment[0],y:segment[1]},
      {x:segment[2],y:segment[3]},
      {x:segment[4],y:segment[5]},
      {x:segment[6],y:segment[7]},48,
    );
    for(const p of sampled.points){
      const previous=points.at(-1);
      if(previous)length+=Math.hypot(p.x-previous.x,p.y-previous.y);
      points.push({x:p.x,y:p.y,length});
    }
  }
  return {points,length};
}

function oval(cx:number,cy:number,rx:number,ry:number,degrees=0):Curve{
  const k=.55228475;
  const shape=curve(
    [rx,0,rx,k*ry,k*rx,ry,0,ry],
    [0,ry,-k*rx,ry,-rx,k*ry,-rx,0],
    [-rx,0,-rx,-k*ry,-k*rx,-ry,0,-ry],
    [0,-ry,k*rx,-ry,rx,-k*ry,rx,0],
  );
  const angle=degrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return {...shape,points:shape.points.map(p=>({x:cx+p.x*cos-p.y*sin,y:cy+p.x*sin+p.y*cos,length:p.length}))};
}

/** Original hand-drawn ornaments. Coordinates use the same radius-50 space as the existing cat. */
export const cuteDecorationPaths:Record<string,CuteDecorationPath[]>={
  'cat-ears':[
    {id:'left-ear',width:4.3,curve:curve(
      [-47,1,-47,-13,-46,-37,-40,-39],
      [-40,-39,-35,-41,-14,-19,-8,-5],
    )},
    {id:'right-ear',width:4.3,curve:curve(
      [8,-5,18,-22,34,-42,39,-38],
      [39,-38,45,-34,47,-11,47,1],
    )},
    {id:'left-inner-ear',width:2.8,profile:'taper',curve:curve(
      [-38,-12,-39,-19,-39,-27,-37,-28],
      [-37,-28,-34,-28,-25,-20,-21,-15],
    )},
    {id:'right-inner-ear',width:2.8,profile:'taper',curve:curve(
      [21,-15,26,-21,34,-29,37,-27],
      [37,-27,40,-25,39,-17,39,-11],
    )},
  ],
  rabbit:[
    {id:'left-ear',width:4.3,curve:curve(
      [-28,-24,-39,-40,-50,-73,-36,-80],
      [-36,-80,-24,-88,-11,-55,-10,-27],
    )},
    {id:'right-ear',width:4.2,curve:curve(
      [10,-28,13,-51,27,-88,40,-81],
      [40,-81,54,-73,40,-35,30,-22],
    )},
    {id:'round-face',width:3.8,curve:curve(
      [-34,-18,-48,-10,-55,12,-46,30],
      [-46,30,-34,51,28,57,45,32],
      [45,32,57,12,48,-9,34,-18],
      [34,-18,18,-31,-19,-31,-34,-18],
    )},
    {id:'left-inner-ear',width:3.1,profile:'taper',curve:curve([-25,-36,-31,-48,-35,-60,-32,-67])},
    {id:'right-inner-ear',width:3.1,profile:'taper',curve:curve([25,-36,31,-48,36,-62,35,-69])},
    {id:'left-eye',width:5,eye:{x:-16,y:8}},
    {id:'right-eye',width:5,eye:{x:17,y:7}},
    {id:'little-nose',width:3.2,curve:curve(
      [-4,15,-1,12,4,12,6,15],
      [6,15,9,20,1,24,-1,21],
      [-1,21,-4,20,-8,18,-4,15],
    )},
    {id:'left-smile',width:3.1,curve:curve([0,22,0,32,-10,33,-13,26])},
    {id:'right-smile',width:3.1,curve:curve([0,22,1,32,12,33,15,25])},
    {id:'left-cheek',width:3,profile:'taper',curve:curve([-36,23,-33,27,-28,28,-23,26])},
    {id:'right-cheek',width:3,profile:'taper',curve:curve([25,26,30,27,35,25,38,21])},
  ],
  dog:[
    {id:'left-floppy-ear',width:4.4,curve:curve(
      [-34,-22,-56,-49,-75,-28,-72,4],
      [-72,4,-70,24,-55,32,-45,11],
      [-45,11,-40,-3,-36,-16,-34,-22],
    )},
    {id:'right-floppy-ear',width:4.4,curve:curve(
      [38,-20,58,-45,78,-23,74,6],
      [74,6,71,28,57,34,47,13],
      [47,13,41,1,39,-9,38,-20],
    )},
    {id:'round-face',width:3.8,curve:curve(
      [-35,-20,-20,-42,23,-42,38,-18],
      [38,-18,49,-2,48,27,30,42],
      [30,42,11,55,-19,52,-36,35],
      [-36,35,-50,20,-48,-4,-35,-20],
    )},
    {id:'left-eye',width:5,eye:{x:-17,y:7}},
    {id:'right-eye',width:5,eye:{x:17,y:7}},
    {id:'button-nose',width:3.8,curve:curve(
      [-6,18,-3,14,5,14,8,18],
      [8,18,11,23,3,28,0,25],
      [0,25,-3,28,-11,23,-6,18],
    )},
    {id:'left-smile',width:3.1,curve:curve([0,26,0,35,-12,38,-17,31])},
    {id:'right-smile',width:3.1,curve:curve([0,26,2,36,13,37,18,30])},
    {id:'little-tongue',width:3.3,curve:curve([-7,36,-6,50,7,51,10,36])},
    {id:'left-freckle',width:3,curve:oval(-28,24,1.6,1.8,-12)},
    {id:'right-freckle',width:3,curve:oval(29,22,1.6,1.8,12)},
  ],
  bow:[
    {id:'left-loop',width:4.5,curve:curve(
      [-7,-7,-25,-27,-58,-47,-65,-29],
      [-65,-29,-76,-3,-65,26,-45,26],
      [-45,26,-26,25,-11,12,-6,6],
      [-6,6,-3,2,-4,-1,-7,-7],
    )},
    {id:'right-loop',width:4.5,curve:curve(
      [7,-6,25,-27,58,-43,65,-25],
      [65,-25,74,-2,64,27,44,25],
      [44,25,28,23,12,12,6,6],
      [6,6,3,2,4,-1,7,-6],
    )},
    {id:'left-ribbon-tail',width:4.1,curve:curve(
      [-9,8,-17,24,-30,36,-25,62],
      [-25,62,-17,58,-14,56,-6,61],
      [-6,61,-8,43,1,29,4,12],
    )},
    {id:'right-ribbon-tail',width:4.1,curve:curve(
      [6,9,20,19,33,37,28,58],
      [28,58,20,53,16,51,9,54],
      [9,54,13,34,3,20,-2,12],
    )},
    {id:'left-crease',width:3,profile:'taper',curve:curve([-50,-5,-31,-5,-20,1,-9,3])},
    {id:'right-crease',width:3,profile:'taper',curve:curve([52,-6,33,-8,22,-2,9,1])},
    {id:'soft-knot',width:4.2,curve:oval(0,1,10,12,-5)},
  ],
  paw:[
    {id:'outer-left-toe',width:3.8,curve:oval(-41,-15,9,12,-28)},
    {id:'inner-left-toe',width:4,curve:oval(-16,-38,10,15,-10)},
    {id:'inner-right-toe',width:4,curve:oval(16,-39,10,15,12)},
    {id:'outer-right-toe',width:3.8,curve:oval(41,-14,9,12,29)},
    {id:'soft-pad',width:4.5,curve:curve(
      [-30,22,-24,12,-12,-4,0,-4],
      [0,-4,12,-4,26,8,32,20],
      [32,20,40,32,40,49,25,51],
      [25,51,14,54,8,47,0,47],
      [0,47,-9,47,-19,55,-29,50],
      [-29,50,-42,44,-40,32,-30,22],
    )},
  ],
};

/** The renderer can place each ear root near its own edge of the finished word. */
export const catEarAnchors:Record<'left'|'right',Point>={left:{x:-28,y:0},right:{x:28,y:0}};

/** Bounds include the centerlines, eye ellipses and brush thickness for layout and hit testing. */
export const cuteDecorationBounds:Record<string,Box>=Object.fromEntries(
  Object.entries(cuteDecorationPaths).map(([id,paths])=>{
    const bounds:Box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for(const path of paths){
      const points=path.curve?.points??(path.eye?[path.eye]:[]);
      const padding=path.width*.75+1;
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
