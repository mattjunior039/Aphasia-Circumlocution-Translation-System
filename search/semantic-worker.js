import { pipeline, env } from "@huggingface/transformers";
import { createIndex, rank, senseText, wordSenses, shouldAbstain } from "./engine.js";
import { cosineRows } from "./models.js";
import { assetUrl } from "./assets.js";

let extractor;
let manifest;
let vocabulary;
let vectors;
let queue = Promise.resolve();
const personalCache = new Map();

async function initialize(model) {
  const [vocabularyResponse, manifestResponse] = await Promise.all([
    fetch(assetUrl("data/vocabulary.json")),
    fetch(assetUrl(`data/${model}-manifest.json`))
  ]);
  if (!vocabularyResponse.ok || !manifestResponse.ok) throw new Error("Local model assets are missing. Run the documented model build command.");
  vocabulary = await vocabularyResponse.json();
  manifest = await manifestResponse.json();
  if (manifest.vocabularySha256 !== vocabulary.sha256) throw new Error("The local model index is outdated. Rebuild it before using semantic search.");
  self.postMessage({ type: "progress", message: "Loading the local word index…" });
  const response = await fetch(assetUrl(`data/${manifest.indexFile}`));
  if (!response.ok) throw new Error("The local word index could not be loaded.");
  vectors = new Float32Array(await response.arrayBuffer());
  if (vectors.length !== manifest.senseIds.length * manifest.dimensions) throw new Error("The local word index is incomplete.");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  // The app service worker caches the original responses, including compressed assets.
  env.useBrowserCache = false;
  const modelRoot = new URL(assetUrl("models/"));
  env.localModelPath = ["http:", "https:"].includes(modelRoot.protocol) ? modelRoot.pathname : modelRoot.href;
  env.backends.onnx.wasm.wasmPaths = assetUrl("runtime/");
  env.backends.onnx.wasm.numThreads = 1;
  self.postMessage({ type: "progress", message: "Loading model weights and preparing on-device inference…" });
  extractor = await pipeline("feature-extraction", manifest.model, { dtype: manifest.dtype });
  self.postMessage({ type: "ready", model: manifest.engine });
}

async function search(message) {
  if (!extractor) throw new Error("Semantic search is not ready yet.");
  const { requestId, query, customWords } = message;
  const index = createIndex([...vocabulary.words, ...customWords]);
  if (shouldAbstain(index, query)) {
    self.postMessage({ type: "result", requestId, result: rank(index, query) });
    return;
  }
  const queryEmbedding = await extractor((manifest.queryPrefix || "") + query, {
    pooling: manifest.pooling, normalize: true, truncation: true, max_length: 96
  });
  const similarities = cosineRows(queryEmbedding.data, vectors, manifest.senseIds, manifest.dimensions);
  const activeKeys = new Set();
  for (const word of customWords) {
    for (const sense of wordSenses(word)) {
      const key = `${sense.id}:${senseText(word, sense)}`;
      activeKeys.add(key);
      let embedding = personalCache.get(key);
      if (!embedding) {
        const output = await extractor(senseText(word, sense), { pooling: manifest.pooling, normalize: true, truncation: true, max_length: 96 });
        embedding = new Float32Array(output.data);
        personalCache.set(key, embedding);
      }
      similarities.push(...cosineRows(queryEmbedding.data, embedding, [sense.id], manifest.dimensions));
    }
  }
  for (const key of personalCache.keys()) {
    if (!activeKeys.has(key)) personalCache.delete(key);
  }
  self.postMessage({ type: "result", requestId, result: rank(index, query, similarities) });
}

self.addEventListener("message", (event) => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      if (message.type === "initialize") await initialize(message.model);
      else if (message.type === "search") await search(message);
      else throw new Error("Unknown semantic engine request.");
    } catch (error) {
      console.error("Local engine failure:", error.stack);
      self.postMessage({ type: "error", requestId: message.requestId, message: error.message });
    }
  });
});
