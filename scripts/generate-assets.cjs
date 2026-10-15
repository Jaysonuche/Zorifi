const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const logo=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#5b3ad9"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="#0d1019"/><path d="M128 136h264v58L211 320h181v56H120v-57l181-127H128z" fill="url(#g)"/></svg>`;
const background=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><radialGradient id="a"><stop stop-color="#542498"/><stop offset="1" stop-color="#090b10"/></radialGradient><linearGradient id="b"><stop stop-color="#a78bfa" stop-opacity=".4"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".05"/></linearGradient></defs><rect width="1600" height="900" fill="#090b10"/><ellipse cx="800" cy="440" rx="950" ry="500" fill="url(#a)"/><path d="M0 730Q420 320 850 580T1600 300" fill="none" stroke="url(#b)" stroke-width="120"/></svg>`;
async function main(){
 for(const dir of ['icons','assets','build'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 fs.writeFileSync(path.join(root,'icons','zorifi-logo.svg'),logo);
 fs.writeFileSync(path.join(root,'assets','zorifi-background.svg'),background);
 for(const size of [64,192,512])await sharp(Buffer.from(logo)).resize(size,size).png().toFile(path.join(root,'icons',size===64?'favicon-64.png':`icon-${size}.png`));
 await sharp(Buffer.from(logo)).jpeg({quality:92}).toFile(path.join(root,'icons','zorifi-logo.jpeg'));
 await sharp(Buffer.from(background)).jpeg({quality:88}).toFile(path.join(root,'assets','zorifi-background.jpeg'));
 // ICO accepts an embedded PNG; a 256px entry supports high-DPI Windows icons.
 const png=await sharp(Buffer.from(logo)).resize(256,256).png().toBuffer(),header=Buffer.alloc(22);
 header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 fs.writeFileSync(path.join(root,'build','zorifi.ico'),Buffer.concat([header,png]));
 console.log('Generated replacement Zorifi brand assets.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
