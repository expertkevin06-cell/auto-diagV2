const CACHE_NAME = 'diag-kevin-v7';
const urlsToCache = [
    '/aide-diagnostic/',
    '/aide-diagnostic/index.html',
    '/aide-diagnostic/app.js',
    '/aide-diagnostic/manifest.json'
];

self.addEventListener('install', event => {
    console.log('[SW] Installation cache:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => 
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Pour les JSON : toujours réseau (pas de cache) pour avoir les MAJ
    if (event.request.url.includes('data.json') || 
        event.request.url.includes('new-models.json') ||
        event.request.url.includes('version.json')) {
        event.respondWith(fetch(event.request));
    } else {
        // Pour le reste : cache first
        event.respondWith(
            caches.match(event.request).then(r => r || fetch(event.request))
        );
    }
});

self.addEventListener('message', event => {
    if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
