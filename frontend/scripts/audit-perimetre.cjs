/**
 * Audit du périmètre : ce que la recherche rend atteignable, et comment on le sert.
 *
 *     cd frontend && node scripts/audit-perimetre.cjs
 *
 * Prérequis : /tmp/echantillon.json, produit en interrogeant `/api/v1/search` sur une trentaine
 * de requêtes variées (marques, places, familles de fonds, cryptos).
 *
 * ⚠️ **Il existe parce que les catalogues locaux ne sont pas le périmètre.** `audit-logos.cjs`
 * couvre les listes écrites dans le dépôt ; celui-ci part de ce qu'un utilisateur peut réellement
 * ouvrir, c'est-à-dire de Yahoo. C'est là que les formes exotiques apparaissent — `ETH-BTC`,
 * `0P0001OZ17`, `1NESN.MI`, `PBR-A` — et c'est là qu'un bug se cache.
 *
 * ⚠️ **Il en a trouvé un dès le premier passage.** `cryptoSymbol` ne retirait que `-USD` : les
 * cryptos cotées en euro, en livre ou contre bitcoin cherchaient un logo nommé « eth-eur » et
 * n'en trouvaient aucun. **Quatre cryptos sur huit** étaient muettes. Corrigé, elles sont huit
 * sur huit.
 */

const ech=require('/tmp/echantillon.json');
const CMC={btc:1,eth:1027,bnb:1839,sol:5426,xrp:52,doge:74,ada:2010,avax:5805,dot:6636,shib:5994,matic:3890,pol:3890,link:1975,uni:7083,ltc:2,atom:3794,trx:1958,etc:1321,xlm:512,fil:2280,hbar:4642,apt:21794,arb:11841,op:11840,sui:20947,pepe:24478,wif:28752,inj:7226,sei:23149,jup:29210,near:6535,vet:3077,mkr:1518,aave:7278,sand:6210,mana:1966,crv:6538,comp:5692,snx:2586,ens:13855,imx:10603,rune:4157,ftm:3513,s:3513,algo:4030,icp:8916,qnt:3155,eos:1765,flow:4558,ksm:5034,xmr:328,zec:1437,bch:1831,ton:11419,wld:13502,stx:4847,floki:10804,bonk:23095,render:5690,fet:3773,grt:6719,ldo:8000};
// répliques EXACTES de l'actuel resolveUrls / cryptoSymbol
const sym=t=>t.replace(/-[A-Z]{2,5}$/,'').replace(/[0-9]+$/,'').toLowerCase();
function urls(t,type){
  const c = type==='CRYPTOCURRENCY' || t.endsWith('-USD');
  if(c){ const s=sym(t), id=CMC[s], u=[];
    if(id) u.push(`https://s2.coinmarketcap.com/static/img/coins/128x128/${id}.png`);
    u.push(`https://assets.coincap.io/assets/icons/${s}@2x.png`);
    u.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/128/color/${s}.png`); return u; }
  const cl=t.replace(/\.[A-Z]{1,3}$/,'').replace(/^\^/,'');
  const u=[`https://assets.parqet.com/logos/symbol/${encodeURIComponent(t)}?format=png&size=256`,
           `https://financialmodelingprep.com/image-stock/${t}.png`];
  if(cl!==t) u.push(`https://financialmodelingprep.com/image-stock/${cl}.png`);
  return u;
}
(async()=>{
  const sharp=require('sharp'); const res=[];
  for(const a of ech){
    const liste=urls(a.ticker,a.type); let ok=false,src=-1;
    for(let i=0;i<liste.length;i++){
      try{ const r=await fetch(liste[i],{signal:AbortSignal.timeout(8000)});
        if(!r.ok) continue; const b=Buffer.from(await r.arrayBuffer());
        if(b.length<100) continue;
        const m=await sharp(b).metadata().catch(()=>null); if(!m||!m.width) continue;
        ok=true; src=i; break; }catch(e){}
    }
    res.push({...a, ok, src});
  }
  require('fs').writeFileSync('/tmp/verif.json', JSON.stringify(res));
  const sans=res.filter(r=>!r.ok);
  console.log('=== ÉCHANTILLON ATTEIGNABLE PAR LA RECHERCHE ===');
  console.log('  avec logo :', res.length-sans.length, '/', res.length, '('+Math.round(100*(res.length-sans.length)/res.length)+'%)');
  const parType={}; for(const r of res){ const k=r.type; parType[k]=parType[k]||{n:0,ok:0}; parType[k].n++; if(r.ok)parType[k].ok++; }
  for(const [k,v] of Object.entries(parType)) console.log('   ',k.padEnd(16), v.ok+'/'+v.n);
  console.log('\n=== SANS LOGO ===', sans.length);
  for(const s of sans.slice(0,30)) console.log('  '+s.ticker.padEnd(12), s.type.padEnd(14), (s.name||'').slice(0,38));
  const crypto=res.filter(r=>r.type==='CRYPTOCURRENCY');
  console.log('\n=== CRYPTOS EN DÉTAIL ===');
  for(const c of crypto) console.log('  '+c.ticker.padEnd(10), c.ok?('logo ✓ (source '+c.src+')'):'AUCUN LOGO ✗');
})();
