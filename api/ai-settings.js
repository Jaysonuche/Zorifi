// Public capability metadata only. Provider secrets never leave the server.
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Configure credentials in Vercel environment variables.'});
 try{
  const {configuration}=await import('../netlify/functions/_shared/provider.mjs');
  return res.status(200).json({server:'Vercel server',configurations:configuration(),secureStorage:{available:false},provider:{name:'Vanessa AI Provider'}});
 }catch{return res.status(500).json({error:'Provider status is unavailable.'});}
};
