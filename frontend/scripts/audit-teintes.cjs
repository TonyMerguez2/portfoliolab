/**
 * Audit des teintes de carte : la table de marques, confrontée aux logos réels.
 *
 *     cd frontend && node scripts/audit-teintes.cjs
 *
 * Prérequis : les logos téléchargés dans /tmp/hq (256 px) et la table extraite dans
 * /tmp/brand.json — voir l'en-tête de `couleurActif` pour la marche à suivre.
 *
 * ⚠️ **Il répond à une question qu'aucun test ne peut poser : « la couleur écrite ressemble-t-elle
 * au logo ? »** Un test vérifie une règle ; celui-ci vérifie des *données*, et les données d'une
 * table écrite à la main se périment en silence. Deux cartes l'ont montré — `ESE.PA`, un fonds
 * BNP à qui la table donnait le cyan d'Amundi, et `JPM`, en bleu pour une plaque brune.
 *
 * ⚠️ **Il distingue les logos partagés des logos uniques, et c'est tout son intérêt.** Vingt-cinq
 * actifs du catalogue portent le logo de leur émetteur — sept ETF sectoriels SPDR, douze iShares,
 * quatre Vanguard, deux BNP. Pour eux la plaque ne dit que la maison : c'est la table qui
 * distingue l'or de `GLD` de l'énergie de `XLE`, et il ne faut surtout pas la corriger. Ce sont
 * les logos **uniques** dont la plaque contredit la table qui signalent une entrée fausse.
 *
 * ⚠️ **Le contrôle de contraste porte sur la teinte brute et ne veut donc rien dire.** La teinte
 * ne devient jamais le fond d'un texte : `tileSurface` ne l'emploie qu'en lavis à 34 % au plus,
 * sur une base sombre. Mesuré sur la carte NVDA, le fond composé vaut `#020a18` et le texte blanc
 * y contraste à **19,8:1** quand ce script annonçait 1,34. Il est gardé pour mémoire, pas pour
 * décider.
 */

const sharp=require('sharp'), fs=require('fs'), crypto=require('crypto');
const map=require('/tmp/brand.json');
const tous=fs.readFileSync('/tmp/tous.txt','utf8').trim().split('\n');
const nomFichier=t=>t.replace(/[^A-Za-z0-9.^-]/g,'_')+'.png';
const h2r=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const r2h=p=>'#'+p.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');

// --- répliques fidèles de lib/couleur.ts ---
function rvbVersTsl([r,g,b]){const R=r/255,V=g/255,B=b/255,max=Math.max(R,V,B),min=Math.min(R,V,B);
  const l=(max+min)/2,d=max-min; if(d===0) return [0,0,l];
  const s=l>0.5?d/(2-max-min):d/(max+min); let h;
  if(max===R)h=((V-B)/d+(V<B?6:0))/6; else if(max===V)h=((B-R)/d+2)/6; else h=((R-V)/d+4)/6;
  return [h,s,l];}
function tslVersRvb([h,s,l]){ if(s===0){const v=l*255;return [v,v,v];}
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const c=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return [c(h+1/3)*255,c(h)*255,c(h-1/3)*255];}
function pourFondSombre(hex){const [h,s,l]=rvbVersTsl(h2r(hex));
  if(s<0.08) return r2h(tslVersRvb([h,s,Math.max(0.52,Math.min(0.72,l))]));
  return r2h(tslVersRvb([h,Math.max(0.45,Math.min(0.92,s)),Math.max(0.52,Math.min(0.72,l))]));}
