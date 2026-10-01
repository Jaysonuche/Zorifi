(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiStickers=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STICKERS=[
    {id:'spark-star',name:'Spark Star',category:'Shapes',colors:['#ffcc4d','#ff7a45'],art:'<path d="M256 42l49 128 137 7-107 86 36 133-115-75-115 75 36-133-107-86 137-7z"/>'},
    {id:'soft-heart',name:'Soft Heart',category:'Love',colors:['#ff4fa3','#ff8064'],art:'<path d="M256 421C128 338 66 267 78 177 89 96 184 66 256 145c72-79 167-49 178 32 12 90-50 161-178 244z"/>'},
    {id:'comic-wow',name:'Comic Wow',category:'Comic',colors:['#8b5cff','#ff45ad'],art:'<path d="M75 135l93 15 39-88 58 76 83-55 6 97 98 3-61 75 69 70-97 15 8 98-88-44-48 85-42-88-91 38 15-96-95-22 74-65z"/><text x="256" y="286" text-anchor="middle" font-family="Arial Black,Arial" font-size="96" fill="white" stroke="#17131f" stroke-width="13" paint-order="stroke">WOW!</text>'},
    {id:'speech-pop',name:'Speech Pop',category:'Social',colors:['#7b5cff','#d643d9'],art:'<path d="M74 92h364a42 42 0 0142 42v190a42 42 0 01-42 42H252l-96 78 22-78H74a42 42 0 01-42-42V134a42 42 0 0142-42z"/><circle cx="176" cy="231" r="18" fill="white"/><circle cx="256" cy="231" r="18" fill="white"/><circle cx="336" cy="231" r="18" fill="white"/>'},
    {id:'follow-arrow',name:'Follow Arrow',category:'Arrows',colors:['#ff5c83','#ff983f'],art:'<path d="M62 262c112-104 228-91 304-26l-46-80 59-34 101 178-189 72-24-64 92-35c-58-45-149-45-241 39z"/>'},
    {id:'loop-arrow',name:'Loop Arrow',category:'Arrows',colors:['#32d4d8','#596cff'],art:'<path d="M91 204c26-91 132-143 225-112 45 15 82 46 105 84l45-44 4 143-142-3 45-44c-15-22-38-39-66-48-54-18-115 12-132 66-18 54 12 114 66 132 44 15 93-2 119-39l75 53c-50 70-141 102-223 75-101-34-155-143-121-243z"/>'},
    {id:'verified-badge',name:'Verified Badge',category:'Social',colors:['#24b7ff','#586dff'],art:'<path d="M256 39l55 55 78-4 4 78 55 55-55 55-4 78-78-4-55 55-55-55-78 4-4-78-55-55 55-55 4-78 78 4z"/><path d="M158 250l63 63 137-145" fill="none" stroke="white" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>'},
    {id:'fire-burst',name:'Fire Burst',category:'Energy',colors:['#ff372f','#ffb22c'],art:'<path d="M271 32c40 93-48 117 17 189 8-56 51-77 63-133 82 71 119 165 75 258-35 74-99 123-184 123-105 0-181-75-181-176 0-80 52-142 119-202-7 76 33 97 47 139 36-59 7-123 44-198z"/>'},
    {id:'electric-bolt',name:'Electric Bolt',category:'Energy',colors:['#fff45d','#ff9f1a'],art:'<path d="M278 31L99 289h126l-28 192 216-286H281z"/>'},
    {id:'camera-frame',name:'Camera Frame',category:'Frames',colors:['#9a66ff','#ed43bb'],art:'<path d="M68 76h112v28H96v84H68zm264 0h112v112h-28v-84h-84zM68 324h28v84h84v28H68zm348 0h28v112H332v-28h84z"/><circle cx="256" cy="256" r="77" fill="none" stroke="white" stroke-width="24"/><circle cx="382" cy="142" r="18" fill="white"/>'},
    {id:'focus-ring',name:'Focus Ring',category:'Frames',colors:['#35eff1','#5975ff'],art:'<circle cx="256" cy="256" r="150" fill="none" stroke="url(#g)" stroke-width="28" stroke-dasharray="46 22"/><circle cx="256" cy="256" r="68" fill="none" stroke="white" stroke-width="14" opacity=".8"/><path d="M256 48v70M256 394v70M48 256h70M394 256h70" fill="none" stroke="white" stroke-width="18"/>'},
    {id:'record-dot',name:'Recording',category:'Frames',colors:['#ff335f','#ff7447'],art:'<rect x="45" y="90" width="422" height="332" rx="52" fill="none" stroke="url(#g)" stroke-width="24"/><circle cx="117" cy="158" r="24"/><text x="156" y="174" font-family="Arial Black,Arial" font-size="52" fill="white">REC</text><path d="M209 218l126 74-126 74z" fill="white"/>'},
    {id:'shine-cluster',name:'Shine Cluster',category:'Shapes',colors:['#ffe66b','#ff7edb'],art:'<path d="M256 45c14 99 43 128 142 142-99 14-128 43-142 142-14-99-43-128-142-142 99-14 128-43 142-142z"/><path d="M399 281c7 51 22 66 73 73-51 8-66 22-73 73-8-51-23-65-74-73 51-7 66-22 74-73z" fill="white"/><path d="M113 309c6 39 17 50 56 56-39 6-50 18-56 57-6-39-18-51-57-57 39-6 51-17 57-56z" fill="white"/>'},
    {id:'smile-face',name:'Happy Face',category:'Emoji',colors:['#ffdc55','#ff9b35'],art:'<circle cx="256" cy="256" r="201"/><ellipse cx="184" cy="220" rx="22" ry="31" fill="#191824"/><ellipse cx="328" cy="220" rx="22" ry="31" fill="#191824"/><path d="M153 298c22 69 74 103 103 103s81-34 103-103c-59 25-147 25-206 0z" fill="white" stroke="#191824" stroke-width="14"/>'},
    {id:'cool-face',name:'Cool Face',category:'Emoji',colors:['#56d7ff','#5369ff'],art:'<circle cx="256" cy="256" r="201"/><path d="M92 181h137l-16 87c-6 34-31 54-60 54-31 0-55-21-60-58zm191 0h137l-1 83c-5 37-29 58-60 58-29 0-54-20-60-54z" fill="#17131f"/><path d="M229 204h54" stroke="#17131f" stroke-width="26"/><path d="M193 369c40 22 86 22 126 0" fill="none" stroke="#17131f" stroke-width="18" stroke-linecap="round"/>'},
    {id:'thumbs-up',name:'Thumbs Up',category:'Social',colors:['#ffb54b','#ff725d'],art:'<path d="M185 439H78V226h107zm48-211c34-50 49-100 52-151 1-25 17-40 40-36 54 9 54 85 30 145h88c38 0 57 31 48 63l-38 137c-8 30-31 47-62 47H216V250z"/><path d="M112 399h40" stroke="white" stroke-width="14" stroke-linecap="round"/>'},
    {id:'location-pin',name:'Location Pin',category:'Travel',colors:['#ff4a79','#9a54ff'],art:'<path d="M256 45c-105 0-190 82-190 184 0 129 190 246 190 246s190-117 190-246c0-102-85-184-190-184z"/><circle cx="256" cy="226" r="70" fill="white"/><circle cx="256" cy="226" r="37" fill="#8b54ff"/>'},
    {id:'plane-route',name:'Plane Route',category:'Travel',colors:['#58d8ff','#6a62ff'],art:'<path d="M59 389c88 34 145-4 191-61 58-72 93-151 206-168" fill="none" stroke="url(#g)" stroke-width="22" stroke-linecap="round" stroke-dasharray="16 25"/><path d="M389 91l84 25-50 72-18-38-78 38 54-61z"/><circle cx="69" cy="387" r="28" fill="white"/>'},
    {id:'music-note',name:'Music Note',category:'Music',colors:['#ba52ff','#ff42ad'],art:'<path d="M215 107v253c-19-10-45-13-69-6-52 14-84 58-70 98 13 40 67 59 119 45 45-12 75-46 75-81V202l145-32v129c-19-10-45-13-69-6-52 14-84 58-70 98 13 40 67 59 119 45 45-12 75-46 75-81V42z"/>'},
    {id:'sound-wave',name:'Sound Wave',category:'Music',colors:['#25e3c6','#5e6dff'],art:'<path d="M54 256h43m318 0h43M118 196v120m55-186v252m56-300v348m55-303v258m56-197v136m55-90v44" fill="none" stroke="url(#g)" stroke-width="30" stroke-linecap="round"/>'},
    {id:'sale-tag',name:'Sale Tag',category:'Business',colors:['#ff4e8b','#ff8b45'],art:'<path d="M60 87h233l159 159-206 206L60 266z"/><circle cx="158" cy="178" r="30" fill="#17131f"/><text x="270" y="305" text-anchor="middle" font-family="Arial Black,Arial" font-size="96" fill="white" transform="rotate(45 270 305)">%</text>'},
    {id:'new-badge',name:'New Badge',category:'Business',colors:['#7f5cff','#e84fc3'],art:'<path d="M256 38l54 43 68-8 29 62 63 30-9 68 42 54-43 54 8 68-62 29-30 63-68-9-54 42-54-43-68 8-29-62-63-30 9-68-42-54 43-54-8-68 62-29 30-63 68 9z"/><text x="256" y="284" text-anchor="middle" font-family="Arial Black,Arial" font-size="88" fill="white">NEW</text>'},
    {id:'crown',name:'Creator Crown',category:'Business',colors:['#ffd952','#ff8b39'],art:'<path d="M77 151l100 91 79-150 79 150 100-91-33 257H110z"/><path d="M126 363h260" stroke="white" stroke-width="22" stroke-linecap="round"/><circle cx="77" cy="138" r="27" fill="white"/><circle cx="256" cy="76" r="27" fill="white"/><circle cx="435" cy="138" r="27" fill="white"/>'},
    {id:'zorifi-ribbon',name:'Zorifi Ribbon',category:'Brand',colors:['#762bff','#ff3cac'],art:'<path d="M111 88h290L264 244h135L104 424l139-157H106z"/><path d="M203 193h127l-63 66h-94z" fill="white" opacity=".9"/>'}
  ];

  function byId(id){return STICKERS.find(item=>item.id===id)||null;}
  function escapeXml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));}
  function svg(id){
    const sticker=typeof id==='string'?byId(id):id;
    if(!sticker)throw new Error('Unknown Zorifi sticker');
    const [first,second]=sticker.colors;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeXml(sticker.name)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${first}"/><stop offset="1" stop-color="${second}"/></linearGradient></defs><g fill="url(#g)" stroke-linejoin="round">${sticker.art}</g></svg>`;
  }
  function dataUrl(id){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(id))}`;}
  function asset(id){const sticker=byId(id);if(!sticker)throw new Error('Unknown Zorifi sticker');const url=dataUrl(sticker);return {id:`sticker-${sticker.id}`,stickerId:sticker.id,name:sticker.name,type:'image',kind:'sticker',duration:5,width:512,height:512,url,thumbnail:url,generated:true,localFile:false,persisted:true,createdAt:new Date().toISOString()};}
  function query({search='',category='All'}={}){const needle=String(search).trim().toLowerCase();return STICKERS.filter(item=>(category==='All'||item.category===category)&&(!needle||`${item.name} ${item.category}`.toLowerCase().includes(needle)));}
  return {STICKERS:Object.freeze(STICKERS.map(item=>Object.freeze({...item}))),byId,svg,dataUrl,asset,query};
});
