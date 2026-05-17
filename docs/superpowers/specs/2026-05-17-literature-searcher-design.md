# Literature Searcher Design

## Summary

Add a dedicated `literature-searcher` worker profile for academic literature discovery. The architecture should be provider-ready, but the first implementation phase only delivers offline structured search planning. This avoids pretending that model-memory output is a real database search while still giving the lead agent a clean workflow stage for literature retrieval.

The intended default workflow for broad requests such as "find papers about NIR" is:

1. `literature-searcher`: define the search scope, query plan, candidate bibliography hints, screening notes, and retrieval gaps.
2. `researcher`: synthesize accepted search outputs into evidence summaries, evidence tables, and uncertainty notes when the task asks for evidence synthesis rather than only a search plan.
3. `lead-agent`: decide whether one or both worker steps are needed, persist artifacts under the session task folder, and synthesize the final user-facing answer.

## Current State

`lead-agent` already has the pieces needed for this feature:

- Markdown-backed worker profiles under `packages/lead-agent/profiles/`.
- LLM workflow planning with available profiles and workflow templates as guidance.
- Workflow templates in `packages/lead-agent/src/orchestration/templates.ts`.
- Sequential workflow execution with step results, artifact briefs, carried artifact refs, acceptance reports, and session artifact folders.
- Worker result parsing in `coding-agent` that can return `structuredOutputs`, `producedArtifacts`, and `artifactBriefs`.

The current gap is semantic. The `researcher` profile combines literature discovery and evidence synthesis. That makes retrieval tasks too likely to request `evidence-table` before the worker has enough source material, and it blurs the difference between search planning and source-backed synthesis.

## Goals

- Separate literature discovery from evidence synthesis.
- Let the planner choose `literature-searcher`, `researcher`, or `literature-searcher -> researcher`.
- Preserve lightweight interaction: do not require user confirmation before the plan runs unless a blocking clarification is genuinely needed.
- Keep all task outputs inside the current lead-agent session artifact folder.
- Keep worker-to-lead context small by passing artifact refs and artifact briefs, not large raw result dumps.
- Prepare for future real search providers without requiring provider integration in the first phase.

## Non-Goals

- Do not integrate PubMed, Crossref, Semantic Scholar, arXiv, Google Scholar, CNKI, or Web of Science in the first phase.
- Do not claim that offline structured output is a completed database search.
- Do not implement DOI resolution, citation formatting, PDF/full-text retrieval, deduplication, or ranking across databases yet.
- Do not move literature-search semantics into `agent-host`; this remains `lead-agent` orchestration behavior.

## Architecture

### Worker Profile

Add `packages/lead-agent/profiles/literature-searcher.md`.

Recommended role:

- Act as an academic literature search planner and retrieval triage worker.
- Convert a broad research request into precise search questions, synonyms, query strings, source/database recommendations, inclusion and exclusion criteria, and candidate bibliography hints.
- Clearly label offline/model-derived candidates as candidates, not verified retrieval results.

Recommended capabilities:

- literature-search
- search-strategy
- query-planning
- bibliography-triage
- screening-plan
- retrieval-gap-analysis

Recommended output requirements:

- search strategy
- query plan
- bibliography candidates
- screening notes
- retrieval gaps

Recommended acceptance checklist:

- Search scope and key concepts are explicit.
- Query terms include synonyms and field variants.
- Candidate bibliography is separated from verified evidence.
- Retrieval gaps and database limitations are explicit.

### Searcher vs Researcher Boundary

`literature-searcher` owns the retrieval setup:

- search question decomposition
- keywords and synonyms
- database/source recommendations
- query strings
- inclusion/exclusion criteria
- candidate bibliography hints
- retrieval gaps and open questions

`researcher` owns evidence synthesis:

- source-backed evidence summaries
- evidence tables
- uncertainty notes
- claim support and interpretation boundaries

The lead agent should not ask `literature-searcher` for `evidence-table` by default. It should ask `researcher` for `evidence-table` only after search outputs or source artifacts are available, or when the user explicitly asks for synthesis.

### Workflow Templates

Add two templates.

`literature-search`:

- Purpose: produce a structured search plan and candidate bibliography hints.
- Steps: `literature-searcher`
- Expected outputs: `search strategy`, `query plan`, `bibliography candidates`, `retrieval gaps`
- Expected artifact kinds: `literature-search-results`

`literature-to-evidence`:

- Purpose: search first, then synthesize evidence.
- Steps:
  1. `literature-searcher`
  2. `researcher`
- Searcher expected outputs: `search strategy`, `bibliography candidates`, `retrieval gaps`
- Researcher expected outputs: `evidence summary`, `evidence-table`, `uncertainty notes`
- Expected artifact kinds: `literature-search-results`, `evidence-table`

