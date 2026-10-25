// Only shipped interface copy can be sent to the interface translation service.
// Keep this catalogue in source control so client and server use the same allowlist.
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const strings=new Set();
const templates=new Set();
function add(value){
  const text=String(value).replace(/\\n/g,' ').replace(/\\(['"])/g,'$1').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  if(text.length<2||text.length>700||!/[A-Za-z]{2}/.test(text)||/[<>{}$`\\]|\b(?:https?:|data:|function|return|const|undefined)\b/.test(text)||/^[\w./-]+\.(?:js|css|png|svg|mp4|json)/i.test(text))return;
  strings.add(text);
}
const files=fs.readdirSync(root).filter(name=>name==='app.js'||name==='index.html'||/^zorifi-.*\.js$/.test(name)&&!/^zorifi-interface-/.test(name));
for(const file of files){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/>([^<>]+)</g))add(match[1]);
 for(const match of source.matchAll(/(?:title|placeholder|aria-label)="([^"\r\n]+)"/g))add(match[1]);
 for(const match of source.matchAll(/'((?:\\.|[^'\\\r\n])*)'|"((?:\\.|[^"\\\r\n])*)"/g))add(match[1]??match[2]);
 // Numbered placeholders let labels with counts or filenames be translated
 // without sending those values to the language service.
 for(const match of source.matchAll(/>([^<>]+)<|(?:title|placeholder|aria-label)="([^"\r\n]+)"/g)){
  let index=0;const value=(match[1]??match[2]).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g,()=>`{${index++}}`).replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  if(!index||index>4||value.length>500||/[$`<>\\]/.test(value)||!/[A-Za-z]{4}/.test(value)||value.split('{')[0].trim().length<4)continue;
  if(/\{(?!\d+\})|(?<!\{\d)\}/.test(value))continue;
  templates.add(value);strings.add(value);
 }
}
for(const text of ['Hey, {0}','Good to see you, {0}','Welcome, {0}','Hello, {0}']){strings.add(text);templates.add(text);}
const output={version:1,strings:[...strings].sort(),templates:[...templates].sort((a,b)=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length)};fs.writeFileSync(path.join(root,'zorifi-interface-catalog.json'),JSON.stringify(output,null,2)+'\n');
console.log(`Interface catalogue: ${strings.size} approved strings from ${files.length} sources.`);
