/* DOL Save Editor - Service Worker
   功能：把所有静态资源缓存进来，安装后断网也能用 */
const CACHE = 'dol-save-editor-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './dict.js',
  './lz-string.min.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 缓存优先（离线可用），同时后台更新
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(hit => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
