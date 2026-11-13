import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const NEWS_URL = process.env.DOLLAR_NEWS_URL ||
  "https://oolfbjxclhzlbwjmzxxx.supabase.co/functions/v1/market-api/news?read_only=1";
const PRICE_URL = process.env.MARKET_DATA_URL ||
  "https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/popular.json";
const NERKHARA_URL = process.env.NERKHARA_URL || "https://nerkhara.com/api/v1/latest.json";
const NERKHARA_IDS = {usd:"USD_IRR_FREE",eur:"EUR_IRR_FREE","gold-18k":"GOLD_18K_IRR","coin-emami":"COIN_EMAMI_IRR"};
const PENDING_DIR = "data/pending-review";
const NEWS_DIR = join(PENDING_DIR, "news");
const PRICE_DIR = join(PENDING_DIR, "prices");
const NEWS_INDEX_PATH = join(PENDING_DIR, "news-index.json");
const PRICE_INDEX_PATH = join(PENDING_DIR, "prices-index.json");
const NOW = new Date();

const HIGH_VALUE_TERMS = [
  "بانک مرکزی", "سیاست پولی", "نرخ بهره", "تورم", "تحریم", "مذاکرات هسته",
  "توافق هسته", "صادرات نفت", "کسری بودجه", "بحران ارزی", "نرخ ارز",
  "دلار آزاد", "قیمت طلا", "اونس طلا", "قیمت نفت", "نفت خام",
  "central bank", "monetary policy", "interest rate", "inflation",
  "sanctions", "nuclear deal", "oil exports", "budget deficit",
  "currency crisis", "exchange rate", "gold price", "crude oil",
  "federal reserve", "opec", "imf", "world bank", "iranian rial",
  "iran economy", "iran currency"
];
const CONTEXT_TERMS = [
  "بازار ارز", "بازار طلا", "نقدینگی", "پایه پولی", "بودجه",
  "تجارت خارجی", "نفت", "گاز طبیعی", "بازار جهانی", "نرخ دلار",
  "currency market", "forex", "commodity", "oil market",
  "trade policy", "tariff", "economic growth", "recession"
];

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 18);
}
function iso(value) {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}
function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("fa")
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();
}
function scoreHeadline(title) {
  const text = normalize(title);
  const high = HIGH_VALUE_TERMS.filter(term => text.includes(normalize(term))).length;
  const context = CONTEXT_TERMS.filter(term => text.includes(normalize(term))).length;
  if (!high && context < 3) return 0;
  return Math.min(95, 30 + high * 22 + context * 7);
}
function categoryFor(title) {
  const text = normalize(title);
  if (text.includes("ایران") || text.includes("iran") || text.includes("ریال")) return "iran";
  if (HIGH_VALUE_TERMS.some(term => text.includes(normalize(term))) ||
      CONTEXT_TERMS.some(term => text.includes(normalize(term)))) return "economy";
  return "world";
}
function publisherFor(item, url) {
  try { return String(item.domain || new URL(url).hostname).replace(/^www\./, ""); }
  catch { return String(item.domain || item.source_id || "unknown"); }
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "History-Dollar-Archive/1.0" },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " from " + new URL(url).hostname);
  return response.json();
}
async function fetchMarketPayload() {
  try {
    const payload=await fetchJson(NERKHARA_URL);
    const items=Array.isArray(payload?.items)?payload.items:[];
    const data=items.flatMap(item=>{
      const symbol=NERKHARA_IDS[item.id],price=Number(item.price),timestamp=iso(item.updated_utc||payload.generated_utc);
      if(!symbol||!(price>0)||!timestamp) return [];
      return [{symbol,price,timestamp,name_fa:item.name?.fa||item.name?.en||symbol,unit:item.unit||"IRT",
        currency:item.unit||"IRT",market:"iran_free",source:"NerkhAra",stale:item.stale===true,
        provider_meta:{method:item.method||null,source_count:Number(item.sources)||0,spread_pct:Number.isFinite(Number(item.spread_pct))?Number(item.spread_pct):null,
          updated_utc:item.updated_utc||payload.generated_utc,page:item.page?.fa||item.page?.en||null}}];
    });
    if(!data.length) throw new Error("NerkhAra returned no mapped quotes");
    return {data,meta:{source:"NerkhAra",published_at:payload.generated_utc||null,public_file:NERKHARA_URL}};
  } catch(error) {
    console.warn("NerkhAra price source unavailable; trying legacy public snapshot:",String(error?.message||error).slice(0,160));
    return fetchJson(PRICE_URL);
  }
}
async function readIndex(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed.items)) throw new Error("Index items must be an array: " + path);
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { schema_version: "1.0.0", updated_at: NOW.toISOString().slice(0, 10), items: [] };
    throw error;
  }
}
async function saveRecord(directory, id, record) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, id + ".json");
  if (existsSync(path)) return false;
  await writeFile(path, JSON.stringify(record, null, 2) + "\n", "utf8");
  return true;
}
function newsRecord(item, title, url, publisher, publishedAt, significance) {
  const claim = "تیتر منتشرشدهٔ ناشر چنین گزارش می‌کند: " + title;
  return {
    id: "news-" + hash(url),
    headline: title,
    publisher,
    author: null,
    source_url: url,
    published_at: publishedAt,
    collected_at: NOW.toISOString(),
    event_date: null,
    language: item.language_code || "und",
    category: categoryFor(title),
    summary: "این رکورد در مرحلهٔ دریافت خودکار فقط تیتر و پیوند ناشر را ثبت می‌کند. متن کامل، سند اولیه و صحت ادعا هنوز مستقلاً بررسی نشده‌اند.",
    claims: [{
      claim,
      evidence_grade: "unverified",
      supporting_sources: [url],
      note: "ثبت تیتر به معنی تأیید ادعا نیست؛ بررسی متن کامل و سند پشتیبان لازم است."
    }],
    status: "pending_review",
    significance_score: significance,
    significance_reason: "امتیاز صرفاً برای اولویت‌بندی بررسی آرشیوی و بر پایهٔ واژگان موضوعی است؛ معیار صحت یا بی‌طرفی نیست.",
    sources: [{
      title,
      publisher,
      country: null,
      source_type: "other",
      original_reporting: null,
      ownership_or_mandate_note: "در دریافت خودکار بررسی نشده است.",
      url,
      claim_supported: claim,
      reporting_chain: "زنجیرهٔ گزارش‌دهی و استقلال منبع هنوز بررسی نشده است."
    }],
    independent_domains: [],
    disagreements: [],
    limitations: [
      "این رکورد بر پایهٔ تیتر و فرادادهٔ خوراک خبری ساخته شده است، نه بررسی متن کامل.",
      "استقلال ناشر، مالکیت رسانه و بازنشر از خبرگزاری دیگر هنوز ارزیابی نشده است.",
      "امتیاز اهمیت، احتمال صحت خبر نیست."
    ],
    correction_watch: "برای اصلاحیه، تکذیبیه یا گزارش تکمیلی بعدی ناشر دوباره بررسی شود.",
    review_note: "پیش از تغییر وضعیت به verified، منبع اولیه و دست‌کم دو زنجیرهٔ گزارش‌دهی مستقل بررسی شوند."
  };
}
function conflictCandidates(items) {
  const positive=["افزایش","رشد","صعود","بالا رفت","تقویت","increase","rise","surge","gain","up"];
  const negative=["کاهش","افت","نزول","پایین آمد","تضعیف","decrease","fall","drop","decline","down"];
  const stop=new Set(["the","and","for","from","with","that","this","در","از","به","با","برای","و","را","که","این","آن","یک","های","شد"]);
  const tokens=value=>normalize(value).match(/[\p{L}\p{N}]{2,}/gu)?.filter(x=>!stop.has(x))||[];
  const pairs=[];
  for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) {
    const a=items[i],b=items[j],da=publisherFor(a,a.url),db=publisherFor(b,b.url);
    if(!da||!db||da===db) continue;
    const A=new Set(tokens(a.title||a.original_title)),B=new Set(tokens(b.title||b.original_title));
    const shared=[...A].filter(x=>B.has(x)),similarity=shared.length/Math.max(1,new Set([...A,...B]).size);
    if(shared.length<2||similarity<0.28) continue;
    const ta=normalize(a.title||a.original_title),tb=normalize(b.title||b.original_title);
    const polarity=t=>({up:positive.some(x=>t.includes(normalize(x))),down:negative.some(x=>t.includes(normalize(x)))});
    const pa=polarity(ta),pb=polarity(tb);
    const nums=t=>(t.match(/\d+(?:[.,]\d+)?/g)||[]).sort().join(",");
    const opposite=(pa.up&&pb.down)||(pa.down&&pb.up),numeric=Boolean(nums(ta)&&nums(tb)&&nums(ta)!==nums(tb));
    if(!opposite&&!numeric) continue;
    pairs.push({headline_a:a.title||a.original_title,headline_b:b.title||b.original_title,
      source_a:da,source_b:db,similarity:Number(similarity.toFixed(2)),
      signals:[...(opposite?["opposing_direction_words"]:[]),...(numeric?["different_numeric_values"]:[])],
      status:"needs_human_review",
      note:"این هشدار الگوریتمی صرفاً موردی برای بررسی انسانی است؛ صحت یا تناقض واقعی را تعیین نمی‌کند."});
    if(pairs.length>=20) return pairs;
  }
  return pairs;
}
function priceRecord(item, marketMeta) {
  const source = String(item.source || marketMeta.source || "unknown");
  const sourceName = source.toLowerCase() === "tgju" ? "TGJU" :
    source.toLowerCase() === "nobitex" ? "Nobitex" : source;
  const unitMap = { unit: "واحد", gram: "گرم", coin: "سکه" };
  return {
    id: "price-" + hash(String(item.symbol) + ":" + String(item.timestamp)),
    instrument: item.name_fa || item.name_en || item.symbol,
    symbol: item.symbol || null,
    market: item.market || "unspecified",
    value: Number(item.price),
    unit: unitMap[item.unit] || item.unit || "unspecified",
    currency: item.currency || "unspecified",
    observed_at: iso(item.timestamp),
    collected_at: NOW.toISOString(),
    source_name: sourceName,
    source_url: item.provider_meta?.page || marketMeta.public_file || PRICE_URL,
    provider_method: item.provider_meta?.method || null,
    provider_source_count: item.provider_meta?.source_count ?? null,
    provider_spread_pct: item.provider_meta?.spread_pct ?? null,
    provider_updated_at: item.provider_meta?.updated_utc || item.timestamp || null,
    methodology: "ثبت عین مشاهدهٔ منتشرشده در خوراک عمومی؛ واحد و زمان منبع حفظ می‌شود و هیچ مقدار کهنه‌ای جایگزین نمی‌شود.",
    status: "pending_review",
    supersedes: null,
    notes: [
      "وضعیت بازار: " + String(item.market_status || "در خوراک مشخص نشده"),
      "زمان تهران: " + String(item.timestamp_tehran || "ثبت نشده"),
      "تاریخ شمسی: " + String(item.timestamp_jalali || "ثبت نشده"),
      "زمان بررسی منبع: " + String(item.checked_at || "ثبت نشده"),
      "پرچم stale: " + String(item.stale === true)
    ].join(" | ")
  };
}

