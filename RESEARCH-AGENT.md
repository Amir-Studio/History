# History research agent

## What it does

- The public research desk at `research.html` searches GDELT (news coverage), Crossref (scholarly publications), and Wikidata (reference entities) from the visitor's browser.
- The private GitHub Actions workflow can investigate recent Dollar headlines with the OpenAI Responses API and its web-search tool.
- It checks for durable historical value, searches for primary evidence and independent reporting, records disagreements and source context, and archives selected candidates as `pending_review`.
- It never marks an AI-generated record as verified.
- Human-reviewed corrections in `data/quality/feedback.json` are supplied as examples in later research runs. This is feedback-based prompt improvement, not model-weight training.
- Accuracy remains `not_measured` until a human-labelled holdout benchmark exists.

## One-time setup required

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Name the secret `OPENAI_API_KEY` and add an API key created for the OpenAI API. Never put the key in HTML, JavaScript, or any public file.
3. Open **Actions → History research intake → Run workflow**. Start with 1 candidate to test the integration.

The OpenAI API is billed separately from a ChatGPT subscription. Each run is capped at five candidates (three by default); each candidate may trigger a web-search-enabled model request. Check API usage and set an appropriate billing limit before repeated runs.

## Current boundaries

- The intake reads the public Dollar news endpoint only. It does not write to, delete from, or change any Dollar/Moon Shop Supabase table.
- Automatic retention cleanup in Dollar is intentionally not enabled because the Dollar database is shared with other Moon Shop data and must not be modified by this History workflow.
- The archive commit happens only after the model response passes basic structural and independent-domain checks. Every record remains pending human review.
- The static site has no secret and cannot call a paid LLM directly from the browser.
- The public research desk is a discovery aid. GDELT coverage, Crossref metadata, and Wikidata entries are not proof that a claim is true.

## Editorial rules

See `data/research-methodology.json` and `AI-INGESTION.md`. Source country is context, not a truth score. Independence must be assessed by reporting chain, ownership, and evidence. Contested high-impact claims need more corroboration; unresolved conflicts stay visible.
