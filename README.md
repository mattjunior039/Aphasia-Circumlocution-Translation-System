# Wordbridge

A local word-finding companion: describe what you mean, explore possible words, and optionally clarify your clue. This is an experimental communication aid, not a guaranteed translation or a clinically validated treatment.

## Start the app

Use Node.js 22.12+ (or 20.19+). Node 26 and Chrome on macOS were used for validation.

```sh
npm install
npm run dev
```

Open the **Local** address printed in the terminal. Vite selects another port if its default is occupied. Enable **on-device semantic search** below the clue input for the MiniLM-based engine. Until enabled, the UI explicitly labels its more limited basic matching.

The included vocabulary, model weights, and browser runtime are served from this project. Searching sends no clues or personal vocabulary to an external AI provider. There is no cloud integration or API key requirement.

### If you used the previous directly opened page

The expanded app needs its local assets served over HTTP; directly opening `index.html` no longer starts the finder. Browser storage is tied to its address, so data saved at the former `file://` address does not automatically appear at localhost.

Open the same `index.html` directly and use **Export previous saved words** in its migration panel. Start the local server, then choose **Restore backup** in the new app. Original built-in IDs remain compatible. Keep the downloaded JSON private.

## What changed

- **2,500 unique word labels and 3,973 senses**, instead of 41 built-in entries.
- 144 curated entries with everyday definitions, purposes, and properties, plus a frequency-selected WordNet subset. The wider subset is broader and less curated; it is not 2,500 hand-verified everyday concepts.
- A shared search engine with exact-word lookup, lexical ranking, structured object-purpose constraints, and optional local sentence-embedding retrieval.
- Distinct words such as tea/coffee, nurse/doctor, pencil/pen, and watch/clock no longer collapse into misleading exact aliases.
- Six initial credible suggestions, **Show more**, paginated browsing, an Actions category, and an optional clarifying question.
- Search results connect to selection, spoken output, saved words, and personal vocabulary. Personal words are embedded only on this device, including after edits.
- Private backup/restore, explicit storage failures, corrupt-data protection, keyboard support, text/contrast controls, and loading/error announcements.

For example, “round thing i use to eat soup” now suggests **bowl and spoon**, without apple. “What I use to call my daughter” suggests **phone**. Ambiguous clues still require your judgment.

## Measured quality and remaining limits

See [evaluation/README.md](./evaluation/README.md) and the reproducible [semantic report](./evaluation/semantic-report.json).

On the frozen **120-clue held-out split**:

| Engine | Top-1 accuracy | Acceptable answer in first 6 |
| --- | ---: | ---: |
| Expanded basic matching | 72.5% | 88.3% |
| Local MiniLM | 79.2% | 96.7% |
| Local BGE | 79.2% | 99.2% |

MiniLM is the current opt-in UI engine: it did better on the development split and has smaller weights (about 23 MB, versus 34 MB for BGE). BGE remains an evaluated alternative, not a silently selected cloud service.

The proposed **80% top-1 gate has not been met**. The main benchmark tests coverage expansion over 80 added concepts and is editorial, not representative patient data. Results do not establish general-language accuracy or clinical efficacy. The five negative regression cases are too few to validate abstention reliably. Negation, vague personal references, and anatomical versus object descriptions can still confuse the engine. Do not interpret similarities as probabilities.

## Build and offline use

```sh
npm run build
npm run preview
```

The production build installs an app-scoped service worker. Load it online, allow installation, reload, and enable the local model once so its assets can be cached. Subsequent offline reload and local inference were tested in Chrome. Uncached files still require the server; cache eviction, storage limits, and unsupported browsers can prevent offline use. Development mode does not install the offline shell.

Model weights are only part of the footprint: the MiniLM index is approximately 6.1 MB, and the browser runtime and vocabulary add further assets. Loading progress is shown by stage, not an invented percentage. Browser inference uses a worker and single-threaded WASM; WebGPU acceleration and real mobile hardware have not been validated.

## Validation

```sh
npm test                   # unit, schema, baseline, index, and regression tests
npm run test:browser       # development end-to-end tests
npm run build
npm run test:offline       # production model loading and offline reload/inference
npm run benchmark         # original baseline versus expanded lexical search
npm run benchmark:semantic # same dataset through lexical, MiniLM, and BGE
```

Browser tests use an installed Google Chrome (`channel: "chrome"`). If Chrome is unavailable, choose an installed supported Playwright channel or install Chromium and remove the channel setting. The test servers use fixed project-specific ports and stop when tests finish. They do not terminate unrelated processes.

## Rebuild data and models

Generated assets are included. For vocabulary changes:

```sh
npm run data:build
npm run models:build -- minilm
npm run models:build -- bge
npm test
npm run benchmark:semantic
```

Rebuilding downloads public model assets from pinned Hugging Face revisions and preserves model cards. It never uploads descriptions. Regenerate both semantic indexes after a vocabulary change; version checks reject stale indexes. Dataset and runtime license notices are included under `public/`. See [DATA-SOURCES.md](./DATA-SOURCES.md).

## Privacy and personal words

Saved words, personal entries, and display preferences are stored in this browser on this origin. They are not synced. Use **Download private backup** to transfer or preserve them; restoring replaces existing entries only after confirmation. Invalid backups are rejected, and invalid existing data is not overwritten by normal saves.

Clearing site data removes local entries and cached assets. On a shared device, other people using this browser may see your entries. Backups also contain personal information.

**Browser voice recognition is separate from local word search.** Depending on the browser it may send audio to a speech service; the microphone control asks before starting it. Spoken output uses browser/OS voices, which may have their own service behavior. Typing always remains available.

External LLM interpretation could help flexible descriptions, but also introduces data handling, cost, hallucination, and outage concerns. It is deliberately deferred until a provider, explicit consent, and a request/spending budget are approved.
