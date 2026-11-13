import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.HISTORY_MODEL || "gpt-6-luna";
const DOLLAR_NEWS_URL = process.env.DOLLAR_NEWS_URL || "https://oolfbjxclhzlbwjmzxxx.supabase.co/functions/v1/market-api/news";
const MAX_CANDIDATES = Math.max(1, Math.min(5, Number(process.env.MAX_CANDIDATES || 3)));
const ROOT = process.cwd();
const now = new Date().toISOString();

if (!API_KEY) {
  console.error("OPENAI_API_KEY is missing. Add it as a private GitHub Actions repository secret; never place it in site code.");
  process.exit(2);
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("GET failed (" + response.status + "): " + url);
  return response.json();
}
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(join(ROOT, path), "utf8")); }
  catch { return fallback; }
}
function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return null; }
}
function cleanUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.href;
  } catch { return null; }
}
function xmlEscape(value) {
  return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function slug(value) {
  const normalized = String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return normalized || "news";
}
function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) if (part.type === "output_text" && part.text) chunks.push(part.text);
  }
  return chunks.join("\n");
}
function searchSources(response) {
  const found = [];
  for (const item of response.output || []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources || item.results || []) {
        const url = cleanUrl(source.url || source.uri);
        if (url) found.push({ title: String(source.title || host(url)), url, domain: host(url), snippet: String(source.snippet || source.description || "").slice(0, 400) });
      }
    }
    for (const part of item.content || []) {
      for (const annotation of part.annotations || []) {
        if (annotation.type === "url_citation") {
          const url = cleanUrl(annotation.url);
          if (url) found.push({ title: String(annotation.title || host(url)), url, domain: host(url), snippet: "" });
        }
      }
    }
  }
  return [...new Map(found.map(x => [x.url, x])).values()].slice(0, 20);
}
function parseJson(text) {
  const stripped = String(text).trim().replace(/^\uFEFF/, "").replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const first = stripped.indexOf("{"), last = stripped.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Model did not return a JSON object");
  return JSON.parse(stripped.slice(first, last + 1));
}
async function research(candidate, feedback) {
  const instructions = `You are the research editor for History, a source-led historical archive.
Use web search to investigate the candidate, not merely summarize its headline.
Return ONE JSON object only, in Persian where appropriate, with these keys:
historically_significant (boolean), significance_score (integer 0-100; editorial relevance, NOT probability of truth), significance_reason, headline, publisher, source_url, published_at, event_date (YYYY-MM-DD or null), language, category (iran|world|economy|technology|people|other), summary (original concise paraphrase, no long quotations), claims (array of {claim,evidence_grade:A|B|C|unverified,supporting_sources:[URLs],note}), sources (array of {title,publisher,country,url,reporting_chain,source_type:primary|independent_reporting|analysis|other,original_reporting:boolean,ownership_or_mandate_note,claim_supported}), disagreements (array of {issue,version_a,version_b,what_is_known,what_remains_uncertain}), limitations, correction_watch.
Research rules:
- Search for the original document, statement, dataset, filing, court record, scientific paper, or direct transcript where relevant.
- Seek genuinely independent corroboration. Syndicated copies, shared wire stories, and articles quoting the same single source count as one reporting chain.
- For contested/high-impact political or geopolitical claims, seek at least three independent source domains when available and include coverage from jurisdictions not directly involved in the dispute. Do not assume any country is neutral.
- Assess ownership, funding, institutional mandate, sourcing, original reporting, correction history, access restrictions, and the publisher's own framing only when supported by evidence. Never infer truth, bias, or motive from nationality, ethnicity, audience, or political position alone.
- Compare exact claims, dates, numbers, and definitions. Distinguish confirmed facts, attributed statements, analysis, and unresolved allegations.
- Do not force false balance: evidence can support one claim more strongly, but explain why and cite it.
- Do not invent sources, quotes, dates, owners, or corroboration. If sources conflict and cannot be resolved, preserve the disagreement and lower the evidence grade.
- A source's existence is not proof that its claim is true. Evidence grades describe evidence, not numerical model accuracy.
- Preserve uncertainty. Never state that a disputed claim is verified just because several outlets repeat it.
- Select for the permanent archive only if it has durable historical value (policy change, major event, institutional decision, documented milestone, meaningful data release, or event likely to matter to later historical interpretation). Routine short-lived headlines should be false.
- Never mark as verified. Archive candidates are always pending_review.
- Respect copyright: summarize in original wording; do not reproduce article text.`;
  const input = JSON.stringify({
    candidate: {
      headline: candidate.title || candidate.original_title || "",
      source_url: cleanUrl(candidate.url),
      publisher_domain: candidate.domain || host(candidate.url),
      source_id: candidate.source_id || null,
      language: candidate.language_code || null,
      published_at: candidate.published_at || null
    },
    prior_human_reviewed_corrections: feedback.slice(-12),
    task: "Investigate this candidate using web search and return the requested JSON."
  });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: "Bearer " + API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, tools: [{ type: "web_search" }], tool_choice: "auto", include: ["web_search_call.results"], input: instructions + "\n\nINPUT:\n" + input }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error("Responses API HTTP " + response.status + ": " + (await response.text()).slice(0, 900));
  const payload = await response.json();
  const result = parseJson(outputText(payload));
  const search = searchSources(payload);
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const combined = [...sources.map(s => ({ ...s, url: cleanUrl(s.url) })).filter(s => s.url), ...search];
  const unique = [...new Map(combined.map(s => [s.url, s])).values()];
  return { result, unique };
}
function isContested(item) {
  const text = [item.headline, item.significance_reason, ...(item.claims || []).map(x => x.claim)].join(" ").toLowerCase();
  return /(war|attack|election|coup|sanction|nuclear|conflict|protest|تحریم|جنگ|حمله|انتخابات|کودتا|هسته|اعتراض|درگیری|مناقشه)/i.test(text);
}
function validateResearch(candidate, result, sources) {
  if (result.historically_significant !== true || Number(result.significance_score) < 70) return { ok: false, reason: "not-selected" };
  const claims = Array.isArray(result.claims) ? result.claims.filter(x => x && typeof x.claim === "string" && x.claim.trim()) : [];
  if (!claims.length) return { ok: false, reason: "no-claims" };
  const assessments = Array.isArray(result.sources) ? result.sources.filter(x => x && cleanUrl(x.url)) : [];
  const primaryDomains = new Set(assessments.filter(x => x.source_type === "primary").map(x => host(x.url)).filter(Boolean));
  const independentGroups = new Set(assessments.filter(x => x.source_type === "independent_reporting" && x.original_reporting === true).map(x => String(x.reporting_chain || host(x.url)).toLowerCase().trim()).filter(Boolean));
  for (const domain of primaryDomains) independentGroups.delete(domain);
  const contested = isContested(result);
  const enough = contested
    ? independentGroups.size >= 2 && (primaryDomains.size >= 1 || independentGroups.size >= 3)
    : (primaryDomains.size >= 1 && independentGroups.size >= 1) || independentGroups.size >= 2;
  if (!enough) return { ok: false, reason: "insufficient-assessed-independent-reporting" };
  const sourceUrl = cleanUrl(result.source_url || candidate.url);
  if (!sourceUrl) return { ok: false, reason: "invalid-primary-url" };
  const allowedUrls = new Set(sources.map(x => cleanUrl(x.url)).filter(Boolean));
  allowedUrls.add(sourceUrl);
  const validClaims = claims.map(claim => {
    const links = Array.isArray(claim.supporting_sources) ? claim.supporting_sources.map(cleanUrl).filter(url => url && allowedUrls.has(url)) : [];
    const grade = links.length ? (["A", "B", "C", "unverified"].includes(claim.evidence_grade) ? claim.evidence_grade : "unverified") : "unverified";
    return { claim: claim.claim.trim(), evidence_grade: grade, supporting_sources: [...new Set(links)], note: String(claim.note || "") };
  }).filter(x => x.supporting_sources.length > 0);
  if (!validClaims.length) return { ok: false, reason: "claims-not-cited-by-retrieved-sources" };
  return { ok: true, sourceUrl, claims: validClaims, domains: [...independentGroups], assessments };
}

