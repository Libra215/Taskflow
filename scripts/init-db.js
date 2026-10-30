require('dotenv').config();const fs=require('fs'),mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:+process.env.DB_PORT||3306,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true});
await c.query(fs.readFileSync(__dirname+'/../database/schema.sql','utf8'));console.log('Schema OK');await c.end()})().catch(e=>{console.error(e.message);process.exit(1)});
