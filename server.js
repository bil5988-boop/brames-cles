'use strict';
// Serveur "Contrôles VGP" : aucune dépendance (Node 18+). Rôles imposés côté serveur.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,SECURE=process.env.SECURE==='1';
const DIR=path.join(__dirname,'data'),PUB=path.join(__dirname,'public'),PH=path.join(DIR,'photos'),DBF=path.join(DIR,'db.json');
fs.mkdirSync(PH,{recursive:true});
const ROLE={controleur:1,gestionnaire:2,admin:3},RES=['conforme','non-conforme','non-vu'];
// Droits modulables : chaque utilisateur a par défaut les droits de son rôle ; l'admin peut les personnaliser (u.perms).
const PERMS=['ctl.create','ctl.edit','ctl.delete','item.edit','item.add','item.delete'];
const DEFP={controleur:['ctl.create'],gestionnaire:PERMS.slice(),admin:PERMS.slice()};
const RDEF={controleur:'Contrôle',gestionnaire:'Gestionnaire',admin:'Admin'};
const PN={'ctl.create':'Faire des contrôles','ctl.edit':'Modifier les contrôles','ctl.delete':'Supprimer les contrôles','item.edit':'Modifier les fiches matériel','item.add':'Ajouter des matériels','item.delete':'Supprimer des matériels'};
const RL={conforme:'Conforme','non-conforme':'Non conforme','non-vu':'Non vu'};
const rname=r=>(db.roles[r]&&db.roles[r].n)||RDEF[r];
const rperms=r=>r==='admin'?PERMS.slice():(db.roles[r]&&Array.isArray(db.roles[r].perms)?db.roles[r].perms.filter(k=>PERMS.includes(k)):DEFP[r]);
const perms=u=>u.role==='admin'?PERMS.slice():(Array.isArray(u.perms)?u.perms.filter(k=>PERMS.includes(k)):rperms(u.role));
const rolesOut=()=>Object.fromEntries(Object.keys(ROLE).map(r=>[r,{n:rname(r),perms:rperms(r)}]));
const err=(c,m)=>Object.assign(new Error(m),{c});
let db=fs.existsSync(DBF)?JSON.parse(fs.readFileSync(DBF,'utf8')):{users:[],items:JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8')),controls:[]};
const save=()=>{fs.writeFileSync(DBF+'.tmp',JSON.stringify(db));fs.renameSync(DBF+'.tmp',DBF)};
db.seq=db.seq||{};
const nextNum=y=>{const n=(db.seq[y]||0)+1;db.seq[y]=n;return 'CR-'+y+'-'+String(n).padStart(9,'0')};
(function migrate(){
  db.roles=db.roles||{};db.log=db.log||[];
  for(const i of db.items){i.p=i.p||'';i.pc=i.pc||[]}
  for(const c of db.controls){
    if(!c.main){const p=c.photos||[];c.main=p.slice(0,1);c.comp=p.slice(1,5);c.anom=[];c.old=p.slice(5);delete c.photos}
    const m=/^CR-(\d{4})-(\d+)$/.exec(c.num||'');if(m)db.seq[m[1]]=Math.max(db.seq[m[1]]||0,+m[2])}
  db.controls.filter(c=>!c.num).sort((a,b)=>(a.at||a.date||'').localeCompare(b.at||b.date||''))
    .forEach(c=>{const y=(c.at||c.date||'').slice(0,4);c.num=nextNum(/^\d{4}$/.test(y)?y:new Date().getFullYear())});
  if(!db.log.length){const E=[];
    for(const c of db.controls){if(c.by&&c.at)E.push({t:c.at,u:c.by.u,n:c.by.n,a:'ctl.create',r:c.ref,no:c.num,x:'Résultat : '+RL[c.res]+' (historique reconstitué)'});
      if(c.upd&&c.upd.at)E.push({t:c.upd.at,u:c.upd.u,n:c.upd.n,a:'ctl.edit',r:c.ref,no:c.num,x:'Dernière modification (historique reconstitué)'});
      if(c.del&&c.del.at)E.push({t:c.del.at,u:c.del.u,n:c.del.n,a:'ctl.delreq',r:c.ref,no:c.num,x:c.del.m||''})}
    for(const i of db.items)if(i.upd&&i.upd.at)E.push({t:i.upd.at,u:i.upd.u,n:i.upd.n,a:'item.edit',r:i.r,x:'Dernière modification (historique reconstitué)'});
    db.log=E.sort((a,b)=>a.t.localeCompare(b.t))}
  save();
})();
const hash=(pw,s=crypto.randomBytes(16).toString('hex'))=>s+':'+crypto.scryptSync(pw,s,64).toString('hex');
const DUMMY=hash('x');
const check=(pw,h)=>{const [s,k]=h.split(':'),a=Buffer.from(k,'hex'),b=crypto.scryptSync(pw,s,64);return crypto.timingSafeEqual(a,b)};
if(!db.users.length){const pw=crypto.randomBytes(9).toString('base64url');db.users.push({u:'admin',n:'Administrateur',role:'admin',active:true,h:hash(pw),must:true});save();
  console.log('\n=== Premier démarrage ===\nCompte : admin\nMot de passe provisoire : '+pw+'\n(à changer à la première connexion)\n')}
const pub=u=>({u:u.u,n:u.n,role:u.role,rn:rname(u.role),active:u.active,must:!!u.must,perms:perms(u),custom:u.role!=='admin'&&Array.isArray(u.perms)});
const S=new Map(),F=new Map(),TTL=12*3600e3;
const sess=req=>{const m=/(?:^|; )sid=([a-f0-9]{64})/.exec(req.headers.cookie||''),s=m&&S.get(m[1]);
  if(!s||s.exp<Date.now()){m&&S.delete(m[1]);return null}
  const u=db.users.find(x=>x.u===s.u&&x.active);if(!u)return null;s.exp=Date.now()+TTL;return {u,tok:m[1]}};
const drop=(name,keep)=>{for(const [k,v] of S)if(v.u===name&&k!==keep)S.delete(k)};
const SEC={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const send=(res,c,b,h={})=>{const buf=Buffer.isBuffer(b);res.writeHead(c,{'Content-Type':buf?'application/octet-stream':'application/json; charset=utf-8','Cache-Control':'no-store',...SEC,...h});res.end(buf?b:JSON.stringify(b))};
const body=req=>new Promise((ok,ko)=>{let n=0;const a=[];req.on('data',c=>{n+=c.length;if(n>40e6){ko(err(413,'Envoi trop volumineux'));req.destroy()}else a.push(c)});
  req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(a).toString()||'{}'))}catch(e){ko(err(400,'JSON invalide'))}})});
