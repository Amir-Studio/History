import { readFile, writeFile } from "node:fs/promises";
const read = async path => JSON.parse(await readFile(path, "utf8"));
const benchmark = await read("data/quality/benchmark.json");
const cases = Array.isArray(benchmark.items) ? benchmark.items : [];
const holdout = cases.filter(x => x.split === "holdout");
const counts = {};
for (const type of ["claim_verification","source_attribution","date_extraction","translation","context_completeness"]) {
  const rows = holdout.filter(x => x.task_type === type);
  const pairs = rows.flatMap(item => {
    const labels = new Map((item.human_labels || []).map(x => [x.item_id, x.label]));
    return (item.predictions || []).filter(x => labels.has(x.item_id)).map(x => ({ predicted:x.label, expected:labels.get(x.item_id) }));
  });
  counts[type] = { cases:rows.length, labelled_items:pairs.length, correct:pairs.filter(x => x.predicted === x.expected).length };
}
const claim = counts.claim_verification;
const n = claim.labelled_items;
const accuracy = n >= 30 ? Number((claim.correct / n * 100).toFixed(2)) : null;
const evaluation = {
  schema_version:"1.0.0",
  status:n >= 30 ? "measured" : "insufficient_sample",
  updated_at:new Date().toISOString(),
  benchmark:{cases:cases.length,holdout_cases:holdout.length,human_labelled_claims:n,minimum_holdout_claims:30},
  metrics:{
    claim_level_accuracy_pct:accuracy,
    source_attribution_accuracy_pct:counts.source_attribution.labelled_items >= 30 ? Number((counts.source_attribution.correct/counts.source_attribution.labelled_items*100).toFixed(2)) : null,
    date_extraction_accuracy_pct:counts.date_extraction.labelled_items >= 30 ? Number((counts.date_extraction.correct/counts.date_extraction.labelled_items*100).toFixed(2)) : null,
    translation_accuracy_pct:counts.translation.labelled_items >= 30 ? Number((counts.translation.correct/counts.translation.labelled_items*100).toFixed(2)) : null,
    context_completeness_accuracy_pct:counts.context_completeness.labelled_items >= 30 ? Number((counts.context_completeness.correct/counts.context_completeness.labelled_items*100).toFixed(2)) : null
  },
  breakdown:counts,
  notes:n >= 30 ? "Claim-level exact-label accuracy on human-reviewed holdout cases only. This is not a guarantee of future accuracy; report sample size and date range." : "No accuracy percentage is published until at least 30 human-labelled holdout claims are available. Add reviewed cases to benchmark.json; keep holdout labels out of model prompts."
};
await writeFile("data/quality/evaluation.json",JSON.stringify(evaluation,null,2)+"\n");
console.log("Evaluation status:",evaluation.status,"holdout claims:",n);
