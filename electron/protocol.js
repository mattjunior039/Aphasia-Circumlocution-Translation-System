import path from "node:path";

export function resolveAsset(root, url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "app:" || parsed.host !== "-") return null;
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.includes("\\") || pathname.includes("\0")) return null;
    const resolvedRoot = path.resolve(root);
    const asset = path.resolve(resolvedRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!asset.startsWith(`${resolvedRoot}${path.sep}`)) return null;
    return asset;
  } catch {
    return null;
  }
}

export function contentType(asset) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8"
  })[path.extname(asset).toLowerCase()] || "application/octet-stream";
}
