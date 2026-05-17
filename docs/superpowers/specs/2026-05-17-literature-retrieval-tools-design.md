# Literature Retrieval Tools Design

## Summary

Implement real academic retrieval as a tool-aware worker capability inside `lead-agent`.
The feature upgrades `literature-searcher` from offline structured planning to controlled
database-backed search while preserving the lead/code/host boundary:

- `agent-host` provides session and tool execution infrastructure.
- `lead-agent` owns academic orchestration, profile selection, retrieval tools, artifact
  routing, and acceptance.
- `coding-agent` remains the coding worker and is not the default host for literature
  retrieval.

The first development cycle must include Crossref, Semantic Scholar, PubMed, and arXiv,
but it should land in stages so each part is testable and committable.

## Current State

The repo already has the foundation for this feature:

- `agent-host` supports custom tool definitions and session-level tool allowlists.
- `lead-agent` has Markdown worker profiles, workflow templates, acceptance, artifact
  briefs, carried artifact refs, and session artifact folders.
- `literature-searcher` exists as a profile, but its first version is intentionally
  offline structured planning.
- `artifact-core` has academic artifact kinds and refs.
- `coding-agent` worker output can return structured outputs, artifact refs, and artifact
  briefs.

The missing piece is a tool-aware profile worker path in `lead-agent`: a worker profile
should define not only role text, but also tools, tool policy, and boundaries.

## Goals

- Let `literature-searcher` call a controlled `literature.search` tool.
- Support Crossref, Semantic Scholar, PubMed, and arXiv in one development cycle.
- Persist full normalized search results as artifacts under the current session task
  folder.
- Return compact artifact refs and content hints to the lead agent, not large raw result
  dumps.
- Carry search artifacts into downstream `researcher` steps.
- Keep interaction lightweight: default to automatic execution, with clarification only
  when the task is unusably ambiguous.
- Keep provider behavior testable with mocked fetch/provider clients; live checks must be
  opt-in.

## Non-Goals

- Do not make `coding-agent` the literature retrieval host.
- Do not let workers freely access arbitrary network APIs.
- Do not implement Google Scholar, Web of Science, Scopus, CNKI, Zotero, PDF download, or
  full-text extraction in this cycle.
- Do not claim that search results are exhaustive or systematic-review-grade unless the
  user supplied a systematic protocol and provider coverage supports it.
- Do not store global long-lived search indexes. Session artifacts are the durable output
  for this cycle.

## Design Decision

Use a **tool-aware profile worker** architecture.

`WorkerProfile` becomes the place where an academic role defines:

- its role prompt
- allowed tools
- tool policy
- input requirements
- output requirements
- boundaries
- acceptance checklist

`lead-agent` then runs profile workers through `agent-host` sessions with only the tools
allowed by the selected profile.

This keeps the worker interface honest: the profile defines what the worker can do, while
the host still enforces what actually runs.

## Worker Profile Contract

Extend `WorkerProfile` in `agent-contracts` with optional fields:

```ts
export interface WorkerToolPolicy {
	maxCalls?: number;
	defaultProviders?: string[];
	allowedProviders?: string[];
	maxResultsPerProvider?: number;
	timeoutMs?: number;
	requireArtifactOutput?: boolean;
}

export interface WorkerProfile {
	id: string;
	name: string;
	description?: string;
	rolePrompt?: string;
	capabilities: string[];
	expectedOutputs?: string[];
	acceptanceChecklist?: string[];
	allowedTools?: string[];
	toolPolicy?: WorkerToolPolicy;
	inputRequirements?: string[];
	boundaries?: string[];
}
```

Markdown profile parsing should support these sections:

- `## Allowed Tools`
- `## Tool Policy`
- `## Input Requirements`
- `## Boundaries`

`literature-searcher.md` should allow only:

- `literature.search`

Its boundaries should say:

- do not invent retrieved papers
- do not present provider results as exhaustive coverage
- do not synthesize clinical/scientific conclusions beyond retrieved metadata and
  abstracts
- do not request `evidence-table` unless a downstream synthesis step is planned

## Retrieval Tool

### Tool Name

`literature.search`

### Input

```ts
export type LiteratureProviderId =
	| "crossref"
	| "semantic-scholar"
	| "pubmed"
	| "arxiv";

export interface LiteratureSearchToolInput {
	query: string;
	providers?: LiteratureProviderId[];
	maxResults?: number;
	fromYear?: number;
	toYear?: number;
	fieldOfStudy?: string;
	includePreprints?: boolean;
	includeBiomedical?: boolean;
}
```

### Output

```ts
export interface LiteratureSearchToolOutput {
	retrievalRunId: string;
	providers: LiteratureProviderRunSummary[];
	artifactRefs: ArtifactRef[];
	candidatesPreview: LiteratureCandidateBrief[];
	warnings: string[];
}
```

The tool output must be context-small. It should include only a short preview, warnings,
and artifact refs. Complete normalized results must live in artifacts.

## Normalized Candidate

All provider results normalize to one internal shape:

