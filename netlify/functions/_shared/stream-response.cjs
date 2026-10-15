const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
module.exports=async function relayStream(result,response){
 response.statusCode=result.status;
 for(const [key,value] of result.headers)response.setHeader(key,value);
 if(!result.body){response.end();return;}
 const source=Readable.fromWeb(result.body);
 try{await pipeline(source,response);}catch(error){if(!response.destroyed)response.destroy(error);}
};