const newsIndex = await readIndex(NEWS_INDEX_PATH);
const priceIndex = await readIndex(PRICE_INDEX_PATH);
const existingNews = new Set(newsIndex.items.map(item => item.id));
const existingNewsUrls = new Set(newsIndex.items.map(item => item.source_url).filter(Boolean));
const existingPrices = new Set(priceIndex.items.map(item => item.id));
const existingPriceKeys = new Set(priceIndex.items.map(item => String(item.symbol || "") + ":" + String(item.observed_at || "")));

const results = await Promise.allSettled([fetchJson(NEWS_URL), fetchMarketPayload()]);
const newsPayload = results[0].status === "fulfilled" ? results[0].value : null;
const marketPayload = results[1].status === "fulfilled" ? results[1].value : null;
if (!newsPayload && !marketPayload) {
  throw new Error("Both public Dollar news and market-data sources failed.");
}

let newsAdded = 0;
let pricesAdded = 0;
const newsItems = Array.isArray(newsPayload?.items) ? newsPayload.items : [];
newsItems.sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
const conflictReport = {
  generated_at: NOW.toISOString(),
  source_headlines: newsItems.length,
  independent_publishers_seen: [...new Set(newsItems.map(item=>publisherFor(item,item.url)))].length,
  candidate_count: 0,
  candidates: [],
  method: "Title-token overlap plus opposing direction terms or differing numeric strings. Candidate flags are not fact checks.",
  status: "heuristic_screening_only"
};
conflictReport.candidates=conflictCandidates(newsItems);
conflictReport.candidate_count=conflictReport.candidates.length;
await mkdir(PENDING_DIR,{recursive:true});
await writeFile(join(PENDING_DIR,"news-analysis.json"),JSON.stringify(conflictReport,null,2)+"\n","utf8");
for (const item of newsItems) {
  const title = String(item.title || item.original_title || "").trim();
  let url;
  try { url = new URL(item.url || "").href; } catch { continue; }
  if (!["https:", "http:"].includes(new URL(url).protocol)) continue;
  const publishedAt = iso(item.published_at);
  if (!title || title.length < 8 || !publishedAt) continue;
  const age = NOW.getTime() - Date.parse(publishedAt);
  if (age < -5 * 60 * 1000 || age > 72 * 60 * 60 * 1000) continue;
  const significance = scoreHeadline(title);
  if (significance < 52 || existingNewsUrls.has(url)) continue;
  const publisher = publisherFor(item, url);
  const record = newsRecord(item, title, url, publisher, publishedAt, significance);
  if (existingNews.has(record.id)) continue;
  const created = await saveRecord(NEWS_DIR, record.id, record);
  const stored = created ? record : JSON.parse(await readFile(join(NEWS_DIR, record.id + ".json"), "utf8"));
  if (!newsIndex.items.some(entry => entry.id === record.id)) {
    newsIndex.items.unshift({
      id: stored.id,
      headline: stored.headline,
      category: stored.category,
      status: stored.status,
      published_at: stored.published_at,
      source_url: stored.source_url,
      json_url: "https://amir-studio.github.io/History/data/pending-review/news/" + stored.id + ".json"
    });
    existingNews.add(stored.id);
    existingNewsUrls.add(stored.source_url);
    newsAdded++;
  }
  if (newsAdded >= 12) break;
}

