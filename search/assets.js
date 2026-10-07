export function assetUrl(relativePath) {
  const moduleUrl = import.meta.url;
  const root = new URL(import.meta.env.BASE_URL, new URL("../", moduleUrl));
  return new URL(relativePath, root).href;
}
