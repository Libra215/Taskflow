require('dotenv').config();
const mysql=require('mysql2');
const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:+process.env.DB_PORT||3306,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionLimit:10,charset:'utf8mb4',dateStrings:true});
module.exports={pool,q:async(sql,p=[])=>(await pool.promise().execute(sql,p))[0]};
