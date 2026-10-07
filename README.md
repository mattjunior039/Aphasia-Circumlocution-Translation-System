# Wordbridge

A local, private, and supportive word-finding companion. Describe what you mean, explore possible words, and optionally clarify your clue. 

> **Disclaimer:** This is an experimental communication aid, not a guaranteed translation or a clinically validated treatment.

## 📥 Download

**[Download Mac App (macOS Apple Silicon)](https://github.com/mattjunior039/Aphasia-Circumlocution-Translation-System/releases)**

The desktop app includes the vocabulary and MiniLM assets out of the box and needs no web server or internet connection for word search. Once installed, simply enable **on-device semantic search** to load the included model.

---

## 🚀 Features

- **2,500+ unique word labels and ~4,000 senses**: A broad vocabulary built in.
- **On-device Privacy**: Search results connect to selection, spoken output, saved words, and personal vocabulary entirely on your device. No cloud integration or API key requirement. No clues or personal vocabulary are sent to an external AI provider.
- **Advanced Semantic Search**: Shared search engine with exact-word lookup, lexical ranking, structured object-purpose constraints, and optional local sentence-embedding retrieval.
- **Differentiated Meanings**: Distinct words such as tea/coffee, nurse/doctor, pencil/pen, and watch/clock no longer collapse into misleading exact aliases.
- **Personal Vocabulary**: Add your own words and clues, which are embedded only on your device, even after edits.
- **Accessible & Resilient**: Private backup/restore, explicit storage failures, corrupt-data protection, keyboard support, text/contrast controls, and loading/error announcements.

*Example:* “Round thing I use to eat soup” suggests **bowl and spoon**, without "apple". “What I use to call my daughter” suggests **phone**. 

---

## 💻 Web App Usage (Local Development)

Wordbridge can also be run as a local web application.

### Prerequisites
- Node.js 22.12+ (or 20.19+)
- (Tested on Node 26 and Chrome on macOS)

### Running Locally

```sh
npm install
npm run dev
```

Open the **Local** address printed in your terminal. Enable **on-device semantic search** below the clue input to use the MiniLM-based engine.

### Migration for Web App Users

If you previously used a directly opened `index.html` (via `file://`), you will need to migrate your saved words, as browser storage is tied to the address.
1. Open the original `index.html` file directly.
2. Use **Export previous saved words** in the migration panel.
3. Start the local server (`npm run dev`), open it, and choose **Restore backup**.

---

## 🛠️ Build and Offline Use

### Web Build
```sh
npm run build
npm run preview
```
The production build installs an app-scoped service worker. Load it online, allow installation, reload, and enable the local model once so its assets can be cached. Subsequent offline reload and local inference work smoothly (tested in Chrome).

### Desktop App Build (Native)
```sh
npm install
npm run app:dev      # build and open the native app
npm run app:build    # build one macOS arm64 app and DMG in releases/
npm run test:desktop # test the built renderer in Electron
```
The native desktop app uses bundled assets instead of a service worker and starts offline immediately. Release output is in `releases/`.

---

## 📊 Measured Quality and Limitations

*MiniLM* is the current opt-in UI engine (about 23 MB). *BGE* remains an evaluated alternative, but not a silently selected cloud service.

Please note:
- The system was tested on an editorial dataset, which does not represent actual patient data.
- Results do not establish general-language accuracy or clinical efficacy. 
- Negation, vague personal references, and anatomical versus object descriptions can still confuse the engine. Do not interpret similarities as probabilities.

For detailed metrics and methodology, see the [Evaluation README](./evaluation/README.md) and the reproducible [semantic report](./evaluation/semantic-report.json).

---

## 🧪 Validation and Testing

Wordbridge includes comprehensive test suites:

```sh
npm test                   # unit, schema, baseline, index, and regression tests
npm run test:browser       # development end-to-end tests
npm run build
npm run test:offline       # production model loading and offline reload/inference
npm run app:renderer
npm run test:desktop       # native layout, model search, preferences, and resize
npm run benchmark          # original baseline versus expanded lexical search
npm run benchmark:semantic # same dataset through lexical, MiniLM, and BGE
```

Tests use an installed Google Chrome (`channel: "chrome"`). The test servers use fixed project-specific ports and stop automatically.

---

## 🔄 Rebuilding Data and Models

If you modify the vocabulary, regenerate the semantic indexes:

```sh
npm run data:build
npm run models:build -- minilm
npm run models:build -- bge
npm test
npm run benchmark:semantic
```

Rebuilding downloads public model assets from pinned Hugging Face revisions. Dataset and runtime license notices are included under `public/`. See [DATA-SOURCES.md](./DATA-SOURCES.md) for attribution.
