const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.post('/' , (req,res)=>{
    var user_id = req.session.user.user_id;
    var product_id = req.body.product_id;
    var sql = `delete from cart where user_id = ${user_id} and pro_id = ${product_id}`;
    mysql.query(sql , (err , result)=>{
        res.send("deleted");
    })
})
module.exports = router;