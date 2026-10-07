import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { MODEL_OPTIONS } from "../search/models.js";

const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url)));
for (const name of ["minilm", "bge"]) {
  test(`${name} model assets and sense index match the vocabulary version`, async () => {
    const manifest = JSON.parse(await readFile(new URL(`../public/data/${name}-manifest.json`, import.meta.url)));
    assert.equal(manifest.vocabularySha256, vocabulary.sha256);
    assert.equal(manifest.revision, MODEL_OPTIONS[name].revision);
    assert.equal(manifest.senseIds.length, vocabulary.words.reduce((sum, word) => sum + word.senses.length, 0));
    assert.equal((await stat(new URL(`../public/data/${manifest.indexFile}`, import.meta.url))).size, manifest.senseIds.length * manifest.dimensions * 4);
    assert.equal((await stat(new URL(`../public/models/${manifest.model}/onnx/model_quantized.onnx`, import.meta.url))).size, manifest.modelBytes);
  });
}
