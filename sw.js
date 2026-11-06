const CACHE='iljeongdam-shell-v4-0';
const SHELL=['./','./index.html','./styles.css','./app.js','./calendar.js','./voice-input.js','./voice-parser.js','./photo-grid.js','./photo-review.js','./recognition.js','./document-layout.js','./office-import.js','./mobile.js','./google-sync.js','./sync-ui.js','./google-config.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('iljeongdam-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const scope=new URL(self.registration.scope);if(!url.pathname.startsWith(scope.pathname))return;
 const relative='./'+url.pathname.slice(scope.pathname.length);if(!SHELL.includes(relative)&&relative!=='./')return;
 // Never intercept or cache OAuth tokens, Google API responses or user documents.
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(new Request(url.origin+url.pathname),copy));}return response;}).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(new Request(url.origin+url.pathname))||Response.error();}));
});