const marketItems = Array.isArray(marketPayload?.data) ? marketPayload.data : [];
for (const item of marketItems) {
  const observedAt = iso(item.timestamp);
  const value = Number(item.price);
  if (!item.symbol || !(value > 0) || !observedAt || item.stale === true) continue;
  const age = NOW.getTime() - Date.parse(observedAt);
  if (age < -5 * 60 * 1000 || age > 24 * 60 * 60 * 1000) continue;
  const key = String(item.symbol) + ":" + observedAt;
  if (existingPriceKeys.has(key)) continue;
  const record = priceRecord(item, marketPayload.meta || {});
  if (existingPrices.has(record.id)) continue;
  const created = await saveRecord(PRICE_DIR, record.id, record);
  const stored = created ? record : JSON.parse(await readFile(join(PRICE_DIR, record.id + ".json"), "utf8"));
  if (!priceIndex.items.some(entry => entry.id === record.id)) {
    priceIndex.items.unshift({
      id: stored.id,
      instrument: stored.instrument,
      symbol: stored.symbol,
      market: stored.market,
      observed_at: stored.observed_at,
      status: stored.status,
      json_url: "https://amir-studio.github.io/History/data/pending-review/prices/" + stored.id + ".json"
    });
    existingPrices.add(stored.id);
    existingPriceKeys.add(key);
    pricesAdded++;
  }
}

if (newsAdded) {
  newsIndex.updated_at = NOW.toISOString().slice(0, 10);
  await writeFile(NEWS_INDEX_PATH, JSON.stringify(newsIndex, null, 2) + "\n", "utf8");
}
if (pricesAdded) {
  priceIndex.updated_at = NOW.toISOString().slice(0, 10);
  await writeFile(PRICE_INDEX_PATH, JSON.stringify(priceIndex, null, 2) + "\n", "utf8");
}
console.log(JSON.stringify({
  ok: true,
  news_seen: newsItems.length,
  news_added: newsAdded,
  prices_seen: marketItems.length,
  prices_added: pricesAdded,
  news_source_ok: Boolean(newsPayload),
  price_source_ok: Boolean(marketPayload),
  status: "pending_review",
  api_key_required: false
}, null, 2));
