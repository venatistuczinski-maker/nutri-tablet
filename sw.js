const VERSION='2084cb7aa249b966';
const BASE=new URL('./',self.registration.scope);
const PREFIX='nutrir-shell:'+BASE.pathname+':';
const CACHE=PREFIX+VERSION;
const MEASURE_HASHES={
  'foods.js':'4349595a50f581724e53c4f33c91fc50883156e294bb87bc97973b6567fae41f',
  'household-measures.js':'11ab559250c04d9a81f779fef81e64a792784cc330027df409eb84c583d3ddee',
  'ibge-measure-data.js':'a7ec12b69a8e165df70d9737a7bedc1c510d53122b55ae7533032c7b6ce13960',
  'menu-ui.js':'4d83cfd4700d6f716f6af126a12fc8ae5c5f80a78a945d53d14cbac0261bdefc',
  'nutrition.js':'817232805231514e5f47019c77c75567f4e53f27cca5988018009dc4f1397472',
};
const ASSETS=['./','./index.html','./app.js','./local-vault.js','./validation.js','./domain.js','./foods.js','./household-measures.js','./ibge-measure-data.js','./food-search.js','./nutrition.js','./menu-ui.js','./app-update.js','./reports.js','./style.css','./icon-192.png','./icon-512.png','./manifest.webmanifest','./icon.svg'].map(path=>new URL(path,BASE).href);

function supportsUpdatePrompt(worker){
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
    const timer=setTimeout(()=>finish(false),1500);
    channel.port1.onmessage=event=>finish(typeof event.data?.version==='string');
    try{worker.postMessage({type:'NUTRIR_VERSION'},[channel.port2]);}
    catch{finish(false);}
  });
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try{
    await Promise.all(ASSETS.map(async asset=>{
      const url=new URL(asset);
      url.searchParams.set('nutrir-release',VERSION);
      const response=await fetch(url,{cache:'reload'});
      if(!response.ok)throw Error('Falha ao preparar '+url.pathname);
      if(asset===ASSETS[0]||asset===ASSETS[1]){
        const html=await response.clone().text();
        if(!html.includes('data-shell-version="'+VERSION+'"'))throw Error('Versão da página incompatível.');
      }
      const assetName=url.pathname.slice(BASE.pathname.length);
      if(Object.hasOwn(MEASURE_HASHES,assetName)){
        const bytes=await response.clone().arrayBuffer();
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        if(hash!==MEASURE_HASHES[assetName])throw Error('Arquivo de medidas incompatível: '+assetName);
      }
      return [asset,response];
    })).then(entries=>Promise.all(entries.map(([asset,response])=>cache.put(asset,response))));
  }catch(error){
    await caches.delete(CACHE);
    throw error;
  }
  const active=self.registration.active;
  // Old releases never listen for an update request. Release them from waiting mode.
  if(active&&!(await supportsUpdatePrompt(active)))await self.skipWaiting();
})()));

self.addEventListener('message',event=>{
  if(event.data?.type==='NUTRIR_VERSION')event.ports[0]?.postMessage({version:VERSION});
  if(event.data?.type==='NUTRIR_ACTIVATE')event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);url.search='';url.hash='';
  if(event.request.method!=='GET'||!ASSETS.includes(url.href))return;
  // Only public shell assets are cached. IndexedDB is owned by the app.
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
