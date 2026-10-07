import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function prepareRuntime() {
  await mkdir(new URL("../public/runtime/", import.meta.url), { recursive: true });
  for (const name of [
    "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"
  ]) {
    await copyFile(new URL(`../node_modules/onnxruntime-web/dist/${name}`, import.meta.url), new URL(`../public/runtime/${name}`, import.meta.url));
  }
  const licenseFile = new URL("../public/runtime/LICENSE.txt", import.meta.url);
  try {
    await readFile(licenseFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch("https://raw.githubusercontent.com/microsoft/onnxruntime/8d85527a0/LICENSE");
    if (!response.ok) throw new Error("Could not preserve the runtime license.");
    await writeFile(licenseFile, await response.text());
  }
  await copyFile(new URL("../node_modules/@huggingface/transformers/LICENSE", import.meta.url), new URL("../public/runtime/TRANSFORMERS-LICENSE.txt", import.meta.url));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareRuntime();