```ts
export interface LiteratureCandidate {
	id: string;
	provider: LiteratureProviderId;
	providerRecordId: string;
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	doi?: string;
	pmid?: string;
	arxivId?: string;
	url?: string;
	abstract?: string;
	publicationType?: string;
	isOpenAccess?: boolean;
	citationCount?: number;
	sourceQuery: string;
	rawScore?: number;
	retrievedAt: string;
}
```

Provider raw responses may be stored in artifact content or metadata for debugging, but
worker prompts and lead-agent synthesis should consume normalized candidates and briefs.

## Provider Layer

Add provider-specific modules under `packages/lead-agent/src/literature/`:

```text
types.ts
normalize.ts
provider-registry.ts
tools.ts
providers/crossref.ts
providers/semantic-scholar.ts
providers/pubmed.ts
providers/arxiv.ts
```

Provider interface:

```ts
export interface LiteratureSearchProvider {
	id: LiteratureProviderId;
	search(request: LiteratureProviderRequest): Promise<LiteratureProviderResult>;
}
```

### Crossref

Use Crossref for broad DOI and publisher metadata search.

Configuration:

- no API key required for public access
- support polite access through `mailto` and identifying `User-Agent`
- optional Metadata Plus token can be represented later, but not required in this cycle

Implementation shape:

- endpoint family: Crossref REST `/works`
- query fields: `query`, `rows`, `filter=from-pub-date`, `filter=until-pub-date`
- normalize title, authors, year, container title, DOI, URL, type

### Semantic Scholar

Use Semantic Scholar for scholarly graph metadata, abstracts, citation counts, open-access
PDF hints, and broad cross-domain search.

Configuration:

- unauthenticated fallback is allowed when no API key is configured
- `SEMANTIC_SCHOLAR_API_KEY` enables authenticated requests when present

Implementation shape:

- endpoint family: Academic Graph paper search
- requested fields should include title, authors, year, venue, DOI/external IDs,
  abstract, citation count, URL, open access PDF where available
- normalize Semantic Scholar paper IDs and external IDs

### PubMed

Use NCBI E-utilities for biomedical literature search.

Configuration:

- `NCBI_API_KEY` optional
- `NCBI_TOOL` and `NCBI_EMAIL` or lead-agent contact settings should be supported
- enforce conservative request pacing; without a key, do not exceed NCBI public usage
  expectations

Implementation shape:

- call `ESearch` with `db=pubmed` to obtain PMIDs
- call `ESummary` or `EFetch` for metadata summaries
- normalize title, authors, journal, year, PMID, DOI when present, URL, abstract when
  available

### arXiv

Use arXiv for preprints, especially physics, mathematics, statistics, computer science,
and related technical domains.

Configuration:

- no API key
- obey arXiv API terms and conservative pacing

Implementation shape:

- endpoint family: arXiv API query interface
- use `search_query`, `start`, `max_results`, and sort controls
- normalize arXiv ID, title, authors, published/updated year, abstract, categories, DOI,
  and entry URL

## Configuration

Add `LiteratureSearchConfig` to `lead-agent` runtime options:

```ts
export interface LiteratureSearchConfig {
	enabledProviders?: LiteratureProviderId[];
	defaultProviders?: LiteratureProviderId[];
	maxResultsPerProvider?: number;
	timeoutMs?: number;
	cacheTtlHours?: number;
	contactEmail?: string;
	userAgent?: string;
	semanticScholarApiKey?: string;
	ncbiApiKey?: string;
	ncbiTool?: string;
	ncbiEmail?: string;
}
```

Environment fallback:

- `SEMANTIC_SCHOLAR_API_KEY`
- `NCBI_API_KEY`
- `NCBI_TOOL`
- `NCBI_EMAIL`
- `PI_LITERATURE_CONTACT_EMAIL`
- `CROSSREF_MAILTO`

Default provider set:

```ts
["crossref", "semantic-scholar", "pubmed", "arxiv"]
```

Default `maxResultsPerProvider` should be small, for example 10, so the first tool call is
useful without flooding artifacts or context.

## Artifact Semantics

The tool should write at least one artifact per retrieval run:

- `literature-search-results`: normalized candidate set, provider summaries, warnings,
  query parameters, retrieval timestamp

Optional split artifacts:

- `bibliography-candidates`: compact bibliography-oriented candidate list
- `search-strategy`: query expansion and provider choice rationale when generated by the
  searcher

The artifact manifest should preserve:

- retrieval run ID
- provider IDs
- query and filters
- count per provider
- failures and warnings
- upstream workflow step ID

## Context Control

The tool must never return all results directly to the LLM context. It returns:

- top candidates preview, capped
- artifact refs
- provider summaries
- warnings

The full candidate list is only read later when a worker explicitly needs it. If a
downstream worker needs larger evidence, pass artifact refs and a short brief first; load
selected artifact content only when necessary.

## Workflow Integration

### Profile Worker Runner

Add a `lead-agent` runner that executes academic profile workers through `agent-host`
custom tools:

```text
planner decision
-> workflow step profile id
-> profile-worker-runner
-> create agent-host session with profile role prompt and allowed tools
-> literature.search tool writes artifacts
-> worker returns WorkerResult with artifact refs and artifact briefs
```

