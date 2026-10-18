(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiMusicCatalogue=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const YEAR=2026,UPDATED='2026-10-18';
  // Metadata and official listening destinations only. Audio from these songs
  // is neither bundled nor fetched into the editor. Importing an authorized
  // local file is a separate action from discovering a release.
  const TRENDING=Object.freeze([
  {
    "id": "jamie-miller-babydoll",
    "title": "Babydoll",
    "artist": "Jamie Miller",
    "released": "2026-08-07",
    "listenUrl": "https://www.officialcharts.com/songs/jamie-miller-babydoll/",
    "releaseSource": "https://www.officialcharts.com/songs/jamie-miller-babydoll/",
    "trendSource": "https://www.officialcharts.com/charts/singles-chart/20261016/7501/",
    "trendNote": "UK chart #2 · week of 16 October 2026"
  },
  {
    "id": "sienna-spiro-great-expectation",
    "title": "Great Expectation",
    "artist": "Sienna Spiro",
    "released": "2026-07-03",
    "listenUrl": "https://www.officialcharts.com/songs/sienna-spiro-great-expectation/",
    "releaseSource": "https://www.officialcharts.com/songs/sienna-spiro-great-expectation/",
    "trendSource": "https://www.officialcharts.com/charts/singles-chart/20261016/7501/",
    "trendNote": "UK chart #4 · week of 16 October 2026"
  }
]);
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function validUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
  function validateTrack(track){
    if(!track||typeof track.id!=='string'||!/^[-a-z0-9]{2,80}$/.test(track.id)||typeof track.title!=='string'||!track.title.trim()||track.title.length>160||typeof track.artist!=='string'||!track.artist.trim()||track.artist.length>160||!/^2026-\d{2}-\d{2}$/.test(track.released)||!Number.isFinite(Date.parse(track.released))||!validUrl(track.listenUrl)||!validUrl(track.releaseSource)||!validUrl(track.trendSource)||typeof track.trendNote!=='string'||track.trendNote.length>240)throw new Error('A music inspiration entry needs a verified 2026 release and official listening/source links.');
    return {id:track.id,title:track.title.trim(),artist:track.artist.trim(),released:track.released,listenUrl:track.listenUrl,releaseSource:track.releaseSource,trendSource:track.trendSource,trendNote:track.trendNote};
  }
  function search(query='',tracks=TRENDING){const term=String(query).trim().toLowerCase();return tracks.map(validateTrack).filter(track=>!term||`${track.title} ${track.artist}`.toLowerCase().includes(term));}
  function markup({query='',autoCut=false,compact=false}={}){
    const tracks=search(query),attribute=autoCut?'data-autocut-trending-import':'data-trending-audio-import';
    return `<section class="music-inspiration ${compact?'compact':''}" aria-label="2026 music inspiration"><header><small>RELEASE RADAR · ${YEAR}</small><h3>Trending inspiration</h3><p>Discover current releases, then use an audio file you have permission to edit. Official listening links open separately.</p></header><div class="music-inspiration-list">${tracks.map(track=>`<article class="music-inspiration-card"><div class="music-inspiration-cover" aria-hidden="true">♫</div><div class="music-inspiration-copy"><b>${escape(track.title)}</b><span>${escape(track.artist)}</span><small>Released ${escape(track.released)} · <a href="${escape(track.trendSource)}" target="_blank" rel="noopener noreferrer">${escape(track.trendNote)}</a></small></div><div class="music-inspiration-actions"><a href="${escape(track.listenUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Listen to ${escape(track.title)} on the official page">Official listen ↗</a><button type="button" ${attribute}="${escape(track.id)}">Import your audio</button></div></article>`).join('')||'<p>Release radar is being refreshed. Original Zorifi scores and your imported music remain ready to use.</p>'}</div><footer>Research updated ${UPDATED}. Chart placement changes; these are sourced discoveries, with no bundled song audio. <span>Original Zorifi scores can be used in your edits immediately.</span></footer></section>`;
  }
  function pcmWaveform(bytes,{bins=480}={}){
    if(!(bytes instanceof Uint8Array)||bytes.byteLength<44||bytes.byteLength>16*1024*1024||!Number.isInteger(bins)||bins<8||bins>2048)throw new Error('Original-score waveform input is outside its bounded budget.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=at=>String.fromCharCode(...bytes.subarray(at,at+4));if(text(0)!=='RIFF'||text(8)!=='WAVE')throw new Error('The original score is not PCM WAV.');
    let format=null,data=null;for(let at=12;at+8<=bytes.length;){const size=view.getUint32(at+4,true),offset=at+8;if(offset+size>bytes.length)throw new Error('The original score WAV is incomplete.');if(text(at)==='fmt '&&size>=16)format={encoding:view.getUint16(offset,true),channels:view.getUint16(offset+2,true),sampleRate:view.getUint32(offset+4,true),bits:view.getUint16(offset+14,true)};if(text(at)==='data')data={offset,size};at=offset+size+(size%2);}
    if(!format||!data||format.encoding!==1||format.bits!==16||![1,2].includes(format.channels)||format.sampleRate<8000||format.sampleRate>96000)throw new Error('The original score waveform needs mono or stereo 16-bit PCM.');
    const frames=Math.floor(data.size/(format.channels*2)),duration=frames/format.sampleRate,peaks=Array(Math.min(bins,frames)).fill(0);if(!frames||duration>180.01)throw new Error('The original score duration is outside the waveform budget.');
    for(let frame=0;frame<frames;frame++){const bucket=Math.min(peaks.length-1,Math.floor(frame/frames*peaks.length));for(let channel=0;channel<format.channels;channel++)peaks[bucket]=Math.max(peaks[bucket],Math.abs(view.getInt16(data.offset+(frame*format.channels+channel)*2,true)/32768));}
    return {duration,sampleRate:format.sampleRate,peaks,method:'measured-pcm-peaks'};
  }
  async function inspectLocalAudio(file,{signal,createUrl=value=>root.URL.createObjectURL(value),revokeUrl=value=>root.URL.revokeObjectURL(value)}={}){
    if(!(file instanceof root.Blob)||!file.size)throw new Error('Choose a readable audio file.');
    if(signal?.aborted)throw new DOMException('Audio selection cancelled','AbortError');
    const url=createUrl(file),audio=root.document.createElement('audio');let completed=false;
    try{
      audio.preload='metadata';audio.src=url;
      await new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',ready);audio.removeEventListener('error',failed);signal?.removeEventListener('abort',aborted);},done=(fn,value)=>{cleanup();fn(value);},ready=()=>done(resolve),failed=()=>done(reject,new Error('This device cannot play the chosen audio format. Try WAV, MP3 or M4A.')),aborted=()=>done(reject,new DOMException('Audio selection cancelled','AbortError'));audio.addEventListener('loadedmetadata',ready,{once:true});audio.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',aborted,{once:true});timer=setTimeout(()=>done(reject,new Error('The audio metadata took too long to open. Try a different audio file.')),Math.min(120000,45000+Math.ceil(file.size/1048576)*100));if(audio.readyState>=1)ready();});
      if(signal?.aborted)throw new DOMException('Audio selection cancelled','AbortError');
      if(!Number.isFinite(audio.duration)||audio.duration<=0)throw new Error('The audio file has no readable finite duration.');
      completed=true;return {id:`autocut-imported-audio-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,name:String(file.name||'Imported soundtrack'),type:'audio',kind:'audio',file,url,duration:audio.duration,size:file.size,mimeType:file.type,localFile:true};
    }finally{audio.pause();audio.removeAttribute('src');audio.load();if(!completed)revokeUrl(url);}
  }
  return {YEAR,UPDATED,TRENDING,validateTrack,search,markup,pcmWaveform,inspectLocalAudio};
});
