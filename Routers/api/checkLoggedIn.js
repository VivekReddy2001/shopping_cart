const express = require('express');
const router = express.Router();
router.get('/' , (req,res)=>{
    if(req.session.user) {
        if(req.session.user.username!="") {
            return res.send(true);
        }
        return res.send(false);
    }
    return res.send(false);
})
module.exports = router;