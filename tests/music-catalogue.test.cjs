const test=require('node:test'),assert=require('node:assert/strict'),Catalogue=require('../zorifi-music-catalogue.js'),SFX=require('../zorifi-sfx.js');
const track={id:'verified-release',title:'A verified release',artist:'A credited artist',released:'2026-09-12',listenUrl:'https://artist.example/music/verified',releaseSource:'https://label.example/news/release',trendSource:'https://charts.example/chart/2026-10-16',trendNote:'Weekly chart · 16 Oct 2026'};
test('release inspiration requires verified 2026 metadata and safe external source links',()=>{
  assert.equal(Catalogue.validateTrack(track).released,'2026-09-12');assert.equal(Catalogue.search('credited',[track]).length,1);assert.equal(Catalogue.search('other',[track]).length,0);for(const change of [{released:'2025-01-01'},{listenUrl:'javascript:alert(1)'},{releaseSource:''},{trendSource:'http://charts.example'},{artist:''}])assert.throws(()=>Catalogue.validateTrack({...track,...change}));
  const html=Catalogue.markup({autoCut:true});assert(!/\<audio|\.mp3|download=/.test(html));assert.match(html,/Official listening links open separately/);assert.match(html,/no bundled song audio/);
});
test('original score timing is measured from bounded PCM samples rather than guessed from a song title',()=>{
  const bytes=SFX.wavBytes('soft-whoosh'),waveform=Catalogue.pcmWaveform(bytes);assert.equal(waveform.duration,.72);assert.equal(waveform.peaks.length,480);assert.equal(waveform.method,'measured-pcm-peaks');assert(waveform.peaks.every(value=>Number.isFinite(value)&&value>=0&&value<=1));assert(Math.max(...waveform.peaks)>.05);assert.throws(()=>Catalogue.pcmWaveform(new Uint8Array(44)));assert.throws(()=>Catalogue.pcmWaveform(bytes,{bins:10000}));
});
