// Kaikki polut ovat suhteellisia, joten sovellus toimii myös alihakemistossa
// (esim. https://kayttaja.github.io/kasvisarki/). Vaihda versio, kun tiedostolista muuttuu.
const CACHE = 'vegesaurus-arkiruokia-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/vegesaurus.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Poistaa vain tämän sovelluksen vanhat välimuistit, koska saman käyttäjän
  // muut GitHub Pages -projektit jakavat saman originin.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('vegesaurus-arkiruokia-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Näyttää heti välimuistissa olevan version ja päivittää sen taustalla,
// joten päivitykset näkyvät viimeistään seuraavalla avauskerralla.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = request.mode === 'navigate' ? './index.html' : request;
    const cached = await cache.match(key, { ignoreSearch: true });
    const refresh = fetch(request).then(async (response) => {
      if (response.ok) await cache.put(key, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }
    return refresh;
  })());
});
