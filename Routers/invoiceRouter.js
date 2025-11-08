const express = require('express');
const middleware = require('../middleware');
const mysql = require('../database');
const router = express.Router();
router.get('/:order_id' ,middleware, (req,res,next)=>{
    const order_id = req.params.order_id;
    const user_id = req.session.user.user_id;
    var sql = `select * from order_info where order_id = "${order_id}"`;
    mysql.query(sql , (err , result)=>{
        console.log(result);
        sql = `select product_name as description ,qty as quantity, product_price as unitCost ,qty*product_price as Amount  from order_items  where order_id = "${order_id}";`
        mysql.query(sql , (err,cart)=>{
            console.log(cart);
            var totalAmount = 0;
            cart.forEach((item)=>{
                totalAmount+=item.Amount;
            })
            return res.render('invoice' ,{order:result[0] , cart:cart,totalAmount:totalAmount, email:req.session.user.email , username:req.session.user.username});
        })
    })
})

module.exports = router;