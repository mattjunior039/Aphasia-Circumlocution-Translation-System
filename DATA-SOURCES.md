# Vocabulary and model attribution

## Original Wordbridge entries

The original 41 entries and the new editorial core are project-authored. The generated bank contains 144 editorial entries after merging labels. The evaluation clues are separate project-authored descriptions, not imported dictionary text.

## WordNet

The wider vocabulary uses **Princeton WordNet 3.1**, distributed through the pinned `wordnet-db@3.1.14` package. The generator selects lower-case, frequently tagged noun and verb labels from `index.sense` and the data files, keeps up to two senses per selected label, and retains the package's supplied notice verbatim.

See [the supplied license](./public/data/WORDNET-LICENSE.txt). That package's license file is headed WordNet Release 3.0 even though its documented data version is 3.1; the supplied notice has not been rewritten. Permission requires preserving its copyright statements and disclaimer in distributed copies.

Tagged frequency is corpus-based, not a current population frequency estimate. Category metadata comes from WordNet lexicographer file numbers. Broader entries may be formal, dated, abstract, or outside the initial everyday focus. No ConceptNet data is included, and no attribution-only assumption is made about its share-alike license.

## Embedding encoders

- [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), revision `751bff37182d3f1213fa05d7196b954e230abad9`, declared Apache-2.0. Its [model card](./public/models/Xenova/all-MiniLM-L6-v2/MODEL-CARD.txt) is preserved.
- [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5), revision `ea104dacec62c0de699686887e3f920caeb4f3e3`. The conversion card identifies [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) as the upstream model; upstream metadata declares MIT. Both the [conversion card](./public/models/Xenova/bge-small-en-v1.5/MODEL-CARD.txt) and [upstream card](./public/models/Xenova/bge-small-en-v1.5/UPSTREAM-MODEL-CARD.txt) are preserved. BGE is included for the reproducible comparison; the UI currently uses MiniLM.

Model weights are quantized q8 ONNX assets. Sense vectors are generated with each model's declared pooling and normalization settings. Query encoding uses the matching settings and, for BGE, its retrieval prefix.

## Browser inference software

Transformers.js is Apache-2.0; its [license](./public/runtime/TRANSFORMERS-LICENSE.txt) is preserved. ONNX Runtime is MIT; its [license](./public/runtime/LICENSE.txt) is preserved from the runtime's upstream commit. Package versions are pinned through the dependency manifest and lockfile.

Model/data downloads happen only during asset preparation. Normal word searches load these files from the app's own origin; they do not call an inference provider.
