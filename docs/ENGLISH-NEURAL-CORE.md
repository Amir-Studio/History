# English-centred multilingual learning core

## Purpose

English is the initial high-coverage working language for domain knowledge, technical reading, and source discovery. It is **not** the universal truth layer and it must not erase language-specific meaning. Every lexical item remains keyed by both language and normalized form; concepts are language-independent IDs with language-specific definitions and reviewed lexical realizations.

## Implemented module

`scripts/english-neural-core.mjs` provides:

- Language-aware normalization and lexical deduplication.
- Unknown-term detection that distinguishes missing knowledge from a verified learned entry.
- Context and domain accumulation for repeated encounters.
- An injected multilingual encoder interface for vector representations.
- Cosine-based concept candidate retrieval, explicitly marked unverified.
- Concept-linked cross-language transfer that returns only human-reviewed equivalents.
- Retrieval-attempt logging and human-gated mastery status.
- Bounded context and attempt histories.

The module is storage-agnostic. Supply `getState()` and `saveState(state)`; do not connect it directly to public static JSON for writes. A private authenticated API or a controlled GitHub Actions ingestion process should own persistence.

## Neural encoder contract

Inject an encoder implementing:

```js
const encoder = {
  model: "provider/model-version",
  async encode(text, { language }) {
    // Return a finite numeric vector from a real multilingual model.
    return embedding;
  }
};
```

The module does not download, train, or contain model weights. Without an encoder, semantic vector matching is unavailable and the system must say so. A future production integration should use a multilingual sentence encoder (for example, an evaluated XLM-R/Sentence-Transformer-family model) and pin its exact model revision, tokenizer, pooling method, and vector dimension. Do not label a dictionary lookup or cosine calculation as neural training.

## English-first learning policy

1. Read the original sentence and preserve its source language.
2. Detect the target term in context; do not infer that every unfamiliar-looking token is unknown.
3. Check exact language + normalized term + sense. Homographs must support multiple senses.
4. Retrieve a candidate concept using the encoder only when it is configured.
5. Store candidate meaning separately from verified meaning.
6. Search for reliable definitions and examples; keep source URLs and dates.
7. Link translations only through a shared concept ID, never through string similarity alone.
8. Evaluate each target language independently. English correctness does not imply translation correctness.
9. Record practice attempts and error types. A correct answer is evidence, not automatic proof of mastery.
10. Only a named human reviewer with sources can promote an entry to `learned`.

## Domain curriculum

Prioritize connected, useful vocabulary rather than random lists:

- Economics: inflation, liquidity, yield, monetary tightening, fiscal deficit, balance of payments.
- Politics and institutions: mandate, coalition, incumbent, legislation, oversight, sovereignty.
- International relations: deterrence, sanctions, ceasefire, escalation, treaty, diplomatic recognition.
- Technology and AI: inference, training data, embedding, tokenizer, evaluation, model drift.
- Research literacy: methodology, evidence, attribution, uncertainty, corroboration, causal inference.

Each item should be taught with a definition, sense, collocations, authentic context, contrast, and reviewed translations.

## Quality gates

Run:

```bash
node --test tests/english-neural-core.test.mjs
node --check scripts/english-neural-core.mjs
```

Required invariants:

- No cross-language merge by surface spelling.
- No automatic promotion to learned from model confidence.
- No verified translation without reviewer and source.
- No semantic match when vectors are malformed or dimensions differ.
- No claim of neural capability when no encoder is configured.
- No cross-language transfer unless both entries are attached to the same concept ID and target equivalent is reviewed.

## Honest current capability

This commit adds a tested learning and integration layer. It does **not** train neural weights, provide a pretrained encoder, or establish measured C1-level English competence. Those require a selected model, a real runtime/provider, curated domain datasets, human-reviewed multilingual pairs, and held-out evaluation sets. Performance must be reported separately for English comprehension, contextual sense disambiguation, grammar, and each target language.
