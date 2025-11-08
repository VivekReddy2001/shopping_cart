const mysql = require('mysql2');
const db = mysql.createConnection({
    host:"your-database-host.example.com",
    port:"3306",
    user:"admin",
    password:"your-database-password",
    database:"RedStore"
})
db.connect((err)=>{
    if(err){
        console.log(err.message);
    }
    console.log("DataBase is connected");
})
var sql = `select * from brands`;
db.query(sql , (err,result)=>{
    console.log(result);
})