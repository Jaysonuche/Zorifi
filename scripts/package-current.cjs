const {spawnSync} = require('node:child_process');
const path = require('node:path');
const target = {win32:['--win','nsis'],darwin:['--mac','dmg','zip'],linux:['--linux','AppImage','deb']}[process.platform];
if(!target)throw new Error(`Unsupported platform: ${process.platform}`);
const cli=require.resolve('electron-builder/cli.js');
const result=spawnSync(process.execPath,[cli,...target],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status||0;
