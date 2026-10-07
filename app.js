import { createIndex, rank, normalize, validateVocabulary, filterCandidates } from "./search/engine.js";
import { SemanticClient } from "./search/semantic-client.js";
import { validateBackup } from "./search/backup.js";

const STORAGE_KEYS = {
  custom: "wordbridge.customWords.v1",
  saved: "wordbridge.savedWords.v1",
  preferences: "wordbridge.preferences.v1"
};
const storageWarnings = [];
const blockedStorage = new Set();
function readStorage(key, fallback, validate) {
  try {
    const text = localStorage.getItem(key);
    if (text === null) return fallback;
    const value = JSON.parse(text);
    if (!validate(value)) throw new Error("Saved data has an unsupported shape.");
    return value;
  } catch (error) {
    console.error(`Could not load ${key}: ${error.message}`);
    storageWarnings.push("Some saved data could not be loaded. It has not been deleted. Check browser storage or restore a backup before saving changes.");
    blockedStorage.add(key);
    return fallback;
  }
}
const state = {
  vocabulary: [], index: null, result: null,
  query: "", refinement: "", clarificationDismissed: false,
  activeCategory: "all", visibleCount: 24,
  selectedWordId: null, editingWordId: null, generation: 0,
  engine: "lexical", busy: false,
  customWords: readStorage(STORAGE_KEYS.custom, [], (value) => {
    validateVocabulary(value);
    return value.every((word) => word.id.startsWith("custom-"));
  }),
  savedIds: new Set(readStorage(STORAGE_KEYS.saved, [], (value) =>
    Array.isArray(value) && value.every((id) => typeof id === "string"))),
  preferences: readStorage(STORAGE_KEYS.preferences, { largeText: false, highContrast: false }, (value) =>
    value && typeof value.largeText === "boolean" && typeof value.highContrast === "boolean")
};
const elements = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#clue-input"),
  grid: document.querySelector("#word-grid"),
  status: document.querySelector("#result-status"),
  empty: document.querySelector("#empty-state"),
  announcer: document.querySelector("#announcer"),
  addPanel: document.querySelector("#add-panel"),
  addForm: document.querySelector("#add-word-form"),
  addMessage: document.querySelector("#add-message"),
  speechStatus: document.querySelector("#speech-status"),
  engineStatus: document.querySelector("#engine-status"),
  engineButton: document.querySelector("#semantic-button"),
  more: document.querySelector("#load-more"),
  clarification: document.querySelector("#clarification"),
  storageStatus: document.querySelector("#storage-status")
};
const semantic = new SemanticClient(({ state: engineState, message }) => {
  elements.engineStatus.textContent = message;
  elements.engineButton.disabled = engineState === "loading";
  if (engineState === "ready") {
    state.engine = "semantic";
    elements.engineButton.textContent = "Use basic matching";
    if (state.query) void runSearch();
  } else if (engineState === "error") {
    state.engine = "lexical";
    elements.engineButton.textContent = "Retry on-device model";
    if (state.query) void runSearch();
  }
});
document.querySelector("#backup-button").addEventListener("click", () => {
  if (blockedStorage.size) {
    elements.storageStatus.textContent = "Some saved data could not be loaded, so a complete backup cannot be made. The original browser data has not been overwritten.";
    return;
  }
  const backup = { version: 1, customWords: state.customWords, savedIds: [...state.savedIds], preferences: state.preferences };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "wordbridge-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("Your backup contains personal words and preferences. Keep the downloaded file private.");
});
const restoreInput = document.querySelector("#restore-input");
document.querySelector("#restore-button").addEventListener("click", () => restoreInput.click());
restoreInput.addEventListener("change", async () => {
  const file = restoreInput.files[0];
  restoreInput.value = "";
  if (!file) return;
  try {
    if (!state.index) throw new Error("Wait for the vocabulary to finish loading.");
    if (file.size > 1024 * 1024) throw new Error("The backup is too large. The supported limit is 1 MB.");
    const backup = validateBackup(JSON.parse(await file.text()), state.vocabulary);
    if (!window.confirm("Restore this backup? It will replace the personal words, saved words, and display preferences in this browser.")) return;
    const previous = Object.values(STORAGE_KEYS).map((key) => [key, localStorage.getItem(key)]);
    try {
      localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(backup.customWords));
      localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(backup.savedIds));
      localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(backup.preferences));
    } catch (error) {
      try {
        for (const [key, value] of previous) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      } catch (rollbackError) {
        throw new Error(`Restore failed and could not be fully undone: ${rollbackError.message}. Keep your backup and check browser storage.`);
      }
      throw error;
    }
    blockedStorage.clear();
    state.customWords = backup.customWords;
    state.savedIds = new Set(backup.savedIds);
    state.preferences = backup.preferences;
    state.activeCategory = "My words";
    if (!elements.addPanel.hidden) closeAddForm();
    rebuildIndex();
    resetSearch();
    updatePreferences();
    elements.storageStatus.textContent = "Backup restored. Your personal words and preferences are stored in this browser.";
  } catch (error) {
    console.error(`Backup restore failed: ${error.message}`);
    elements.storageStatus.textContent = `Backup could not be restored: ${error.message}`;
  }
});