const lum=hex=>{const v=h2r(hex).map(x=>x/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const ct=(a,b)=>{const l=[lum(a),lum(b)].sort((p,q)=>q-p);return (l[0]+.05)/(l[1]+.05);};
const teinteDeg=hex=>{const [h,s]=rvbVersTsl(h2r(hex)); return s<0.08?null:h*360;};

// --- répliques fidèles de AssetLogo ---
function plaqueDuLogo(data,S){const px=(x,y)=>{const i=(y*S+x)*4;return [data[i],data[i+1],data[i+2],data[i+3]];};
  const coins=[px(0,0),px(S-1,0),px(0,S-1),px(S-1,S-1)];
  if(coins.some(p=>p[3]<250)) return null;
  const ec=Math.max(...[0,1,2].map(k=>Math.max(...coins.map(p=>p[k]))-Math.min(...coins.map(p=>p[k]))));
  if(ec>48) return null;
  const moy=[0,1,2].map(k=>Math.round(coins.reduce((s,p)=>s+p[k],0)/4));
  const max=Math.max(...moy),min=Math.min(...moy);
  const clarte=(max+min)/2/255, sat=max===0?0:(max-min)/max;
  if(sat<0.15||clarte<0.10||clarte>0.88) return null;
  return r2h(moy);}
function dominante(data){const seaux=new Map();
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
    if(a<50)continue; const br=(r+g+b)/3; if(br>220||br<15)continue;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,sat=max===0?0:d/max;
    if(sat<0.15)continue; let h=0;
    if(d!==0){if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;}
    const k=Math.floor(h*24),e=seaux.get(k);
    if(!e)seaux.set(k,{n:1,r,g,b,sat});else{e.n++;if(sat>e.sat){e.r=r;e.g=g;e.b=b;e.sat=sat;}}}
  if(!seaux.size)return null; let best=null,sc=-1;
  seaux.forEach(v=>{const p=v.n*(0.35+v.sat);if(p>sc){sc=p;best=v;}});
  return r2h([best.r,best.g,best.b]);}
function hachage(t){let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}h>>>=0;
  return r2h([100+(h&0x7F),100+((h>>8)&0x7F),140+((h>>16)&0x5F)]);}

(async()=>{
  const res=[], parLogo=new Map();
  for(const t of tous){
    const f='/tmp/hq/'+nomFichier(t);
    let plaque=null, dom=null, empreinte=null;
    if(fs.existsSync(f)){
      empreinte=crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0,10);
      const S=64;
      const {data}=await sharp(f).resize(S,S,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      plaque=plaqueDuLogo(data,S);
      const {data:d32}=await sharp(f).resize(32,32,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      dom=dominante(d32); if(dom) dom=pourFondSombre(dom);
    }
    const marque=map[t]||null;
    let branche, brut;
    if(marque){branche='table';brut=marque;}
    else if(plaque){branche='plaque';brut=plaque;}
    else if(dom){branche='dominante';brut=dom;}
    else {branche='hachage';brut=hachage(t);}
    const final=pourFondSombre(brut);
    const avant=pourFondSombre(marque||dom||hachage(t)); // ancienne règle : table d'abord
    res.push({t,branche,final,avant,plaque,marque,dom,empreinte,logo:!!empreinte});
    if(empreinte){ if(!parLogo.has(empreinte))parLogo.set(empreinte,[]); parLogo.get(empreinte).push({t,final}); }
  }
  fs.writeFileSync('/tmp/audit.json', JSON.stringify(res));
  const par=b=>res.filter(r=>r.branche===b).length;
  console.log('=== D\'OÙ VIENT LA COULEUR ===');
  console.log('  plaque du logo :', par('plaque'), '| table de marques :', par('table'), '| dominante :', par('dominante'), '| hachage :', par('hachage'));
  console.log('  sans logo :', res.filter(r=>!r.logo).length, '/', res.length);
  const chg=res.filter(r=>r.final!==r.avant);
  console.log('\n=== CARTES QUI CHANGENT DE COULEUR ===', chg.length);
  for(const c of chg) console.log('  '+c.t.padEnd(10), c.avant, '→', c.final, '('+c.branche+')');
  console.log('\n=== MÊME LOGO, COULEURS DIFFÉRENTES (le défaut signalé) ===');
  let ko=0;
  parLogo.forEach(v=>{ if(v.length<2) return; const u=[...new Set(v.map(x=>x.final))];
    if(u.length>1){ko++;console.log('  ⚠ '+v.map(x=>x.t+'='+x.final).join('  '));}});
  if(!ko) console.log('  aucun ✓');
  console.log('\n=== LISIBILITÉ (contraste du texte blanc sur la carte) ===');
  const pires=res.map(r=>({t:r.t,c:+ct(r.final,'#ffffff').toFixed(2)})).sort((a,b)=>a.c-b.c).slice(0,5);
  console.log('  cinq pires :', pires.map(p=>p.t+' '+p.c).join(', '));
  console.log('  toutes ≥ 2:1 ?', res.every(r=>ct(r.final,'#ffffff')>=2));
})();
