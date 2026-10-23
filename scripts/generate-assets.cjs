const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const brand=path.join(root,'icons','zorifi-brand-source.png');
const background=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><radialGradient id="a"><stop stop-color="#542498"/><stop offset="1" stop-color="#090b10"/></radialGradient><linearGradient id="b"><stop stop-color="#a78bfa" stop-opacity=".4"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".05"/></linearGradient></defs><rect width="1600" height="900" fill="#090b10"/><ellipse cx="800" cy="440" rx="950" ry="500" fill="url(#a)"/><path d="M0 730Q420 320 850 580T1600 300" fill="none" stroke="url(#b)" stroke-width="120"/></svg>`;
const iconPng=(size,destination)=>sharp(brand).resize(size,size,{fit:'cover'}).png().toFile(destination);
async function iconIco(destination){
 const png=await sharp(brand).resize(256,256).png().toBuffer(),header=Buffer.alloc(22);
 header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 fs.writeFileSync(destination,Buffer.concat([header,png]));
}
async function main(){
 for(const dir of ['icons','assets','build'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 if(!fs.existsSync(brand))throw new Error(`Missing Zorifi brand source: ${brand}`);
 const embedded=(await sharp(brand).resize(512,512).jpeg({quality:88}).toBuffer()).toString('base64');
 fs.writeFileSync(path.join(root,'icons','zorifi-logo.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/jpeg;base64,${embedded}"/></svg>`);
 fs.writeFileSync(path.join(root,'assets','zorifi-background.svg'),background);
 for(const size of [64,192,512])await iconPng(size,path.join(root,'icons',size===64?'favicon-64.png':`icon-${size}.png`));
 const flutterAssets=path.join(root,'flutter_mobile','assets');
 if(fs.existsSync(path.join(root,'flutter_mobile'))){fs.mkdirSync(flutterAssets,{recursive:true});await iconPng(192,path.join(flutterAssets,'zorifi-mark.png'));}
 await sharp(brand).resize(512,512).jpeg({quality:90}).toFile(path.join(root,'icons','zorifi-logo.jpeg'));
 await sharp(Buffer.from(background)).jpeg({quality:88}).toFile(path.join(root,'assets','zorifi-background.jpeg'));
 const vanessaSource=path.join(root,'assets','vanessa-orb.png');
 if(fs.existsSync(vanessaSource))await sharp(vanessaSource).resize(384,384).webp({quality:90,effort:6}).toFile(path.join(root,'assets','vanessa-orb.webp'));
 await iconIco(path.join(root,'build','zorifi.ico'));
 const densities={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
 for(const [density,multiplier] of Object.entries(densities)){
   const android=path.join(root,'android','app','src','main','res',`mipmap-${density}`);
   const flutterAndroid=path.join(root,'flutter_mobile','android','app','src','main','res',`mipmap-${density}`);
   if(fs.existsSync(android)){
     await iconPng(Math.round(48*multiplier),path.join(android,'ic_launcher.png'));
     await iconPng(Math.round(48*multiplier),path.join(android,'ic_launcher_round.png'));
     await iconPng(Math.round(108*multiplier),path.join(android,'ic_launcher_foreground.png'));
   }
   if(fs.existsSync(flutterAndroid))await iconPng(Math.round(48*multiplier),path.join(flutterAndroid,'ic_launcher.png'));
 }
 const macIcons=path.join(root,'flutter_mobile','macos','Runner','Assets.xcassets','AppIcon.appiconset');
 if(fs.existsSync(macIcons))for(const filename of fs.readdirSync(macIcons)){
   const match=/^app_icon_(\d+)\.png$/.exec(filename);
   if(match)await iconPng(Number(match[1]),path.join(macIcons,filename));
 }
 const iosIcons=path.join(root,'flutter_mobile','ios','Runner','Assets.xcassets','AppIcon.appiconset');
 if(fs.existsSync(path.join(iosIcons,'Contents.json'))){
   const manifest=JSON.parse(fs.readFileSync(path.join(iosIcons,'Contents.json'),'utf8'));
   const files=new Map(manifest.images.filter(item=>item.filename).map(item=>[item.filename,Math.round(parseFloat(item.size)*parseFloat(item.scale))]));
   for(const [filename,size] of files)await iconPng(size,path.join(iosIcons,filename));
 }
 const flutterIco=path.join(root,'flutter_mobile','windows','runner','resources','app_icon.ico');
 if(fs.existsSync(flutterIco))await iconIco(flutterIco);
 console.log('Generated Zorifi brand assets from icons/zorifi-brand-source.png.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
