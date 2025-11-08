const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.get('/' , (req,res)=>{
    var sql = `select user_id ,user_name , email from users`;
    mysql.query(sql , (err,users)=>{
        res.render('userList' , {users:users});
    })
})

module.exports = router;