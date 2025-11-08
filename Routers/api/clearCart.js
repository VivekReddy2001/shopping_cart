const express = require('express');
const router = express.Router();
const mysql = require('../../database');
router.post('/' , (req,res)=>{
    const user_id = req.session.user.user_id;
    console.log("Hello");
    const sql = `delete from cart where user_id = ${user_id}`;
    mysql.query(sql);
    res.send('cleared');
})
module.exports = router;