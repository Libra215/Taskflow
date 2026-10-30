require('dotenv').config();const bcrypt=require('bcrypt'),rl=require('readline').createInterface({input:process.stdin,output:process.stdout}),{q,pool}=require('../src/db');
const ask=t=>new Promise(r=>rl.question(t,r));
(async()=>{const name=await ask('Nama: '),email=(await ask('Email: ')).toLowerCase(),pw=await ask('Password (min 10 karakter): ');rl.close();
if(pw.length<10)throw new Error('Password terlalu pendek');
await q("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?, 'admin')",[name,email,await bcrypt.hash(pw,12)]);console.log('Admin dibuat.');pool.end()})().catch(e=>{console.error(e.message);process.exit(1)});