This runner is for academic/tool-aware workers. `coding-agent` remains available for
coding-specific worker requests, but literature retrieval should not route through it.

### Planner Behavior

The planner should receive tool-aware profile summaries:

- `literature-searcher`: can call `literature.search`
- `researcher`: consumes literature artifacts and synthesizes evidence
- `reviewer`: evaluates draft quality and evidence use

For literature tasks:

- search/list/discover tasks route to `literature-searcher`
- search plus summarize/synthesize tasks route to `literature-searcher -> researcher`
- already-provided sources can skip retrieval and route directly to `researcher`

## Error Handling

Provider failures should be partial, not fatal, unless all requested providers fail.

Rules:

- timeout from one provider becomes a warning
- unavailable optional API key falls back to unauthenticated mode when supported
- rate limit or access failure becomes a provider warning
- no results from all providers produces an acceptance failure with open questions
- provider-specific malformed response is stored as diagnostic metadata when possible

The final user answer should distinguish:

- retrieved provider-backed candidates
- partial provider coverage
- unavailable providers
- gaps that need manual/database-specific follow-up

## Development Cycle Phases

### Phase 1: Profile and Tool Contract

- Extend `WorkerProfile` with tool-aware fields.
- Update profile Markdown parsing.
- Update `literature-searcher.md` with `allowedTools`, `toolPolicy`, and boundaries.
- Add `literature.search` TypeScript input/output types.

Commit boundary: contract compiles and profile parser tests pass.

### Phase 2: Retrieval Core

- Add normalized candidate types.
- Add provider registry.
- Add fake provider for tests.
- Add artifact writer for `literature-search-results`.
- Add `literature.search` tool implementation against fake providers.

Commit boundary: tool unit tests pass with fake provider and artifact refs.

### Phase 3: General Providers

- Implement Crossref provider.
- Implement Semantic Scholar provider.
- Add mocked-fetch tests for both.
- Add API key/contact configuration resolution.

Commit boundary: provider tests pass without real network.

### Phase 4: Domain Providers

- Implement PubMed provider through E-utilities.
- Implement arXiv provider.
- Add mocked-fetch/XML parsing tests.

Commit boundary: PubMed and arXiv provider tests pass without real network.

### Phase 5: Workflow Integration

- Add profile-worker-runner for tool-aware academic profiles.
- Route `literature-searcher` through the profile worker runner.
- Carry literature artifact refs to downstream `researcher`.
- Update acceptance so provider-backed search requires artifact refs and provenance.

Commit boundary: lead-agent workflow tests pass.

### Phase 6: Smoke and Live Check

- Keep default smoke deterministic with fake provider fixtures.
- Add optional live smoke behind explicit environment opt-in.
- Extend academic smoke to verify provider provenance and artifact manifest content.

Commit boundary: focused tests, `npm run check`, and deterministic smoke pass.

## Testing

Add tests at the narrowest package level:

- `agent-contracts`: profile serialization/type guard coverage for tool fields.
- `lead-agent` profile parser: `Allowed Tools`, `Tool Policy`, `Input Requirements`,
  `Boundaries`.
- `lead-agent` literature providers: mocked Crossref, Semantic Scholar, PubMed, arXiv
  responses.
- `lead-agent` tool tests: fake provider writes `literature-search-results` and returns
  compact previews.
- `lead-agent` workflow tests: search task routes to `literature-searcher`; synthesis task
  routes to `literature-searcher -> researcher`.
- Academic smoke: deterministic fixture mode by default; optional live mode only when
  explicitly enabled.

Do not use real API keys, paid providers, or real network calls in normal tests.

## Acceptance Criteria

The cycle is complete when a prompt like:

```text
帮我寻找一些关于 NIR 在医学诊断中的近五年文献
```

can run through:

```text
lead-agent
-> planner selects literature-search or literature-to-evidence workflow
-> literature-searcher calls literature.search
-> Crossref, Semantic Scholar, PubMed, and arXiv providers run when enabled
-> normalized literature-search-results artifact is written
-> researcher consumes artifact refs if synthesis is needed
-> lead-agent produces a final answer with provider coverage and limitations
```

The answer must not treat the retrieval as exhaustive, and it must not include fabricated
citations. If providers fail, the final output should say which providers failed and what
was still available.

## Source Notes

Provider behavior in this spec is based on official public documentation checked on
2026-05-17:

- Crossref REST API access supports public, polite, and Metadata Plus modes; polite access
  uses contact information such as `mailto` or an identifying agent header:
  https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/
- Semantic Scholar Academic Graph API supports paper metadata search and optional API key
  usage for better authenticated access:
  https://www.semanticscholar.org/product/api
- NCBI E-utilities provide PubMed search and summary/fetch endpoints such as ESearch,
  ESummary, and EFetch:
  https://dataguide.nlm.nih.gov/eutilities/utilities.html
- arXiv offers public API access and documents the query interface and terms of use:
  https://info.arxiv.org/help/api/index.html
  https://info.arxiv.org/help/api/user-manual.html
