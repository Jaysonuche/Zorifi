const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),kind=process.argv[2]||'apk';
if(!['apk','bundle','sync'].includes(kind))throw new Error('Choose apk, bundle, or sync.');
function run(command,args,cwd=root){const result=spawnSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&/\.(cmd|bat)$/.test(command)});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run(process.execPath,[path.join(__dirname,'build-web.cjs')]);
const capacitor=require.resolve('@capacitor/cli/bin/capacitor');
if(!fs.existsSync(path.join(root,'android')))run(process.execPath,[capacitor,'add','android']);
run(process.execPath,[capacitor,'sync','android']);
if(kind==='sync')process.exit(0);
const android=path.join(root,'android'),wrapper=path.join(android,process.platform==='win32'?'gradlew.bat':'gradlew');
run(wrapper,[kind==='apk'?'assembleDebug':'bundleDebug'],android);
const name=kind==='apk'?'app-debug.apk':'app-debug.aab',source=path.join(android,'app','build','outputs',kind==='apk'?'apk':'bundle','debug',name),out=path.join(root,'android-dist');
fs.mkdirSync(out,{recursive:true});fs.copyFileSync(source,path.join(out,kind==='apk'?'Zorifi-debug.apk':'Zorifi-debug.aab'));
console.log('Debug build complete. Public releases require your own signing key.');