async function main() {
  const response = await getJson(DOLLAR_NEWS_URL);
  const candidates = Array.isArray(response.items) ? response.items : [];
  const indexPath = "data/news/index.json";
  const index = await readJson(indexPath, { schema_version: "1.0.0", items: [] });
  const known = new Set((index.items || []).map(x => x.source_url).filter(Boolean));
  const feedbackDoc = await readJson("data/quality/feedback.json", { items: [] });
  const feedback = Array.isArray(feedbackDoc.items) ? feedbackDoc.items : [];
  const queue = candidates.filter(x => cleanUrl(x.url) && !known.has(cleanUrl(x.url))).slice(0, MAX_CANDIDATES);
  console.log("Dollar news candidates:", candidates.length, "new candidates selected for research:", queue.length);
  let archived = 0, skipped = 0;
  const archivedRecords = [];
  for (const candidate of queue) {
    try {
      const { result, unique } = await research(candidate, feedback);
      const checked = validateResearch(candidate, result, unique);
      if (!checked.ok) {
        console.log("Candidate skipped:", checked.reason, String(candidate.title || "").slice(0, 120));
        skipped++;
        continue;
      }
      const title = String(result.headline || candidate.title || "News record").trim().slice(0, 240);
      const id = slug(title) + "-" + createHash("sha256").update(checked.sourceUrl).digest("hex").slice(0, 10);
      const recordPath = "data/news/" + id + ".json";
      if (existsSync(join(ROOT, recordPath))) { skipped++; continue; }
      const record = {
        id,
        headline: title,
        publisher: String(result.publisher || candidate.domain || "نامشخص"),
        source_url: checked.sourceUrl,
        published_at: (Number.isFinite(Date.parse(candidate.published_at || result.published_at || now)) ? new Date(candidate.published_at || result.published_at || now).toISOString() : now),
        collected_at: now,
        event_date: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(result.event_date || "")) && Number.isFinite(Date.parse(result.event_date + "T00:00:00Z")) ? result.event_date : null,
        language: String(result.language || candidate.language_code || "unknown"),
        category: ["iran","world","economy","technology","people","other"].includes(result.category) ? result.category : "other",
        summary: String(result.summary || "").trim().slice(0, 2200),
        significance_score: Math.round(Number(result.significance_score)),
        significance_reason: String(result.significance_reason || "").slice(0, 1200),
        claims: checked.claims,
        sources: unique.map(s => ({
          title: String(s.title || s.publisher || s.domain || "Source").slice(0, 220),
          publisher: String(s.publisher || s.domain || "نامشخص").slice(0, 160),
          country: s.country || null,
          source_type: s.source_type || "other",
          reporting_chain: String(s.reporting_chain || "").slice(0, 160),
          original_reporting: typeof s.original_reporting === "boolean" ? s.original_reporting : null,
          ownership_or_mandate_note: String(s.ownership_or_mandate_note || "").slice(0, 500),
          url: s.url,
          claim_supported: String(s.claim_supported || "").slice(0, 500)
        })),
        independent_domains: checked.domains,
        disagreements: Array.isArray(result.disagreements) ? result.disagreements : [],
        limitations: Array.isArray(result.limitations) ? result.limitations : [],
        correction_watch: String(result.correction_watch || ""),
        status: "pending_review",
        review_note: "پیشنهاد آرشیو خودکار؛ پیش از تأیید نهایی نیازمند بازبینی انسانی است."
      };
      if (record.summary.length < 30) { skipped++; continue; }
      await mkdir(dirname(join(ROOT, recordPath)), { recursive: true });
      await writeFile(join(ROOT, recordPath), JSON.stringify(record, null, 2) + "\n");
      index.items.push({
        id, headline: title, category: record.category, published_at: record.published_at,
        collected_at: now, status: record.status, source_url: record.source_url,
        json_url: "https://amir-studio.github.io/History/" + recordPath
      });
      known.add(checked.sourceUrl);
      archived++;
      console.log("Archived pending human review:", id, "sources:", checked.domains.length);
    } catch (error) {
      console.error("Research failed for candidate:", String(candidate.title || "").slice(0, 120), error?.message || error);
      skipped++;
    }
  }
  if (archived > 0) {
    index.updated_at = now.slice(0, 10);
    await writeFile(join(ROOT, indexPath), JSON.stringify(index, null, 2) + "\n");
    const feedPath = join(ROOT, "feed.xml");
    let feed = await readFile(feedPath, "utf8");
    const sitemapPath = join(ROOT, "sitemap.xml");
    let sitemap = await readFile(sitemapPath, "utf8");
    for (const record of archivedRecords) {
      const recordUrl = "https://amir-studio.github.io/History/data/news/" + record.id + ".json";
      const pageUrl = "https://amir-studio.github.io/History/news.html?id=" + encodeURIComponent(record.id);
      if (!feed.includes(recordUrl)) {
        const item = "<item><title>" + xmlEscape(record.headline) + "</title><link>" + pageUrl + "</link><guid isPermaLink=\"false\">" + recordUrl + "</guid><pubDate>" + new Date(record.published_at).toUTCString() + "</pubDate><description>" + xmlEscape(record.summary.slice(0, 420)) + "</description><category>" + xmlEscape(record.category) + "</category></item>";
        feed = feed.replace("</channel>", item + "</channel>");
      }
      if (!sitemap.includes(recordUrl)) sitemap = sitemap.replace("</urlset>", "<url><loc>" + recordUrl + "</loc><priority>0.7</priority></url></urlset>");
    }
    await writeFile(feedPath, feed);
    await writeFile(sitemapPath, sitemap);
  }
  console.log(JSON.stringify({ archived, skipped, index_items: index.items.length, model: MODEL }));
}
main().catch(error => { console.error(error); process.exit(1); });
