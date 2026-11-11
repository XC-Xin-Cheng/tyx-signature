import test from 'node:test';
import assert from 'node:assert/strict';
import {pointAt,ribbon,sampleCubic} from '../src/geometry';
import {pullOffset} from '../src/motion';
const line=sampleCubic({x:0,y:100},{x:150,y:70},{x:380,y:65},{x:500,y:90});
const flight=sampleCubic({x:500,y:90},{x:570,y:-20},{x:550,y:-150},{x:250,y:-200});
const phase={start:4,end:4.35};
const first=(d:string)=>d.match(/^M ([\d.\-]+) ([\d.\-]+)/)?.slice(1);
test('whole-span pull fixes the left endpoint and returns to the resting path',()=>{
 const rest=ribbon(line,1,10),pull=pullOffset(flight,4.04,phase),raised=ribbon(line,1,10,pull);
 assert.notDeepEqual(pull,{x:0,y:0});assert.notEqual(raised,rest);
 assert.deepEqual(first(raised),first(rest));
 assert.equal(ribbon(line,1,10,pullOffset(flight,5,phase)),rest);
 assert.deepEqual(pullOffset(flight,0,phase),{x:0,y:0});
});
test('same frame is reproducible when sought in arbitrary order',()=>{
 const samples=[4.02,4.08,4.16,4.3].map(t=>pullOffset(flight,t,phase));
 for(const i of [3,0,2,1])assert.deepEqual(pullOffset(flight,[4.02,4.08,4.16,4.3][i],phase),samples[i]);
 assert.deepEqual(pointAt(line,0),{x:0,y:100});
});
