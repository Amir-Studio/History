import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/vocabulary-intake.mjs");

async function fixture(items = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "history-vocab-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await mkdir(path.join(dir, "data/vocabulary"), { recursive: true });
  await cp(script, path.join(dir, "scripts/vocabulary-intake.mjs"));
  await writeFile(path.join(dir, "data/vocabulary/index.json"), JSON.stringify({
    schema_version: "1.0.0", items, updated_at: "2026-01-01T00:00:00.000Z"
  }));
  return dir;
}

function run(dir, record) {
  return spawnSync(process.execPath, [path.join(dir, "scripts/vocabulary-intake.mjs")], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, VOCABULARY_RECORD: JSON.stringify(record) }
  });
}

async function readIndex(dir) {
  return JSON.parse(await readFile(path.join(dir, "data/vocabulary/index.json"), "utf8"));
}

test("new unknown term is saved with exact context and source", async () => {
  const dir = await fixture();
  try {
    const result = run(dir, {
      term: "stagflation", language: "en", context: "The report discusses stagflation.",
      source_url: "https://example.org/report", source_title: "Economic report",
      captured_at: "2026-11-16T12:00:00Z", domain: ["economy"]
    });
    assert.equal(result.status, 0, result.stderr);
    const index = await readIndex(dir);
    assert.equal(index.items.length, 1);
    const item = index.items[0];
    assert.equal(item.status, "unknown");
    assert.equal(item.occurrences, 1);
    assert.equal(item.term, "stagflation");
    assert.equal(item.contexts[0].text, "The report discusses stagflation.");
    assert.equal(item.contexts[0].source_url, "https://example.org/report");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("repeated term is deduplicated and occurrence count increases", async () => {
  const dir = await fixture();
  try {
    for (const context of ["First context", "Second context"]) {
      const result = run(dir, { term: "通货膨胀", language: "zh", context, captured_at: "2026-11-16T12:00:00Z" });
      assert.equal(result.status, 0, result.stderr);
    }
    const index = await readIndex(dir);
    assert.equal(index.items.length, 1);
    assert.equal(index.items[0].occurrences, 2);
    assert.equal(index.items[0].contexts.length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a new sighting never overwrites human-reviewed learning state", async () => {
  const reviewed = {
    id: "vocab-inflation", term: "inflation", normalized_term: "inflation", language: "en",
    status: "learned", first_seen_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-01-01T00:00:00.000Z", occurrences: 1,
    contexts: [{ text: "Old context", source_url: null, source_title: null, captured_at: "2026-01-01T00:00:00.000Z" }],
    candidate_meaning: null, verified_meaning: "A sustained increase in the general price level.",
    reviewed_at: "2026-01-02T00:00:00.000Z", reviewed_by: "human", domain: []
  };
  const dir = await fixture([reviewed]);
  try {
    const result = run(dir, { term: "inflation", language: "en", context: "New context", captured_at: "2026-11-16T12:00:00Z" });
    assert.equal(result.status, 0, result.stderr);
    const item = (await readIndex(dir)).items[0];
    assert.equal(item.status, "learned");
    assert.equal(item.verified_meaning, reviewed.verified_meaning);
    assert.equal(item.reviewed_by, "human");
    assert.equal(item.occurrences, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("unsafe source URL is rejected without changing the index", async () => {
  const dir = await fixture();
  try {
    const result = run(dir, { term: "risk premium", language: "en", context: "Example", source_url: "javascript:alert(1)" });
    assert.notEqual(result.status, 0);
    assert.equal((await readIndex(dir)).items.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("missing term or language is rejected", async () => {
  const dir = await fixture();
  try {
    const result = run(dir, { term: "", language: "en", context: "Example" });
    assert.notEqual(result.status, 0);
    assert.equal((await readIndex(dir)).items.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
