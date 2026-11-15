import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const indexPath = "data/vocabulary/index.json";
const raw = process.env.VOCABULARY_RECORD;
if (!raw) throw new Error("VOCABULARY_RECORD is missing");
const incoming = JSON.parse(raw);
const term = String(incoming.term || "").trim().normalize("NFKC");
const language = String(incoming.language || "").trim().toLowerCase();
const contextText = String(incoming.context || "").trim();
const capturedAt = new Date(incoming.captured_at || Date.now()).toISOString();
if (!term || term.length > 180 || !language || language.length > 35 || contextText.length > 1200) {
  throw new Error("Invalid term, language, or context");
}
const sourceUrl = incoming.source_url ? new URL(String(incoming.source_url)) : null;
if (sourceUrl && !["http:", "https:"].includes(sourceUrl.protocol)) throw new Error("Invalid source URL");
const normalizedTerm = term.toLowerCase().replace(/[\u200c\s]+/gu, " ").trim();
if (!normalizedTerm) throw new Error("Term normalizes to empty text");
const slug = normalizedTerm.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "term";
const digest = createHash("sha256").update(language + "\n" + normalizedTerm).digest("hex").slice(0, 12);
const id = "vocab-" + slug + "-" + digest;
const context = {
  text: contextText || term,
  source_url: sourceUrl ? sourceUrl.href : null,
  source_title: String(incoming.source_title || "").slice(0, 300) || null,
  captured_at: capturedAt
};
const index = JSON.parse(await readFile(indexPath, "utf8"));
if (!Array.isArray(index.items)) throw new Error("Vocabulary index items must be an array");
const existing = index.items.find(item =>
  String(item.language).toLowerCase() === language &&
  String(item.normalized_term || "").normalize("NFKC").toLowerCase().replace(/[\u200c\s]+/gu, " ").trim() === normalizedTerm
);
if (existing) {
  existing.occurrences = Math.max(1, Number(existing.occurrences) || 1) + 1;
  existing.last_seen_at = capturedAt > existing.last_seen_at ? capturedAt : existing.last_seen_at;
  existing.contexts = Array.isArray(existing.contexts) ? existing.contexts : [];
  const duplicateContext = existing.contexts.some(item =>
    item.text === context.text && item.source_url === context.source_url
  );
  if (!duplicateContext) existing.contexts.push(context);
  if (existing.contexts.length > 12) existing.contexts = [existing.contexts[0], ...existing.contexts.slice(-11)];
  if (incoming.domain && Array.isArray(incoming.domain)) {
    existing.domain = [...new Set([...(existing.domain || []), ...incoming.domain.map(x => String(x).slice(0, 80))])].slice(0, 12);
  }
  if (!existing.candidate_meaning && incoming.candidate_meaning) existing.candidate_meaning = String(incoming.candidate_meaning).slice(0, 1200);
  // A successful dictionary lookup moves an unknown term to learning_pending, never to learned.
  if(existing.status==="unknown" && incoming.status==="learning_pending") existing.status="learning_pending";
  // Preserve "learned" and "dismissed" states; a new sighting never reverses human review.
  console.log("Updated existing vocabulary term:", existing.id, "occurrences:", existing.occurrences);
} else {
  index.items.push({
    id, term, normalized_term: normalizedTerm, language,
    part_of_speech: incoming.part_of_speech ? String(incoming.part_of_speech).slice(0, 80) : null,
    domain: Array.isArray(incoming.domain) ? [...new Set(incoming.domain.map(x => String(x).slice(0, 80)))].slice(0, 12) : [],
    status: incoming.status === "learning_pending" ? "learning_pending" : "unknown",
    first_seen_at: capturedAt,
    last_seen_at: capturedAt,
    occurrences: 1,
    contexts: [context],
    candidate_meaning: incoming.candidate_meaning ? String(incoming.candidate_meaning).slice(0, 1200) : null,
    verified_meaning: null,
    related_terms: [],
    notes: "ثبت خودکار از عامل Dollar؛ نیازمند بررسی و یادگیری.",
    reviewed_at: null,
    reviewed_by: null
  });
  console.log("Added unknown vocabulary term:", id);
}
index.items.sort((a,b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)));
index.updated_at = new Date().toISOString();
await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
