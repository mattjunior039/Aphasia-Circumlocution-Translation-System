import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import wordnet from "wordnet-db";
import { coreWords, CORE_VERSION } from "../data/core.js";

const legacy = JSON.parse(await readFile(new URL("../tests/fixtures/legacy-words.json", import.meta.url)));
const categories = new Map([[4, "Actions"], [11, "Actions"], [12, "Feelings & needs"], [15, "Places"], [18, "People"]]);
const words = new Map(legacy.map((word) => [word.label.toLowerCase(), {
  ...word,
  aliases: word.aliases.filter((alias) => !["tea", "nurse", "caregiver", "watch", "pencil", "thirsty", "drink", "time", "girl", "boy", "fruit"].includes(alias)),
  source: "Wordbridge original editorial",
  priority: 1,
  senses: [{ id: `${word.id}:everyday`, description: word.description, functions: word.clues, properties: [], contexts: [] }]
}]));
for (const word of coreWords) words.set(word.label.toLowerCase(), word);

const counts = new Map();
for (const line of (await readFile(`${wordnet.path}/index.sense`, "utf8")).split("\n")) {
  const [key, offset, , frequency] = line.trim().split(/\s+/);
  if (!key || !Number(frequency)) continue;
  const pos = key.split("%")[1]?.[0];
  const id = `${pos === "1" ? "n" : pos === "2" ? "v" : "other"}-${offset}`;
  counts.set(id, (counts.get(id) || 0) + Number(frequency));
}
const records = [];
for (const pos of ["noun", "verb"]) {
  for (const line of (await readFile(`${wordnet.path}/data.${pos}`, "utf8")).split("\n")) {
    if (!/^\d/.test(line)) continue;
    const [metadata, gloss] = line.split(" | ");
    const fields = metadata.split(/\s+/);
    const [offset, lex, type, size] = fields;
    const id = `${type}-${offset}`;
    const frequency = counts.get(id) || 0;
    if (!frequency) continue;
    const names = [];
    for (let index = 0; index < parseInt(size, 16); index++) {
      const label = fields[4 + index * 2].replaceAll("_", " ");
      if (/^[a-z][a-z '-]{1,35}$/.test(label) && label.split(" ").length <= 3) names.push(label);
    }
    if (!names.length || !gloss) continue;
    records.push({
      id: `wn-${id}`,
      label: names[0],
      aliases: names.slice(1),
      category: pos === "verb" ? "Actions" : categories.get(Number(lex)) || "Everyday",
      description: gloss.split('; "')[0].trim(),
      frequency,
      semanticType: ({ 6: "artifact", 13: "food", 17: "physical", 27: "substance" })[Number(lex)] || "other",
      pos: type
    });
  }
}
records.sort((a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id));
for (const record of records) {
  const existing = words.get(record.label);
  const sense = {
    id: record.id,
    description: record.description,
    functions: [],
    properties: [],
    contexts: []
  };
  if (existing) {
    if (existing.source === "Princeton WordNet 3.1" && existing.senses.length < 2) existing.senses.push(sense);
    continue;
  }
  if (words.size >= 2500) continue;
  words.set(record.label, {
    id: record.id, label: record.label[0].toUpperCase() + record.label.slice(1),
    category: record.category, description: record.description,
    aliases: record.aliases, clues: [], priority: 0, semanticType: record.semanticType,
    senses: [sense], source: "Princeton WordNet 3.1"
  });
}
const entries = [...words.values()];
const digest = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
const output = new URL("../public/data/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("vocabulary.json", output), `${JSON.stringify({
  version: `${CORE_VERSION}-wordnet3.1-${digest.slice(0, 12)}`,
  sha256: digest,
  concepts: entries.length,
  curatedConcepts: entries.filter((entry) => entry.priority === 1).length,
  words: entries
}, null, 2)}\n`);
await writeFile(new URL("WORDNET-LICENSE.txt", output), await readFile(`${wordnet.path}/../LICENSE`, "utf8"));
console.log(`Built ${entries.length} unique labels, ${entries.reduce((sum, entry) => sum + entry.senses.length, 0)} senses; ${entries.filter((entry) => entry.priority === 1).length} editorial entries. ${digest.slice(0, 12)}`);
