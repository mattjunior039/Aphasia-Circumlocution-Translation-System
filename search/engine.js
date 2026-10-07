export const CATEGORIES = ["Everyday", "People", "Places", "Feelings & needs", "Actions"];
const STOP = new Set("a an and are as at be been being but by can could did do does doing for from had has have having he her here i if in is it its me my of on or our she so that the their them there they this to was we were what when where which who will with would you your thing things something someone use used uses please um uh".split(" "));
const LEMMAS = new Map(Object.entries({
  ate: "eat", eaten: "eat", eating: "eat", teeth: "tooth", feet: "foot", children: "child",
  knives: "knife", glasses: "glass", dishes: "dish", drank: "drink", drinking: "drink",
  writing: "write", written: "write", wrote: "write", sitting: "sit", sat: "sit",
  running: "run", ran: "run", told: "tell", tells: "tell", held: "hold",
  bought: "buy", buying: "buy", cutting: "cut", sleeping: "sleep", slept: "sleep",
  neighbours: "neighbor", neighbour: "neighbor", colour: "color", favourite: "favorite",
  cellphone: "phone", trousers: "trouser"
}));

export function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

export function lemma(token) {
  if (LEMMAS.has(token)) return LEMMAS.get(token);
  if (token.length > 5 && token.endsWith("ing")) {
    let root = token.slice(0, -3);
    if (root.at(-1) === root.at(-2)) root = root.slice(0, -1);
    return root;
  }
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokens(text) {
  return normalize(text).split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)).map(lemma);
}

export function wordSenses(word) {
  return word.senses?.length ? word.senses : [{
    id: `${word.id}:personal`,
    description: word.description,
    functions: word.clues || [],
    properties: [], contexts: []
  }];
}

export function senseText(word, sense) {
  return [
    word.label, ...word.aliases, sense.description,
    ...sense.functions, ...sense.properties, ...sense.contexts
  ].join(". ");
}

export function validateVocabulary(words) {
  if (!Array.isArray(words)) throw new Error("Vocabulary must be an array.");
  const ids = new Set();
  const senses = new Set();
  for (const word of words) {
    if (!word || typeof word.id !== "string" || !word.id || ids.has(word.id)
      || typeof word.label !== "string" || !word.label.trim()
      || typeof word.description !== "string" || !word.description.trim()
      || !CATEGORIES.includes(word.category)
      || !Array.isArray(word.aliases) || word.aliases.some((value) => typeof value !== "string")
      || !Array.isArray(word.clues) || word.clues.some((value) => typeof value !== "string")) {
      throw new Error(`Invalid or duplicate word entry: ${word?.id ?? "unknown"}`);
    }
    ids.add(word.id);
    for (const sense of wordSenses(word)) {
      if (!sense.id || senses.has(sense.id) || typeof sense.description !== "string"
        || !["functions", "properties", "contexts"].every((key) =>
          Array.isArray(sense[key]) && sense[key].every((value) => typeof value === "string"))) {
        throw new Error(`Invalid or duplicate sense: ${sense.id}`);
      }
      senses.add(sense.id);
    }
  }
  return true;
}

export function createIndex(words) {
  validateVocabulary(words);
  const documents = words.flatMap((word) => wordSenses(word).map((sense) => {
    const terms = new Map();
    for (const [text, weight] of [
      [word.label, 2], [word.aliases.join(" "), 1.5], [sense.description, 1],
      [sense.functions.join(" "), 2.5], [sense.properties.join(" "), 1],
      [sense.contexts.join(" "), 0.5]
    ]) {
      for (const token of tokens(text)) terms.set(token, (terms.get(token) || 0) + weight);
    }
    const description = normalize(sense.description);
    const isConsumable = word.semanticType === "food" || /^(?:a |an )?(?:(?:warm|cold|clear|dark|white|liquid|crisp|round|curved|baked|yellow|soft|hot|small|starchy|edible|domestic) ){0,5}(?:food|fruit|drink|beverage|liquid food|animal)\b/.test(description)
      || /\b(?:a|an) (?:.* )?(?:fruit|food) (?:that|made|enclosed|often)\b/.test(description);
    return { word, sense, terms, isConsumable, length: [...terms.values()].reduce((sum, count) => sum + count, 0) };
  }));
  const frequency = new Map();
  for (const document of documents) {
    for (const token of document.terms.keys()) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  return { words, documents, frequency, averageLength: documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, documents.length) };
}

function excludedTerms(query) {
  const matches = normalize(query).matchAll(/\b(?:not|isn't|isnt|without)\s+(?:(?:a|an|the)\s+)?([\p{L}]+)/gu);
  return [...matches].map((match) => lemma(match[1]));
}

function lexicalScores(index, query) {
  const exclusions = excludedTerms(query);
  const queryTerms = [...new Set(tokens(query))].filter((term) => !["not", "without"].includes(term) && !exclusions.includes(term));
  return index.documents.map((document) => {
    let score = 0;
    const matched = [];
    for (const token of queryTerms) {
      const tf = document.terms.get(token) || 0;
      if (!tf) continue;
      const df = index.frequency.get(token) || 0;
      const idf = Math.log(1 + (index.documents.length - df + 0.5) / (df + 0.5));
      score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * document.length / index.averageLength));
      matched.push(token);
    }
    if (exclusions.some((token) => document.terms.has(token))) score *= 0.12;
    return { ...document, score, matched, excluded: exclusions.some((token) => document.terms.has(token)) };
  });
}

