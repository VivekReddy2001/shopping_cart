const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.get('/' , (req,res)=>{
    var sql = `select * from product`;
    mysql.query(sql , (err,products)=>{
        res.render('productList' , {products:products});
    })
})

module.exports = router;