import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { Store } from './store.js';
import { parseEcb, parseDeals, createSources, HOUR } from './sources.js';
import { createRefresh } from './refresh.js';
import { createProjectHandler } from './routes.js';

const snapshot = () => ({ parsedAt:'2026-01-01T00:00:00Z',count:2,games:[
  {appId:'400',name:'Portal',price:10,currency:'EUR',description:'Old description',genres:['Puzzle'],detailStatus:'ok'},
  {appId:'620',name:'Portal 2',price:20,currency:'EUR',genres:['Puzzle'],detailStatus:'ok'},
] });
function setup(t) { const store=new Store(':memory:');store.saveCatalog(snapshot()); t.after(()=>store.close()); return store; }
const xml = `<Envelope><Cube><Cube time='2026-11-23'><Cube currency='USD' rate='1.25'/></Cube></Cube></Envelope>`;
const deal = {steamAppID:'400',dealID:'a%2Bb%3D',storeID:'1',title:'Portal',salePrice:'5.00',normalPrice:'10.00'};

test('SQLite transakcija ohrani stare opise, osveži cene in ne izbriše shranjenih iger',t=>{
  const store=setup(t); store.save('620','igram','Moja opomba');
  store.saveCatalog({parsedAt:'2026-11-23T12:00:00Z',games:[{appId:'400',name:'Portal',price:5,currency:'EUR',description:null,genres:[],detailStatus:'pending'}]});
  assert.equal(store.catalog().count,1); assert.equal(store.game('400').price,5);
  assert.equal(store.game('400').description,'Old description');assert.deepEqual(store.game('400').genres,['Puzzle']);
  assert.equal(store.saved()[0].game.name,'Portal 2');assert.equal(store.saved()[0].note,'Moja opomba');
  assert.throws(()=>store.saveCatalog({games:[]}));
  assert.throws(()=>store.saveCatalog({games:[{appId:'999'}]}));
  assert.equal(store.catalog().count,1);assert.equal(store.game('400').price,5);
});
test('SQLite seznam in predpomnilnik preživita zaprtje ter ponovno odprtje baze',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'play-test-'));
  let store=new Store(join(dir,'test.sqlite'));store.saveCatalog(snapshot());store.save('400','koncano','Zelo dobro');store.putCache('test',{value:1},1000);store.close();
  store=new Store(join(dir,'test.sqlite'));t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  assert.equal(store.saved()[0].state,'koncano');assert.equal(store.cached('test').data.value,1);
  store.remove('400');assert.equal(store.saved().length,0);
});
test('ECB parser prebere XML z imenskimi prostori ter zavrne manjkajoč ali neveljaven tečaj',()=>{
  assert.equal(parseEcb(xml).usdPerEur,1.25);
  assert.equal(parseEcb(xml.replace('Envelope','gesmes:Envelope').replace('</Envelope>','</gesmes:Envelope>')).date,'2026-11-23');
  assert.throws(()=>parseEcb(xml.replace('1.25','0')));assert.throws(()=>parseEcb('<broken>'));
});
test('CheapShark uporablja natančen Steam ID, številčne cene ter pravilno kodirano povezavo',()=>{
  const rows=parseDeals([deal,{...deal,steamAppID:'620'}],'400');
  assert.equal(rows.length,1);assert.equal(rows[0].priceUsd,5);assert.equal(rows[0].url,'https://www.cheapshark.com/redirect?dealID=a%2Bb%3D');
  assert.throws(()=>parseDeals([{...deal,salePrice:''}],'400'));assert.throws(()=>parseDeals({},'400'));
});
test('Sočasni klici delijo prenos; TTL predpomnilnik preživi nov adapter in pretvorba USD/EUR je pravilna',async t=>{
  const store=setup(t);let calls=0;
  const fetchImpl=async url=>{
    calls++; await new Promise(resolve=>setTimeout(resolve,5));
    return new Response(url.includes('xml')?xml:JSON.stringify(url.endsWith('stores')?[{storeID:'1',storeName:'Steam'}]:[deal]));
  };
  const source=createSources({store,fetchImpl});
  const [a,b]=await Promise.all([source.comparison('400'),source.comparison('400')]);
  assert.equal(calls,3);assert.equal(a.deals[0].priceEur,4);assert.equal(b.deals[0].store,'Steam');
  const fresh=createSources({store,fetchImpl:()=>{throw new Error('Must use SQLite');}});
  assert.equal((await fresh.comparison('400')).retrieval.stale,false);
});
test('Izpad ponudnika ohrani staro kopijo z opozorilom, brez kopije pa vrne napako',async t=>{
  const store=setup(t);store.putCache('deals:400',{deals:parseDeals([deal],'400')},HOUR,Date.now()-2*HOUR);
  const source=createSources({store,fetchImpl:async()=>{throw new Error('Offline');}});
  const result=await source.comparison('400');
  assert.equal(result.retrieval.stale,true);assert.equal(result.deals[0].priceUsd,5);assert.equal(result.deals[0].priceEur,null);
  assert.equal(store.source('cheapshark').error,'Offline');
  await assert.rejects(source.deals('620'),/Offline/);
});
test('SURS se shrani v SQLite in po 24 urah ob izpadu vrne označeno kopijo',async t=>{
  const store=setup(t); const data={rows:[{year:'2026'}],retrieval:{mode:'live'}};
  const source=createSources({store,sursSource:{load:async()=>data}});
  assert.equal((await source.surs()).rows[0].year,'2026');
  store.putCache('surs',data,HOUR,Date.now()-2*HOUR);
  const offline=createSources({store,sursSource:{load:async()=>({retrieval:{mode:'cache'}})}});
  assert.equal((await offline.surs()).retrieval.stale,true);
});
test('Samodejna osvežitev spoštuje interval, združuje sočasne klice ter ob napaki ohrani bazo',async t=>{
  const store=setup(t);let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const refresh=createRefresh({store,sources:{},scrapeFree:async()=>{},scrape:async()=>{calls++;await gate;},importData:async()=>{const c=snapshot();c.parsedAt=new Date().toISOString();store.saveCatalog(c);return c;}});
  t.after(refresh.close);
  const a=refresh.steam();const b=refresh.steam();assert.equal(refresh.status().running,true);release();await Promise.all([a,b]);
  assert.equal(calls,1);await refresh.steam();assert.equal(calls,1);
  const broken=createRefresh({store,sources:{},scrapeFree:async()=>{throw new Error('Offline');}});t.after(broken.close);
  await broken.steam(true);assert.equal(store.catalog().count,2);assert.equal(broken.status().error,'Offline');
});
test('HTTP CRUD: dodajanje, urejanje, filtrirljivi podatki, brisanje in preverjanje vnosa/izvora',async t=>{
  const store=setup(t);
  const handler=createProjectHandler({store,sources:{comparison:async()=>({deals:[]})},refresh:{steam:async()=>{},status:()=>({running:false})}});
  const server=http.createServer((req,res)=>{void handler(req,res,new URL(req.url,'http://localhost'));});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/naloga6/api`;
  const mutate=(method,data,headers={})=>fetch(base+'/library',{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await mutate('POST',{appId:'400',state:'zelim',note:'Pozneje'})).status,200);
  assert.equal((await mutate('PUT',{appId:'400',state:'koncano',note:'<script>test</script>'})).status,200);
  const rows=await (await fetch(base+'/library')).json();assert.equal(rows[0].state,'koncano');assert.equal(rows[0].note,'<script>test</script>');
  assert.equal((await mutate('POST',{appId:'999',state:'zelim',note:''})).status,404);
  assert.equal((await mutate('PUT',{appId:'400',state:'invalid',note:''})).status,400);
  assert.equal((await mutate('POST',{appId:'400',state:'zelim',note:'x'.repeat(1001)})).status,400);
  assert.equal((await mutate('DELETE',{appId:'400'},{Origin:'https://example.com'})).status,403);
  assert.equal((await mutate('DELETE',{appId:'400'})).status,200);assert.equal(store.saved().length,0);
  assert.equal((await fetch(base+'/compare?id=400')).status,200);
  assert.equal((await fetch(base+'/compare?id=bad')).status,404);
});
