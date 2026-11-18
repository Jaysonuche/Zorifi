/* Original procedural instruments. No cloud model, samples, microphone or second editor store. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiNativeMusic=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA='zorifi.music-pattern/1',BLUEPRINT='zorifi.song-blueprint/1';
  const INSTRUMENTS=Object.freeze(['kick','snare','hat','bass','piano','pluck','pad']);
  const NOTES=Object.freeze(['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']);
  const SCALES=Object.freeze({minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11],pentatonic:[0,3,5,7,10]});
  const clone=value=>structuredClone(value),finite=value=>typeof value==='number'&&Number.isFinite(value);
  function assert(value,message){if(!value)throw new TypeError(message);}
  function hash(text){let result=2166136261;for(const char of String(text)){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0;}
  function random(seed){let value=hash(seed)||1;return()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return(value>>>0)/4294967296;};}
  function validatePattern(pattern,{maxDuration=600}={}){
    assert(pattern&&pattern.schema===SCHEMA,'Unsupported native music pattern.');
    assert(INSTRUMENTS.includes(pattern.instrument),'Choose a supported native instrument.');
    assert(finite(pattern.duration)&&pattern.duration>=.05&&pattern.duration<=maxDuration,'Pattern duration exceeds the supported range.');
    assert(finite(pattern.bpm)&&pattern.bpm>=40&&pattern.bpm<=200,'Tempo must be 40–200 BPM.');
    assert(Array.isArray(pattern.notes)&&pattern.notes.length<=30000,'A pattern supports up to 30,000 notes.');
    const ids=new Set();
    for(const note of pattern.notes){
      assert(typeof note.id==='string'&&note.id.length<=100&&!ids.has(note.id),'Each note needs a unique ID.');ids.add(note.id);
      assert(finite(note.start)&&note.start>=0&&finite(note.duration)&&note.duration>=.005&&note.start+note.duration<=pattern.duration+.000001,'Keep notes within the pattern duration.');
      assert(Number.isInteger(note.pitch)&&note.pitch>=0&&note.pitch<=127&&finite(note.velocity)&&note.velocity>=0&&note.velocity<=1,'Use a MIDI pitch 0–127 and velocity 0–1.');
      if(note.drumStep!==undefined)assert(note.drumStep&&Object.keys(note.drumStep).every(k=>['anchorId','articulation'].includes(k))&&typeof note.drumStep.anchorId==='string'&&['flam','roll'].includes(note.drumStep.articulation),'Unsupported drum articulation note.');
    }
    const noteById=new Map(pattern.notes.map(n=>[n.id,n])),articulations=new Map();
    for(const note of pattern.notes)if(note.drumStep){const anchor=noteById.get(note.drumStep.anchorId);assert(anchor&&!anchor.drumStep&&anchor.pitch===note.pitch&&note.start>anchor.start,'A drum articulation needs its original earlier hit at the same pitch.');const hits=articulations.get(anchor.id)||[];hits.push(note.drumStep.articulation);articulations.set(anchor.id,hits);}
    for(const hits of articulations.values())assert(hits.every(kind=>kind===hits[0])&&(hits[0]==='flam'?hits.length===1:[1,2,3,5,7].includes(hits.length)),'A drum articulation supports a 2-hit flam or a 2, 3, 4, 6 or 8-hit roll.');
    assert(pattern.notes.reduce((sum,n)=>sum+n.duration,0)<=pattern.duration*16,'Pattern exceeds the native synthesis voice budget.');
    const events=pattern.notes.flatMap(n=>[{at:n.start,delta:1},{at:n.start+n.duration,delta:-1}]).sort((a,b)=>a.at-b.at||a.delta-b.delta);let voices=0;
    for(const event of events){voices+=event.delta;assert(voices<=32,'Pattern exceeds 32 simultaneous voices.');}
    return clone(pattern);
  }
  function compose(options={}){
    const duration=options.duration??30,bpm=options.bpm??110,key=options.key??'A',scaleMode=options.scaleMode??'minor',timeSignature=options.timeSignature??'4/4';
    assert(finite(duration)&&duration>=5&&duration<=600,'Choose an exact native duration between 5 and 600 seconds.');
    assert(finite(bpm)&&bpm>=40&&bpm<=200,'Tempo must be 40–200 BPM.');
    assert(NOTES.includes(key)&&SCALES[scaleMode],'Choose a supported key and scale.');
    assert(['4/4','3/4','6/8'].includes(timeSignature),'Choose 4/4, 3/4 or 6/8 time.');
    assert(!options.vocals||options.vocals==='instrumental','Native instruments do not generate a singing voice. Select instrumental.');
    const seed=String(options.seed??options.prompt??'Zorifi original').slice(0,1500),rng=random(seed),beat=60/bpm,beats=timeSignature==='3/4'?3:timeSignature==='6/8'?3:4,bar=beats*beat;
    const genre=String(options.genre||'cinematic').slice(0,50),afro=/afro|amapiano|highlife/i.test(genre+' '+seed),ambient=/ambient|cinematic/i.test(genre),swing=options.groove==='swing'?.12:afro?.055:0;
    const leads=[...new Set((options.selectedInstruments||['piano']).map(item=>item==='strings'?'pad':item==='piano'?'piano':'pluck'))].slice(0,2);
    const instruments=[...(options.rhythm==='ambient-none'?[]:['kick','snare','hat']),...(options.bassline==='none'?[]:['bass']),...leads];
    const sections=[{id:'intro',name:'Intro',start:0,end:duration*.16,energy:.45},{id:'build',name:'Build',start:duration*.16,end:duration*.36,energy:.7},{id:'hook',name:'Hook',start:duration*.36,end:duration*.83,energy:1},{id:'outro',name:'Outro',start:duration*.83,end:duration,energy:.5}];
    const tonic=NOTES.indexOf(key),scale=SCALES[scaleMode],degree=n=>{const oct=Math.floor(n/scale.length),index=((n%scale.length)+scale.length)%scale.length;return scale[index]+12*oct;};
    const patterns=instruments.map(instrument=>({schema:SCHEMA,instrument,duration,bpm,key,scaleMode,timeSignature,seed:seed+':'+instrument,locked:false,revision:1,notes:[]}));
    const add=(p,time,length,pitch,velocity)=>{if(time<0||time>=duration-.01)return;const available=Math.min(length,duration-time);if(available>=.005)p.notes.push({id:p.instrument+'-'+p.notes.length,start:Number(time.toFixed(6)),duration:Number(available.toFixed(6)),pitch,velocity:Number(velocity.toFixed(4))});};
    for(let b=0;b*bar<duration;b++){
      const from=b*bar,ending=from>=duration-bar*1.1,section=sections.find(s=>from<s.end)||sections.at(-1),energy=section.energy;
      const root=tonic+degree(ending?0:[0,5,3,4][Math.floor(b/2)%4]);
      for(const p of patterns){
        if(p.instrument==='kick'){for(const offset of afro?[0,1.5,2.75]:[0,beats/2])if(offset<beats)add(p,from+offset*beat,.27,36,.78*energy);}
        else if(p.instrument==='snare'){for(let n=1;n<beats;n+=2)add(p,from+n*beat,.18,38,.5*energy);}
        else if(p.instrument==='hat'){for(let n=0;n<beats*2;n++)if(!ending||n<beats)add(p,from+(n/2+(n%2?swing:0))*beat,.065,42,(n%2?.32:.46)*energy);}
        else if(p.instrument==='bass'){for(const offset of afro?[0,.75,1.75,2.5,3.5]:[0,beats/2])if(offset<beats)add(p,from+offset*beat,beat*(afro?.45:1.3),36+root,.7*energy);}
        else if(p.instrument==='pad'||ambient&&p.instrument==='piano'){for(const interval of [0,2,4])add(p,from,Math.min(bar*.9,duration-from),48+tonic+degree((ending?0:[0,5,3,4][Math.floor(b/2)%4])+interval),.32*energy);}
        else{for(let n=0;n<beats*2;n++){if(rng()>(afro?.76:.6)&&!ending)continue;const step=ending?0:[0,2,4,2,6,4,2,1][(n+b)%8],pitch=60+tonic+degree(step);add(p,from+(n/2+(n%2?swing:0))*beat,beat*(afro?.32:.65),Math.min(108,pitch),(.38+rng()*.22)*energy);}}
      }
    }
    // A tonic cadence and an actual short envelope produce a musical ending at the requested frame.
    for(const p of patterns)if(['piano','pluck','pad','bass'].includes(p.instrument)){p.notes=p.notes.filter(n=>n.start<duration-beat*1.5);add(p,Math.max(0,duration-beat*1.5),beat*1.45,(p.instrument==='bass'?36:60)+tonic,.42);}
    return {schema:BLUEPRINT,id:'song-'+hash(seed+duration+bpm+key+genre).toString(16),title:String(options.title||genre+' arrangement').slice(0,100),duration,bpm,key,scaleMode,timeSignature,seed,sections,patterns:patterns.map(validatePattern),provenance:{engine:'zorifi-native-procedural-v1',originalSynthesis:true,cloudModel:false,voice:false}};
  }
  function drumGrid(source,{steps=16,bar=0,pitch}={}){
    const p=validatePattern(source),defaultPitch={kick:36,snare:38,hat:42}[p.instrument];
    assert(defaultPitch!==undefined,'Choose a native kick, snare or hat pattern for drum sequencing.');
    assert([16,32,64].includes(steps),'Choose a 16, 32 or 64-step drum grid.');
    const meter=String(p.timeSignature||'4/4').match(/^([1-9]\d?)\/(1|2|4|8|16|32|64|128)$/);
    assert(meter&&Number(meter[1])<=32,'This source meter is not supported by the drum grid.');
    pitch=pitch??defaultPitch;assert(Number.isInteger(pitch)&&pitch>=0&&pitch<=127,'Use a MIDI pitch 0–127.');
    const barDuration=60/p.bpm*Number(meter[1])*4/Number(meter[2]),totalBars=Math.ceil(p.duration/barDuration),stepDuration=barDuration/steps;
    assert(Number.isInteger(bar)&&bar>=0&&bar<totalBars,'Choose a source bar inside this pattern.');
    const start=bar*barDuration,cells=Array.from({length:steps},(_,index)=>{
      const at=Number((start+index*stepDuration).toFixed(6)),notes=p.notes.filter(n=>!n.drumStep&&n.pitch===pitch&&Math.abs(n.start-at)<=.000001),ids=new Set(notes.map(n=>n.id)),hits=p.notes.filter(n=>ids.has(n.id)||ids.has(n.drumStep?.anchorId)),styles=notes.map(n=>hits.find(hit=>hit.drumStep?.anchorId===n.id)?.drumStep.articulation||'single');
      return {index,start:at,available:at+.005<=p.duration+.000001,noteIds:[...ids],hitIds:hits.map(n=>n.id),enabled:notes.length>0,velocity:hits.length?Math.max(...hits.map(n=>n.velocity)):0,articulation:styles.every(style=>style===styles[0])?(styles[0]||'single'):'mixed',hits:Math.max(1,...notes.map(n=>1+hits.filter(hit=>hit.drumStep?.anchorId===n.id).length))};
    });
    return {steps,bar,pitch,timeSignature:p.timeSignature||'4/4',barDuration,stepDuration,totalBars,start,end:Math.min(p.duration,start+barDuration),cells};
  }
  function editPattern(source,edit){
    const p=validatePattern(source);assert(edit&&typeof edit.operation==='string','Choose a native note operation.');
    if(edit.operation==='lock'){assert(typeof edit.value==='boolean','Lock must be true or false.');p.locked=edit.value;return p;}
    assert(!p.locked,'Unlock this composition pattern before changing notes.');
    if(edit.operation==='instrument'){assert(INSTRUMENTS.includes(edit.instrument),'Unknown native instrument.');p.instrument=edit.instrument;}
    else if(edit.operation==='add'){p.notes.push(clone(edit.note));}
    else if(edit.operation==='update'){const note=p.notes.find(n=>n.id===edit.id);assert(note,'Choose an existing note.');assert(edit.changes&&Object.keys(edit.changes).every(k=>['start','duration','pitch','velocity'].includes(k)),'Unsupported note property.');detachDrumStep(p,note);Object.assign(note,edit.changes);}
    else if(edit.operation==='delete'){const note=p.notes.find(n=>n.id===edit.id);assert(note,'Choose an existing note.');detachDrumStep(p,note);p.notes=p.notes.filter(n=>n.id!==edit.id);}
    else if(edit.operation==='transpose'){assert(Number.isInteger(edit.semitones)&&Math.abs(edit.semitones)<=24,'Transpose within two octaves.');for(const note of p.notes)note.pitch+=edit.semitones;}
    else if(edit.operation==='quantize'){assert([.125,.25,.5,1].includes(edit.beats),'Choose a 1/32, 1/16, 1/8 or quarter-note grid.');const step=60/p.bpm*edit.beats;for(const note of p.notes){delete note.drumStep;note.start=Math.min(p.duration-.005,Math.max(0,Math.round(note.start/step)*step));note.duration=Math.min(note.duration,p.duration-note.start);}}
    else if(edit.operation==='step'){
      assert(Object.keys(edit).every(key=>['operation','steps','bar','pitch','index','enabled','velocity','articulation','hits'].includes(key)),'Unsupported drum step property.');
      const grid=drumGrid(p,edit);assert(Number.isInteger(edit.index)&&edit.index>=0&&edit.index<grid.steps,'Choose an existing drum step.');
      assert(typeof edit.enabled==='boolean','Choose whether this drum step is enabled.');
      const cell=grid.cells[edit.index],velocity=edit.velocity??.75;assert(cell.available,'This drum step lies outside the source pattern.');
      assert(finite(velocity)&&velocity>0&&velocity<=1,'Drum step velocity must be greater than 0 and at most 1.');
      const style=edit.articulation;assert(style===undefined||['single','flam','roll'].includes(style),'Choose a single hit, flam or roll.');
      assert(edit.hits===undefined||style!==undefined,'Choose an articulation before setting its hit count.');
      const hits=edit.hits??(style==='flam'?2:style==='roll'?4:1);assert(Number.isInteger(hits)&&(style==='roll'?[2,3,4,6,8].includes(hits):hits===(style==='flam'?2:1)),'Use 2 hits for a flam or 2, 3, 4, 6 or 8 hits for a roll.');
      const matches=new Set(cell.noteIds),owned=new Set(cell.hitIds);
      if(!edit.enabled)p.notes=p.notes.filter(n=>!owned.has(n.id));
      else{
        if(!matches.size){let noteId='step-'+grid.bar+'-'+grid.steps+'-'+grid.pitch+'-'+edit.index;while(p.notes.some(n=>n.id===noteId))noteId+='x';assert(noteId.length<=100,'The drum step needs an available note ID.');matches.add(noteId);p.notes.push({id:noteId,start:cell.start,duration:Math.max(.005,Math.min(grid.stepDuration*.8,p.duration-cell.start)),pitch:grid.pitch,velocity});}
        if(style!==undefined)p.notes=p.notes.filter(n=>!matches.has(n.drumStep?.anchorId));
        const anchors=p.notes.filter(n=>matches.has(n.id));
        for(const anchor of anchors){
          if(style!==undefined&&style!=='single'){
            const interval=style==='flam'?Math.min(.03,grid.stepDuration*.25):grid.stepDuration/hits;
            for(let hit=1;hit<hits;hit++){
              const at=Number((anchor.start+interval*hit).toFixed(6));assert(at+.005<=Math.min(p.duration,grid.start+grid.barDuration)+.000001,'This source step has too little room for the requested articulation.');
              let noteId='step-hit-'+hash(anchor.id+':'+style+':'+hit).toString(16);while(p.notes.some(n=>n.id===noteId))noteId+='x';assert(noteId.length<=100,'The drum articulation needs an available note ID.');
              p.notes.push({id:noteId,start:at,duration:Math.max(.005,Math.min(anchor.duration,style==='roll'?interval*.8:anchor.duration,p.duration-at)),pitch:anchor.pitch,velocity,drumStep:{anchorId:anchor.id,articulation:style}});
            }
          }
          const children=p.notes.filter(n=>n.drumStep?.anchorId===anchor.id),flam=children[0]?.drumStep.articulation==='flam';anchor.velocity=flam?Number((velocity*.65).toFixed(6)):velocity;for(const child of children)child.velocity=velocity;
        }
      }
    }
    else throw new Error('Unsupported native note operation.');
    p.revision=(p.revision||1)+1;return validatePattern(p);
  }
  // Editing an individual source note makes its group independent; subsequent
  // step changes must never remove notes the user has edited separately.
  function detachDrumStep(pattern,note){const anchorId=note.drumStep?.anchorId||note.id;for(const hit of pattern.notes)if(hit.drumStep?.anchorId===anchorId)delete hit.drumStep;}
  function renderWav(source,{sampleRate=48000}={}){
    const p=validatePattern(source);assert([22050,44100,48000].includes(sampleRate),'Unsupported synthesis sample rate.');
    const length=Math.round(p.duration*sampleRate),samples=new Float32Array(length),tau=Math.PI*2;
    for(const note of p.notes){
      const from=Math.round(note.start*sampleRate),count=Math.min(length-from,Math.round(note.duration*sampleRate)),frequency=440*2**((note.pitch-69)/12),rng=random(p.seed+':'+note.id),attack=p.instrument==='pad'?.08:.003,release=Math.min(p.instrument==='pad'?.18:.055,note.duration*.4);
      for(let i=0;i<count;i++){
        const t=i/sampleRate,end=(count-i)/sampleRate,envelope=Math.min(1,t/attack,end/release),phase=tau*frequency*t;let wave;
        if(p.instrument==='kick')wave=Math.sin(tau*(47*t+90*.024*(1-Math.exp(-t/.024))))*Math.exp(-t*17);
        else if(p.instrument==='snare')wave=((rng()*2-1)*.8+Math.sin(tau*180*t)*.2)*Math.exp(-t*25);
        else if(p.instrument==='hat')wave=(rng()*2-1)*Math.exp(-t*65)*.45;
        else if(p.instrument==='bass')wave=(Math.sin(phase)+Math.sin(phase*2)*.18)*Math.exp(-t*1.8);
        else if(p.instrument==='piano')wave=(Math.sin(phase)+Math.sin(phase*2)*.35+Math.sin(phase*3)*.12)*Math.exp(-t*2.8);
        else if(p.instrument==='pluck')wave=(Math.sin(phase)+Math.sin(phase*2)*.25)*Math.exp(-t*7);
        else wave=(Math.sin(phase)+Math.sin(phase*1.003)*.3+Math.sin(phase*2)*.15)*.7;
        samples[from+i]+=wave*envelope*note.velocity*.38;
      }
    }
    const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes),ascii=(at,s)=>{for(let n=0;n<s.length;n++)view.setUint8(at+n,s.charCodeAt(n));};
    ascii(0,'RIFF');view.setUint32(4,36+length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,length*2,true);
    const peaks=Array(480).fill(0),step=Math.max(1,Math.ceil(length/peaks.length));let peak=0,sum=0;
    for(let i=0;i<length;i++){const tail=Math.min(1,(length-1-i)/(sampleRate*.025)),value=Math.tanh(samples[i])*tail;peak=Math.max(peak,Math.abs(value));sum+=value*value;peaks[Math.min(peaks.length-1,Math.floor(i/step))]=Math.max(peaks[Math.min(peaks.length-1,Math.floor(i/step))],Math.abs(value));view.setInt16(44+i*2,Math.round(value*32767),true);}
    return {bytes,duration:length/sampleRate,sampleRate,channels:1,frames:length,peaks,peak,rms:Math.sqrt(sum/length)};
  }
  function vlq(number){const output=[number&127];while(number>>=7)output.unshift((number&127)|128);return output;}
  function parseMidi(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);assert(bytes.byteLength>=14&&bytes.byteLength<=2_000_000,'Import a MIDI file between14 bytes and2 MB.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),label=at=>String.fromCharCode(...bytes.subarray(at,at+4));
    assert(label(0)==='MThd','This is not a Standard MIDI File.');const header=view.getUint32(4);assert(header>=6&&header<=1024&&8+header<=bytes.length,'Invalid MIDI header.');
    const format=view.getUint16(8),trackCount=view.getUint16(10),ppq=view.getUint16(12);assert([0,1].includes(format),'Only MIDI format0 and1 are supported.');assert(trackCount>=1&&trackCount<=64&&(format!==0||trackCount===1),'Import at most64 MIDI tracks.');assert(ppq>0&&!(ppq&0x8000),'SMPTE MIDI timing is not supported; export with musical PPQ timing.');
    const tempos=[{tick:0,microseconds:500000,ordinal:-1}],signatures=[],raw=[],warnings=new Set();let offset=8+header,totalEvents=0,lastTick=0,ordinal=0,startedNotes=0;
    for(let track=0;track<trackCount;track++){
      assert(offset+8<=bytes.length&&label(offset)==='MTrk','Missing or truncated MIDI track.');const size=view.getUint32(offset+4),end=offset+8+size;offset+=8;assert(end<=bytes.length,'Truncated MIDI track data.');
      let at=offset,tick=0,running=null,name='Track '+(track+1),finished=false;const programs=Array(16).fill(0),active=new Map(),notes=[];
      const byte=()=>{assert(at<end,'Truncated MIDI event.');return bytes[at++];},variable=()=>{let value=0;for(let i=0;i<4;i++){const b=byte();value=value*128+(b&127);if(!(b&128))return value;}throw Error('Invalid MIDI variable-length quantity.');},data=()=>{const b=byte();assert(b<128,'Invalid MIDI event data byte.');return b;};
      while(at<end&&!finished){
        assert(++totalEvents<=120000,'MIDI event count exceeds the safe import limit.');tick+=variable();assert(Number.isSafeInteger(tick)&&tick<=100_000_000,'MIDI timeline exceeds the safe import range.');lastTick=Math.max(lastTick,tick);let status=byte();if(status<128){assert(running!==null,'MIDI running status has no preceding channel event.');at--;status=running;}else if(status<240)running=status;else running=null;
        if(status===255){const type=byte(),length=variable();assert(at+length<=end,'Truncated MIDI metadata.');const value=bytes.subarray(at,at+length);at+=length;
          if(type===47){assert(length===0,'Invalid MIDI end-of-track event.');finished=true;}
          else if(type===81){assert(length===3&&tempos.length<1000,'Invalid or excessive MIDI tempo events.');const microseconds=value[0]*65536+value[1]*256+value[2];assert(microseconds>0,'MIDI tempo must be positive.');tempos.push({tick,microseconds,ordinal:ordinal++});}
          else if(type===88){assert(length===4&&value[0]>0&&value[1]<=6&&signatures.length<1000,'Invalid MIDI time signature.');signatures.push({tick,numerator:value[0],denominator:2**value[1]});}
          else if(type===3)name=new TextDecoder().decode(value).replace(/[\x00-\x1f]/g,' ').trim().slice(0,80)||name;
          else if(type===5)warnings.add('Lyrics remain in the MIDI source; native import creates instrument notes, not singing.');
          continue;
        }
        if(status===240||status===247){const length=variable();assert(at+length<=end,'Truncated MIDI SysEx event.');at+=length;warnings.add('SysEx and external instrument settings are not applied.');continue;}
        assert(status>=128&&status<=239,'Unsupported MIDI system event.');const kind=status>>4,channel=status&15,a=data(),b=kind===12||kind===13?0:data();
        if(kind===12){programs[channel]=a;continue;}
        if(kind===9&&b>0){assert(++startedNotes<=30000,'Import at most30,000 MIDI notes.');const key=channel+':'+a,queue=active.get(key)||[];queue.push({tick,pitch:a,velocity:b/127,program:programs[channel],channel,track,name});active.set(key,queue);}
        else if(kind===8||kind===9){const key=channel+':'+a,queue=active.get(key);assert(queue?.length,'MIDI note-off has no matching note-on.');const note=queue.shift();if(!queue.length)active.delete(key);assert(tick>note.tick,'Zero-length MIDI notes are not supported.');notes.push({...note,endTick:tick});}
        else warnings.add('Controllers, sustain, pressure and pitch bend are not applied; source notes and timing are retained.');
      }
      assert(finished&&at===end,'MIDI track is missing its end marker or contains trailing events.');assert(active.size===0,'MIDI contains held notes without note-off events. Close the notes before importing.');for(const note of notes)raw.push({...note,name});offset=end;
    }
    assert(offset===bytes.length,'Unexpected data follows the MIDI tracks.');assert(raw.length>0&&raw.length<=30000,'The MIDI file contains no supported notes or too many notes.');
    tempos.sort((a,b)=>a.tick-b.tick||a.ordinal-b.ordinal);const map=[];for(const t of tempos){if(map.at(-1)?.tick===t.tick)map[map.length-1]=t;else map.push(t);}let elapsed=0;for(let i=0;i<map.length;i++){if(i)elapsed+=(map[i].tick-map[i-1].tick)*map[i-1].microseconds/ppq/1e6;map[i].seconds=elapsed;}
    const seconds=tick=>{let low=0,high=map.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(map[mid].tick<=tick)low=mid;else high=mid-1;}const t=map[low];return t.seconds+(tick-t.tick)*t.microseconds/ppq/1e6;},duration=seconds(lastTick),bpm=60_000_000/map[0].microseconds;
    assert(duration>=.05&&duration<=600,'Native MIDI import supports source timelines up to600 seconds.');assert(bpm>=40&&bpm<=200,'The initial MIDI tempo must be40-200 BPM; it is never silently clamped.');
    const groups=new Map();for(const note of raw){const instrument=note.channel===9?([35,36].includes(note.pitch)?'kick':[38,40].includes(note.pitch)?'snare':'hat'):note.program>=32&&note.program<=39?'bass':note.program>=88&&note.program<=95?'pad':note.program>=24&&note.program<=31?'pluck':'piano';
      const group=note.track+':'+note.channel+':'+note.program+':'+instrument;if(!groups.has(group))groups.set(group,{instrument,name:note.name,channel:note.channel,program:note.program,track:note.track,notes:[]});const start=seconds(note.tick),length=seconds(note.endTick)-start;assert(length>=.005,'Notes shorter than5 ms are not supported by native instruments.');groups.get(group).notes.push({id:'midi-note-'+groups.get(group).notes.length,start,duration:length,pitch:note.pitch,velocity:note.velocity});}
    assert(groups.size<=32,'MIDI import supports up to32 native instrument layers.');let fingerprint=2166136261;for(const b of bytes){fingerprint^=b;fingerprint=Math.imul(fingerprint,16777619);}const songId='midi-'+(fingerprint>>>0).toString(16),firstSignature=signatures.find(s=>s.tick===0),timeSignature=firstSignature?firstSignature.numerator+'/'+firstSignature.denominator:'4/4';
    warnings.add('GM programs use Zorifi synthetic instrument approximations; external sound libraries are not imported.');if(map.length>1)warnings.add('Tempo changes are preserved in note times; native quantization uses the initial tempo.');if(signatures.length>1||!['4/4','3/4','6/8'].includes(timeSignature))warnings.add('Source meters are retained in metadata; native composition controls support4/4,3/4 and6/8.');
    const patterns=[...groups.values()].map(g=>validatePattern({schema:SCHEMA,instrument:g.instrument,duration,bpm,key:'C',scaleMode:'minor',timeSignature,seed:songId+':'+g.track+':'+g.channel,locked:false,revision:1,midiSource:{track:g.track,name:g.name,channel:g.channel,program:g.program},notes:g.notes}));
    return{schema:BLUEPRINT,id:songId,title:'Imported MIDI arrangement',duration,bpm,key:'C',scaleMode:'minor',timeSignature,seed:songId,sections:[],patterns,warnings:[...warnings],midi:{format,ppq,trackCount,tempoMap:map.map(t=>({tick:t.tick,microseconds:t.microseconds,seconds:t.seconds})),timeSignatures:signatures},provenance:{engine:'zorifi-native-procedural-v1',originalSynthesis:true,cloudModel:false,importedMidi:true,rights:'User-selected MIDI; composition rights are not independently verified.'}};
  }
  function midiFile(sources){
    const patterns=sources.map(p=>validatePattern(p,{maxDuration:86400}));assert(patterns.length>0&&patterns.length<=32,'Export 1–32 native patterns.');
    assert(patterns.every(p=>p.bpm===patterns[0].bpm),'This MIDI export requires one shared tempo.');
    const tempo=Math.round(60000000/patterns[0].bpm),chunks=[],pushChunk=(name,bytes)=>{chunks.push(...[...name].map(c=>c.charCodeAt(0)),(bytes.length>>>24)&255,(bytes.length>>>16)&255,(bytes.length>>>8)&255,bytes.length&255);for(const byte of bytes)chunks.push(byte);};
    pushChunk('MThd',[0,1,0,patterns.length,1,224]);
    for(let index=0;index<patterns.length;index++){
      const p=patterns[index],drum=['kick','snare','hat'].includes(p.instrument),channel=drum?9:index%9,program={bass:33,piano:0,pluck:24,pad:89}[p.instrument]||0,ticks=seconds=>Math.round(seconds*p.bpm/60*480);
      const events=[];for(const n of p.notes){if(n.velocity===0)continue;events.push({at:ticks(n.start),off:false,bytes:[0x90|channel,n.pitch,Math.max(1,Math.round(n.velocity*127))]},{at:ticks(n.start+n.duration),off:true,bytes:[0x80|channel,n.pitch,0]});}
      events.sort((a,b)=>a.at-b.at||Number(b.off)-Number(a.off));const data=[0,255,81,3,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255,0,0xC0|channel,program];let previous=0;
      for(const event of events){data.push(...vlq(event.at-previous),...event.bytes);previous=event.at;}data.push(...vlq(Math.max(0,ticks(p.duration)-previous)),255,47,0);pushChunk('MTrk',data);
    }
    return new Uint8Array(chunks);
  }
  function blueprintFromProject(project){
    const clips=(project.clips||[]).filter(c=>c.musicPattern?.schema===SCHEMA),metadata=project.creatorSettings?.nativeSong||{};
    // References and a portable snapshot derived from the real timeline; never a second mutable store.
    return {schema:BLUEPRINT,...clone(metadata),tracks:clips.map(c=>({clipId:c.id,assetId:c.mediaId,track:c.track,start:c.start,duration:c.duration,sourceStart:c.sourceStart||0,pattern:validatePattern(c.musicPattern)}))};
  }
  return {SCHEMA,BLUEPRINT,INSTRUMENTS,NOTES,SCALES,compose,validatePattern,drumGrid,editPattern,renderWav,parseMidi,midiFile,blueprintFromProject};
});
