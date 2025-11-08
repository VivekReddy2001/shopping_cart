const mysql = require('mysql2');
const db = mysql.createConnection({
    host:"database-2.cjqpyslxmtms.us-west-2.rds.amazonaws.com",
    port:"3306",
    user:"admin",
    password:"zeroop123",
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