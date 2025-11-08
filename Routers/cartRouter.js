const express = require('express');
const router = express.Router();
const mysql = require('../database');
const middleware = require('../middleware');
router.get('/' , middleware ,  (req,res , next)=>{
    var user_id = req.session.user.user_id;
    if(req.query.p_id){
        var p_id = req.query.p_id;
        var sql = `delete from cart where user_id = ${user_id} and pro_id = ${p_id}`;
        mysql.query(sql);
    }
    // this will auto matically check the 
    if(req.query.all){
        var sql = `delete from cart where user_id = ${user_id}`;
        mysql.query(sql);
    }
    var sql = `select p_name,qty, p_image ,(qty)*( p_price) as p_price ,pro_id as p_id, category_name as p_cat, brand_name as p_brand , user_id from product,cart,category,brand where pro_id=p_id and cat_id=p_category and brand_id=p_brand and cart.user_id = ${user_id}  `;
    mysql.query(sql , (err , result)=>{
        if(err) throw err;
        let total_price = 0;
        result.forEach((item)=>{
            total_price +=item.p_price;
        });
        const payload = {};
        payload.cart_items = result;
        payload.user_id = req.session.user.user_id;
        payload.total_price = total_price;
        res.render('cart' , payload);
    })
});
module.exports = router;