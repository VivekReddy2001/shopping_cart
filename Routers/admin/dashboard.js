const express = require('express');
const router = express.Router();

router.get('/' , (req,res)=>{
    res.render('adminDashboard');
})

module.exports = router;