export function queryIntent(query) {
  const text = normalize(query);
  const object = /\b(?:use|using|used)\b.{0,40}\b(?:to|for)\b/.test(text)
    || /\b(?:tool|utensil|device|equipment|container|vessel)\b/.test(text);
  const fillerOnly = !tokens(text.replace(/\byou know\b|\bthat one\b/g, "")).length;
  const unknowable = /\b(?:my|our)\b.{0,35}\b(?:secret|password|access code|pin)\b/.test(text)
    || /\bname\b.{0,25}\bperson\b.{0,25}\bi (?:met|saw)\b/.test(text);
  return { object, fillerOnly, unknowable };
}

export function shouldAbstain(index, query) {
  const intent = queryIntent(query);
  const recognized = tokens(query).some((term) => index.frequency.has(term));
  if (intent.fillerOnly || !recognized) return true;
  if (intent.unknowable && !index.words.some((word) =>
    word.id.startsWith("custom-") && tokens(word.description).some((token) => tokens(query).includes(token)))) return true;
  return false;
}

function explanation(result) {
  const purpose = result.sense.functions.find((text) => tokens(text).some((term) => result.matched.includes(term)));
  return purpose || result.sense.description;
}

function clarification(candidates, index) {
  if (candidates.length < 2) return null;
  const first = index.words.find((word) => word.id === candidates[0].id);
  const second = index.words.find((word) => word.id === candidates[1].id);
  if (!first || !second || candidates[0].score - candidates[1].score > 0.2) return null;
  const firstSense = wordSenses(first).find((sense) => sense.id === candidates[0].senseId);
  const secondSense = wordSenses(second).find((sense) => sense.id === candidates[1].senseId);
  return {
    question: "Which description is closer to what you mean?",
    choices: [
      { id: first.id, label: firstSense.functions[0] || firstSense.description },
      { id: second.id, label: secondSense.functions[0] || secondSense.description }
    ]
  };
}

/**
 * @returns {{engine: string, candidates: {id: string, senseId: string, score: number, explanation: string}[], clarification: object|null}}
 */
export function rank(index, query, semantic = null) {
  const cleaned = normalize(query);
  if (!cleaned || shouldAbstain(index, query)) return { engine: semantic ? "local-semantic" : "local-lexical", candidates: [], clarification: null };
  const exact = index.words.filter((word) => [word.label, ...word.aliases].some((name) => normalize(name) === cleaned));
  if (exact.length) {
    return {
      engine: semantic ? "local-semantic" : "local-lexical",
      candidates: exact.map((word) => ({ id: word.id, senseId: wordSenses(word)[0].id, score: 1, explanation: word.description })),
      clarification: null
    };
  }
  const intent = queryIntent(query);
  const scored = lexicalScores(index, query).filter((entry) =>
    !intent.object || (entry.word.category === "Everyday" && !entry.isConsumable
      && (!entry.word.semanticType || ["artifact", "physical", "substance"].includes(entry.word.semanticType))));
  const bestLexical = Math.max(0, ...scored.map((entry) => entry.score));
  const semanticMap = semantic ? new Map(semantic.map((entry) => [entry.senseId, entry.similarity])) : null;
  const results = scored.map((entry) => {
    const lexical = bestLexical ? entry.score / bestLexical : 0;
    const similarity = semanticMap?.get(entry.sense.id) ?? 0;
    const score = semantic
      ? 0.8 * similarity + 0.2 * lexical - (entry.excluded ? 0.4 : 0)
      : lexical;
    return { ...entry, similarity, score };
  }).filter((entry) => semantic
    ? entry.similarity >= 0.32 && !entry.excluded
    : entry.matched.length > 0 && !entry.excluded && entry.score >= 0.42);
  results.sort((a, b) => b.score - a.score || (b.word.priority || 0) - (a.word.priority || 0) || a.word.label.localeCompare(b.word.label));
  const best = results[0]?.score ?? 0;
  const distinct = new Map();
  for (const entry of results) {
    if (semantic && entry.score < best - 0.2) continue;
    if (!distinct.has(entry.word.id)) distinct.set(entry.word.id, {
      id: entry.word.id,
      senseId: entry.sense.id,
      score: entry.score,
      explanation: explanation(entry)
    });
    if (distinct.size >= 30) break;
  }
  const candidates = [...distinct.values()];
  return { engine: semantic ? "local-semantic" : "local-lexical", candidates, clarification: clarification(candidates, index) };
}

export function filterCandidates(candidates, words, category, savedIds) {
  const byId = new Map(words.map((word) => [word.id, word]));
  return candidates.filter((candidate) => {
    const word = byId.get(candidate.id);
    if (!word) return false;
    if (category === "Saved") return savedIds.has(word.id);
    if (category === "My words") return word.id.startsWith("custom-");
    return category === "all" || word.category === category;
  });
}
