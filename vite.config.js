import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
export default defineConfig(({ mode }) => {
  const isElectron = mode === "desktop";
  const base = isElectron ? "/" : (process.env.GITHUB_ACTIONS ? "/Aphasia-Circumlocution-Translation-System/" : "/");
  return {
  base,
  build: { outDir: isElectron ? "build/renderer" : "build/web" },
  worker: { format: "es" },
  plugins: [
    {
    name: "self-hosted-onnx-runtime",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const name = request.url?.split("?")[0];
        if (!["/runtime/ort-wasm-simd-threaded.mjs", "/runtime/ort-wasm-simd-threaded.asyncify.mjs"].includes(name)) return next();
        try {
          const source = await readFile(new URL(`./public${name}`, import.meta.url));
          response.setHeader("Content-Type", "text/javascript");
          response.end(source);
        } catch (error) {
          next(error);
        }
      });
    }
  }, {
    name: "wordbridge-offline-shell",
    generateBundle(_options, bundle) {
      if (isElectron) return;
      const shellPaths = [base, `${base}index.html`, ...Object.keys(bundle).filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `${base}${name}`)];
      const shell = shellPaths;

      const version = JSON.stringify(`wordbridge-${Object.keys(bundle).join("-")}`);
      this.emitFile({
        type: "asset", fileName: "sw.js",
        source: `
const CACHE = ${version};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(${JSON.stringify(shell)})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("wordbridge-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.status === 200 && !event.request.headers.has("Range")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(async error => {
        console.error("Offline asset caching failed:", error.message);
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: "offline-cache-error" }));
      }));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    return cached || new Response("This file has not been cached for offline use. Restore the connection and retry.", { status: 503 });
  }));
});`
      });
    }
  }]
  };
});
