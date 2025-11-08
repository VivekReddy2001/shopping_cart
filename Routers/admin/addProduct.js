const express = require('express');
const bp = require('body-parser');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const mysql = require('../../database');
router.use(bp.urlencoded({extended:true}))
// we can use multer to images 
const storage = multer.diskStorage({
    destination:(req,file,callback)=>{
        callback(null , 'public/images');
    },
    filename:(req,file,callback)=>{
        callback(null,Date.now()+ path.extname(file.originalname));
    }
})

const upload = multer({storage:storage})

router.get('/' , (req,res)=>{
    var sql  = `select * from brand`;
    mysql.query(sql , (err,brands)=>{
        sql = `select * from category`;
        mysql.query(sql , (err , category)=>{
            res.render('addProduct' , {brands:brands , category:category});
        })
    })
})
router.post('/', upload.single('image') ,(req,res)=>{
    // here req.file will store the data regarding the file uploded
    // console.log(req.file); here the file will contain the 
    // console.log(req.body);
    var p_name = req.body.p_name , p_price = req.body.p_price , p_category = req.body.p_category , p_brand = req.body.p_brand , p_image = req.file.filename;
    var sql = `insert into product (p_category,p_brand,p_name,p_price,p_image)values(${p_category} , ${p_brand} , "${p_name}" ,${p_price} , "${p_image}")`;
    mysql.query(sql);
    res.redirect('/addProduct');
})
module.exports = router;