const express = require('express');
const middleware = require('../middleware');
const router = express.Router();
const mysql = require('../database');
router.get('/' , middleware , (req,res)=>{
    var sql = `select * from order_info where user_id = ${req.session.user.user_id}`;
    mysql.query(sql , (err, orders)=>{
        // console.log(orders);
        orders.reverse();
        res.render('order_history' , {orders:orders});
    })
})

module.exports = router;