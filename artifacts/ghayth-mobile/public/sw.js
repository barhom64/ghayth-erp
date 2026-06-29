/**
 * Service Worker — غيث ERP PWA
 * استراتيجية: Network-first للـ API، Cache-first للأصول الثابتة
 */
const CACHE = 'ghayth-v1';
const STATIC_EXTS = /\.(js|css|png|ico|woff2?|ttf)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // الـ API يمر عبر الشبكة دائمًا — لا caching للبيانات الحية
  if (url.pathname.startsWith('/api/')) return;

  // الأصول الثابتة: cache-first
  if (STATIC_EXTS.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // SPA shell: network-first مع fallback للـ index.html
  e.respondWith(
    fetch(request).catch(() =>
      caches.match('/index.html').then(r => r ?? fetch('/index.html'))
    )
  );
});
