import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";
import { senseText, wordSenses, validateVocabulary } from "../search/engine.js";
import { MODEL_OPTIONS } from "../search/models.js";
import { prepareRuntime } from "./prepare-runtime.mjs";

const selected = process.argv[2] || "minilm";
const config = MODEL_OPTIONS[selected];
if (!config) throw new Error("Choose minilm or bge.");
const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url)));
validateVocabulary(vocabulary.words);
const output = new URL(`../public/models/${config.id}/`, import.meta.url);
await mkdir(new URL("onnx/", output), { recursive: true });
const metadataResponse = await fetch(`https://huggingface.co/api/models/${config.id}/revision/${config.revision}`);
if (!metadataResponse.ok) throw new Error(`Model metadata download failed: ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
let license = metadata.cardData?.license;
let upstream = null;
if (!license && typeof metadata.cardData?.base_model === "string") {
  const response = await fetch(`https://huggingface.co/api/models/${metadata.cardData.base_model}`);
  if (!response.ok) throw new Error("Could not verify the upstream model license.");
  upstream = await response.json();
  license = upstream.cardData?.license;
}
if (!["apache-2.0", "mit"].includes(license)) throw new Error(`Review the model license before bundling: ${license}`);
const files = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx"];
for (const name of files) {
  const file = new URL(name, output);
  try {
    await stat(file);
    continue;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetch(`https://huggingface.co/${config.id}/resolve/${metadata.sha}/${name}`);
  if (!response.ok) throw new Error(`Model asset ${name} failed: ${response.status}`);
  await writeFile(file, new Uint8Array(await response.arrayBuffer()));
  console.log(`Downloaded ${name}`);
}
const cardResponse = await fetch(`https://huggingface.co/${config.id}/raw/${metadata.sha}/README.md`);
if (!cardResponse.ok) throw new Error("Could not retrieve the model card for attribution.");
await writeFile(new URL("MODEL-CARD.txt", output), await cardResponse.text());
if (upstream) {
  const response = await fetch(`https://huggingface.co/${upstream.id}/raw/${upstream.sha}/README.md`);
  if (!response.ok) throw new Error("Could not preserve the upstream model card.");
  await writeFile(new URL("UPSTREAM-MODEL-CARD.txt", output), await response.text());
}
await prepareRuntime();
env.localModelPath = fileURLToPath(new URL("../public/models/", import.meta.url));
env.allowRemoteModels = false;
const extractor = await pipeline("feature-extraction", config.id, {
  dtype: "q8", device: "cpu", session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }
});
const documents = vocabulary.words.flatMap((word) => wordSenses(word).map((sense) => ({
  id: sense.id, text: senseText(word, sense)
})));
const vectors = new Float32Array(documents.length * config.dimensions);
const started = performance.now();
for (let start = 0; start < documents.length; start += 16) {
  const batch = documents.slice(start, start + 16);
  const result = await extractor(batch.map((entry) => entry.text), {
    pooling: config.pooling, normalize: true, truncation: true, max_length: 96
  });
  if (result.data.length !== batch.length * config.dimensions) throw new Error("Unexpected embedding output shape.");
  vectors.set(result.data, start * config.dimensions);
  if (start % 256 === 0) console.log(`Embedded ${start}/${documents.length} senses`);
}
const indexFile = `${selected}-${vocabulary.sha256.slice(0, 12)}.f32`;
await writeFile(new URL(`../public/data/${indexFile}`, import.meta.url), new Uint8Array(vectors.buffer));
const manifest = {
  engine: selected, model: config.id, revision: metadata.sha, license,
  dtype: "q8", pooling: config.pooling, dimensions: config.dimensions,
  queryPrefix: config.queryPrefix || "",
  upstream: upstream ? { model: upstream.id, revision: upstream.sha, license } : null,
  vocabularyVersion: vocabulary.version, vocabularySha256: vocabulary.sha256,
  indexFile, senseIds: documents.map((document) => document.id),
  bytes: vectors.byteLength,
  modelBytes: (await stat(new URL("onnx/model_quantized.onnx", output))).size,
  encodingMilliseconds: Math.round(performance.now() - started)
};
await writeFile(new URL(`../public/data/${selected}-manifest.json`, import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
await extractor.dispose();
console.log(`Built ${selected} index: ${manifest.bytes} bytes; model: ${manifest.modelBytes} bytes.`);
