const express  = require('express');
const bp = require('body-parser');
const router = express.Router();
const mysql = require('../../database');
router.post('/:product_id' , (req,res) =>{
    const user = req.session.user;
    const product_id = req.params.product_id;
    const qty = req.body.val;
    var sql = `update cart set qty = ${qty} where user_id = ${user.user_id} and pro_id = ${product_id}`
    mysql.query(sql);
    res.redirect('/cart');
})
module.exports = router;