export type Point={x:number;y:number};
export type Box={minX:number;minY:number;maxX:number;maxY:number};
export type Curve={points:(Point&{length:number})[];length:number};
export const add=(a:Point,b:Point)=>({x:a.x+b.x,y:a.y+b.y});
export function union(boxes:Box[]):Box {return {minX:Math.min(...boxes.map(b=>b.minX)),minY:Math.min(...boxes.map(b=>b.minY)),maxX:Math.max(...boxes.map(b=>b.maxX)),maxY:Math.max(...boxes.map(b=>b.maxY))};}
export function sampleCubic(a:Point,b:Point,c:Point,d:Point,n=160):Curve {
 const points:Curve['points']=[];let length=0;
 for(let i=0;i<=n;i++){const t=i/n,u=1-t,p={x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};const last=points.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({...p,length});}
 return {points,length};
}
export function pointAt(c:Curve,u:number):Point {
 const length=Math.max(0,Math.min(1,u))*c.length;let hi=c.points.length-1,lo=0;
 while(lo<hi){const m=(lo+hi)>>1;if(c.points[m].length<length)lo=m+1;else hi=m;}
 const a=c.points[Math.max(0,lo-1)],b=c.points[lo];const t=(length-a.length)/(b.length-a.length||1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
export function pathOf(points:Point[]){return points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ');}
export function ribbon(c:Curve,progress:number,width:number,offset?:Point):string {
 const end=Math.max(0,Math.min(1,progress));if(end<=0)return '';
 const raw=[...c.points.filter(p=>p.length<c.length*end),{...pointAt(c,end),length:c.length*end}];
 const pts=raw.map(p=>{const u=p.length/c.length,w=offset?u*u*(3-2*u):0;return {...p,x:p.x+(offset?.x??0)*w,y:p.y+(offset?.y??0)*w};});
 const left:Point[]=[],right:Point[]=[];
 for(let i=0;i<pts.length;i++){
  const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(i+1,pts.length-1)],len=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const u=p.length/c.length,w=width/2*Math.max(.015,Math.sin(Math.PI*Math.pow(u,.82)))*(.75+.25*u);
  const x=p.x,y=p.y;
  left.push({x:x-(b.y-a.y)/len*w,y:y+(b.x-a.x)/len*w});right.push({x:x+(b.y-a.y)/len*w,y:y-(b.x-a.x)/len*w});
 }
 return pathOf([...left,...right.reverse()])+' Z';
}

export function pointBounds(points:Point[]):Box{
 const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const p of points){box.minX=Math.min(box.minX,p.x);box.minY=Math.min(box.minY,p.y);box.maxX=Math.max(box.maxX,p.x);box.maxY=Math.max(box.maxY,p.y);}return box;
}
