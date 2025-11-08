const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.post('/' , (req,res)=>{
    const product_id = req.body.product_id;
    var sql = `delete from product where p_id = ${product_id}`;
    mysql.query(sql);
    var sql = `delete from cart where pro_id = ${product_id}`;
    mysql.query(sql , (err,result)=>{
        res.send("success");
    });  
})
module.exports = router;