The LLM planner can adapt these templates, but validation must continue to prevent unknown profile IDs and invented input artifact refs.

### Provider-Ready Interface

Reserve a future provider boundary, but do not wire it into execution yet:

```ts
export interface LiteratureSearchProvider {
	id: string;
	search(request: LiteratureSearchProviderRequest): Promise<LiteratureSearchProviderResult>;
}
```

First-phase worker outputs should record provider state in structured output:

```json
{
	"retrievalMode": "offline-structured",
	"providerAvailable": false
}
```

This creates a stable upgrade path:

- Phase 1: offline structured search planning.
- Phase 2: optional provider injection.
- Phase 3: real retrieval result normalization and deduplication.
- Phase 4: citation manager/export integration.

## Data Flow

1. User sends a broad literature task to `lead-agent`.
2. The LLM planner sees `literature-searcher` in available profiles and the new search templates.
3. The planner chooses one of:
   - direct, for tiny writing-only tasks
   - `literature-searcher`, for search/listing tasks
   - `literature-searcher -> researcher`, for search plus synthesis tasks
4. `lead-agent` writes `workflow-plan.json` under the session task folder.
5. `literature-searcher` returns structured outputs and artifact briefs for search strategy and bibliography candidates.
6. If a researcher step follows, the executor carries produced artifact refs and artifact briefs into the next worker request.
7. `lead-agent` synthesizes the final answer and avoids overclaiming about retrieval when no provider was used.

## Artifact Semantics

First phase should introduce or consistently use these artifact kinds:

- `literature-search-results`
- `bibliography-candidates`
- `search-strategy`

The durable artifact content can remain lightweight in phase 1. The artifact brief is the main context bridge:

```json
{
	"kind": "literature-search-results",
	"title": "NIR literature search plan and candidate bibliography",
	"brief": "Search plan for near-infrared spectroscopy/imaging with candidate review areas and retrieval gaps.",
	"keyFindings": [
		"Disambiguate NIR spectroscopy, imaging, and device-development contexts",
		"Search PubMed and Web of Science for biomedical applications; search IEEE/Scopus for devices"
	],
	"limitations": [
		"Offline structured mode; candidates are not verified database retrieval results"
	]
}
```

## Acceptance

Searcher acceptance should match search-specific outputs:

- `search strategy`
- `query plan`
- `bibliography candidates`
- `screening notes`
- `retrieval gaps`

Researcher acceptance should continue to match synthesis outputs:

- `evidence summary`
- `evidence-table`
- `uncertainty notes`

This avoids the previous class of failure where a literature-search task is rejected because it did not produce an evidence table before evidence synthesis was requested.

## User Interaction

Default behavior should remain automatic and lightweight. The lead agent should ask a blocking clarification only when ambiguity prevents a usable plan, for example:

- the acronym has multiple incompatible meanings and no domain clues
- the user requests a systematic review but gives no population/domain/outcome scope
- the requested database/provider is unavailable and no fallback is acceptable

For ordinary broad prompts, the searcher should proceed and surface non-blocking open questions in the result.

## Testing

Add focused tests for:

- profile loading includes `literature-searcher`
- planner/template guidance can produce a `literature-searcher` step
- "帮我寻找一些关于NIR的文献" can be accepted as search output without requiring `evidence-table`
- `literature-searcher -> researcher` carries artifact briefs into the researcher request
- academic smoke includes at least one literature-search case

No real provider calls should appear in tests. Use deterministic worker runners and structured fixtures.

## Rollout Plan

Phase 1: Offline structured searcher

- Add profile markdown.
- Add workflow templates.
- Adjust smoke/test fixtures.
- Ensure final synthesis clearly says when results are offline structured search planning.

Phase 2: Provider interface

- Add typed provider interface and no-op/default provider state.
- Keep provider optional and injectable.

Phase 3: Real retrieval providers

- Add one provider at a time behind tests and fixtures.
- Normalize results into artifact refs and artifact briefs.
- Keep failure modes non-fatal unless the user explicitly required that provider.

## Risks

- If the searcher returns too much bibliography content inline, the lead context will bloat. Mitigation: artifact briefs stay short, full content goes into artifacts.
- If offline candidates are phrased as verified results, the agent will overclaim. Mitigation: required `retrievalMode` and limitations.
- If planner templates are too rigid, every literature task may become two steps. Mitigation: let the planner choose one-step searcher for simple discovery and two-step searcher/researcher for synthesis.
- If provider interfaces are implemented too early, API noise will slow workflow design. Mitigation: phase 1 remains provider-ready but offline-only.

