const express = require('express');
const mysql = require('../database');
const router = express.Router();
router.get('/' , (req,res)=>{
    req.session.user = null;
    res.render('login');
})
router.post('/' , (req , res)=>{
    const username = req.body.username;
    const pass = req.body.password;
    var sql = `select * from users where username = "${username}"`;
    mysql.query(sql , (err,results)=>{
        if(err) throw err;
        const user = results[0];
        if(user.password == pass){
           req.session.user = user;
           return  res.redirect('/product');
        }
        return res.redirect('/login');
    })
})
module.exports = router;