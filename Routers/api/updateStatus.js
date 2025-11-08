const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.post('/',(req,res)=>{
    const order_id  = req.body.order_id , order_status = req.body.order_status;
    console.log(order_id);
    console.log(order_status);
    var sql = `update order_info set order_status = "${order_status}" where order_id = "${order_id}"`
    mysql.query(sql , ()=>{
        res.send("Hello");
    })
})

module.exports = router;