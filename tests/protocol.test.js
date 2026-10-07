import test from "node:test";
import assert from "node:assert/strict";
import { resolveAsset, contentType } from "../electron/protocol.js";

test("application assets resolve with query strings and encoded characters", () => {
  assert.equal(resolveAsset("/app/renderer", "app://-/assets/style.css?v=1"), "/app/renderer/assets/style.css");
  assert.equal(resolveAsset("/app/renderer", "app://-/models/a%20b/file.onnx"), "/app/renderer/models/a b/file.onnx");
  assert.equal(resolveAsset("/app/renderer", "app://-/"), "/app/renderer/index.html");
});
test("application protocol rejects malformed, foreign, and escaping paths", () => {
  for (const url of ["https://example.com/file", "app://other/file", "app://-/%2e%2e%2fsecret", "app://-/%5csecret", "app://-/%00secret", "app://-/%zz"]) {
    assert.equal(resolveAsset("/app/renderer", url), null, url);
  }
});
test("desktop stylesheet, module, worker, and model content types are explicit", () => {
  assert.match(contentType("style.css"), /^text\/css/);
  assert.match(contentType("worker.js"), /^text\/javascript/);
  assert.match(contentType("runtime.mjs"), /^text\/javascript/);
  assert.equal(contentType("runtime.wasm"), "application/wasm");
  assert.equal(contentType("model.onnx"), "application/octet-stream");
});
