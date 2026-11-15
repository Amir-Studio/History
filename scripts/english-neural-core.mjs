/**
 * English-centred multilingual learning core for History.
 *
 * This is an integration layer, not a pretrained neural network. A real
 * multilingual encoder is injected through `encoder.encode(text, { language })`.
 * The core never fabricates verified meanings and never marks a term learned
 * without a human review record.
 */
const DEFAULTS = Object.freeze({
  unknownConfidenceThreshold: 0.62,
  semanticMatchThreshold: 0.78,
  maxContextsPerTerm: 40,
  maxAttemptsPerTerm: 200
});

export function normalizeTerm(value, language = "en") {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return "";
  return text.toLocaleLowerCase(language).replace(/[\\s\\u200b\\u200c]+/gu, " ");
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) return null;
  let dot = 0, a = 0, b = 0;
  for (let i = 0; i < left.length; i++) {
    const x = Number(left[i]), y = Number(right[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y; a += x * x; b += y * y;
  }
  if (a === 0 || b === 0) return null;
  return dot / (Math.sqrt(a) * Math.sqrt(b));
}

function safeIso(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid timestamp");
  return date.toISOString();
}

function cleanContext(context = {}) {
  return {
    text: String(context.text ?? "").trim().slice(0, 1200),
    source_url: context.source_url ? String(context.source_url).slice(0, 1000) : null,
    source_title: context.source_title ? String(context.source_title).slice(0, 240) : null,
    captured_at: safeIso(context.captured_at)
  };
}

function lexicalKey(language, term) {
  return language + "::" + normalizeTerm(term, language);
}

export function createEnglishNeuralCore({ encoder = null, storage, ...options } = {}) {
  if (!storage || typeof storage.getState !== "function" || typeof storage.saveState !== "function") {
    throw new TypeError("storage.getState() and storage.saveState(state) are required");
  }
  const config = { ...DEFAULTS, ...options };

  async function readState() {
    const state = await storage.getState();
    return {
      lexical_entries: Array.isArray(state?.lexical_entries) ? state.lexical_entries : [],
      concepts: Array.isArray(state?.concepts) ? state.concepts : [],
      learning_events: Array.isArray(state?.learning_events) ? state.learning_events : []
    };
  }

  async function writeState(state) {
    await storage.saveState(state);
    return state;
  }

  async function detectKnowledge({ term, language = "en", confidence = 0, context = "" }) {
    const normalized = normalizeTerm(term, language);
    if (!normalized) throw new TypeError("term is required");
    const state = await readState();
    const entry = state.lexical_entries.find(item =>
      item.language === language && item.normalized_term === normalized
    );
    const score = Math.max(0, Math.min(1, Number(confidence) || 0));
    const hasVerifiedMeaning = Boolean(entry?.verified_meaning && entry?.reviewed_by);
    const known = hasVerifiedMeaning && entry.status === "learned";
    return {
      term: String(term).trim(),
      language,
      known,
      status: known ? "learned" : entry?.status || "unknown",
      confidence: score,
      should_learn: !known && (!entry || score < config.unknownConfidenceThreshold),
      reason: known ? "human_verified_lexical_entry" : entry ? "not_mastered_or_not_verified" : "no_lexical_entry",
      context: String(context).slice(0, 1200)
    };
  }

  async function recordEncounter({ term, language = "en", context = {}, domains = [], partOfSpeech = null }) {
    const normalized = normalizeTerm(term, language);
    if (!normalized) throw new TypeError("term is required");
    const state = await readState();
    const key = lexicalKey(language, term);
    const now = safeIso();
    let entry = state.lexical_entries.find(item => lexicalKey(item.language, item.term) === key);
    const newContext = cleanContext(context);
    if (!entry) {
      entry = {
        id: "vocab-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)),
        term: String(term).trim().slice(0, 180),
        normalized_term: normalized,
        language,
        part_of_speech: partOfSpeech,
        domain: [...new Set(domains.map(String))],
        status: "unknown",
        first_seen_at: now,
        last_seen_at: now,
        occurrences: 0,
        contexts: [],
        candidate_meaning: null,
        verified_meaning: null,
        related_terms: [],
        notes: "",
        reviewed_at: null,
        reviewed_by: null,
        attempts: []
      };
      state.lexical_entries.push(entry);
    }
    entry.last_seen_at = now;
    entry.occurrences += 1;
    entry.domain = [...new Set([...(entry.domain || []), ...domains.map(String)])];
    if (newContext.text && !entry.contexts.some(item => item.text === newContext.text && item.source_url === newContext.source_url)) {
      entry.contexts.push(newContext);
      entry.contexts = entry.contexts.slice(-config.maxContextsPerTerm);
    }
    await writeState(state);
    return structuredClone(entry);
  }

  async function suggestMeaning({ term, language = "en", context = "" }) {
    if (!encoder || typeof encoder.encode !== "function") {
      return { available: false, reason: "multilingual_encoder_not_configured", candidate_meaning: null };
    }
    const vector = await encoder.encode(String(context || term), { language });
    if (!Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(Number(value)))) {
      throw new TypeError("encoder.encode must return a finite numeric vector");
    }
    const state = await readState();
    const candidates = [];
    for (const concept of state.concepts) {
      if (!Array.isArray(concept.prototypes)) continue;
      for (const prototype of concept.prototypes) {
        const similarity = cosineSimilarity(vector, prototype.vector);
        if (similarity !== null) candidates.push({ concept_id: concept.id, label: concept.label, similarity });
      }
    }
    candidates.sort((a, b) => b.similarity - a.similarity);
    const best = candidates[0] || null;
    return {
      available: true,
      model: encoder.model || "injected-multilingual-encoder",
      candidate_meaning: best && best.similarity >= config.semanticMatchThreshold ? best.label : null,
      concept_id: best && best.similarity >= config.semanticMatchThreshold ? best.concept_id : null,
      confidence: best?.similarity ?? 0,
      candidates: candidates.slice(0, 5),
      verified: false
    };
  }

  async function addConcept({ id, label, domain = "general", definitions = [], prototypes = [] }) {
    if (!id || !label) throw new TypeError("concept id and label are required");
    const state = await readState();
    const existing = state.concepts.find(item => item.id === id);
    const concept = {
      id: String(id),
      label: String(label),
      domain: String(domain),
      definitions: definitions.map(item => ({ language: String(item.language), text: String(item.text) })),
      prototypes: prototypes.map(item => ({
        language: String(item.language),
        vector: item.vector.map(Number)
      })).filter(item => item.vector.length && item.vector.every(Number.isFinite))
    };
    if (existing) Object.assign(existing, concept);
    else state.concepts.push(concept);
    await writeState(state);
    return structuredClone(concept);
  }

  async function transferConcept({ conceptId, targetLanguage }) {
    const state = await readState();
    const concept = state.concepts.find(item => item.id === conceptId);
    if (!concept) return { found: false, concept_id: conceptId, equivalents: [] };
    const equivalents = state.lexical_entries
      .filter(item => item.concept_id === conceptId && item.language === targetLanguage && item.verified_meaning && item.reviewed_by)
      .map(item => ({
        term: item.term,
        language: item.language,
        meaning: item.verified_meaning,
        notes: item.notes || "",
        reviewed_by: item.reviewed_by
      }));
    return { found: true, concept_id: conceptId, concept: concept.label, target_language: targetLanguage, equivalents };
  }

  async function recordAttempt({ term, language = "en", correct, context = "", evidence = null }) {
    const normalized = normalizeTerm(term, language);
    const state = await readState();
    const entry = state.lexical_entries.find(item => item.language === language && item.normalized_term === normalized);
    if (!entry) throw new Error("Unknown term: record an encounter before recording an attempt");
    entry.attempts ||= [];
    entry.attempts.push({ correct: Boolean(correct), context: String(context).slice(0, 1200), evidence, attempted_at: safeIso() });
    entry.attempts = entry.attempts.slice(-config.maxAttemptsPerTerm);
    entry.status = "learning_pending";
    state.learning_events.push({
      type: "retrieval_attempt",
      term_id: entry.id,
      language,
      correct: Boolean(correct),
      created_at: safeIso()
    });
    await writeState(state);
    return { status: entry.status, attempts: entry.attempts.length, human_review_required: true };
  }

  async function reviewEntry({ term, language = "en", verifiedMeaning, reviewer, sources = [], conceptId = null }) {
    if (!String(reviewer || "").trim()) throw new TypeError("reviewer is required");
    if (!String(verifiedMeaning || "").trim()) throw new TypeError("verifiedMeaning is required");
    if (!Array.isArray(sources) || sources.length === 0) throw new TypeError("at least one review source is required");
    const normalized = normalizeTerm(term, language);
    const state = await readState();
    const entry = state.lexical_entries.find(item => item.language === language && item.normalized_term === normalized);
    if (!entry) throw new Error("Vocabulary entry not found");
    entry.verified_meaning = String(verifiedMeaning).trim().slice(0, 1600);\n    if (conceptId) {\n      if (!state.concepts.some(item => item.id === conceptId)) throw new Error("Concept not found");\n      entry.concept_id = String(conceptId);\n    }
    entry.reviewed_by = String(reviewer).trim().slice(0, 120);
    entry.reviewed_at = safeIso();
    entry.review_sources = sources.map(String).slice(0, 10);
    entry.status = "learned";
    await writeState(state);
    return structuredClone(entry);
  }

  async function snapshot() {
    return structuredClone(await readState());
  }

  return Object.freeze({
    detectKnowledge,
    recordEncounter,
    suggestMeaning,
    addConcept,
    transferConcept,
    recordAttempt,
    reviewEntry,
    snapshot
  });
}
