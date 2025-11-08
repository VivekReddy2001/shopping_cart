const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.put('/:id' , (req,res)=>{
    var product_id = req.params.id , user_id = req.session.user.user_id;
    var sql = `select * from cart where user_id= ${user_id} and pro_id = ${product_id}`;
    mysql.query(sql , (err,records)=>{
        if(err) throw err;
        // here we are making sure that if there is already a item in the cart then we are not adding the same item once again
        if(records.length == 0){
            sql = ` insert into cart (pro_id , user_id,qty)values(${product_id} , ${user_id},1) `;
            mysql.query(sql);
        }
    });

    return res.send(product_id);
})
module.exports = router;