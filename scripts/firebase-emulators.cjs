// Development tooling only. Reuse the installed CLI and local JRE, never credentials.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(process.env.LOCALAPPDATA||'', 'npm-cache','_npx');
const cli=process.env.FIREBASE_CLI_PATH||[path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js'),...fs.readdirSync(cache,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>path.join(cache,x.name,'node_modules/firebase-tools/lib/bin/firebase.js'))].find(p=>fs.existsSync(p));
if(!cli)throw Error('Install the development CLI first: npm exec --yes --package=firebase-tools@14.24.2 -- firebase --version');
const env={...process.env};delete env.OPENAI_API_KEY;
const jre=path.join(root,'artifacts/verification-tools/jre21');if(!env.JAVA_HOME&&fs.existsSync(jre)){const installed=fs.readdirSync(jre).map(x=>path.join(jre,x)).find(p=>fs.existsSync(path.join(p,'bin/java.exe')));if(installed)env.JAVA_HOME=installed;}
const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')||'PATH';env[pathKey]=[path.dirname(process.execPath),...(env.JAVA_HOME?[path.join(env.JAVA_HOME,'bin')]:[]),env[pathKey]||''].join(path.delimiter);
const exec=process.argv.includes('--exec'),args=['emulators:'+ (exec?'exec':'start'),'--config','firebase.local.json','--project','demo-zorifi-openai','--only','auth,firestore',...(exec?['node scripts/test-openai-emulators.cjs']:[])];
const child=spawn(process.execPath,[cli,...args],{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('exit',code=>{process.exitCode=code||0;});child.on('error',()=>{console.error('Firebase development tooling could not start. Install the CLI and Java21.');process.exitCode=1;});
