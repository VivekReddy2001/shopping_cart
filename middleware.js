module.exports = (req,res,next)=>{
    if(!req.session.user || !req.session.user.user_id){
       return res.redirect('/login');
    }
    return next();
}