function allWords() { return [...state.vocabulary, ...state.customWords]; }
function rebuildIndex() { state.index = createIndex(allWords()); }
function announce(message) { elements.announcer.textContent = message; }
function writeStorage(key, value) {
  try {
    if (blockedStorage.has(key)) throw new Error("Saved data needs recovery before it can be overwritten.");
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key}: ${error.message}`);
    elements.storageStatus.textContent = `This change could not be saved: ${error.message} Check browser storage settings or restore a valid backup.`;
    announce(elements.storageStatus.textContent);
    return false;
  }
}
function makeButton(className, label, action, accessibleLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", accessibleLabel || label);
  button.addEventListener("click", action);
  return button;
}
function renderCard(word) {
  const card = document.createElement("article");
  card.className = "word-card";
  const top = document.createElement("div");
  top.className = "card-top";
  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = word.label;
  const category = document.createElement("span");
  category.className = "word-category";
  category.textContent = word.category;
  titleGroup.append(title, category);
  const saved = state.savedIds.has(word.id);
  const saveButton = makeButton("save-button", saved ? "♥" : "♡", () => toggleSaved(word.id),
    saved ? `Remove ${word.label} from saved words` : `Save ${word.label}`);
  saveButton.classList.toggle("is-saved", saved);
  saveButton.setAttribute("aria-pressed", String(saved));
  top.append(titleGroup, saveButton);
  const description = document.createElement("p");
  description.className = "word-description";
  const candidate = state.result?.candidates.find((entry) => entry.id === word.id);
  description.textContent = candidate?.explanation || word.description;
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(
    makeButton("choose-button", "This is my word", () => selectWord(word.id), `Choose ${word.label}`),
    makeButton("speak-button", "Hear it", () => speakWord(word.label), `Hear ${word.label}`)
  );
  if (word.id.startsWith("custom-")) {
    actions.append(
      makeButton("manage-button", "Edit", () => showAddForm(word), `Edit ${word.label}`),
      makeButton("manage-button", "Remove", () => removeCustomWord(word.id), `Remove ${word.label}`)
    );
  }
  card.append(top, description, actions);
  return card;
}
function renderSelectedWord() {
  document.querySelector(".selected-word")?.remove();
  const word = allWords().find((entry) => entry.id === state.selectedWordId);
  if (!word) return;
  const panel = document.createElement("section");
  panel.className = "selected-word";
  panel.setAttribute("aria-label", "Selected word");
  const label = document.createElement("p");
  label.className = "selected-word-label";
  label.textContent = "YOU FOUND A POSSIBILITY";
  const content = document.createElement("div");
  content.className = "selected-word-content";
  const text = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = word.label;
  const description = document.createElement("p");
  description.textContent = "Does this feel like the word you mean?";
  text.append(heading, description);
  content.append(text, makeButton("primary-button", "Say this word", () => speakWord(word.label)));
  panel.append(label, content);
  elements.more.after(panel);
}
function matchingWords() {
  const words = allWords();
  const candidates = state.query
    ? state.result?.candidates || []
    : words.map((word) => ({ id: word.id }));
  const byId = new Map(words.map((word) => [word.id, word]));
  return filterCandidates(candidates, words, state.activeCategory, state.savedIds).map((candidate) => byId.get(candidate.id));
}
function renderClarification() {
  elements.clarification.replaceChildren();
  const clarification = state.result?.clarification;
  elements.clarification.hidden = !clarification || state.clarificationDismissed || state.busy;
  if (elements.clarification.hidden) return;
  const heading = document.createElement("h3");
  heading.textContent = clarification.question;
  const hint = document.createElement("p");
  hint.textContent = "Optional: pick a description to narrow your clue, or keep exploring.";
  elements.clarification.append(heading, hint);
  for (const choice of clarification.choices) {
    elements.clarification.append(makeButton("outline-button", choice.label, () => {
      state.refinement = choice.label;
      state.clarificationDismissed = true;
      void runSearch();
    }));
  }
  elements.clarification.append(makeButton("text-button", "Skip this question", () => {
    state.clarificationDismissed = true;
    elements.clarification.hidden = true;
    elements.input.focus();
  }));
}
function render() {
  const words = matchingWords();
  const visible = words.slice(0, state.visibleCount);
  elements.grid.replaceChildren(...visible.map(renderCard));
  elements.grid.setAttribute("aria-busy", String(state.busy));
  elements.empty.hidden = words.length !== 0 || state.busy || !state.index;
  elements.more.hidden = state.busy || words.length <= visible.length;
  elements.more.textContent = state.query ? "Show more possibilities" : "Show more words";
  if (state.busy) elements.status.textContent = "Looking for possibilities on this device…";
  else if (state.query) elements.status.textContent = words.length
    ? `Showing ${visible.length} of ${words.length} possibilities. These are suggestions, not certain answers.`
    : "No close matches in this category. Try another clue, choose All words, or add a personal word.";
  else elements.status.textContent = `Showing ${visible.length} of ${words.length} words. Add a clue to search all ${allWords().length.toLocaleString()} entries.`;
  document.querySelectorAll(".category-chip").forEach((button) => {
    const active = button.dataset.category === state.activeCategory;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderClarification();
  renderSelectedWord();
}
async function runSearch() {
  if (!state.index) {
    announce("The vocabulary is still loading. Please try again when it is ready.");
    return;
  }
  const generation = ++state.generation;
  const started = performance.now();
  state.busy = true;
  state.result = null;
  state.visibleCount = state.query ? 6 : 24;
  render();
  const query = `${state.query} ${state.refinement}`.trim();
  try {
    const result = state.engine === "semantic"
      ? await semantic.search(query, state.customWords)
      : rank(state.index, query);
    if (generation !== state.generation) return;
    state.result = result;
  } catch (error) {
    if (generation !== state.generation) return;
    elements.engineStatus.textContent = `${error.message} Showing limited basic matches instead.`;
    state.result = rank(state.index, query);
    announce(elements.engineStatus.textContent);
  } finally {
    if (generation === state.generation) {
      state.busy = false;
      render();
      performance.clearMeasures("wordbridge-search");
      performance.measure("wordbridge-search", { start: started, end: performance.now() });
    }
  }
}
function resetSearch() {
  state.generation++;
  state.query = "";
  state.refinement = "";
  state.result = null;
  state.busy = false;
  state.selectedWordId = null;
  state.clarificationDismissed = false;
  state.visibleCount = 24;
  elements.input.value = "";
  render();
}
function selectWord(id) {
  state.selectedWordId = id;
  renderSelectedWord();
  const word = allWords().find((entry) => entry.id === id);
  announce(`${word.label} selected. ${word.description}`);
}
function toggleSaved(id) {
  const savedIds = new Set(state.savedIds);
  const wasSaved = savedIds.has(id);
  if (wasSaved) savedIds.delete(id);
  else savedIds.add(id);
  if (!writeStorage(STORAGE_KEYS.saved, [...savedIds])) return;
  state.savedIds = savedIds;
  render();
  const word = allWords().find((entry) => entry.id === id);
  announce(wasSaved ? `${word.label} removed from saved words.` : `${word.label} saved on this device.`);
}
function speakWord(text) {
  if (!("speechSynthesis" in window)) {
    announce("Spoken output is not available in this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en";
  utterance.onerror = () => announce("Spoken output failed. The selected word is still displayed.");
  window.speechSynthesis.speak(utterance);
}
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = elements.input.value.trim();
  state.refinement = "";
  state.selectedWordId = null;
  state.clarificationDismissed = false;
  if (!state.query) {
    resetSearch();
    announce("Type or speak a clue, or browse the words below.");
    elements.input.focus();
    return;
  }
  void runSearch();
});
document.querySelector("#clear-button").addEventListener("click", () => {
  resetSearch();
  elements.input.focus();
});
document.querySelectorAll(".example-chip").forEach((button) => button.addEventListener("click", () => {
  elements.input.value = button.dataset.example;
  elements.form.requestSubmit();
}));
document.querySelector("#category-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  state.visibleCount = state.query ? 6 : 24;
  render();
});
elements.more.addEventListener("click", () => {
  const previousCount = state.visibleCount;
  state.visibleCount += state.query ? 6 : 24;
  render();
  elements.grid.querySelectorAll(".choose-button")[previousCount]?.focus();
});
document.querySelector("#show-all-button").addEventListener("click", () => {
  state.activeCategory = "all";
  resetSearch();
});
elements.engineButton.addEventListener("click", () => {
  if (state.engine === "semantic") {
    state.generation++;
    semantic.stop();
    state.engine = "lexical";
    elements.engineStatus.textContent = "Basic word matching is active. It is less reliable for descriptions.";
    elements.engineButton.textContent = "Enable on-device semantic search";
    if (state.query) void runSearch();
  } else {
    semantic.start("minilm");
  }
});
function showAddForm(word = null) {
  state.editingWordId = word?.id ?? null;
  document.querySelector("#add-title").textContent = word ? "Edit personal word" : "Add a personal word";
  elements.addForm.querySelector("[type='submit']").textContent = word ? "Save changes" : "Save my word";
  document.querySelector("#word-name").value = word?.label ?? "";
  document.querySelector("#word-clues").value = word?.description ?? "";
  document.querySelector("#word-category").value = word?.category ?? "Everyday";
  elements.addPanel.hidden = false;
  elements.addMessage.textContent = "";
  document.querySelector("#word-name").focus();
}
function closeAddForm() {
  elements.addPanel.hidden = true;
  state.editingWordId = null;
  elements.addForm.reset();
  document.querySelector("#add-word-button").focus();
}
document.querySelector("#add-word-button").addEventListener("click", () => showAddForm());
document.querySelector("#close-add-button").addEventListener("click", closeAddForm);
document.querySelector("#cancel-add-button").addEventListener("click", closeAddForm);
function removeCustomWord(id) {
  const word = state.customWords.find((entry) => entry.id === id);
  if (!word || !window.confirm(`Remove ${word.label} from your personal words?`)) return;
  const updatedWords = state.customWords.filter((entry) => entry.id !== id);
  if (!writeStorage(STORAGE_KEYS.custom, updatedWords)) return;
  state.customWords = updatedWords;
  if (state.savedIds.has(id)) {
    state.savedIds.delete(id);
    writeStorage(STORAGE_KEYS.saved, [...state.savedIds]);
  }
  if (state.selectedWordId === id) state.selectedWordId = null;
  rebuildIndex();
  if (state.query) void runSearch();
  else render();
  announce(`${word.label} removed from your personal words.`);
}
elements.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = document.querySelector("#word-name").value.trim();
  const clues = document.querySelector("#word-clues").value.trim();
  const category = document.querySelector("#word-category").value;
  if (!label || !clues) {
    elements.addMessage.textContent = "Please enter both the word and a description.";
    return;
  }
  if (allWords().some((word) => word.id !== state.editingWordId && normalize(word.label) === normalize(label))) {
    elements.addMessage.textContent = "That word is already in the list. Give your personal entry a more specific name.";
    return;
  }
  const existing = state.customWords.find((word) => word.id === state.editingWordId);
  const word = { id: existing?.id ?? `custom-${crypto.randomUUID()}`, label, category, description: clues, aliases: [], clues: [clues] };
  const updatedWords = existing ? state.customWords.map((entry) => entry.id === word.id ? word : entry) : [...state.customWords, word];
  if (!writeStorage(STORAGE_KEYS.custom, updatedWords)) return;
  state.customWords = updatedWords;
  rebuildIndex();
  closeAddForm();
  state.activeCategory = "My words";
  resetSearch();
  announce(`${label} ${existing ? "updated" : "added to your personal words"}.`);
});
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const listenButton = document.querySelector("#listen-button");
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "en";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  listenButton.addEventListener("click", () => {
    if (!window.confirm("Your browser's voice recognition may send audio to its speech service. Allow voice input for this clue?")) return;
    try {
      recognition.start();
    } catch (error) {
      console.error(`Voice input could not start: ${error.message}`);
      elements.speechStatus.textContent = "Voice input could not start. Please type or try again.";
    }
  });
  recognition.addEventListener("start", () => {
    listenButton.classList.add("is-listening");
    elements.speechStatus.textContent = "Listening… Your browser's speech service handles the audio.";
  });
  recognition.addEventListener("result", (event) => {
    elements.input.value = event.results[0][0].transcript;
    elements.speechStatus.textContent = "Your clue is ready. Choose Find my word when ready.";
    elements.input.focus();
  });
  recognition.addEventListener("error", () => {
    elements.speechStatus.textContent = "Voice input was unavailable or not permitted. Please type your clue.";
  });
  recognition.addEventListener("end", () => listenButton.classList.remove("is-listening"));
} else listenButton.addEventListener("click", () => {
  elements.speechStatus.textContent = "Voice input is not available in this browser. Please type your clue.";
});
function updatePreferences() {
  for (const [key, className, id, activeText, inactiveText] of [
    ["largeText", "large-text", "#text-size-toggle", "Standard text", "Larger text"],
    ["highContrast", "high-contrast", "#contrast-toggle", "Standard contrast", "High contrast"]
  ]) {
    const enabled = Boolean(state.preferences[key]);
    document.body.classList.toggle(className, enabled);
    const button = document.querySelector(id);
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? activeText : inactiveText;
  }
}
for (const [id, key] of [["#text-size-toggle", "largeText"], ["#contrast-toggle", "highContrast"]]) {
  document.querySelector(id).addEventListener("click", () => {
    const preferences = { ...state.preferences, [key]: !state.preferences[key] };
    if (!writeStorage(STORAGE_KEYS.preferences, preferences)) return;
    state.preferences = preferences;
    updatePreferences();
  });
}
updatePreferences();
elements.storageStatus.textContent = [...new Set(storageWarnings)].join(" ");
try {
  const response = await fetch("/data/vocabulary.json");
  if (!response.ok) throw new Error(`Vocabulary request failed (${response.status}).`);
  const data = await response.json();
  validateVocabulary(data.words);
  state.vocabulary = data.words;
  rebuildIndex();
  elements.engineStatus.textContent = `${data.concepts.toLocaleString()} words available. Basic matching is active; enable the on-device model for semantic suggestions.`;
  render();
} catch (error) {
  console.error(`Vocabulary initialization failed: ${error.message}`);
  elements.status.textContent = "The vocabulary could not be loaded. Start the app with npm run dev, or reload to try again.";
  elements.engineStatus.textContent = error.message;
  elements.engineButton.disabled = true;
  announce(elements.status.textContent);
}
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "offline-cache-error") {
      elements.storageStatus.textContent = "Offline asset caching failed. Keep the local server available and check browser storage before using the app offline.";
    }
  });
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    elements.storageStatus.textContent = `Offline caching is unavailable: ${error.message}. The app requires the local server to remain running.`;
  });
}
