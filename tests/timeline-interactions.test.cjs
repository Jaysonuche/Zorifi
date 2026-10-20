const test=require('node:test'),assert=require('node:assert/strict');
const {movedClip,trimmedClip,detectBeats,pcmChannels}=require('../zorifi-timeline-interactions.js');
test('moving an element preserves source trim and retimes its animation and kinetic words',()=>{
  const clip={id:'visual',start:4,duration:5,sourceStart:9,track:0,keyframes:{opacity:[{time:4,value:0},{time:9,value:100}]},kineticWords:[{start:4,end:5,text:'Hello'}]};
  const next=movedClip(clip,7,1);assert.equal(next.sourceStart,9);assert.equal(next.track,1);assert.deepEqual(next.keyframes.opacity.map(f=>f.time),[7,12]);assert.equal(next.kineticWords[0].start,7);assert.equal(clip.start,4);
});
test('trimming cannot extend video before source frame zero or past source end; stills and effects remain extendable',()=>{
  const clip={start:5,duration:4,sourceStart:2,playbackRate:2};
  const left=trimmedClip(clip,{type:'video',duration:14},{side:'left',time:0,fps:30});assert.equal(left.start,4);assert.equal(left.duration,5);assert.equal(left.sourceStart,0);
  const right=trimmedClip(clip,{type:'video',duration:14},{side:'right',time:40,fps:30});assert.equal(right.duration,6);
  assert.equal(trimmedClip(clip,{type:'image',duration:4},{side:'right',time:30,fps:30}).duration,25);
  assert.equal(trimmedClip({...clip,type:'effect'},null,{side:'right',time:30,fps:30}).duration,25);
});
test('beat detection measures rhythmic transients in the selected source range without manufacturing a grid',()=>{
  const rate=16000,data=new Float32Array(rate*5);for(const time of [.5,1,1.5,2,2.5,3,3.5,4])for(let i=0;i<rate*.045;i++)data[Math.floor(time*rate)+i]=Math.sin(i*.23)*.8*(1-i/(rate*.045));
  const beats=detectBeats([data],rate,{start:1.2,duration:2});assert.equal(beats.length,4);for(const [index,time] of beats.entries())assert(Math.abs(time-(1.5+index*.5))<.05);
  assert.deepEqual(detectBeats([new Float32Array(rate)],rate),[]);
});
test('bounded PCM parsing decodes real stereo samples and rejects other containers',()=>{
  const bytes=new Uint8Array(52),view=new DataView(bytes.buffer),write=(at,value)=>[...value].forEach((letter,i)=>bytes[at+i]=letter.charCodeAt(0));write(0,'RIFF');write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,16000,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,8,true);view.setInt16(44,16384,true);view.setInt16(46,-16384,true);const pcm=pcmChannels(bytes);assert.equal(pcm.channels.length,2);assert.equal(pcm.channels[0][0],.5);assert.equal(pcm.channels[1][0],-.5);assert.equal(pcmChannels(new Uint8Array(50)),null);
});
