import test from "node:test";
import assert from "node:assert/strict";
import { createEnglishNeuralCore, cosineSimilarity, normalizeTerm } from "../scripts/english-neural-core.mjs";

function memory() {
  let state = { lexical_entries: [], concepts: [], learning_events: [] };
  return {
    async getState() { return structuredClone(state); },
    async saveState(next) { state = structuredClone(next); }
  };
}

test("normalizes multilingual terms without merging languages", () => {
  assert.equal(normalizeTerm("  INFLATION  ", "en"), "inflation");
  assert.equal(normalizeTerm("  تورم  ", "fa"), "تورم");
});

test("unknown term is recorded once and encounters are appended", async () => {
  const core = createEnglishNeuralCore({ storage: memory() });
  await core.recordEncounter({ term: "Inflation", language: "en", context: { text: "Inflation rose." }, domains: ["economics"] });
  const second = await core.recordEncounter({ term: " inflation ", language: "en", context: { text: "Inflation affects rates." } });
  assert.equal(second.occurrences, 2);
  assert.equal(second.contexts.length, 2);
  assert.equal((await core.snapshot()).lexical_entries.length, 1);
});

test("a candidate or high model confidence cannot mark a term learned", async () => {
  const core = createEnglishNeuralCore({ storage: memory() });
  await core.recordEncounter({ term: "yield", language: "en", context: { text: "Bond yields increased." } });
  const result = await core.detectKnowledge({ term: "yield", language: "en", confidence: 0.99 });
  assert.equal(result.known, false);
  assert.equal(result.should_learn, true);
});

test("retrieval attempts remain pending until human review", async () => {
  const core = createEnglishNeuralCore({ storage: memory() });
  await core.recordEncounter({ term: "liquidity", language: "en", context: { text: "Market liquidity declined." } });
  await core.recordAttempt({ term: "liquidity", correct: true, context: "Explain market liquidity." });
  assert.equal((await core.detectKnowledge({ term: "liquidity" })).known, false);
  await assert.rejects(() => core.reviewEntry({ term: "liquidity", verifiedMeaning: "Ability to trade without large price impact", sources: ["https://example.org"] }), /reviewer/);
  const reviewed = await core.reviewEntry({
    term: "liquidity",
    verifiedMeaning: "Ability to trade without a large price impact.",
    reviewer: "human-review",
    sources: ["https://example.org/definition"]
  });
  assert.equal(reviewed.status, "learned");
  assert.equal((await core.detectKnowledge({ term: "liquidity" })).known, true);
});

test("semantic suggestions require a configured encoder and stay unverified", async () => {
  const core = createEnglishNeuralCore({
    storage: memory(),
    encoder: { model: "test-encoder", async encode() { return [1, 0]; } }
  });
  await core.addConcept({
    id: "economics.inflation",
    label: "A sustained increase in the general price level",
    domain: "economics",
    prototypes: [{ language: "en", vector: [1, 0] }]
  });
  const suggestion = await core.suggestMeaning({ term: "inflation", context: "Prices are rising." });
  assert.equal(suggestion.concept_id, "economics.inflation");
  assert.equal(suggestion.verified, false);
});

test("cross-language transfer only returns reviewed equivalents attached to the same concept", async () => {
  const core = createEnglishNeuralCore({ storage: memory() });
  await core.addConcept({ id: "economics.inflation", label: "Inflation", domain: "economics" });
  await core.recordEncounter({ term: "Inflation", language: "en", context: { text: "Inflation is rising." } });
  await core.recordEncounter({ term: "التضخم", language: "ar", context: { text: "ارتفاع المستوى العام للأسعار." } });
  const state = await core.snapshot();
  const ar = state.lexical_entries.find(item => item.language === "ar");
  ar.concept_id = "economics.inflation";
  await core.reviewEntry({ term: "التضخم", language: "ar", verifiedMeaning: "ارتفاع مستمر في المستوى العام للأسعار", reviewer: "human-review", sources: ["https://example.org/ar"], conceptId: "economics.inflation" });
  const transfer = await core.transferConcept({ conceptId: "economics.inflation", targetLanguage: "ar" });
  assert.equal(transfer.equivalents.length, 1);
  assert.equal(transfer.equivalents[0].term, "التضخم");
});

test("cosine similarity rejects malformed vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 2]), null);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), null);
});
