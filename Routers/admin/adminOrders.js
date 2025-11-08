const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.get('/' , (req,res)=>{
    var sql = `select * from order_info`;
    mysql.query(sql , (err , orders)=>{
        res.render('adminOrders' , {orders:orders});
    })
});

module.exports = router;