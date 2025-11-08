const express = require('express');
const router = express.Router();
const mysql = require('../../database');
const mail = require('../../mail');
router.post('/' , (req,res)=>{
    // console.log(req.body);
    const username  = req.body.username , email = req.body.email , pass = req.body.password;
    var sql = `select * from users where username =  "${username}"`;
    mysql.query(sql , (err,result)=>{
        if(result.length != 0){
            return res.send('userExt');
        }
        sql = `select * from users where email =  "${email}"`;
        mysql.query(sql , (err,result)=>{
            if(result.length != 0){
                return res.send('emailExt');
            }
            sql = `insert into users (username , password ,email) values("${username}" , "${pass}" , "${email}")`;
            mysql.query(sql ,async (err,user)=>{
                req.session.user ={
                    user_id:user.insertId,
                    username:username,
                    email:email
                }
                var text = `
                'Your Registration has been successfull . Welcome to Red Store. 
                 continue Shoping.... https://redstore1.herokuapp.com/ 
                `
                await mail(email,'Welcom to RedStore',text);
                return res.send("success");
            })
        })
    })
})
module.exports = router;