const express = require('express');
const generateHash = require('../generateHash');
const middleware = require('../middleware');
const mysql = require('../database');
const router = express.Router();
const mail = require('../mail');
router.get('/' , middleware , (req,res,next)=>{
    res.render('Transaction');
})
router.post('/' , (req,res)=>{
    var user_id = req.session.user.user_id; 
    const data = req.body;
    var order_id =  generateHash(15);
    var transaction_id = generateHash(20);
    var name = req.body.name;
    var sql = `select qty,p_price ,pro_id as p_id ,p_name  from product,cart where pro_id=p_id and  user_id = ${user_id}`;
    mysql.query(sql , (err , cart)=>{
        let total_price = 0;
        cart.forEach((item)=>{
            total_price+=item.p_price*item.qty;
        });
        console.log(order_id);
        var Shipping_Add = `${data. street_address} , ${data.city} , ${data.postcode}`;
        sql = `insert into order_info values("${order_id}" , "${transaction_id}" , ${total_price}, ${user_id},"${Shipping_Add}","${new Date().toISOString().slice(0, 19).replace('T', ' ')}" , "ACTIVE" , "${name}")`;
        mysql.query(sql); // here we are creating the new order info
        var text = `
    Your Order Placed Successfully. 
Order Id ${order_id} and Transaction Id is ${transaction_id}.
        `
        mail(req.session.user.email , 'Order Placed' , text);

        cart.forEach((item)=>{
            sql = `insert into order_items values("${order_id}" , ${item.p_id} ,${item.p_price} ,"${item.p_name}", ${item.qty})`;
            mysql.query(sql);
        })
        sql = `delete from cart where user_id = ${user_id}`;
        mysql.query(sql);
    })
    res.redirect('/');
})


module.exports = router;