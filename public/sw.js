/**
 * Service Worker for Kereke Hub
 * Caches app shell and assets for offline access
 * Firebase SDK handles its own offline persistence via IndexedDB
 */

const CACHE_NAME = 'kereke-hub-v2';
const CACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest'
];

// API URLs we never want to cache
const API_PASSTHROUGH = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_ASSETS).catch(err => {
        console.warn('Failed to cache some assets:', err);
        // Don't fail install if some assets aren't available
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key.startsWith('kereke-hub'))
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Never intercept Firebase API calls
  if (API_PASSTHROUGH.some(api => url.includes(api))) {
    return; // pass through to network
  }

  // For navigation requests, go to the NETWORK FIRST so the freshly deployed
  // HTML (which references the current CSS/JS chunk hashes) is always used.
  // Only fall back to a cached page or the offline page when truly offline.
  // Serving cached HTML first was causing unstyled pages after deploys, because
  // the old HTML pointed at CSS files whose hashed names no longer existed.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            cached => cached || caches.match('/offline.html').then(off => off || new Response('Offline'))
          )
        )
    );
    return;
  }

  // For other requests: network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          if (shouldCache(request)) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

function shouldCache(request) {
  // Cache static assets
  const url = request.url;
  const extensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.svg', '.jpg'];
  return extensions.some(ext => url.endsWith(ext));
}

// Background sync for pending operations
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_REQUEST'
          });
        });
      })
    );
  }
});
