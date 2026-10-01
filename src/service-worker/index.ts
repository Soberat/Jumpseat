import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { self } from '$app/service-worker';

// App shell: hashed build output plus everything in /static. Cached per deploy.
const CACHE = `jumpseat-${version}`;
const SHELL = [...immutable, ...assets].map((f) => f.path);
const SHELL_SET = new Set(SHELL);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// Shell files never change for a given version: serve from cache.
	if (SHELL_SET.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Pages and data: network first, falling back to the last copy we saw,
	// so trips you have opened before still load with no signal.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			try {
				const response = await fetch(request);
				if (response.ok) cache.put(request, response.clone());
				return response;
			} catch (err) {
				const hit = await cache.match(request);
				if (hit) return hit;
				throw err;
			}
		})()
	);
});
