module.exports=(req,res)=>{req.query={...req.query,service:'vanessa-chat'};return require('../vanessa-provider.js')(req,res);};
