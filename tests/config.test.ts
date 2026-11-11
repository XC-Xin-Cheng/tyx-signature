import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,mergeConfig,parseConfig} from '../src/config';
import {makePlan,naturalTime} from '../src/timeline';
test('names retain case, spaces and supported punctuation',()=>{
 for(const name of ['Zoe','zoe','Alex Chen',"O'Connor",'Anne-Marie'])assert.equal(parseConfig({name}).name,name);
 assert.throws(()=>parseConfig({name:'你好'}));assert.throws(()=>parseConfig({name:'   '}));
});
test('width capabilities are real and patches retain other groups',()=>{
 assert.throws(()=>parseConfig({name:'Alex',font:{id:'tangerine',penWidth:1.4}}));
 const result=parseConfig(mergeConfig(defaultConfig,{name:'Alex',font:{id:'ems-allure',penWidth:1.4}}));
 assert.equal(result.font.penWidth,1.4);assert.equal(result.glow.color,defaultConfig.glow.color);
 assert.throws(()=>mergeConfig(defaultConfig,JSON.parse('{"__proto__":{"polluted":true}}')));
});
test('phase clock fits a duration and shuts down finished motion',()=>{
 const c=parseConfig({name:'Alex'}),plan=makePlan(c,4);
 assert.equal(plan.total,5);assert.equal(plan.durationInFrames,300);
 assert.equal(naturalTime(-1,plan),0);assert.equal(naturalTime(100,plan),4);
 const phases=[plan.lead,plan.writing,plan.decoration,plan.underline,plan.leaving,plan.wink,plan.hold];
 for(let i=1;i<phases.length;i++)assert.equal(phases[i-1].end,phases[i].start);
 assert.ok(plan.hold.end-plan.hold.start>=.34);
});
test('speed mode derives duration independently of the inactive duration field',()=>{
 const c=parseConfig({name:'Alex',timing:{mode:'speed',speed:2,durationSeconds:3}}),a=makePlan(c,8);
 const b=makePlan(parseConfig({...c,timing:{...c.timing,durationSeconds:15}}),8);
 assert.equal(a.total,b.total);assert.ok(Math.abs(a.writing.end-a.writing.start-4)<1e-9);
});
