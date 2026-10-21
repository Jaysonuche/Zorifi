/* Renders the original, silent Zorifi interface illustration to a local MP4.
   Run only when the illustrated workflow changes. No private projects are used. */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const output=path.join(__dirname,'..','assets','tutorial','zorifi-tour.mp4');
const bundledFfmpeg=path.join(__dirname,'..','artifacts','analysis-python','imageio_ffmpeg','binaries','ffmpeg-win-x86_64-v7.1.exe');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:edge});
  try{
    const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
    await page.setContent('<!doctype html><html><body style="margin:0;background:#080b19"><canvas id="film" width="960" height="540"></canvas></body></html>');
    const result=await page.evaluate(async()=>{
      const canvas=document.getElementById('film'),ctx=canvas.getContext('2d',{alpha:false}),W=960,H=540;
      const round=(x,y,w,h,r,fill,stroke)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}};
      const text=(value,x,y,size=18,color='#fff',weight=600,align='left')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial,sans-serif`;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.textAlign='left';};
      const line=(x,y,X,Y,color='#8a69c6',width=1)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
      const grad=(x,y,w,h,a,b)=>{const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;};
      const glow=(x,y,r,color)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);};
      const star=(x,y,r=4,color='#dda5ff')=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r*1.8);ctx.quadraticCurveTo(x+r*.25,y-r*.25,x+r*1.6,y);ctx.quadraticCurveTo(x+r*.25,y+r*.25,x,y+r*1.8);ctx.quadraticCurveTo(x-r*.25,y+r*.25,x-r*1.6,y);ctx.quadraticCurveTo(x-r*.25,y-r*.25,x,y-r*1.8);ctx.fill();};
      const titles=[
        ['YOUR CREATIVE SPACE','Choose a project. Begin anywhere.'],
        ['BRING YOUR STORY IN','Import media, then build on the timeline.'],
        ['SHAPE EVERY MOMENT','Trim, layer, add titles and effects.'],
        ['MAKE IT SOUND RIGHT','Arrange stems and cut to the beat.'],
        ['CREATE WITH VANESSA','Ask for ideas and supported creative help.'],
        ['KEEP IT YOURS','Local projects. Sharing is always your choice.']
      ];
      const drawBackdrop=(t)=>{
        ctx.fillStyle=grad(0,0,W,H,'#15102b','#080d1e');ctx.fillRect(0,0,W,H);
        glow(160+Math.sin(t*.28)*100,190,360,'#7c3d9338');glow(800-Math.sin(t*.24)*120,330,360,'#a2487433');
        for(let x=0;x<W;x+=48)line(x+Math.sin(t*.3)*8,0,x,H,'#bca4ff0c');
        for(let y=0;y<H;y+=48)line(0,y,W,y,'#bca4ff0c');
        for(let i=0;i<32;i++){const x=(i*149+31)%W,y=(i*71+13)%H;ctx.fillStyle=`rgba(228,192,255,${.12+.13*Math.sin(t*1.5+i)})`;ctx.fillRect(x,y,2,2);}
      };
      const drawFrame=(t)=>{
        const scene=Math.min(5,Math.floor(t/4)),p=(t%4)/4,bob=Math.sin(t*2.5)*3;
        drawBackdrop(t);
        round(26,29,908,481,24,'#0c0e1ef0','#8761bb');
        round(26,29,908,48,[24,24,0,0],'#17172d');
        round(43,42,25,25,7,grad(43,42,25,25,'#8c55ff','#ed58a4'));
        text('Z',49,61,17,'#0e0821',900);text('ZORIFI',79,60,15,'#fff',850);text('CREATE IN MOTION',168,59,9,'#bfa8de',700);
        round(809,43,103,21,11,'#2a2143','#7956b7');text('TOUR  /  06',828,57,10,'#eedcff',800);
        const headings=titles[scene];
        text(`${String(scene+1).padStart(2,'0')}  /  06`,48,103,11,'#ba91ff',800);
        text(headings[0],48,139,30,'#fff',850);text(headings[1],49,161,13,'#ccbde2',500);
        const x=47,y=185,w=866,h=271;
        round(x,y,w,h,16,'#090d1a','#5b4c87');
        if(scene===0){
          round(48,186,164,269,[15,0,0,15],'#16172d');
          round(64,202,132,32,9,'#3a2b63');text('⌂   Home',77,223,13,'#f7eeff',750);
          [['▣','Projects'],['♫','Music'],['✦','Vanessa'],['◇','Social']].forEach(([icon,label],i)=>{const yy=263+i*43;round(64,yy-18,132,31,8,i===0?'#6141a0':'#1a1b31');text(`${icon}   ${label}`,77,yy+2,13,i===0?'#fff':'#c3b8da',700)});
          round(231,202,659,99,17,grad(231,202,659,99,'#592faa','#aa4d95'));
          glow(749,253,82,'#ffaf9e7d');star(766,250+bob,27,'#f4b8e9');
          text('Your moments. A story worth watching.',253,242,21,'#fff',850);
          text('Choose your media. Vanessa directs the edit.',253,268,12,'#ecd7ff',550);
          ['Summer campaign','City after dark','Your next story'].forEach((label,i)=>{
            const xx=231+i*221;round(xx,317,207,116,12,'#1b2037','#706292');round(xx+10,327,187,61,8,grad(xx,327,187,61,['#345176','#664270','#4f4290'][i],'#181a34'));glow(xx+157,349,23,'#f8bb8c');text(label,xx+12,412,12,'#f6f0ff',750);
          });
          const pulse=.5+.5*Math.sin(p*10);round(60,244,140,50,12,'#0000',`rgba(234,166,255,${pulse})`);
        }else if(scene===1||scene===2){
          round(48,186,190,269,[15,0,0,15],'#17192c');text(scene===1?'MEDIA':'TOOLS',65,213,12,'#cab5e8',850);
          if(scene===1){
            for(let i=0;i<4;i++){const xx=63+(i%2)*81,yy=228+Math.floor(i/2)*83;round(xx,yy,70,68,8,grad(xx,yy,70,68,i%2?'#714d8f':'#334d7c','#202238'));glow(xx+49,yy+24,18,'#ffba8d');text(`Clip ${i+1}`,xx+9,yy+57,9,'#fff',700);}
            round(65,401,155,30,8,'#623cb4');text('+  Import your media',75,421,11,'#fff',750);
          }else{
            [['T','Text'],['FX','Effects'],['◐','Adjust'],['♫','Audio']].forEach(([icon,label],i)=>{const yy=237+i*51;round(63,yy-21,154,42,9,i===1?'#53328c':'#282742');text(icon,75,yy+4,13,'#dcb1ff',800);text(label,108,yy+4,12,'#f1eaff',700);});
          }
          round(253,200,637,148,12,grad(253,200,637,148,'#232342','#4e2c5f'));glow(741,267,55,'#ff9e9977');
          round(319,219,505,108,7,grad(319,219,505,108,'#243458','#704472'));round(319,292,505,35,0,'#172039');
          star(572,270+Math.sin(t*3)*4,17,'#e7aae9');
          round(252,362,639,78,10,'#161827','#59506d');
          for(let i=0;i<20;i++)line(269+i*30,367,269+i*30,435,'#80739730');
          text('00:00',264,379,9,'#a99bbd');text('00:05',414,379,9,'#a99bbd');text('00:10',564,379,9,'#a99bbd');
          round(269,389,scene===1?(p>.55?420:250):427,32,6,grad(269,389,420,32,'#804cf1','#c063bc'));
          if(scene===1){
            const drag=Math.max(0,Math.min(1,(p-.2)/.5));if(drag>0&&drag<1){const dx=135+drag*355,dy=256+drag*149;round(dx-31,dy-24,65,48,8,'#9e64ed','#f1baff');text('Clip 1',dx-20,dy+3,10,'#fff',700);}
            glow(270+drag*180,405,50,'#d282ff54');
          }else{
            const edge=675+Math.sin(p*8)*35;line(edge,385,edge,425,'#ffb8df',3);round(433,230,127,34,6,'#2a1b54','#d59fff');text('YOUR STORY',443,252,17,'#fff',850);
            round(270,423,405,9,5,'#bd64b5');for(let i=0;i<5;i++)star(289+i*84,427,3,'#ffe5f9');
          }
        }else if(scene===3){
          round(48,186,179,269,[15,0,0,15],'#17192c');text('SOUND LIBRARY',65,214,12,'#cbb3eb',850);
          ['Imported audio','Generated tracks','Sound effects','Beat markers'].forEach((label,i)=>{const yy=240+i*48;round(65,yy,145,37,8,i===0?'#473178':'#22243d');text('♫',76,264+i*48,14,'#e5b6ff',800);text(label,99,263+i*48,10,'#f3eaff',700);});
          round(243,199,645,130,12,'#191d35','#66578e');text('ARRANGEMENT  •  112 BPM',261,222,11,'#cbb0f3',800);
          for(let i=0;i<106;i++){const xx=261+i*5.7,amp=18+Math.abs(Math.sin(i*.31+t*2)*Math.sin(i*.077))*48;line(xx,272-amp/2,xx,272+amp/2,i%8===0?'#f0a4db':'#9178f0',3);}
          round(244,345,643,95,11,'#111827','#595378');
          for(let row=0;row<2;row++){round(260,357+row*36,567-row*66,27,5,row?'#36557d':'#8053c3');for(let i=0;i<70;i++){const xx=266+i*7.7;line(xx,365+row*36,xx,374+row*36,i%4===0?'#f8b6e1':'#a495db',1);}}
          const beat=269+p*520;line(beat,343,beat,441,'#ffc6ea',2);star(beat,340,5,'#ffd8f2');
          text('DETECT BEATS',726,222,10,'#eadcff',800);
        }else if(scene===4){
          round(48,186,345,269,[15,0,0,15],grad(48,186,345,269,'#291b57','#522878'));glow(220,313,166,'#cf5eb85e');
          for(let i=0;i<12;i++){const a=i*Math.PI/6+t*.3;line(220+Math.cos(a)*86,316+Math.sin(a)*86,220+Math.cos(a)*116,316+Math.sin(a)*116,'#d6a5ff7e',2);}
          ctx.beginPath();ctx.arc(220,316,53+Math.sin(t*5)*4,0,Math.PI*2);ctx.fillStyle=grad(168,265,104,104,'#8b5cff','#e74baf');ctx.fill();ctx.strokeStyle='#f6c9ff';ctx.lineWidth=2;ctx.stroke();star(220,316,30,'#fff');
          round(414,200,474,238,12,'#161827','#665183');text('Vanessa',434,230,18,'#fff',800);text('Your creative companion',434,251,11,'#bfacd9',550);
          round(438,267,425,45,10,'#3d286d');text('Help me plan a fast travel edit',452,295,14,'#fff',650);
          if(p>.34){round(438,323,408,68,10,'#25283e');text('Start with your strongest shot.',454,349,14,'#f8f0ff',650);text('Cut to the rhythm, then reveal the destination.',454,372,12,'#d3c4ed',500);}
          round(439,407,406,20,10,'#1c2033','#65588b');text('Ask Vanessa…',454,421,10,'#a99dbd',500);star(825,417,7,'#dbaeff');
        }else{
          round(48,186,409,269,[15,0,0,15],'#1a1a32');text('STUDIO',67,217,12,'#d3bafa',850);
          for(let i=0;i<3;i++){const xx=66+i*125;round(xx,239,111,140,10,grad(xx,239,111,140,['#303d63','#6e396e','#4b3580'][i],'#1d1c36'));glow(xx+69,272,22,'#ffb88b');text(['Edit','Music','Local'][i],xx+12,362,13,'#fff',800);}
          round(478,186,410,269,[0,15,15,0],'#1b1731');text('SOCIAL',498,218,12,'#ddb5ff',850);
          round(498,238,371,144,10,grad(498,238,371,144,'#7140b5','#b05b89'));star(690,308,26,'#ffcbf4');text('Share only when you choose',512,410,15,'#fff',800);
          const x=476+Math.sin(t*2)*5;line(x,245,x,400,'#ff9cdd',2);
        }
        ctx.fillStyle='#101020';ctx.fillRect(26,461,908,49);line(26,461,934,461,'#756491');
        for(let i=0;i<6;i++)round(48+i*145,479,133,7,4,i===scene?grad(48+i*145,479,133,7,'#9365ff','#ec5aa5'):'#39334c');
        text('ILLUSTRATED TOUR',48,504,8,'#9b8caf',800);text('STUDIO  /  EDIT  /  MUSIC  /  VANESSA',909,504,8,'#9b8caf',800,'right');
      };
      const mime='video/mp4;codecs=avc1.42E01E';
      if(!MediaRecorder.isTypeSupported(mime))throw new Error('This Chromium build cannot record H.264 MP4.');
      const stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1450000}),chunks=[];
      const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>reject(e.error||new Error('Recorder failed'));recorder.onstop=resolve;});
      const start=performance.now();drawFrame(0);recorder.start(1000);
      await new Promise(resolve=>{function tick(now){const t=(now-start)/1000;drawFrame(Math.min(23.99,t));if(t<24)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
      recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
      const blob=new Blob(chunks,{type:'video/mp4'}),array=new Uint8Array(await blob.arrayBuffer());
      let binary='';for(let i=0;i<array.length;i+=16384)binary+=String.fromCharCode(...array.subarray(i,i+16384));
      return {data:btoa(binary),bytes:array.length,type:blob.type};
    },{timeout:60000});
    fs.mkdirSync(path.dirname(output),{recursive:true});
    const raw=`${output}.raw.mp4`,remuxed=`${output}.faststart.mp4`;
    try{
      fs.writeFileSync(raw,Buffer.from(result.data,'base64'));
      const ffmpeg=process.env.FFMPEG_PATH||(fs.existsSync(bundledFfmpeg)?bundledFfmpeg:'ffmpeg');
      const remux=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',raw,'-c','copy','-movflags','+faststart',remuxed],{encoding:'utf8'});
      if(remux.error||remux.status!==0)throw new Error(`FFmpeg is required to make the tour seekable. Set FFMPEG_PATH to its executable. ${remux.error?.message||remux.stderr||''}`);
      fs.copyFileSync(remuxed,output);
    }finally{fs.rmSync(raw,{force:true});fs.rmSync(remuxed,{force:true});}
    console.log(`Created ${output} (${(fs.statSync(output).size/1048576).toFixed(2)} MiB, silent ${result.type}, seekable).`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