const str=(v,n)=>String(v==null?'':v).trim().slice(0,n);
// Journal d'audit (visible des seuls admins) : qui, quand, quoi
const logE=(me,a,o={})=>{db.log.push({t:new Date().toISOString(),u:me.u,n:me.n,a,...o});if(db.log.length>20000)db.log.splice(0,db.log.length-20000)};
const FL={t:'Type',g:'Catégorie',d:'Désignation',m:'Masse',l:'Localisation',s:'Stockage',rc:'Repère'};
const V=v=>v===''||v==null?'—':v;
const diffItem=(o,n)=>[...Object.keys(FL).filter(k=>String(o[k]==null?'':o[k])!==String(n[k]==null?'':n[k])).map(k=>FL[k]+' : '+V(o[k])+' → '+V(n[k])),
  ...((o.p||'')!==(n.p||'')||JSON.stringify(o.pc||[])!==JSON.stringify(n.pc||[])?['Photos de la fiche modifiées']:[])];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function photos(list){const out=[];for(const p of list){
  if(/^[a-f0-9]{24}\.jpg$/.test(p)&&fs.existsSync(path.join(PH,p))){out.push(p);continue}
  const m=/^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(p);if(!m)throw err(400,'Photo invalide');
  const b=Buffer.from(m[1],'base64');if(b.length>6e6||b[0]!==0xff||b[1]!==0xd8)throw err(400,'Photo invalide (JPEG requis)');
  const n=crypto.randomBytes(12).toString('hex')+'.jpg';fs.writeFileSync(path.join(PH,n),b);out.push(n)}return out}
