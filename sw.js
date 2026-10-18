const CACHE = 'kniffel-v4';
const ASSETS = ['./','./index.html','./style.css?v=20261018-4','./rules.js','./app.js?v=20261018-4','./icon.svg','./apple-touch-icon.png','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('kniffel-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
