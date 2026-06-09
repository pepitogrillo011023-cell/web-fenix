const CACHE_NAME = 'casino-fenix-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css', // Cambiá esto por la ruta real de tu CSS si tenés uno
    '/index.js'
];

// Instalar el Service Worker y guardar archivos básicos en caché
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activar el Service Worker
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Responder desde la caché o ir a la red si no está
self.addEventListener('fetch', (e) => {
    // No cachear peticiones de WebSockets ni del panel de administración
    if (e.request.url.includes('socket.io') || e.request.url.includes('/admin')) {
        return;
    }
    
    e.respondWith(
        caches.match(e.request).then((res) => {
            return res || fetch(e.request);
        })
    );
});
