(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.ZorifiColorScopes=api;root.ZorifiColorScopesEngine=api.ZorifiColorScopesEngine;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function analyzePixels(image,{sampleStep=4}={}){
    const {width,height,data}=image||{};
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144||!data||data.length!==width*height*4||!Number.isInteger(sampleStep)||sampleStep<1)throw new Error('Invalid or oversized scope image.');
    const grid=Array.from({length:width},()=>new Uint32Array(256)),rgb=Object.fromEntries(['r','g','b'].map(channel=>[channel,Array.from({length:width},()=>new Uint32Array(256))])),points=[];
    for(let pixel=0;pixel<width*height;pixel++){
      const i=pixel*4,alpha=data[i+3]/255;if(!alpha)continue;
      const r=Math.round(data[i]*alpha),g=Math.round(data[i+1]*alpha),b=Math.round(data[i+2]*alpha),x=pixel%width;
      // Rec.709 matrix applied to encoded browser RGB: an SDR luma estimate.
      const y=.2126*r+.7152*g+.0722*b;grid[x][Math.round(y)]++;rgb.r[x][r]++;rgb.g[x][g]++;rgb.b[x][b]++;
      if(pixel%sampleStep===0){const cb=(b-y)/1.8556,cr=(r-y)/1.5748;points.push({x:cb,y:cr,saturation:Math.hypot(cb,cr)});}
    }
    return {waveform:{type:'waveform',resolution:{width,height},grid,rgb},vectorscope:{type:'vectorscope',points}};
  }
  class ZorifiColorScopesEngine{
    constructor(canvasElement,{ownsCanvas=false}={}){this.canvas=canvasElement;this.ctx=canvasElement?.getContext('2d',{willReadFrequently:true});this.ownsCanvas=ownsCanvas;this.disposed=false;}
    analyzeFrame(frame,{filter='none'}={}){
      if(this.disposed||!this.ctx||!frame)return null;
      if(filter!=='none'&&typeof this.ctx.filter!=='string')throw new Error('This browser cannot apply color filters to scope analysis.');
      const {width,height}=this.canvas;if(!width||!height||width*height>262144)throw new Error('Use a scope analysis canvas of at most 262144 pixels.');
      this.ctx.save();try{this.ctx.setTransform(1,0,0,1,0,0);this.ctx.globalAlpha=1;this.ctx.globalCompositeOperation='source-over';this.ctx.filter='none';this.ctx.fillStyle='#000';this.ctx.fillRect(0,0,width,height);this.ctx.filter=filter;this.ctx.drawImage(frame,0,0,width,height);}
      finally{this.ctx.restore();}
      try{return analyzePixels(this.ctx.getImageData(0,0,width,height));}catch(error){if(error.name==='SecurityError')throw new Error('Scopes cannot read this remote media. Import a local copy or use a source with CORS permission.');throw error;}
    }
    computeWaveformData(frame){return this.analyzeFrame(frame)?.waveform||null;}
    computeVectorscopeData(frame){return this.analyzeFrame(frame)?.vectorscope||null;}
    dispose(){if(this.disposed)return;this.disposed=true;if(this.ownsCanvas&&this.canvas){this.canvas.width=0;this.canvas.height=0;}this.canvas=null;this.ctx=null;}
  }
  function drawWaveform(canvas,waveform,mode='luma'){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#090d15';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#293444';for(const level of [0,64,128,192,255]){const y=h-1-level/255*(h-1);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const channels=mode==='rgb'?['r','g','b']:['luma'],colors={r:'255,83,101',g:'86,229,157',b:'93,169,255',luma:'190,235,223'};
    channels.forEach((channel,index)=>{const grids=channel==='luma'?waveform.grid:waveform.rgb[channel],section=w/channels.length;
      grids.forEach((bins,x)=>{for(let level=0;level<256;level++)if(bins[level]){ctx.fillStyle=`rgba(${colors[channel]},${Math.min(1,.2+Math.log1p(bins[level])/4)})`;ctx.fillRect(index*section+x/grids.length*section,h-1-level/255*(h-1),Math.max(1,section/grids.length),1);}});
    });
  }
  function drawVectorscope(canvas,vectorscope){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,scale=Math.min(w,h)/300;
    ctx.fillStyle='#090d15';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#344252';ctx.beginPath();ctx.arc(cx,cy,127.5*scale,0,Math.PI*2);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();
    ctx.fillStyle='rgba(105,235,206,.18)';for(const point of vectorscope.points)ctx.fillRect(cx+point.x*scale,cy-point.y*scale,1.5,1.5);
  }
  return {ZorifiColorScopesEngine,analyzePixels,drawWaveform,drawVectorscope};
});
