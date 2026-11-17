// Reset password admin: node reset-admin.js PasswordBaru
const {DatabaseSync}=require('node:sqlite'),c=require('crypto');
const pw=process.argv[2];if(!pw||pw.length<8){console.log('Pakai: node reset-admin.js PasswordBaru (min. 8 karakter)');process.exit(1)}
const s=c.randomBytes(16),h=s.toString('hex')+':'+c.scryptSync(pw,s,32).toString('hex');
const d=new DatabaseSync((process.env.DATA_DIR||'./data')+'/shiftin.db');
d.prepare("UPDATE users SET pass=?,tv=tv+1 WHERE username='admin'").run(h);console.log('Password admin direset');