function ctl(b){if(!db.items.some(x=>x.r===b.ref))throw err(400,'Matériel inconnu');
  if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(b.date))throw err(400,'Date invalide');
  if(!RES.includes(b.res))throw err(400,'Résultat invalide');
  const L=(a,n,lab)=>{a=Array.isArray(a)?a:[];if(a.length>n)throw err(400,lab+' : '+n+' maximum');return a};
  const main=L(b.main,1,'Photo principale'),comp=L(b.comp,4,'Photos complémentaires'),anom=L(b.anom,4,'Photos d’anomalies');
  if(b.res!=='non-vu'&&!main.length)throw err(400,'Une photo principale est obligatoire pour ce résultat');
  if(b.res==='non-conforme'&&!anom.length)throw err(400,'Au moins une photo d’anomalie est obligatoire pour un contrôle non conforme');
  return {ref:b.ref,date:b.date,res:b.res,com:str(b.com,4000),main,comp,anom,replMain:!!b.replMain,replComp:!!b.replComp}}
// enregistre les photos du contrôle ; alimente la fiche matériel (si vide, ou si remplacement demandé)
function apply(c,v){const it=db.items.find(x=>x.r===v.ref);
  const main=photos(v.main),comp=photos(v.comp),anom=photos(v.anom);
  Object.assign(c,{ref:v.ref,date:v.date,res:v.res,com:v.com,main,comp,anom});
  if(c.main.length&&(!it.p||v.replMain))it.p=c.main[0];
  if(c.comp.length&&(!it.pc.length||v.replComp))it.pc=[...c.comp]}
function item(b,r,y,o){const m=b.m===''||b.m==null?'':Number(b.m);if(m!==''&&!Number.isFinite(m))throw err(400,'Masse invalide');
  return {r,t:str(b.t,20).toUpperCase(),d:str(b.d,300),m,l:str(b.l,60).toUpperCase(),s:str(b.s,100),y:y||['','','','',''],g:b.g==='cle'?'cle':'charge',p:ip(b,o),pc:ipc(b,o)}}
const ip=(b,o)=>b.p===undefined?(o?o.p||'':''):(b.p?photos([b.p])[0]:'');
const ipc=(b,o)=>{if(b.pc===undefined)return o?o.pc||[]:[];if(!Array.isArray(b.pc)||b.pc.length>4)throw err(400,'4 photos complémentaires maximum');return photos(b.pc)};
const cleanup=()=>{const used=new Set([...db.controls.flatMap(c=>[...c.main,...c.comp,...c.anom,...(c.old||[])]),...db.items.flatMap(i=>[i.p,...(i.pc||[])])]);for(const f of fs.readdirSync(PH))if(!used.has(f))try{fs.unlinkSync(path.join(PH,f))}catch(e){}};
const DEF={org1:'CNPE de Gravelines',org2:'Direction de la Production Nucléaire',org3:'Rue de la Digue Level',org4:'59820 GRAVELINES',
  issuer:'LNU - Maintenance ponts',title:'RAPPORT DE VÉRIFICATION',subtitle:'Contrôle des charges d’essai et des clés de levage',
  okText:'Le matériel est **CONFORME** aux exigences en vigueur et peut rester à la disposition des utilisateurs.',
  koText:'Le matériel est **NON CONFORME** aux exigences en vigueur et ne doit pas être mis à disposition des utilisateurs.',
  footer:'Rapport généré automatiquement par l’application Contrôles VGP',footer2:'CNPE de Gravelines',
  colorBanner:'#0b3d7d',colorOk:'#1a7f45',colorKo:'#e8710a'};
const cfg=()=>({...DEF,...(db.settings||{})});
const LOGO=path.join(DIR,'logo.png');
function sync(old,u){const f=o=>{if(o&&o.u===old){o.u=u.u;o.n=u.n}};
  for(const c of db.controls){f(c.by);f(c.upd);f(c.del)}for(const i of db.items)f(i.upd);for(const e of db.log)f(e)}
