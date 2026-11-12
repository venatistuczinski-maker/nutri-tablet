// Replaced by a content hash in the static build. No skipWaiting: avoid mixing releases.
const VERSION='59879d71f254e6f3';
const BASE=new URL('./',self.registration.scope);
const PREFIX='nutrir-shell:'+BASE.pathname+':';
const CACHE=PREFIX+VERSION;
const ASSETS=['./','./index.html','./app.js','./local-vault.js','./validation.js','./domain.js','./style.css','./icon-192.png','./icon-512.png','./manifest.webmanifest','./icon.svg'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);url.search='';url.hash='';
  if(event.request.method!=='GET'||!ASSETS.includes(url.href))return;
  // Only public shell assets. No API, vault or backup data enters Cache Storage.
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
