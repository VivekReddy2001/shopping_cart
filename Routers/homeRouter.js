const express = require('express');
const mysql = require('../database');
const session = require('express-session');
const router = express.Router();

router.get("/" , (req,res)=>{
    if(!req.session.user) {
        req.session.user = {
            username:"",
            userid:""
        }
    }
    const payload = {};
    payload.username = "";
    if(req.session.user ){
        payload.username = req.session.user.username;
    }
    res.render('entry' , payload);
})
module.exports = router;