const admins=()=>db.users.filter(u=>u.role==='admin'&&u.active);
const STAT={'/':['index.html','text/html; charset=utf-8'],'/jspdf.umd.min.js':['jspdf.umd.min.js','text/javascript'],'/logo.png':['logo.png','image/png']};
http.createServer(async(req,res)=>{try{
  const p=new URL(req.url,'http://x').pathname,M=req.method;
  if(!p.startsWith('/api/')){const s=STAT[p];const f=p==='/logo.png'&&fs.existsSync(LOGO)?LOGO:s&&path.join(PUB,s[0]);
    if(M!=='GET'||!s||!fs.existsSync(f))return send(res,404,{e:'Introuvable'});
    return send(res,200,fs.readFileSync(f),{'Content-Type':s[1]})}
  if(M!=='GET'&&req.headers['x-csrf']!=='1')throw err(403,'Requête refusée');
  if(p==='/api/login'&&M==='POST'){const b=await body(req),name=str(b.u,40).toLowerCase(),key=name+'|'+req.socket.remoteAddress,f=F.get(key);
    if(f&&f.n>=5&&f.t>Date.now())throw err(429,'Trop d’essais : réessayez dans quelques minutes');
    const u=db.users.find(x=>x.u===name),ok=check(String(b.p||''),u?u.h:DUMMY)&&u&&u.active;
    if(!ok){const g=F.get(key)||{n:0};g.n++;g.t=Date.now()+10*60e3;F.set(key,g);throw err(401,'Identifiant ou mot de passe incorrect')}
    F.delete(key);const tok=crypto.randomBytes(32).toString('hex');S.set(tok,{u:u.u,exp:Date.now()+TTL});
    return send(res,200,pub(u),{'Set-Cookie':`sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SECURE?'; Secure':''}`})}
  const s=sess(req);if(!s)throw err(401,'Non connecté');
  const me=s.u,L=ROLE[me.role],need=n=>{if(L<n)throw err(403,'Droits insuffisants')},can=k=>{if(!perms(me).includes(k))throw err(403,'Droit insuffisant pour cette action')};
  if(me.must&&!['/api/password','/api/me','/api/logout'].includes(p))throw err(403,'Changement de mot de passe requis');
  if(p==='/api/me')return send(res,200,pub(me));
  if(p==='/api/logout'&&M==='POST'){S.delete(s.tok);return send(res,200,{ok:1},{'Set-Cookie':'sid=; Max-Age=0; Path=/'})}
  if(p==='/api/password'&&M==='POST'){const b=await body(req);
    if(!check(String(b.old||''),me.h))throw err(400,'Mot de passe actuel incorrect');
    if(String(b.new||'').length<10||b.new===b.old)throw err(400,'Nouveau mot de passe : 10 caractères minimum, différent de l’ancien');
    me.h=hash(b.new);me.must=false;save();drop(me.u,s.tok);return send(res,200,{ok:1})}
  if(p==='/api/settings'&&M==='PUT'){need(3);const b=await body(req);
    if(b.reset){db.settings={};try{fs.unlinkSync(LOGO)}catch(e){}logE(me,'settings.pdf',{x:'Trame PDF rétablie par défaut'});save();return send(res,200,cfg())}
    const n={...(db.settings||{})};
    for(const k of Object.keys(DEF)){if(b[k]===undefined)continue;
      if(k.startsWith('color')){if(!/^#[0-9a-fA-F]{6}$/.test(b[k]))throw err(400,'Couleur invalide');n[k]=b[k]}
      else n[k]=str(b[k],k.endsWith('Text')?400:120)}
    if(b.logo){const mm=/^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/.exec(b.logo);if(!mm)throw err(400,'Logo invalide (PNG requis)');
      const buf=Buffer.from(mm[1],'base64');if(buf.length>2e6||buf[0]!==0x89||buf[1]!==0x50)throw err(400,'Logo invalide (PNG de 2 Mo maximum)');
      fs.writeFileSync(LOGO,buf)}
    else if(b.resetLogo){try{fs.unlinkSync(LOGO)}catch(e){}}
    {const ch=Object.keys(DEF).filter(k=>(n[k]??DEF[k])!==cfg()[k]);if(b.logo)ch.push('logo');else if(b.resetLogo)ch.push('logo par défaut');if(ch.length)logE(me,'settings.pdf',{x:'Trame PDF modifiée : '+ch.join(', ')})}
    db.settings=n;save();return send(res,200,cfg())}
  if(p==='/api/data')return send(res,200,{me:pub(me),items:db.items,controls:db.controls,settings:cfg(),roles:rolesOut()});
  if(p==='/api/log'&&M==='GET'){need(3);const q=new URL(req.url,'http://x').searchParams,ref=q.get('ref'),lim=Math.min(+q.get('limit')||500,2000),L=[];
    for(let i=db.log.length-1;i>=0&&L.length<lim;i--){const e=db.log[i];if(!ref||e.r===ref)L.push(e)}return send(res,200,L)}
  if(p==='/api/roles'&&M==='PUT'){need(3);const b=await body(req);
    if(b.reset){db.roles={};logE(me,'role.edit',{x:'Noms et droits des catégories rétablis par défaut'});save();return send(res,200,rolesOut())}
    const r=b.role;if(!ROLE[r])throw err(400,'Catégorie inconnue');
    const nr={...(db.roles[r]||{})},ch=[];
    if(b.n!==undefined){const n=str(b.n,30);if(n.length<2)throw err(400,'Nom : 2 caractères minimum');
      if(Object.keys(ROLE).some(k=>k!==r&&rname(k).toLowerCase()===n.toLowerCase()))throw err(409,'Ce nom est déjà utilisé par une autre catégorie');
      if(n!==rname(r)){ch.push('Nom : '+rname(r)+' → '+n);nr.n=n}}
    if(b.perms!==undefined&&r!=='admin'){
      if(b.perms===null){if(nr.perms){delete nr.perms;ch.push('Droits rétablis par défaut')}}
      else{if(!Array.isArray(b.perms)||b.perms.some(k=>!PERMS.includes(k)))throw err(400,'Droits invalides');
        const o=rperms(r),np=[...new Set(b.perms)],add=np.filter(k=>!o.includes(k)),rm=o.filter(k=>!np.includes(k));
        if(add.length||rm.length){nr.perms=np;ch.push([add.length?'Accordés : '+add.map(k=>PN[k]).join(', '):'',rm.length?'Retirés : '+rm.map(k=>PN[k]).join(', '):''].filter(Boolean).join(' ; '))}}}
    if(ch.length){db.roles[r]=nr;logE(me,'role.edit',{x:'['+rname(r)+'] '+ch.join(' · ')});save()}
    return send(res,200,rolesOut())}
  let m;
  if((m=/^\/api\/photo\/([a-f0-9]{24}\.jpg)$/.exec(p))&&M==='GET'){const f=path.join(PH,m[1]);if(!fs.existsSync(f))throw err(404,'Introuvable');
    return send(res,200,fs.readFileSync(f),{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400'})}
  if(p==='/api/controls'&&M==='POST'){can('ctl.create');const b=await body(req),v=ctl(b);
    const c={id:crypto.randomBytes(8).toString('hex'),num:nextNum(new Date().getFullYear()),by:{u:me.u,n:me.n},at:new Date().toISOString()};
    apply(c,v);db.controls.unshift(c);logE(me,'ctl.create',{r:c.ref,no:c.num,x:'Résultat : '+RL[c.res]});save();return send(res,200,{c,it:db.items.find(x=>x.r===c.ref)})}
  if((m=/^\/api\/controls\/([a-f0-9]{16})\/delreq$/.exec(p))){const c=db.controls.find(x=>x.id===m[1]);if(!c)throw err(404,'Contrôle introuvable');
    if(M==='POST'){if(c.del)throw err(409,'Une demande de suppression est déjà en cours');const b=await body(req);
      c.del={u:me.u,n:me.n,at:new Date().toISOString(),m:str(b.m,300)};logE(me,'ctl.delreq',{r:c.ref,no:c.num,x:c.del.m});save();return send(res,200,c)}
    if(M==='DELETE'){if(!c.del)throw err(404,'Aucune demande en cours');if(!perms(me).includes('ctl.delete')&&c.del.u!==me.u)throw err(403,'Droits insuffisants');const own=c.del.u===me.u;delete c.del;logE(me,'ctl.delreq.cancel',{r:c.ref,no:c.num,x:own?'Demande annulée par son auteur':'Demande refusée'});save();return send(res,200,c)}}
  if((m=/^\/api\/controls\/([a-f0-9]{16})$/.exec(p))){const c=db.controls.find(x=>x.id===m[1]);if(!c)throw err(404,'Contrôle introuvable');
    if(M==='PUT'){can('ctl.edit');const v=ctl(await body(req)),o=JSON.parse(JSON.stringify(c));apply(c,v);c.upd={u:me.u,n:me.n,at:new Date().toISOString()};
      const ch=[];if(o.res!==c.res)ch.push('Résultat : '+RL[o.res]+' → '+RL[c.res]);if(o.date!==c.date)ch.push('Date : '+o.date+' → '+c.date);if(o.com!==c.com)ch.push('Commentaire modifié');
      if(!same([o.main,o.comp,o.anom],[c.main,c.comp,c.anom]))ch.push('Photos modifiées');logE(me,'ctl.edit',{r:c.ref,no:c.num,x:ch.join(' · ')||'Aucun changement visible'});save();cleanup();return send(res,200,{c,it:db.items.find(x=>x.r===c.ref)})}
    if(M==='DELETE'){can('ctl.delete');db.controls=db.controls.filter(x=>x!==c);logE(me,'ctl.delete',{r:c.ref,no:c.num,x:'Résultat : '+RL[c.res]+' · contrôle du '+c.date});save();cleanup();return send(res,200,{ok:1})}}
  if(p==='/api/items'&&M==='POST'){can('item.add');const b=await body(req),r=str(b.r,40);
    if(!/^[A-Za-z0-9._-]{2,40}$/.test(r))throw err(400,'N° de composant invalide');
    if(db.items.some(x=>x.r===r))throw err(409,'Ce n° de composant existe déjà');
    const it=item(b,r);db.items.push(it);logE(me,'item.add',{r,x:it.d});save();cleanup();return send(res,200,it)}
  if((m=/^\/api\/items\/([^/]+)$/.exec(p))){const r=decodeURIComponent(m[1]),i=db.items.findIndex(x=>x.r===r);if(i<0)throw err(404,'Matériel introuvable');
    if(M==='PUT'){can('item.edit');const old=db.items[i],it=item(await body(req),r,old.y,old);it.upd={u:me.u,n:me.n,at:new Date().toISOString()};db.items[i]=it;logE(me,'item.edit',{r,x:diffItem(old,it).join(' · ')||'Aucun changement visible'});save();cleanup();return send(res,200,it)}
    if(M==='DELETE'){can('item.delete');if(db.controls.some(c=>c.ref===r))throw err(409,'Suppression impossible : des contrôles sont enregistrés pour ce matériel');logE(me,'item.delete',{r,x:db.items[i].d});db.items.splice(i,1);save();return send(res,200,{ok:1})}}
  if(p==='/api/users'){need(3);
    if(M==='GET')return send(res,200,db.users.map(pub));
    if(M==='POST'){const b=await body(req),u=str(b.u,30).toLowerCase();
      if(!/^[a-z0-9._-]{3,30}$/.test(u))throw err(400,'Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)');
      if(db.users.some(x=>x.u===u))throw err(409,'Identifiant déjà utilisé');
      if(!ROLE[b.role])throw err(400,'Rôle invalide');if(String(b.p||'').length<10)throw err(400,'Mot de passe provisoire : 10 caractères minimum');
      const n={u,n:str(b.n,60)||u,role:b.role,active:true,h:hash(String(b.p)),must:true};db.users.push(n);logE(me,'user.create',{tu:u,x:n.n+' · catégorie '+rname(n.role)});save();return send(res,200,pub(n))}}
  if((m=/^\/api\/users\/([a-z0-9._-]+)$/.exec(p))){need(3);const u=db.users.find(x=>x.u===m[1]);if(!u)throw err(404,'Utilisateur introuvable');
    const last=()=>u.role==='admin'&&u.active&&admins().length<2;
    if(M==='PUT'){const b=await body(req),o0={n:u.n,u:u.u,role:u.role,active:u.active,perms:perms(u),custom:Array.isArray(u.perms)};
      let nu=null;if(b.u!==undefined){nu=str(b.u,30).toLowerCase();if(nu===u.u)nu=null;else{
        if(!/^[a-z0-9._-]{3,30}$/.test(nu))throw err(400,'Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)');
        if(db.users.some(x=>x.u===nu))throw err(409,'Identifiant déjà utilisé')}}
      if(b.role!==undefined){if(!ROLE[b.role])throw err(400,'Rôle invalide');if(b.role!==u.role&&last())throw err(400,'Il doit rester au moins un admin actif');if(b.role!==u.role)delete u.perms;u.role=b.role}
      if(b.perms!==undefined){if(b.perms===null)delete u.perms;else{if(!Array.isArray(b.perms)||b.perms.some(k=>!PERMS.includes(k)))throw err(400,'Droits invalides');u.perms=[...new Set(b.perms)]}}
      if(b.active!==undefined){if(!b.active&&last())throw err(400,'Il doit rester au moins un admin actif');u.active=!!b.active;if(!u.active)drop(u.u)}
      const old=u.u;if(nu){u.u=nu;for(const x of S.values())if(x.u===old)x.u=nu}
      if(b.n!==undefined)u.n=str(b.n,60)||u.u;
      if(nu||b.n!==undefined)sync(old,u);
      if(b.p){if(String(b.p).length<10)throw err(400,'Mot de passe provisoire : 10 caractères minimum');u.h=hash(String(b.p));u.must=true;drop(u.u)}
      {const ch=[];if(u.u!==o0.u)ch.push('Identifiant : '+o0.u+' → '+u.u);if(u.n!==o0.n)ch.push('Nom : '+o0.n+' → '+u.n);
        if(u.role!==o0.role)ch.push('Catégorie : '+rname(o0.role)+' → '+rname(u.role));if(u.active!==o0.active)ch.push(u.active?'Compte réactivé':'Compte désactivé');
        const np=perms(u),add=np.filter(k=>!o0.perms.includes(k)),rm=o0.perms.filter(k=>!np.includes(k));
        if(u.role===o0.role&&(add.length||rm.length||o0.custom!==Array.isArray(u.perms)))ch.push(Array.isArray(u.perms)?'Droits personnalisés'+(add.length?' · accordés : '+add.map(k=>PN[k]).join(', '):'')+(rm.length?' · retirés : '+rm.map(k=>PN[k]).join(', '):''):'Droits remis à ceux de la catégorie');
        if(b.p)ch.push('Mot de passe provisoire redéfini');
        if(ch.length)logE(me,'user.edit',{tu:u.u,x:ch.join(' · ')})}
      save();return send(res,200,pub(u))}
    if(M==='DELETE'){if(u===me)throw err(400,'Vous ne pouvez pas supprimer votre propre compte');if(last())throw err(400,'Il doit rester au moins un admin actif');
      logE(me,'user.delete',{tu:u.u,x:u.n});db.users=db.users.filter(x=>x!==u);drop(u.u);save();return send(res,200,{ok:1})}}
  throw err(404,'Introuvable');
}catch(e){send(res,e.c||500,{e:e.c?e.message:'Erreur serveur'});if(!e.c)console.error(e)}}).listen(PORT,()=>console.log('Contrôles VGP : http://localhost:'+PORT));
