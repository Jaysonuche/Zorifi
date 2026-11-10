module.exports=(req,res)=>{req.query={...req.query,service:'vanessa-openai'};return require('../vanessa-provider.js')(req,res);};
