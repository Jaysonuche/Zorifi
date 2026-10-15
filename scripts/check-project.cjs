const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let errors=[];let checked=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','.flutter-tools','flutter_mobile','node_modules','web-dist','artifacts','android','installer-dist','release'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:js|cjs|mjs)$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});checked++;if(result.status!==0)errors.push(result.stderr);}}}
walk(root);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const context={self:{addEventListener(){}},console};vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8')+';self.assets=CORE;',context);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const refs=[...html.matchAll(/(?:src|href)="([^"?]+)(?:[^" ]*)"/g)].map(match=>match[1]).concat(context.self.assets,manifest.icons.map(icon=>icon.src));
for(const ref of refs){const relative=ref.split('?')[0].replace(/^\.\//,'');if(relative&&!/^https?:/.test(relative)&&!fs.existsSync(path.join(root,relative)))errors.push(`Missing referenced asset: ${ref}`);}
for(const name of ['scripts/build-web.cjs','scripts/build-android.cjs','scripts/package-current.cjs','build/zorifi.ico','build/entitlements.mac.plist'])if(!fs.existsSync(path.join(root,name)))errors.push(`Missing build file: ${name}`);
console.log(`Checked syntax of ${checked} source files and ${refs.length} browser/cache asset references.`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Project integrity checks passed.');
