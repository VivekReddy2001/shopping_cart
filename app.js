const express = require('express');
const mysql = require('./database');
const session = require('express-session')
const middleware = require('./middleware')
const bp = require('body-parser');
const app = express();
app.use(bp.urlencoded({extended:true}));
const port = process.env.PORT || 5000;
app.use(express.static(__dirname+"/public"));
app.set('view engine' , 'ejs');

app.use(session({
    secret:"RedStore",
    resave:true,
    saveUninitialized:false
}))
// Routers

const homeRouter = require('./Routers/homeRouter');
app.use('/' , homeRouter);

const productPageRouter = require('./Routers/productsPageRouter')
app.use('/product' , productPageRouter );

const loginRouter = require('./Routers/loginRouter');
app.use('/login' , loginRouter);


const transactionRouter = require('./Routers/transactionRouter');
app.use('/transaction' , transactionRouter);

const orderHistoryRouter = require('./Routers/orderHistoryRouter');
app.use('/order_history',orderHistoryRouter);

const invoiceRouter = require('./Routers/invoiceRouter');
app.use('/invoice' , invoiceRouter);

const apiRouter = require('./Routers/api');
app.use('/api' , apiRouter);


//  Admin routers


const adminDashboard = require('./Routers/admin/dashboard');
app.use('/adminDashboard' , adminDashboard);


const userList = require('./Routers/admin/userList');
app.use('/userList' , userList);

const productList = require('./Routers/admin/productList');
app.use('/productList' , productList);

const orders = require('./Routers/admin/adminOrders');
app.use('/adminOrders' , orders);

const addProduct  = require('./Routers/admin/addProduct');
app.use('/addProduct' , addProduct);

const cartRouter = require('./Routers/cartRouter');
app.use('/cart' , cartRouter);


app.get('/logout' , (req,res)=>{
    req.session.user = null;
    res.redirect('/');
})

app.get('/register' , (req,res)=>{
    res.render('register');
})

app.listen(port , ()=>{
    console.log("Server is running at port:"+port);
})