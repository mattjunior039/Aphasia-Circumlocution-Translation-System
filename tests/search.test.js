import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIndex, rank, validateVocabulary, normalize, filterCandidates } from "../search/engine.js";
import { cosineRows } from "../search/models.js";
import { benchmark, regressions } from "./fixtures/benchmark.js";
import { legacySearch } from "./legacy-engine.js";

const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url)));
const legacy = JSON.parse(await readFile(new URL("./fixtures/legacy-words.json", import.meta.url)));
const index = createIndex(vocabulary.words);

test("the baseline reproduces the reported soup failure", () => {
  assert.equal(legacy.length, 41);
  assert.deepEqual(legacySearch(legacy, "round thing i use to eat soup").map((word) => word.id), ["apple"]);
  assert.deepEqual(legacySearch(legacy, "what I use to call my daughter"), []);
});
test("vocabulary is valid, expanded, and retains old stable IDs", () => {
  assert.equal(validateVocabulary(vocabulary.words), true);
  assert.ok(vocabulary.words.length >= 2000);
  assert.equal(new Set(vocabulary.words.map((word) => normalize(word.label))).size, vocabulary.words.length);
  for (const word of legacy) assert.ok(vocabulary.words.some((entry) => entry.id === word.id));
});
test("distinct concepts are no longer false exact aliases", () => {
  for (const [label, id] of [["tea", "tea"], ["nurse", "nurse"], ["watch", "watch"], ["pencil", "pencil"]]) {
    assert.equal(rank(index, label).candidates[0].id, id);
  }
});
test("WordNet people and places are not mislabeled as everyday tools", () => {
  assert.equal(vocabulary.words.find((word) => normalize(word.label) === "child").category, "People");
  assert.equal(vocabulary.words.find((word) => normalize(word.label) === "city").category, "Places");
  assert.equal(rank(index, "what I use to call my daughter").candidates[0].id, "phone");
  assert.ok(!rank(index, "tool with prongs to eat food").candidates.slice(0, 6).some((candidate) => {
    const word = vocabulary.words.find((entry) => entry.id === candidate.id);
    return word.category === "Actions" || word.category === "People" || word.semanticType === "food";
  }));
});
test("the benchmark has 240+ cases and concept-disjoint splits", () => {
  assert.ok(benchmark.length >= 240);
  const development = new Set(benchmark.filter((row) => row.split === "development").flatMap((row) => row.acceptable));
  const heldOut = new Set(benchmark.filter((row) => row.split === "held-out").flatMap((row) => row.acceptable));
  assert.ok(development.size >= 40 && heldOut.size >= 40);
  assert.ok([...development].every((id) => !heldOut.has(id)));
});
test("function-based soup, fork, rain, and phone regressions", () => {
  for (const row of regressions.filter((entry) => !["negative", "ambiguous"].includes(entry.kind))) {
    const ids = rank(index, row.clue).candidates.slice(0, 6).map((candidate) => candidate.id);
    assert.ok(row.acceptable.some((id) => ids.includes(id)), `${row.id}: ${ids.join(", ")}`);
    assert.ok(!row.forbidden?.some((id) => ids.includes(id)), `${row.id}: forbidden result`);
  }
});
test("empty, filler, and random clues do not create padded results", () => {
  for (const clue of ["", "um the thing you know that one", "zxqv blorp flarg"]) {
    assert.equal(rank(index, clue).candidates.length, 0);
  }
});
test("personal descriptions use the same engine and custom filtering", () => {
  const personal = { id: "custom-maya", label: "Maya", category: "People", description: "My granddaughter who plays the cello", aliases: [], clues: [] };
  const local = createIndex([...vocabulary.words, personal]);
  const results = rank(local, "granddaughter playing cello").candidates;
  assert.ok(results.slice(0, 6).some((word) => word.id === personal.id));
  assert.deepEqual(filterCandidates(results, local.words, "My words", new Set()).map((word) => word.id), [personal.id]);
});
test("negative candidate constraints and token boundaries", () => {
  const ids = rank(index, "not a fruit, a metal scoop for soup").candidates.slice(0, 6).map((candidate) => candidate.id);
  assert.ok(!ids.includes("apple"));
  assert.ok(ids.includes("spoon"));
  assert.notEqual(rank(index, "yesterday").candidates[0]?.id, "yes");
});
test("invalid storage entries fail explicitly rather than corrupting the index", () => {
  assert.throws(() => createIndex([{ id: "bad", label: null }]), /Invalid/);
});
test("embedding dimension mismatch is detected", () => {
  assert.throws(() => cosineRows([1, 2], new Float32Array(3), ["a"], 2), /dimensions/);
  assert.deepEqual(cosineRows([1, 0], new Float32Array([1, 0, 0, 1]), ["a", "b"], 2), [
    { senseId: "a", similarity: 1 }, { senseId: "b", similarity: 0 }
  ]);
});
