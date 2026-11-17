'use strict';
// ShiftIn server — Node >= 22.13, tanpa dependensi eksternal.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=+process.env.PORT||3000,TZ=process.env.TZ||'Asia/Jakarta',PROD=process.env.NODE_ENV==='production';
const DATA=path.resolve(process.env.DATA_DIR||'./data'),UP=path.join(DATA,'uploads'),PUB=path.join(__dirname,'public');
fs.mkdirSync(UP,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'shiftin.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,div TEXT DEFAULT '',nip TEXT DEFAULT '',role TEXT NOT NULL DEFAULT 'employee',pass TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,tv INTEGER NOT NULL DEFAULT 0,created_at TEXT);
CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY,col TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT);
CREATE INDEX IF NOT EXISTS docs_col ON docs(col);`);
const SF=path.join(DATA,'.secret');
if(!fs.existsSync(SF))fs.writeFileSync(SF,crypto.randomBytes(32).toString('hex'),{mode:0o600});
const SECRET=process.env.SESSION_SECRET||fs.readFileSync(SF,'utf8');

class Err extends Error{constructor(c,m){super(m);this.c=c}}
const hp=pw=>{const s=crypto.randomBytes(16);return s.toString('hex')+':'+crypto.scryptSync(pw,s,32).toString('hex')};
const vp=(pw,h)=>{const [s,k]=h.split(':'),x=crypto.scryptSync(pw,Buffer.from(s,'hex'),32);return crypto.timingSafeEqual(x,Buffer.from(k,'hex'))};
const DUMMY=hp('dummy');
const mac=b=>crypto.createHmac('sha256',SECRET).update(b).digest('base64url');
const sign=v=>{const b=Buffer.from(JSON.stringify(v)).toString('base64url');return b+'.'+mac(b)};
const verify=t=>{try{const [b,m]=t.split('.'),e=mac(b);if(m.length!==e.length||!crypto.timingSafeEqual(Buffer.from(m),Buffer.from(e)))return null;const v=JSON.parse(Buffer.from(b,'base64url'));return v.exp>Date.now()?v:null}catch(e){return null}};
const q1=(s,...a)=>db.prepare(s).get(...a),qa=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
const pub=u=>({id:u.id,username:u.username,name:u.name,div:u.div,nip:u.nip,role:u.role,admin:u.role==='admin',active:!!u.active});
const getDoc=p=>{const r=q1('SELECT data FROM docs WHERE path=?',p);return r?JSON.parse(r.data):null};
const putDoc=(p,d)=>run('INSERT INTO docs(path,col,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',p,p.split('/').slice(0,-1).join('/'),JSON.stringify(d),new Date().toISOString());
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:TZ});
const DT=/^\d{4}-\d{2}-\d{2}$/;
const dist=(a,b,c,d)=>{const R=6371e3,r=x=>x*Math.PI/180,u=r(c-a),v=r(d-b),h=Math.sin(u/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(v/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const adm=u=>{if(u.role!=='admin')throw new Err(403,'Hanya admin')};

// Aturan akses: m = 'r' baca | 'w' tulis
function can(u,m,p){const s=p.split('/'),a=u.role==='admin';
 if(s[0]==='cfg'||s[0]==='dec')return m==='r'||a;
 if(s[0]==='att'||s[0]==='req')return s[1]===u.id||(a&&m==='r');
 if(s[0]==='emp')return m==='r'&&(a||s[1]===u.id);
 return false}
function readDoc(u,p){if(!can(u,'r',p))throw new Err(403,'Tidak diizinkan');const s=p.split('/');if(s[0]==='emp'){const r=q1('SELECT * FROM users WHERE id=?',s[1]);return r?pub(r):null}return getDoc(p)}
function readCol(u,p){if(!can(u,'r',p))throw new Err(403,'Tidak diizinkan');if(p==='emp')return qa('SELECT * FROM users WHERE active=1 ORDER BY name').map(pub);return qa('SELECT path,data FROM docs WHERE col=?',p).map(r=>({id:r.path.split('/').pop(),...JSON.parse(r.data)}))}
function writeAtt(u,p,date,b){
 if(date!==today())throw new Err(400,'Absen hanya bisa untuk hari ini');
 const old=getDoc(p)||{},cfg=getDoc('cfg/office')||{},doc={...old},now=new Date().toISOString();
 for(const k of ['in','out']){
  if(old[k]||!b[k])continue;
  if(k==='out'&&!old.in)throw new Err(400,'Belum absen masuk');
  const x=b[k],lat=+x.lat,lng=+x.lng;
  if(!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new Err(400,'Lokasi tidak valid');
  if(cfg.lat!=null&&cfg.lng!=null&&dist(lat,lng,cfg.lat,cfg.lng)>(cfg.rad||200))throw new Err(403,'Di luar area kantor');
  const m=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(x.photo||'');
  if(!m||m[1].length>400000)throw new Err(400,'Foto tidak valid');
  const buf=Buffer.from(m[1],'base64');if(buf[0]!==0xff||buf[1]!==0xd8)throw new Err(400,'Foto tidak valid');
  fs.mkdirSync(path.join(UP,u.id),{recursive:true});
  fs.writeFileSync(path.join(UP,u.id,date+'-'+k+'.jpg'),buf);
  doc[k]={t:now,lat,lng,acc:Math.round(+x.acc)||0,photo:'/uploads/'+u.id+'/'+date+'-'+k+'.jpg'}; // waktu diambil dari server
 }
 putDoc(p,doc);
}
function writeDoc(u,p,b){
 const s=p.split('/');if(!can(u,'w',p))throw new Err(403,'Tidak diizinkan');
 if(!b||typeof b!=='object')throw new Err(400,'Data tidak valid');
 if(s[0]==='cfg'&&s.length===2){const n=k=>b[k]===''||b[k]==null||!isFinite(+b[k])?null:+b[k],tm=(v,d)=>/^\d\d:\d\d$/.test(v)?v:d;
  return putDoc(p,{masuk:tm(b.masuk,'08:00'),pulang:tm(b.pulang,'17:00'),grace:Math.max(0,n('grace')||0),mot:Math.max(0,n('mot')||0),rad:Math.max(20,n('rad')||200),lat:n('lat'),lng:n('lng')})}
 if(s[0]==='dec'&&s.length===2){if(!['ok','no'].includes(b.s))throw new Err(400,'Data tidak valid');return putDoc(p,{s:b.s,by:u.id,at:new Date().toISOString()})}
 if(s[0]==='req'&&s.length===4){if(getDoc(p))throw new Err(409,'Pengajuan sudah ada');
  if(!['Izin','Sakit','Cuti'].includes(b.t)||!DT.test(b.a)||!DT.test(b.b)||b.b<b.a)throw new Err(400,'Data pengajuan tidak valid');
  return putDoc(p,{t:b.t,a:b.a,b:b.b,n:String(b.n||'').slice(0,120),at:new Date().toISOString()})}
 if(s[0]==='att'&&s.length===4&&s[2]==='days')return writeAtt(u,p,s[3],b);
 throw new Err(403,'Tidak diizinkan');
}

// Seed admin pertama
if(!q1('SELECT 1 FROM users LIMIT 1')){
 const un=(process.env.ADMIN_USER||'admin').toLowerCase(),pw=process.env.ADMIN_PASS||crypto.randomBytes(9).toString('base64url');
 run('INSERT INTO users(id,username,name,role,pass,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),un,'Administrator','admin',hp(pw),new Date().toISOString());
 console.log(`\n=== Akun admin pertama ===\nusername: ${un}\npassword: ${pw}\nSegera ganti password setelah login.\n`);
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const fails=new Map();
const body=req=>new Promise((ok,no)=>{let n=0;const c=[];req.on('data',d=>{n+=d.length;if(n>1e6){no(new Err(413,'Data terlalu besar'));req.destroy()}else c.push(d)});req.on('end',()=>{try{ok(c.length?JSON.parse(Buffer.concat(c)):{})}catch(e){no(new Err(400,'JSON tidak valid'))}});req.on('error',no)});
const send=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...h});res.end(JSON.stringify(o))};
const cookie=(t,age)=>`sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${PROD?'; Secure':''}`;
const session=u=>cookie(sign({id:u.id,tv:u.tv,exp:Date.now()+7*864e5}),7*86400);
function auth(req){const m=/(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie||''),v=m&&verify(m[1]);if(!v)return null;const u=q1('SELECT * FROM users WHERE id=?',v.id);return u&&u.active&&u.tv===v.tv?u:null}
const pw8=v=>{if(String(v||'').length<8)throw new Err(400,'Password minimal 8 karakter');return String(v)};

http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://x'),P=url.pathname;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('Permissions-Policy','camera=(self), geolocation=(self)');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'");
 if(PROD)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
  if(P==='/healthz')return send(res,200,{ok:true});
  if(P.startsWith('/api/')){
   if(req.method!=='GET'&&!String(req.headers['content-type']||'').includes('application/json'))throw new Err(415,'Content-Type harus JSON');
   const b=req.method==='GET'?{}:await body(req),u=auth(req);
   if(P==='/api/login'&&req.method==='POST'){
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim(),un=String(b.username||'').trim().toLowerCase(),k=ip+'|'+un,f=fails.get(k);
    if(f&&f.n>=5&&f.until>Date.now())throw new Err(429,'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
    const r=q1('SELECT * FROM users WHERE username=?',un),ok=vp(String(b.password||''),r?r.pass:DUMMY);
    if(!r||!ok||!r.active){fails.set(k,{n:(f&&f.until>Date.now()?f.n:0)+1,until:Date.now()+9e5});throw new Err(401,'Username atau password salah')}
    fails.delete(k);return send(res,200,pub(r),{'Set-Cookie':session(r)});
   }
   if(!u)throw new Err(401,'Belum login');
   if(P==='/api/me'&&req.method==='GET')return send(res,200,pub(u));
   if(P==='/api/logout'&&req.method==='POST')return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
   if(P==='/api/me/password'&&req.method==='POST'){
    if(!vp(String(b.old||''),u.pass))throw new Err(400,'Password lama salah');
    run('UPDATE users SET pass=?,tv=tv+1 WHERE id=?',hp(pw8(b.new)),u.id);
    return send(res,200,{ok:true},{'Set-Cookie':session(q1('SELECT * FROM users WHERE id=?',u.id))});
   }
   if(P==='/api/d'||P==='/api/c'){
    const p=url.searchParams.get('path')||'';if(!/^[\w/.-]+$/.test(p)||p.includes('..'))throw new Err(400,'Path tidak valid');
    if(P==='/api/c')return send(res,200,readCol(u,p));
    if(req.method==='GET')return send(res,200,readDoc(u,p));
    if(req.method==='PUT'){writeDoc(u,p,b);return send(res,200,{ok:true})}
   }
   if(P==='/api/users'){adm(u);
    if(req.method==='GET')return send(res,200,qa('SELECT * FROM users ORDER BY name').map(pub));
    if(req.method==='POST'){
     const un=String(b.username||'').trim().toLowerCase(),nm=String(b.name||'').trim();
     if(!nm||!/^[a-z0-9._-]{3,30}$/.test(un))throw new Err(400,'Isi nama dan username (3–30 huruf/angka)');
     const pw=pw8(b.password);if(q1('SELECT 1 FROM users WHERE username=?',un))throw new Err(409,'Username sudah dipakai');
     const id=crypto.randomUUID();
     run('INSERT INTO users(id,username,name,div,nip,role,pass,created_at) VALUES(?,?,?,?,?,?,?,?)',id,un,nm.slice(0,60),String(b.div||'').slice(0,40),String(b.nip||'').slice(0,20),b.role==='admin'?'admin':'employee',hp(pw),new Date().toISOString());
     return send(res,201,{id});
    }
   }
   const m=/^\/api\/users\/([\w-]+)$/.exec(P);
   if(m&&req.method==='PATCH'){adm(u);
    const t=q1('SELECT * FROM users WHERE id=?',m[1]);if(!t)throw new Err(404,'Akun tidak ditemukan');
    if(t.id===u.id&&(b.active===false||(b.role&&b.role!=='admin')))throw new Err(400,'Tidak bisa menonaktifkan atau menurunkan akun sendiri');
    let pass=t.pass,tv=t.tv;if(b.password!=null){pass=hp(pw8(b.password));tv++}
    const act=b.active==null?t.active:(b.active?1:0);if(!act&&t.active)tv++;
    run('UPDATE users SET name=?,div=?,nip=?,role=?,active=?,pass=?,tv=? WHERE id=?',String(b.name??t.name).slice(0,60),String(b.div??t.div).slice(0,40),String(b.nip??t.nip).slice(0,20),b.role==='admin'?'admin':b.role==='employee'?'employee':t.role,act,pass,tv,t.id);
    return send(res,200,{ok:true});
   }
   throw new Err(404,'Endpoint tidak ditemukan');
  }
  if(P.startsWith('/uploads/')){ // foto hanya untuk pemilik atau admin
   const u=auth(req),m=/^\/uploads\/([\w-]+)\/(\d{4}-\d{2}-\d{2}-(?:in|out)\.jpg)$/.exec(P);
   const f=m&&path.join(UP,m[1],m[2]);
   if(!u||!m||(u.id!==m[1]&&u.role!=='admin')||!fs.existsSync(f)){res.writeHead(404);return res.end()}
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400'});return fs.createReadStream(f).pipe(res);
  }
  let f=path.normalize(path.join(PUB,P==='/'?'index.html':P));
  if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(PUB,'index.html');
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':f.endsWith('sw.js')?'no-cache':'public, max-age=300'});
  fs.createReadStream(f).pipe(res);
 }catch(e){const c=e instanceof Err?e.c:500;if(c===500)console.error(e);send(res,c,{error:c===500?'Kesalahan server':e.message})}
}).listen(PORT,()=>console.log('ShiftIn berjalan di http://localhost:'+PORT));
