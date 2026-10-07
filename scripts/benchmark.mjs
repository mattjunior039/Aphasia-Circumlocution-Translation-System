import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";
import { benchmark, regressions } from "../tests/fixtures/benchmark.js";
import { legacySearch } from "../tests/legacy-engine.js";
import { createIndex, rank } from "../search/engine.js";
import { cosineRows } from "../search/models.js";

const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url)));
const legacy = JSON.parse(await readFile(new URL("../tests/fixtures/legacy-words.json", import.meta.url)));
const index = createIndex(vocabulary.words);
const engines = [
  { name: "original-41-word", words: legacy, search: async (clue) => legacySearch(legacy, clue).map((word) => ({ id: word.id })) },
  { name: "expanded-lexical", words: vocabulary.words, search: async (clue) => rank(index, clue).candidates }
];
const disposables = [];
if (process.argv.includes("--semantic")) {
  env.localModelPath = fileURLToPath(new URL("../public/models/", import.meta.url));
  env.allowRemoteModels = false;
  for (const model of ["minilm", "bge"]) {
    const manifest = JSON.parse(await readFile(new URL(`../public/data/${model}-manifest.json`, import.meta.url)));
    if (manifest.vocabularySha256 !== vocabulary.sha256) throw new Error("Stale semantic index. Rebuild model assets.");
    const buffer = await readFile(new URL(`../public/data/${manifest.indexFile}`, import.meta.url));
    const vectors = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const extractor = await pipeline("feature-extraction", manifest.model, {
      dtype: manifest.dtype, device: "cpu", session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }
    });
    disposables.push(extractor);
    engines.push({
      name: `local-${model}`, words: vocabulary.words, model: manifest,
      search: async (clue) => {
        if (!clue.trim()) return [];
        const query = await extractor((manifest.queryPrefix || "") + clue, { pooling: manifest.pooling, normalize: true, truncation: true, max_length: 96 });
        return rank(index, clue, cosineRows(query.data, vectors, manifest.senseIds, manifest.dimensions)).candidates;
      }
    });
  }
}
const reports = [];
for (const engine of engines) {
  const results = [];
  for (const item of [...benchmark, ...regressions.map((entry) => ({ ...entry, split: "regression" }))]) {
    const start = performance.now();
    const candidates = await engine.search(item.clue);
    const rankOfAnswer = candidates.findIndex((candidate) => item.acceptable.includes(candidate.id)) + 1;
    results.push({
      ...item, candidates: candidates.slice(0, 6).map((candidate) => candidate.id),
      rank: rankOfAnswer, milliseconds: performance.now() - start,
      covered: !item.acceptable.length || engine.words.some((word) => item.acceptable.includes(word.id)),
      abstained: candidates.length === 0,
      forbiddenPresent: candidates.slice(0, 6).some((candidate) => item.forbidden?.includes(candidate.id))
    });
  }
  const metrics = {};
  for (const split of ["all", "development", "held-out", "regression"]) {
    const inSplit = (row) => split === "all" ? row.split !== "regression" : row.split === split;
    const rows = results.filter((row) => inSplit(row) && row.acceptable.length);
    const unambiguous = rows.filter((row) => row.kind === "unambiguous");
    const hit = (selected, k) => selected.length ? selected.filter((row) => row.rank > 0 && row.rank <= k).length / selected.length : null;
    const latencies = rows.map((row) => row.milliseconds).sort((a, b) => a - b);
    const negatives = results.filter((row) => inSplit(row) && row.kind === "negative");
    const ambiguous = rows.filter((row) => row.kind === "ambiguous");
    metrics[split] = {
      cases: rows.length, coverage: rows.length ? rows.filter((row) => row.covered).length / rows.length : null,
      top1Unambiguous: hit(unambiguous, 1), hit3: hit(rows, 3), hit6: hit(rows, 6),
      inVocabularyHit6: hit(rows.filter((row) => row.covered), 6),
      mrr: rows.length ? rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / rows.length : null,
      p50Milliseconds: latencies[Math.floor(latencies.length * 0.5)] ?? null,
      p95Milliseconds: latencies[Math.floor(latencies.length * 0.95)] ?? null,
      negativeAbstention: negatives.length ? negatives.filter((row) => row.abstained).length / negatives.length : null,
      ambiguityAnswerCoverage: ambiguous.length ? ambiguous.reduce((sum, row) =>
        sum + row.acceptable.filter((id) => row.candidates.includes(id)).length / row.acceptable.length, 0) / ambiguous.length : null,
      forbiddenCases: rows.filter((row) => row.forbiddenPresent).length
    };
  }
  reports.push({ engine: engine.name, model: engine.model || null, metrics, results });
  console.log(engine.name, JSON.stringify(metrics["held-out"]), "regressions", JSON.stringify(metrics.regression));
}
for (const extractor of disposables) await extractor.dispose();
await mkdir(new URL("../evaluation/", import.meta.url), { recursive: true });
const semantic = process.argv.includes("--semantic");
await writeFile(new URL(`../evaluation/${semantic ? "semantic" : "lexical"}-report.json`, import.meta.url), `${JSON.stringify({
  vocabularyVersion: vocabulary.version,
  benchmarkVersion: "editorial-240-v1",
  regressionVersion: "regression-v2-verified-sofa-id",
  limitation: "The 80 main target concepts expand beyond the original 41-word bank. This is a coverage-expansion benchmark, not a representative estimate of the original app's accuracy on familiar words. The negative regression set has only five cases.",
  runtime: process.version, platform: process.platform, architecture: process.arch,
  notice: "Synthetic editorial evaluation; not clinical validation. Held-out concepts are disjoint from tuning concepts. No real-device mobile measurements.",
  reports
}, null, 2)}\n`);
