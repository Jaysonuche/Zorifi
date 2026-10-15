const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../zorifi-advanced-editing.js'),'utf8'),{window});
const E=window.ZorifiEasingCurves,A=window.ZorifiAdvancedEditing;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
test('easing formulas, bounds and legacy defaults remain predictable',()=>{
 near(E.evaluate(.25,'easeInQuad'),.0625);near(E.evaluate(.25,'easeOutQuad'),.4375);near(E.evaluate(.25,'easeInOutQuad'),.125);near(E.evaluate(.25),.0625);near(A.easedProgress(.25),.125);
 near(E.evaluate(-1),0);near(E.evaluate(2),1);assert.throws(()=>E.evaluate(NaN));
 for(const mode of ['linear','easeInQuad','easeOutQuad','easeInOutQuad','easeInOutCubic','easeInBounce','easeOutBounce','easeInOutBounce','bezier']){near(E.evaluate(0,mode),0);near(E.evaluate(1,mode),1);}
});
test('Bezier inverts the X curve, preserves zero controls and supports arrays and objects',()=>{
 // x(t)=t^3, y(t)=3t-3t^2+t^3: at x=.125, t=.5 and y=.875.
 near(E.evaluate(.125,'bezier',{x1:0,y1:1,x2:0,y2:1}),.875);
 near(E.evaluate(.125,'bezier',[0,1,0,1]),.875);
 near(E.evaluate(.125,'bezier',{x1:0,y1:0,x2:0,y2:0}),.125);
 near(E.evaluate(.4,'bezier',[0,0,1,1]),.4);
 assert.throws(()=>E.evaluate(.5,'bezier',{x1:-1}),/X controls/);
});
test('bounce reverses direction between impacts and remains bounded',()=>{
 assert.ok(E.evaluate(.4,'bounce')>E.evaluate(.5,'bounce'));
 for(let i=0;i<=100;i++){const p=i/100,value=E.evaluate(p,'bounce');assert.ok(value>=0&&value<=1);near(E.evaluate(p,'easeInBounce'),1-E.evaluate(1-p,'easeOutBounce'));}
});
test('interpolation sorts without mutation, uses last duplicate and holds until the next exact key',()=>{
 const frames=[{time:2,value:20},{time:0,value:0,easing:'hold'},{time:1,value:5},{time:1,value:10,easing:'linear'}],before=JSON.stringify(frames);
 assert.equal(E.interpolateKeyframes(frames,.999),0);assert.equal(E.interpolateKeyframes(frames,1),10);assert.equal(E.interpolateKeyframes(frames,1.5),15);assert.equal(JSON.stringify(frames),before);
 assert.equal(E.interpolateKeyframes([],1),0);assert.throws(()=>E.interpolateKeyframes([{time:NaN,value:1}],0));
});
test('editor property sampling uses the same cubic and bounce evaluator as the public API',()=>{
 const clip={keyframes:{positionX:[{time:0,value:0,easing:'easeOutBounce'},{time:1,value:100}]}};
 near(A.keyframedValue(clip,'positionX',.4),E.evaluate(.4,'easeOutBounce')*100);
 clip.keyframes.positionX[0]={time:0,value:0,easing:'bezier',bezier:[0,1,0,1]};near(A.keyframedValue(clip,'positionX',.125),87.5);
 assert.equal(A.keyframedValue({opacity:70},'opacity',0),70);
});
