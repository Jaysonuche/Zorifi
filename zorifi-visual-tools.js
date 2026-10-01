(function(global){
  'use strict';

  const DEFAULTS={
    enabled:true,
    adjustments:{brightness:0,contrast:0,saturation:100,exposure:0,temperature:0,tint:0,highlights:0,shadows:0,sharpen:0,blur:0,vignette:0},
    hsl:{hue:0,saturation:0,lightness:0},
    grading:{
      master:{color:'#ffffff',intensity:0},
      shadows:{color:'#536dff',intensity:0},
      midtones:{color:'#ffffff',intensity:0},
      highlights:{color:'#ffb45e',intensity:0}
    },
    filter:{id:'none',intensity:100,enabled:true},
    lut:null,
    sections:{adjustments:true,hsl:true,grading:true,filter:true,lut:true}
  };
  const FILTERS={
    none:{name:'None',filter:''},
    cinematic:{name:'Cinematic',filter:'contrast(1.18) saturate(.82) sepia(.08) hue-rotate(-4deg)'},
    warm:{name:'Warm',filter:'sepia(.22) saturate(1.16) hue-rotate(-5deg) brightness(1.03)'},
    cool:{name:'Cool',filter:'saturate(1.08) hue-rotate(14deg) brightness(.99)'},
    vintage:{name:'Vintage',filter:'sepia(.38) contrast(.9) saturate(.76) brightness(1.04)'},
    bw:{name:'Black & White',filter:'grayscale(1) contrast(1.08)'},
    contrast:{name:'High Contrast',filter:'contrast(1.38) saturate(1.05)'},
    fade:{name:'Fade',filter:'contrast(.78) brightness(1.1) saturate(.82)'},
    vivid:{name:'Vivid',filter:'contrast(1.15) saturate(1.55) brightness(1.03)'}
  };
  const RANGES={brightness:[-100,100],contrast:[-100,100],saturation:[0,200],exposure:[-100,100],temperature:[-100,100],tint:[-100,100],highlights:[-100,100],shadows:[-100,100],sharpen:[0,100],blur:[0,30],vignette:[0,100],hue:[-180,180],lightness:[-100,100]};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  function merge(base,value){const result=clone(base);if(!value||typeof value!=='object')return result;Object.keys(result).forEach(key=>{if(result[key]&&typeof result[key]==='object'&&!Array.isArray(result[key]))result[key]=merge(result[key],value[key]);else if(value[key]!==undefined)result[key]=value[key];});return result;}
  function normalize(input){
    const value=merge(DEFAULTS,input),a=value.adjustments,h=value.hsl;
    Object.keys(a).forEach(key=>a[key]=clamp(a[key],...(RANGES[key]||[-100,100])));
    h.hue=clamp(h.hue,-180,180);h.saturation=clamp(h.saturation,-100,100);h.lightness=clamp(h.lightness,-100,100);
    Object.values(value.grading).forEach(wheel=>{wheel.color=/^#[0-9a-f]{6}$/i.test(wheel.color)?wheel.color:'#ffffff';wheel.intensity=clamp(wheel.intensity,0,100);});
    value.filter.id=FILTERS[value.filter.id]?value.filter.id:'none';value.filter.intensity=clamp(value.filter.intensity,0,100);value.filter.enabled=value.filter.enabled!==false;
    if(value.lut){value.lut.name=String(value.lut.name||'Imported LUT');value.lut.intensity=clamp(value.lut.intensity??100,0,100);value.lut.enabled=value.lut.enabled!==false;value.lut.approximation=String(value.lut.approximation||'').slice(0,500);}
    return value;
  }
  function ensure(clip){clip.visualEffects=normalize(clip.visualEffects);return clip.visualEffects;}
  function weightedFilter(filter,intensity){
    const amount=clamp(intensity,0,100)/100;if(amount<=0||!filter)return '';
    return filter.replace(/([a-z-]+)\((-?[\d.]+)([^)]*)\)/g,(all,name,value,unit)=>{
      const number=Number(value);if(!Number.isFinite(number))return all;
      const neutral=['brightness','contrast','saturate'].includes(name)?1:0;
      return `${name}(${neutral+(number-neutral)*amount}${unit})`;
    });
  }
  function colorGradeFilter(grading){
    let hue=0,saturation=1,brightness=1;
    Object.entries(grading).forEach(([zone,wheel])=>{if(!wheel.intensity)return;const rgb=hexToRgb(wheel.color),max=Math.max(rgb.r,rgb.g,rgb.b),min=Math.min(rgb.r,rgb.g,rgb.b),delta=max-min,light=(max+min)/510,sat=delta?delta/(255*(1-Math.abs(2*light-1))):0;let angle=0;if(delta){if(max===rgb.r)angle=60*(((rgb.g-rgb.b)/delta)%6);else if(max===rgb.g)angle=60*((rgb.b-rgb.r)/delta+2);else angle=60*((rgb.r-rgb.g)/delta+4);}const weight={shadows:.55,midtones:.8,highlights:.55,master:1}[zone]||1,amount=wheel.intensity/100*weight;hue+=angle*amount*.16;saturation+=sat*amount*.32;brightness+=(light-.5)*amount*.12;});
    return `hue-rotate(${hue.toFixed(2)}deg) saturate(${Math.max(0,saturation).toFixed(3)}) brightness(${Math.max(.1,brightness).toFixed(3)})`;
  }
  function cssFilter(input,options={}){
    if(options.bypass)return 'none';const value=normalize(input);if(!value.enabled)return 'none';const a=value.adjustments,h=value.hsl,parts=[];
    if(value.sections.adjustments!==false){const brightness=1+(a.brightness+a.exposure+(a.highlights*.2)+(a.shadows*.12))/100,contrast=1+(a.contrast-a.shadows*.08+a.sharpen*.1)/100;parts.push(`brightness(${Math.max(.05,brightness).toFixed(3)})`,`contrast(${Math.max(.05,contrast).toFixed(3)})`,`saturate(${Math.max(0,a.saturation/100).toFixed(3)})`);if(a.temperature)parts.push(`sepia(${Math.abs(a.temperature/400).toFixed(3)})`,`hue-rotate(${(a.temperature/9).toFixed(2)}deg)`);if(a.tint)parts.push(`hue-rotate(${(a.tint/6).toFixed(2)}deg)`);if(a.blur)parts.push(`blur(${a.blur.toFixed(2)}px)`);}
    if(value.sections.hsl!==false)parts.push(`hue-rotate(${h.hue}deg)`,`saturate(${Math.max(0,1+h.saturation/100).toFixed(3)})`,`brightness(${Math.max(.05,1+h.lightness/100).toFixed(3)})`);
    if(value.sections.grading!==false)parts.push(colorGradeFilter(value.grading));
    if(value.sections.filter!==false&&value.filter.enabled&&value.filter.id!=='none')parts.push(weightedFilter(FILTERS[value.filter.id].filter,value.filter.intensity));
    if(value.sections.lut!==false&&value.lut?.enabled)parts.push(weightedFilter(value.lut.approximation,value.lut.intensity));
    return parts.filter(Boolean).join(' ')||'none';
  }
  function vignette(input){const value=normalize(input);return value.enabled&&value.sections.adjustments!==false?value.adjustments.vignette:0;}
  function setValue(input,path,value){const next=normalize(input),parts=String(path).split('.');let target=next;for(let i=0;i<parts.length-1;i++)target=target[parts[i]];target[parts.at(-1)]=value;return normalize(next);}
  function reset(input,path){if(!path)return normalize();const next=normalize(input),parts=String(path).split('.');let target=next,defaults=DEFAULTS;for(let i=0;i<parts.length-1;i++){target=target[parts[i]];defaults=defaults[parts[i]];}target[parts.at(-1)]=clone(defaults[parts.at(-1)]);return normalize(next);}
  function activeEffects(input){const value=normalize(input),items=[];if(Object.entries(value.adjustments).some(([key,item])=>item!==(key==='saturation'?100:0)))items.push({id:'adjustments',name:'Basic adjustments',enabled:value.enabled&&value.sections.adjustments!==false});if(Object.values(value.hsl).some(Boolean))items.push({id:'hsl',name:'HSL',enabled:value.enabled&&value.sections.hsl!==false});if(Object.values(value.grading).some(wheel=>wheel.intensity>0))items.push({id:'grading',name:'Color grading',enabled:value.enabled&&value.sections.grading!==false});if(value.filter.id!=='none')items.push({id:'filter',name:FILTERS[value.filter.id].name,enabled:value.enabled&&value.sections.filter!==false&&value.filter.enabled});if(value.lut)items.push({id:'lut',name:value.lut.name,enabled:value.enabled&&value.sections.lut!==false&&value.lut.enabled});return items;}
  function hexToRgb(hex){const value=String(hex||'#ffffff').replace('#','');return {r:parseInt(value.slice(0,2),16)||0,g:parseInt(value.slice(2,4),16)||0,b:parseInt(value.slice(4,6),16)||0};}
  function parseCube(text,name='Imported LUT'){
    const lines=String(text||'').split(/\r?\n/),values=[];let size=0,title='';
    for(const raw of lines){const line=raw.trim();if(!line||line.startsWith('#'))continue;const titleMatch=line.match(/^TITLE\s+"?(.+?)"?$/i);if(titleMatch){title=titleMatch[1];continue;}const sizeMatch=line.match(/^LUT_3D_SIZE\s+(\d+)$/i);if(sizeMatch){size=Number(sizeMatch[1]);continue;}if(/^(DOMAIN_|LUT_1D_SIZE)/i.test(line))continue;const parts=line.split(/\s+/).map(Number);if(parts.length===3&&parts.every(Number.isFinite))values.push(parts.map(item=>clamp(item,0,1)));}
    if(size<2||size>64||values.length!==size*size*size)throw new Error('This is not a valid .cube 3D LUT file.');
    const average=values.reduce((sum,row)=>sum.map((item,index)=>item+row[index]),[0,0,0]).map(item=>item/values.length),channelSpread=Math.max(...average)-Math.min(...average),temperature=(average[0]-average[2])*80,brightness=((average[0]+average[1]+average[2])/3-.5)*35,saturation=1+channelSpread*.8,approximation=`brightness(${Math.max(.5,1+brightness/100).toFixed(3)}) saturate(${saturation.toFixed(3)}) sepia(${Math.abs(temperature/350).toFixed(3)}) hue-rotate(${(temperature/8).toFixed(2)}deg)`;
    return {name:(title||name).replace(/^"|"$/g,''),size,intensity:100,enabled:true,approximation};
  }

  global.ZorifiVisualTools={DEFAULTS,FILTERS,normalize,ensure,cssFilter,weightedFilter,vignette,setValue,reset,activeEffects,parseCube,clone};
})(typeof window!=='undefined'?window:globalThis);
