const stop = new Set("a an and are as at be been being but by can could did do does doing for from had has have having he her here i if in is it its me my of on or our she so that the their them there they this to was we were what when where which who will with would you your tell tells someone something thing use used uses".split(" "));
const normalize = (text) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (text) => normalize(text).split(/\s+/).filter((token) => token.length > 1 && !stop.has(token));

export function legacySearch(words, query) {
  const cleaned = normalize(query);
  if (!cleaned) return words;
  function score(word) {
    const label = normalize(word.label);
    const aliases = word.aliases.map(normalize);
    if (label === cleaned || aliases.includes(cleaned)) return 100;
    let value = 0;
    const fields = [
      { values: [label, ...aliases], weight: 4 },
      { values: word.clues.map(normalize), weight: 2 },
      { values: [normalize(word.description)], weight: 1 }
    ];
    for (const token of new Set(tokens(query))) {
      for (const field of fields) {
        if (field.values.some((text) => text.split(/\s+/).includes(token))) {
          value += field.weight;
          break;
        }
      }
    }
    if ([label, ...aliases, ...word.clues.map(normalize)].some((text) => text && cleaned.includes(text))) value += 6;
    return value;
  }
  let matches = words.map((word) => ({ word, score: score(word) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.word.label.localeCompare(b.word.label))
    .map((item) => item.word);
  const exact = matches.filter((word) => normalize(word.label) === cleaned || word.aliases.some((alias) => normalize(alias) === cleaned));
  if (exact.length) return exact;
  matches = matches.filter((word) => {
    if (tokens(query).length < 2) return score(word) >= 2;
    const fields = [word.label, ...word.aliases, ...word.clues, word.description].map((text) => normalize(text).split(/\s+/));
    return [...new Set(tokens(query))].filter((token) => fields.some((field) => field.includes(token))).length >= 2;
  });
  return matches;
}
