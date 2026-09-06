/**
 * Audit des logos : couverture, chaîne de repli, résolution servie.
 *
 *     cd frontend && node scripts/audit-logos.cjs
 *
 * Il rejoue exactement `resolveUrls` d'`AssetLogo` — mêmes sources, même ordre — et dit, pour
 * chaque actif du catalogue, si un logo arrive, par quelle source, et à quelle taille.
 *
 * ⚠️ **Il répond à la question que l'œil ne peut pas poser sur cent cinquante-huit actifs.**
 * On ne remarque un logo manquant que sur la carte qu'on regarde ; ici on les compte tous. Relevé
 * au premier passage : **148 sur 158**, les dix absents étant tous des indices — ils n'ont pas de
 * marque, et la carte affiche leurs initiales, ce qui est la bonne réponse.
 *
 * ⚠️ **Il vérifie aussi la résolution, qui était le vrai défaut.** Parqet répond en 100 × 100 si
 * on ne lui demande rien, alors que la carte d'en-tête affiche à 60 px — donc 120 pixels
 * physiques en densité double. Le paramètre `size` corrige cela ; ce script est ce qui permet de
 * constater qu'aucun actif n'est resté en dessous de 128.
 */

const items=require('/tmp/items.json');
const CMC={btc:1,eth:1027,bnb:1839,sol:5426,xrp:52,doge:74,ada:2010,avax:5805,dot:6636,shib:5994,matic:3890,pol:3890,link:1975,uni:7083,ltc:2,atom:3794,trx:1958,etc:1321,xlm:512,fil:2280,hbar:4642,apt:21794,arb:11841,op:11840,sui:20947,pepe:24478,wif:28752,inj:7226,sei:23149,jup:29210,near:6535,vet:3077,mkr:1518,aave:7278,sand:6210,mana:1966,crv:6538,comp:5692,snx:2586,ens:13855,imx:10603,rune:4157,ftm:3513,s:3513,algo:4030,icp:8916,qnt:3155,eos:1765,flow:4558,ksm:5034,xmr:328,zec:1437,bch:1831,ton:11419,wld:13502,stx:4847,floki:10804,bonk:23095,render:5690,fet:3773,grt:6719,ldo:8000};
const sym=t=>t.replace(/-USD$/,'').replace(/[0-9]+$/,'').toLowerCase();
function urls(t,type){
  const crypto = type==='CRYPTOCURRENCY' || t.endsWith('-USD');
  if(crypto){ const s=sym(t), id=CMC[s], u=[];
    if(id) u.push(`https://s2.coinmarketcap.com/static/img/coins/128x128/${id}.png`);
    u.push(`https://assets.coincap.io/assets/icons/${s}@2x.png`);
    u.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/128/color/${s}.png`);
    return u; }
  const clean=t.replace(/\.[A-Z]{1,3}$/,'').replace(/^\^/,'');
  const u=[`https://assets.parqet.com/logos/symbol/${encodeURIComponent(t)}?format=png&size=256`,
           `https://financialmodelingprep.com/image-stock/${t}.png`];
  if(clean!==t) u.push(`https://financialmodelingprep.com/image-stock/${clean}.png`);
  return u;
}
(async()=>{
  const res=[];
  for(const it of items){
    const liste=urls(it.t,it.type);
    let ok=null, idx=-1, taille=null;
    for(let i=0;i<liste.length;i++){
      try{
        const r=await fetch(liste[i],{signal:AbortSignal.timeout(9000)});
        if(!r.ok) continue;
        const buf=Buffer.from(await r.arrayBuffer());
        if(buf.length<100) continue;
        const sharp=require('sharp');
        const m=await sharp(buf).metadata().catch(()=>null);
        if(!m||!m.width) continue;
        ok=liste[i]; idx=i; taille=m.width+'x'+m.height; break;
      }catch(e){}
    }
    res.push({...it, ok:!!ok, source:idx, taille});
  }
  require('fs').writeFileSync('/tmp/logos-res.json', JSON.stringify(res));
  const sansLogo=res.filter(r=>!r.ok);
  console.log('=== COUVERTURE ===');
  console.log('  avec logo :', res.length-sansLogo.length, '/', res.length);
  const parSource={0:'source 1 (Parqet/CMC)',1:'repli 1 (FMP/CoinCap)',2:'repli 2'};
  for(const k of [0,1,2]) console.log('  '+parSource[k]+' :', res.filter(r=>r.source===k).length);
  console.log('\n=== SANS AUCUN LOGO (initiales affichées) ===', sansLogo.length);
  const parT={}; for(const r of sansLogo){ (parT[r.type]=parT[r.type]||[]).push(r.t); }
  for(const [t,l] of Object.entries(parT)) console.log('  '+t+' ('+l.length+') : '+l.join(', '));
  console.log('\n=== RÉSOLUTION SERVIE ===');
  const tailles={}; for(const r of res.filter(x=>x.ok)) tailles[r.taille]=(tailles[r.taille]||0)+1;
  console.log(' ', Object.entries(tailles).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' × '+v).join('   '));
  const petits=res.filter(r=>r.ok && parseInt(r.taille)<128);
  console.log('  sous 128 px (mou sur écran dense) :', petits.length, petits.map(p=>p.t+' '+p.taille).join(', ')||'');
})();
