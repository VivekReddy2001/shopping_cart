const express = require('express');
const router = express.Router();
const mysql = require('../database');
router.get('/' , (req,res,next)=>{
    var username = "";
    if(req.session.user  && req.session.user.username!=""){
        username = req.session.user.username 
    }
    console.log(req.query);
    var sql = " select p_id ,  p_name , p_image , brand_name as p_brand,category_name,p_price from product inner join brand on p_brand = brand_id inner join category on p_category = cat_id ;";
    mysql.query(sql , (err,result)=>{
        sql = `select brand_name from brand`;
        mysql.query(sql , (err , brands)=>{
            sql = `select category_name from category`;
            mysql.query(sql , (err, category)=>{
                res.render('product', {products:result ,brands:brands, category:category, "username":username});
            })
        })
    });
});
module.exports = router;