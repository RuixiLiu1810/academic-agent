# Literature Retrieval Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-backed literature retrieval as a profile-scoped `literature.search` tool for `lead-agent`.

**Architecture:** Reuse the existing `packages/ai` -> `packages/agent` -> `packages/agent-host` tool call stack. `lead-agent` owns academic tool registration, provider normalization, artifact persistence, profile-scoped tool policy, and workflow integration. `coding-agent` remains the coding worker and is not used for literature retrieval.

**Tech Stack:** TypeScript, TypeBox schemas, `@mariozechner/pi-agent-host` `ToolDefinition`, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, Vitest with mocked provider fetches.

---

## Spec

Implement from:

- `docs/superpowers/specs/2026-05-17-literature-retrieval-tools-design.md`

## File Structure

Create:

- `packages/lead-agent/src/literature/types.ts`  
  Shared literature provider/tool types, normalized candidate types, policy types, and cache key helpers.
- `packages/lead-agent/src/literature/normalize.ts`  
  Candidate normalization helpers, deduplication, merge, and deterministic ranking.
- `packages/lead-agent/src/literature/provider-registry.ts`  
  Provider registry, config resolution, timeout/failure wrapping, and fake-provider injection for tests.
- `packages/lead-agent/src/literature/tools.ts`  
  `literature.search` `ToolDefinition`, policy enforcement, artifact writes, cache lookup, and compact tool result construction.
- `packages/lead-agent/src/literature/providers/crossref.ts`  
  Crossref REST provider.
- `packages/lead-agent/src/literature/providers/semantic-scholar.ts`  
  Semantic Scholar provider.
- `packages/lead-agent/src/literature/providers/pubmed.ts`  
  PubMed E-utilities provider.
- `packages/lead-agent/src/literature/providers/arxiv.ts`  
  arXiv API provider.
- `packages/lead-agent/src/workers/profile-worker-runner.ts`  
  Profile-scoped academic worker runner using `createAgentHostSession()` with `customTools` and `allowedTools`.
- `packages/lead-agent/test/literature-normalize.test.ts`
- `packages/lead-agent/test/literature-providers.test.ts`
- `packages/lead-agent/test/literature-tool.test.ts`
- `packages/lead-agent/test/profile-worker-runner.test.ts`

Modify:

- `packages/agent-contracts/src/index.ts`  
  Add tool-aware profile fields and schema/type-guard coverage.
- `packages/agent-contracts/test/contracts.test.ts`  
  Add profile serialization/guard coverage.
- `packages/lead-agent/src/index.ts`  
  Parse tool-aware Markdown profile sections; expose retrieval config and default worker runner wiring.
- `packages/lead-agent/profiles/literature-searcher.md`  
  Add allowed tool, tool policy, input requirements, and boundaries.
- `packages/lead-agent/src/orchestration/executor.ts`  
  Ensure worker request metadata carries task/workspace context needed by profile worker tools.
- `packages/lead-agent/src/orchestration/acceptance.ts`  
  Require artifact refs/provenance for provider-backed literature search outputs.
- `packages/lead-agent/src/academic-smoke.ts`  
  Add deterministic fake-provider smoke coverage and optional live smoke entry points.
- `packages/lead-agent/package.json`  
  Add the direct `typebox` dependency used by the retrieval tool schema.
- `package-lock.json`  
  Reflect the lead-agent dependency update when `npm install --package-lock-only` updates it.
- `packages/lead-agent/test/lead-agent.test.ts`
- `packages/lead-agent/test/orchestration-acceptance.test.ts`
- `packages/lead-agent/test/academic-smoke.test.ts`

Do not modify:

- `packages/ai/src/models.generated.ts`
- `packages/coding-agent` worker behavior except if a type import break is caused by contracts changes.

## Commands

Run focused tests from package roots:

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-normalize.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-providers.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-tool.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-acceptance.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Run repository check after code changes:

```bash
npm run check
```

Do not run `npm test`, `npm run build`, or `npm run dev`.

---

## Task 1: Extend WorkerProfile Contract

**Files:**
- Modify: `packages/agent-contracts/src/index.ts`
- Modify: `packages/agent-contracts/test/contracts.test.ts`

- [ ] **Step 1: Add failing contract test**

Add this test to `packages/agent-contracts/test/contracts.test.ts`:

```ts
it("round-trips tool-aware worker profiles through worker requests", () => {
	const request: WorkerRequest = {
		taskId: "task-tool-profile",
		workerType: "literature-searcher",
		objective: "Find NIR literature.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs: ["literature-search-results"],
		acceptanceCriteria: ["Provider provenance is recorded"],
		profile: {
			id: "literature-searcher",
			name: "Literature Searcher",
			capabilities: ["literature-search"],
			allowedTools: ["literature.search"],
			toolPolicy: {
				maxCalls: 2,
				defaultProviders: ["crossref", "semantic-scholar"],
				allowedProviders: ["crossref", "semantic-scholar", "pubmed", "arxiv"],
				maxResultsPerProvider: 10,
				timeoutMs: 12000,
				requireArtifactOutput: true,
				allowRefresh: false,
			},
			inputRequirements: ["Research question or search topic"],
			boundaries: ["Do not invent retrieved papers"],
		},
	};

	const parsed = deserializeWorkerRequest(serializeContract(request));

	expect(parsed).toEqual(request);
	expect(isWorkerRequest(parsed)).toBe(true);
});
```

- [ ] **Step 2: Run contract test and verify failure**

Run:

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: FAIL because `WorkerProfile` does not yet accept `allowedTools`, `toolPolicy`, `inputRequirements`, or `boundaries`.

- [ ] **Step 3: Add profile policy types**

In `packages/agent-contracts/src/index.ts`, replace the current `WorkerProfile` interface with:

```ts
export interface WorkerToolPolicy {
	maxCalls?: number;
	defaultProviders?: string[];
	allowedProviders?: string[];
	maxResultsPerProvider?: number;
	timeoutMs?: number;
	requireArtifactOutput?: boolean;
	allowRefresh?: boolean;
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

- [ ] **Step 4: Add schema entries**

Near `jsonObjectSchema`, add:

```ts
const workerToolPolicySchema: JsonObject = {
	type: "object",
	properties: {
		maxCalls: { type: "number" },
		defaultProviders: stringArraySchema,
		allowedProviders: stringArraySchema,
		maxResultsPerProvider: { type: "number" },
		timeoutMs: { type: "number" },
		requireArtifactOutput: { type: "boolean" },
		allowRefresh: { type: "boolean" },
	},
	additionalProperties: false,
};
```

In `WorkerProfileSchema.properties`, add:

```ts
allowedTools: stringArraySchema,
toolPolicy: workerToolPolicySchema,
inputRequirements: stringArraySchema,
boundaries: stringArraySchema,
```

- [ ] **Step 5: Add type guards**

Add this helper near `isWorkerRetryPolicy`:

```ts
function isWorkerToolPolicy(value: unknown): value is WorkerToolPolicy {
	if (!isRecord(value)) {
		return false;
	}
	return (
		(value.maxCalls === undefined || typeof value.maxCalls === "number") &&
		(value.defaultProviders === undefined || isStringArray(value.defaultProviders)) &&
		(value.allowedProviders === undefined || isStringArray(value.allowedProviders)) &&
		(value.maxResultsPerProvider === undefined || typeof value.maxResultsPerProvider === "number") &&
		(value.timeoutMs === undefined || typeof value.timeoutMs === "number") &&
		(value.requireArtifactOutput === undefined || typeof value.requireArtifactOutput === "boolean") &&
		(value.allowRefresh === undefined || typeof value.allowRefresh === "boolean")
	);
}
```

Update `isWorkerProfile()` so the return expression includes:

```ts
hasOptionalStringArray(value, "allowedTools") &&
(value.toolPolicy === undefined || isWorkerToolPolicy(value.toolPolicy)) &&
hasOptionalStringArray(value, "inputRequirements") &&
hasOptionalStringArray(value, "boundaries")
```

- [ ] **Step 6: Run contract test**

Run:

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add packages/agent-contracts/src/index.ts packages/agent-contracts/test/contracts.test.ts
git commit -m "feat(agent-contracts): add tool-aware worker profiles"
```

---

## Task 2: Parse Tool-Aware Profiles

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/profiles/literature-searcher.md`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add failing profile parser test**

Update the standalone profile Markdown in `packages/lead-agent/test/lead-agent.test.ts` so it includes:

```md
## Allowed Tools

- literature.search

## Tool Policy

- maxCalls: 2
- defaultProviders: crossref, semantic-scholar
- allowedProviders: crossref, semantic-scholar, pubmed, arxiv
- maxResultsPerProvider: 10
- timeoutMs: 12000
- requireArtifactOutput: true
- allowRefresh: false

## Input Requirements

- Search topic

## Boundaries

- Do not invent retrieved papers
```

Extend the expected `toMatchObject()` with:

```ts
allowedTools: ["literature.search"],
toolPolicy: {
	maxCalls: 2,
	defaultProviders: ["crossref", "semantic-scholar"],
	allowedProviders: ["crossref", "semantic-scholar", "pubmed", "arxiv"],
	maxResultsPerProvider: 10,
	timeoutMs: 12000,
	requireArtifactOutput: true,
	allowRefresh: false,
},
inputRequirements: ["Search topic"],
boundaries: ["Do not invent retrieved papers"],
```

- [ ] **Step 2: Run lead-agent parser test and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because profile parsing does not yet read tool sections.

- [ ] **Step 3: Add parser helpers**

In `packages/lead-agent/src/index.ts`, add this helper near `sectionList()`:

```ts
function parseBoolean(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return undefined;
}

function parseStringList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function sectionKeyValueMap(markdown: string, heading: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const item of sectionList(markdown, heading)) {
		const separator = item.indexOf(":");
		if (separator === -1) {
			continue;
		}
		const key = item.slice(0, separator).trim();
		const value = item.slice(separator + 1).trim();
		if (key.length > 0 && value.length > 0) {
			entries.set(key, value);
		}
	}
	return entries;
}
```

- [ ] **Step 4: Add tool policy parser**

In `packages/lead-agent/src/index.ts`, add:

```ts
function parseToolPolicy(markdown: string): WorkerProfile["toolPolicy"] {
	const values = sectionKeyValueMap(markdown, "Tool Policy");
	if (values.size === 0) {
		return undefined;
	}
	const policy: NonNullable<WorkerProfile["toolPolicy"]> = {};
	const numericKeys = ["maxCalls", "maxResultsPerProvider", "timeoutMs"] as const;
	for (const key of numericKeys) {
		const value = values.get(key);
		if (value !== undefined) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				policy[key] = parsed;
			}
		}
	}
	for (const key of ["defaultProviders", "allowedProviders"] as const) {
		const value = values.get(key);
		if (value !== undefined) {
			policy[key] = parseStringList(value);
		}
	}
	for (const key of ["requireArtifactOutput", "allowRefresh"] as const) {
		const value = values.get(key);
		if (value !== undefined) {
			const parsed = parseBoolean(value);
			if (parsed !== undefined) {
				policy[key] = parsed;
			}
		}
	}
	return policy;
}
```

- [ ] **Step 5: Wire parser into WorkerProfile**

In `parseAcademicProfileMarkdown()`, add:

```ts
const allowedTools = sectionList(markdown, "Allowed Tools");
const toolPolicy = parseToolPolicy(markdown);
const inputRequirements = sectionList(markdown, "Input Requirements");
const boundaries = sectionList(markdown, "Boundaries");
```

Return these fields:

```ts
allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
toolPolicy,
inputRequirements: inputRequirements.length > 0 ? inputRequirements : undefined,
boundaries: boundaries.length > 0 ? boundaries : undefined,
```

- [ ] **Step 6: Update literature-searcher profile**

Append these sections to `packages/lead-agent/profiles/literature-searcher.md`:

```md
## Allowed Tools

- literature.search

## Tool Policy

- maxCalls: 2
- defaultProviders: crossref, semantic-scholar, pubmed, arxiv
- allowedProviders: crossref, semantic-scholar, pubmed, arxiv
- maxResultsPerProvider: 10
- timeoutMs: 12000
- requireArtifactOutput: true
- allowRefresh: false

## Input Requirements

- Search topic, research question, or source-seeking objective
- Domain hints when an acronym has multiple meanings

## Boundaries

- Do not invent retrieved papers.
- Do not present provider results as exhaustive coverage.
- Do not synthesize scientific conclusions beyond retrieved metadata and abstracts.
- Do not request an evidence table unless a downstream synthesis step is planned.
```

- [ ] **Step 7: Run profile tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add packages/lead-agent/src/index.ts packages/lead-agent/profiles/literature-searcher.md packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): parse tool-aware profiles"
```

---

## Task 3: Add Literature Types, Deduplication, and Ranking

**Files:**
- Create: `packages/lead-agent/src/literature/types.ts`
- Create: `packages/lead-agent/src/literature/normalize.ts`
- Create: `packages/lead-agent/test/literature-normalize.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Create `packages/lead-agent/test/literature-normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LiteratureCandidate } from "../src/literature/types.js";
import { dedupeAndRankCandidates, normalizeDoi } from "../src/literature/normalize.js";

function candidate(overrides: Partial<LiteratureCandidate>): LiteratureCandidate {
	return {
		id: overrides.id ?? "candidate-1",
		provider: overrides.provider ?? "crossref",
		providerRecordId: overrides.providerRecordId ?? "record-1",
		title: overrides.title ?? "Near infrared spectroscopy in diagnosis",
		authors: overrides.authors ?? ["A. Author"],
		year: overrides.year ?? 2024,
		doi: overrides.doi,
		pmid: overrides.pmid,
		arxivId: overrides.arxivId,
		url: overrides.url,
		abstract: overrides.abstract,
		venue: overrides.venue,
		citationCount: overrides.citationCount,
		sourceQuery: overrides.sourceQuery ?? "near infrared diagnosis",
		rawScore: overrides.rawScore,
		retrievedAt: overrides.retrievedAt ?? "2026-05-17T00:00:00.000Z",
		provenance: overrides.provenance,
		rankingNotes: overrides.rankingNotes,
	};
}

describe("literature normalization", () => {
	it("normalizes DOI values", () => {
		expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
		expect(normalizeDoi("doi:10.1000/XYZ")).toBe("10.1000/xyz");
	});

	it("deduplicates by DOI and preserves provider provenance", () => {
		const results = dedupeAndRankCandidates(
			[
				candidate({ provider: "crossref", providerRecordId: "doi-1", doi: "https://doi.org/10.1000/ABC" }),
				candidate({ provider: "semantic-scholar", providerRecordId: "s2-1", doi: "10.1000/abc" }),
			],
			{ query: "near infrared diagnosis" },
		);

		expect(results).toHaveLength(1);
		expect(results[0]?.doi).toBe("10.1000/abc");
		expect(results[0]?.provenance?.map((p) => p.provider).sort()).toEqual(["crossref", "semantic-scholar"]);
	});

	it("ranks exact title matches and multi-provider records first", () => {
		const results = dedupeAndRankCandidates(
			[
				candidate({ id: "b", title: "Unrelated spectroscopy note", year: 2026, citationCount: 20 }),
				candidate({ id: "a", title: "Near infrared spectroscopy in diagnosis", year: 2022, citationCount: 1 }),
				candidate({ id: "a2", title: "Near infrared spectroscopy in diagnosis", year: 2022, doi: "10.1/a" }),
				candidate({ id: "a3", title: "Near infrared spectroscopy in diagnosis", year: 2022, doi: "10.1/a", provider: "pubmed" }),
			],
			{ query: "near infrared spectroscopy in diagnosis" },
		);

		expect(results[0]?.title).toBe("Near infrared spectroscopy in diagnosis");
		expect(results[0]?.rankingNotes).toContain("matched query terms");
		expect(results[0]?.rankingNotes).toContain("returned by 2 providers");
	});
});
```

- [ ] **Step 2: Run normalization tests and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-normalize.test.ts
```

Expected: FAIL because literature modules do not exist.

- [ ] **Step 3: Create literature types**

Create `packages/lead-agent/src/literature/types.ts`:

```ts
import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";

export type LiteratureProviderId = "crossref" | "semantic-scholar" | "pubmed" | "arxiv";

export interface LiteratureSearchToolInput {
	query: string;
	providers?: LiteratureProviderId[];
	maxResults?: number;
	fromYear?: number;
	toYear?: number;
	fieldOfStudy?: string;
	includePreprints?: boolean;
	includeBiomedical?: boolean;
	refresh?: boolean;
}

export interface LiteratureProviderProvenance {
	provider: LiteratureProviderId;
	providerRecordId: string;
	sourceQuery: string;
	rawScore?: number;
	retrievedAt: string;
}

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
	provenance?: LiteratureProviderProvenance[];
	rankingNotes?: string[];
}

export interface LiteratureCandidateBrief {
	id: string;
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	doi?: string;
	pmid?: string;
	arxivId?: string;
	url?: string;
	providers: LiteratureProviderId[];
	rankingNotes: string[];
}

export interface LiteratureProviderRequest {
	query: string;
	maxResults: number;
	fromYear?: number;
	toYear?: number;
	fieldOfStudy?: string;
	includePreprints?: boolean;
	includeBiomedical?: boolean;
	signal?: AbortSignal;
}

export interface LiteratureProviderResult {
	provider: LiteratureProviderId;
	candidates: LiteratureCandidate[];
	warnings: string[];
}

export interface LiteratureSearchProvider {
	id: LiteratureProviderId;
	search(request: LiteratureProviderRequest): Promise<LiteratureProviderResult>;
}

export interface LiteratureProviderRunSummary {
	provider: LiteratureProviderId;
	status: "success" | "failed";
	candidateCount: number;
	warnings: string[];
	error?: string;
}

export interface LiteratureSearchToolOutput {
	retrievalRunId: string;
	providers: LiteratureProviderRunSummary[];
	artifactRefs: ArtifactRef[];
	candidatesPreview: LiteratureCandidateBrief[];
	warnings: string[];
}
```

- [ ] **Step 4: Create normalization implementation**

Create `packages/lead-agent/src/literature/normalize.ts`:

```ts
import type { LiteratureCandidate, LiteratureCandidateBrief, LiteratureProviderProvenance } from "./types.js";

export function normalizeDoi(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
		.replace(/^doi:\s*/, "");
	return normalized.length > 0 ? normalized : undefined;
}

function normalizeTitle(value: string): string {
	return value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

function candidateKey(candidate: LiteratureCandidate): string {
	const doi = normalizeDoi(candidate.doi);
	if (doi) return `doi:${doi}`;
	if (candidate.pmid) return `pmid:${candidate.pmid.trim()}`;
	if (candidate.arxivId) return `arxiv:${candidate.arxivId.trim().toLowerCase()}`;
	if (candidate.provider === "semantic-scholar") return `s2:${candidate.providerRecordId}`;
	return `title-year:${normalizeTitle(candidate.title)}:${candidate.year ?? "unknown"}`;
}

function provenanceFor(candidate: LiteratureCandidate): LiteratureProviderProvenance {
	return {
		provider: candidate.provider,
		providerRecordId: candidate.providerRecordId,
		sourceQuery: candidate.sourceQuery,
		rawScore: candidate.rawScore,
		retrievedAt: candidate.retrievedAt,
	};
}

function mergeCandidate(left: LiteratureCandidate, right: LiteratureCandidate): LiteratureCandidate {
	const provenance = [...(left.provenance ?? [provenanceFor(left)]), ...(right.provenance ?? [provenanceFor(right)])];
	const providers = new Set(provenance.map((p) => p.provider));
	return {
		...left,
		title: left.title || right.title,
		authors: left.authors.length > 0 ? left.authors : right.authors,
		year: left.year ?? right.year,
		venue: left.venue ?? right.venue,
		doi: normalizeDoi(left.doi) ?? normalizeDoi(right.doi),
		pmid: left.pmid ?? right.pmid,
		arxivId: left.arxivId ?? right.arxivId,
		url: left.url ?? right.url,
		abstract: left.abstract ?? right.abstract,
		publicationType: left.publicationType ?? right.publicationType,
		isOpenAccess: left.isOpenAccess ?? right.isOpenAccess,
		citationCount: Math.max(left.citationCount ?? 0, right.citationCount ?? 0) || undefined,
		provenance,
		rankingNotes: providers.size > 1 ? [`returned by ${providers.size} providers`] : left.rankingNotes,
	};
}

function score(candidate: LiteratureCandidate, query: string): { score: number; notes: string[] } {
	const notes = new Set(candidate.rankingNotes ?? []);
	const queryTerms = normalizeTitle(query).split(" ").filter((term) => term.length > 2);
	const title = normalizeTitle(candidate.title);
	let value = 0;
	if (queryTerms.length > 0 && queryTerms.every((term) => title.includes(term))) {
		value += 40;
		notes.add("matched query terms");
	}
	const providerCount = new Set((candidate.provenance ?? [provenanceFor(candidate)]).map((p) => p.provider)).size;
	if (providerCount > 1) {
		value += providerCount * 10;
		notes.add(`returned by ${providerCount} providers`);
	}
	if (candidate.year) value += Math.min(Math.max(candidate.year - 2000, 0), 30);
	if (candidate.citationCount) value += Math.min(candidate.citationCount, 50) / 5;
	if (candidate.abstract) value += 5;
	if (candidate.doi || candidate.pmid || candidate.arxivId) value += 5;
	return { score: value, notes: [...notes] };
}

export function dedupeAndRankCandidates(
	candidates: readonly LiteratureCandidate[],
	options: { query: string },
): LiteratureCandidate[] {
	const merged = new Map<string, LiteratureCandidate>();
	for (const candidate of candidates) {
		const normalized = { ...candidate, doi: normalizeDoi(candidate.doi), provenance: candidate.provenance };
		const key = candidateKey(normalized);
		const existing = merged.get(key);
		merged.set(key, existing ? mergeCandidate(existing, normalized) : normalized);
	}
	return [...merged.values()]
		.map((candidate) => {
			const ranked = score(candidate, options.query);
			return { ...candidate, rankingNotes: ranked.notes, rawScore: ranked.score };
		})
		.sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0) || a.title.localeCompare(b.title));
}

export function toCandidateBrief(candidate: LiteratureCandidate): LiteratureCandidateBrief {
	return {
		id: candidate.id,
		title: candidate.title,
		authors: candidate.authors,
		year: candidate.year,
		venue: candidate.venue,
		doi: candidate.doi,
		pmid: candidate.pmid,
		arxivId: candidate.arxivId,
		url: candidate.url,
		providers: [...new Set((candidate.provenance ?? [provenanceFor(candidate)]).map((p) => p.provider))],
		rankingNotes: candidate.rankingNotes ?? [],
	};
}
```

- [ ] **Step 5: Run normalization tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-normalize.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add packages/lead-agent/src/literature/types.ts packages/lead-agent/src/literature/normalize.ts packages/lead-agent/test/literature-normalize.test.ts
git commit -m "feat(lead-agent): add literature retrieval normalization"
```

---

## Task 4: Add Provider Registry and Fake Provider Tool Core

**Files:**
- Create: `packages/lead-agent/src/literature/provider-registry.ts`
- Create: `packages/lead-agent/src/literature/tools.ts`
- Create: `packages/lead-agent/test/literature-tool.test.ts`
- Modify: `packages/lead-agent/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing tool test**

Create `packages/lead-agent/test/literature-tool.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import { afterEach, describe, expect, it } from "vitest";
import { createLiteratureSearchTool } from "../src/literature/tools.js";
import type { LiteratureSearchProvider } from "../src/literature/types.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-literature-tool-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("literature.search tool", () => {
	it("runs fake providers, writes an artifact, and returns compact details", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search(request) {
				return {
					provider: "crossref",
					warnings: [],
					candidates: [
						{
							id: "crossref-1",
							provider: "crossref",
							providerRecordId: "10.1000/nir",
							title: "Near infrared spectroscopy for diagnosis",
							authors: ["A. Author"],
							year: 2024,
							doi: "10.1000/nir",
							sourceQuery: request.query,
							retrievedAt: "2026-05-17T00:00:00.000Z",
						},
					],
				};
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
				requireArtifactOutput: true,
			},
		});

		const result = await tool.execute(
			"tool-call-1",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);

		expect(result.details.artifactRefs).toHaveLength(1);
		expect(result.details.candidatesPreview[0]?.title).toContain("Near infrared");
		expect(store.list()[0]?.kind).toBe("literature-search-results");
		expect(result.content[0]).toMatchObject({ type: "text" });
	});

	it("rejects disallowed providers and refresh attempts", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search() {
				return { provider: "crossref", warnings: [], candidates: [] };
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
				allowRefresh: false,
			},
		});

		await expect(
			tool.execute(
				"tool-call-2",
				{ query: "near infrared diagnosis", providers: ["pubmed"] },
				undefined,
				undefined,
				undefined as never,
			),
		).rejects.toThrow("Provider is not allowed by this worker profile: pubmed");

		await expect(
			tool.execute(
				"tool-call-3",
				{ query: "near infrared diagnosis", refresh: true },
				undefined,
				undefined,
				undefined as never,
			),
		).rejects.toThrow("Refresh is not allowed by this worker profile.");
	});

	it("reuses matching session artifacts unless refresh is allowed and requested", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		let calls = 0;
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search(request) {
				calls += 1;
				return {
					provider: "crossref",
					warnings: [],
					candidates: [
						{
							id: `crossref-${calls}`,
							provider: "crossref",
							providerRecordId: `record-${calls}`,
							title: "Near infrared spectroscopy for diagnosis",
							authors: ["A. Author"],
							year: 2024,
							sourceQuery: request.query,
							retrievedAt: "2026-05-17T00:00:00.000Z",
						},
					],
				};
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
			},
		});

		const first = await tool.execute(
			"tool-call-4",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);
		const second = await tool.execute(
			"tool-call-5",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);

		expect(calls).toBe(1);
		expect(second.details.artifactRefs[0]?.id).toBe(first.details.artifactRefs[0]?.id);
	});
});
```

- [ ] **Step 2: Run tool test and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-tool.test.ts
```

Expected: FAIL because provider registry and tool do not exist.

- [ ] **Step 3: Create provider registry**

Create `packages/lead-agent/src/literature/provider-registry.ts`:

```ts
import type {
	LiteratureProviderId,
	LiteratureProviderRequest,
	LiteratureProviderResult,
	LiteratureSearchProvider,
} from "./types.js";

export interface LiteratureProviderRunFailure {
	provider: LiteratureProviderId;
	error: string;
}

export interface LiteratureProviderRunSuccess {
	provider: LiteratureProviderId;
	result: LiteratureProviderResult;
}

export type LiteratureProviderRun = LiteratureProviderRunSuccess | LiteratureProviderRunFailure;

export class LiteratureProviderRegistry {
	private readonly providers = new Map<LiteratureProviderId, LiteratureSearchProvider>();

	constructor(providers: readonly LiteratureSearchProvider[] = []) {
		for (const provider of providers) {
			this.providers.set(provider.id, provider);
		}
	}

	get(id: LiteratureProviderId): LiteratureSearchProvider | undefined {
		return this.providers.get(id);
	}

	ids(): LiteratureProviderId[] {
		return [...this.providers.keys()];
	}

	async search(providerId: LiteratureProviderId, request: LiteratureProviderRequest): Promise<LiteratureProviderRun> {
		const provider = this.providers.get(providerId);
		if (!provider) {
			return { provider: providerId, error: `Provider not registered: ${providerId}` };
		}
		try {
			return { provider: providerId, result: await provider.search(request) };
		} catch (error) {
			return { provider: providerId, error: error instanceof Error ? error.message : String(error) };
		}
	}
}
```

- [ ] **Step 4: Add direct TypeBox dependency**

Run from the repo root:

```bash
npm install typebox@^1.1.24 --workspace @mariozechner/pi-lead-agent --package-lock-only
```

Expected: `packages/lead-agent/package.json` contains `"typebox": "^1.1.24"` under `dependencies`, and `package-lock.json` records the workspace dependency.

- [ ] **Step 5: Create literature.search tool**

Create `packages/lead-agent/src/literature/tools.ts`:

```ts
import type { ArtifactBrief } from "@mariozechner/pi-agent-contracts";
import { ACADEMIC_ARTIFACT_KINDS, artifactToRef, createAcademicArtifact, type ArtifactStore } from "@mariozechner/pi-artifact-core";
import { Type } from "typebox";
import { defineTool, type ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import { dedupeAndRankCandidates, toCandidateBrief } from "./normalize.js";
import { LiteratureProviderRegistry } from "./provider-registry.js";
import type {
	LiteratureProviderId,
	LiteratureSearchProvider,
	LiteratureSearchToolInput,
	LiteratureSearchToolOutput,
} from "./types.js";

const providerIds = ["crossref", "semantic-scholar", "pubmed", "arxiv"] as const;

const literatureSearchSchema = Type.Object({
	query: Type.String(),
	providers: Type.Optional(Type.Array(Type.Union(providerIds.map((id) => Type.Literal(id))))),
	maxResults: Type.Optional(Type.Number()),
	fromYear: Type.Optional(Type.Number()),
	toYear: Type.Optional(Type.Number()),
	fieldOfStudy: Type.Optional(Type.String()),
	includePreprints: Type.Optional(Type.Boolean()),
	includeBiomedical: Type.Optional(Type.Boolean()),
	refresh: Type.Optional(Type.Boolean()),
});

export interface LiteratureSearchToolPolicy {
	maxCalls?: number;
	defaultProviders?: string[];
	allowedProviders?: string[];
	maxResultsPerProvider?: number;
	timeoutMs?: number;
	requireArtifactOutput?: boolean;
	allowRefresh?: boolean;
}

export interface CreateLiteratureSearchToolOptions {
	store: ArtifactStore;
	providers: readonly LiteratureSearchProvider[];
	policy?: LiteratureSearchToolPolicy;
}

function asProviderId(value: string): LiteratureProviderId {
	if (!providerIds.includes(value as LiteratureProviderId)) {
		throw new Error(`Unsupported literature provider: ${value}`);
	}
	return value as LiteratureProviderId;
}

function resolveProviders(input: LiteratureSearchToolInput, policy: LiteratureSearchToolPolicy): LiteratureProviderId[] {
	const requested = input.providers ?? policy.defaultProviders ?? [...providerIds];
	const allowed = new Set((policy.allowedProviders ?? [...providerIds]).map(asProviderId));
	return requested.map(asProviderId).map((provider) => {
		if (!allowed.has(provider)) {
			throw new Error(`Provider is not allowed by this worker profile: ${provider}`);
		}
		return provider;
	});
}

function artifactBriefFor(output: LiteratureSearchToolOutput): ArtifactBrief {
	return {
		artifactId: output.artifactRefs[0]?.id ?? output.retrievalRunId,
		kind: ACADEMIC_ARTIFACT_KINDS.literatureSearchResults,
		title: "Literature search results",
		brief: `Retrieved ${output.candidatesPreview.length} preview candidates across ${output.providers.length} providers.`,
		keyFindings: output.candidatesPreview.map((candidate) => candidate.title).slice(0, 5),
		limitations: output.warnings,
	};
}

function stableCacheKey(input: LiteratureSearchToolInput, providers: readonly LiteratureProviderId[], maxResults: number): string {
	return JSON.stringify({
		providers: [...providers].sort(),
		query: input.query.trim().toLowerCase().replace(/\s+/g, " "),
		maxResults,
		fromYear: input.fromYear,
		toYear: input.toYear,
		fieldOfStudy: input.fieldOfStudy,
		includePreprints: input.includePreprints,
		includeBiomedical: input.includeBiomedical,
	});
}

function cachedOutput(
	store: ArtifactStore,
	cacheKey: string,
): LiteratureSearchToolOutput | undefined {
	for (const artifact of store.list()) {
		if (artifact.kind !== ACADEMIC_ARTIFACT_KINDS.literatureSearchResults) {
			continue;
		}
		if (artifact.metadata?.cacheKey !== cacheKey) {
			continue;
		}
		const parsed = JSON.parse(artifact.content) as { output?: LiteratureSearchToolOutput };
		return parsed.output;
	}
	return undefined;
}

export function createLiteratureSearchTool(options: CreateLiteratureSearchToolOptions): ToolDefinition<typeof literatureSearchSchema, LiteratureSearchToolOutput> {
	const registry = new LiteratureProviderRegistry(options.providers);
	const policy = options.policy ?? {};
	let callCount = 0;
	return defineTool({
		name: "literature.search",
		label: "Literature Search",
		description: "Search academic metadata providers and write normalized literature results as artifacts.",
		parameters: literatureSearchSchema,
		executionMode: "sequential",
		promptSnippet: "literature.search: search academic metadata providers and return artifact refs.",
		promptGuidelines: [
			"Use literature.search for provider-backed metadata retrieval.",
			"Do not invent citations or retrieved papers.",
			"Summarize provider coverage and limitations.",
		],
		async execute(_toolCallId, params) {
			const input = params as LiteratureSearchToolInput;
			callCount += 1;
			if (policy.maxCalls !== undefined && callCount > policy.maxCalls) {
				throw new Error(`Tool call limit exceeded for literature.search: ${policy.maxCalls}`);
			}
			if (input.refresh === true && policy.allowRefresh !== true) {
				throw new Error("Refresh is not allowed by this worker profile.");
			}
			const providers = resolveProviders(input, policy);
			if (providers.length === 0) {
				throw new Error("No allowed literature providers were selected.");
			}
			const maxResults = Math.min(input.maxResults ?? policy.maxResultsPerProvider ?? 10, policy.maxResultsPerProvider ?? 10);
			const cacheKey = stableCacheKey(input, providers, maxResults);
			if (input.refresh !== true) {
				const cached = cachedOutput(options.store, cacheKey);
				if (cached) {
					return {
						content: [{ type: "text", text: `Reused cached literature search artifact: ${cached.artifactRefs[0]?.id ?? "(none)"}` }],
						details: cached,
					};
				}
			}
			const runs = await Promise.all(
				providers.map((provider) =>
					registry.search(provider, {
						query: input.query,
						maxResults,
						fromYear: input.fromYear,
						toYear: input.toYear,
						fieldOfStudy: input.fieldOfStudy,
						includePreprints: input.includePreprints,
						includeBiomedical: input.includeBiomedical,
					}),
				),
			);
			const candidates = dedupeAndRankCandidates(
				runs.flatMap((run) => ("result" in run ? run.result.candidates : [])),
				{ query: input.query },
			);
			const warnings = runs.flatMap((run) =>
				"result" in run ? run.result.warnings : [`${run.provider}: ${run.error}`],
			);
			const providerSummaries = runs.map((run) =>
				"result" in run
					? { provider: run.provider, status: "success" as const, candidateCount: run.result.candidates.length, warnings: run.result.warnings }
					: { provider: run.provider, status: "failed" as const, candidateCount: 0, warnings: [], error: run.error },
			);
			const retrievalRunId = `literature-${Date.now()}`;
			const artifact = createAcademicArtifact(options.store, {
				kind: ACADEMIC_ARTIFACT_KINDS.literatureSearchResults,
				title: `Literature search: ${input.query}`,
				mediaType: "application/json",
				content: `${JSON.stringify({ retrievalRunId, input, cacheKey, providers: providerSummaries, candidates, warnings }, null, 2)}\n`,
				metadata: {
					retrievalRunId,
					cacheKey,
					query: input.query,
					providers,
				},
			});
			const output: LiteratureSearchToolOutput = {
				retrievalRunId,
				providers: providerSummaries,
				artifactRefs: [artifactToRef(artifact)],
				candidatesPreview: candidates.slice(0, 10).map(toCandidateBrief),
				warnings,
			};
			options.store.update(artifact.id, {
				content: `${JSON.stringify({ retrievalRunId, input, cacheKey, providers: providerSummaries, candidates, warnings, output }, null, 2)}\n`,
				metadata: artifact.metadata,
			});
			if (policy.requireArtifactOutput === true && output.artifactRefs.length === 0) {
				throw new Error("Literature search did not produce an artifact.");
			}
			const brief = artifactBriefFor(output);
			return {
				content: [{ type: "text", text: `${brief.brief}\nArtifact: ${output.artifactRefs[0]?.id ?? "(none)"}` }],
				details: output,
			};
		},
	});
}
```

- [ ] **Step 6: Run tool test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-tool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add packages/lead-agent/src/literature/provider-registry.ts packages/lead-agent/src/literature/tools.ts packages/lead-agent/test/literature-tool.test.ts packages/lead-agent/package.json package-lock.json
git commit -m "feat(lead-agent): add literature search tool core"
```

---

## Task 5: Implement Crossref and Semantic Scholar Providers

**Files:**
- Create: `packages/lead-agent/src/literature/providers/crossref.ts`
- Create: `packages/lead-agent/src/literature/providers/semantic-scholar.ts`
- Create: `packages/lead-agent/test/literature-providers.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `packages/lead-agent/test/literature-providers.test.ts` with Crossref and Semantic Scholar tests:

```ts
import { describe, expect, it } from "vitest";
import { createCrossrefProvider } from "../src/literature/providers/crossref.js";
import { createSemanticScholarProvider } from "../src/literature/providers/semantic-scholar.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("literature providers", () => {
	it("normalizes Crossref works results", async () => {
		const provider = createCrossrefProvider({
			fetch: async () =>
				jsonResponse({
					message: {
						items: [
							{
								DOI: "10.1000/nir",
								title: ["Near infrared spectroscopy for diagnosis"],
								author: [{ given: "Alice", family: "Author" }],
								"container-title": ["Journal of NIR"],
								published: { "date-parts": [[2024]] },
								URL: "https://doi.org/10.1000/nir",
								type: "journal-article",
							},
						],
					},
				}),
		});

		const result = await provider.search({ query: "near infrared diagnosis", maxResults: 5 });

		expect(result.provider).toBe("crossref");
		expect(result.candidates[0]).toMatchObject({
			provider: "crossref",
			doi: "10.1000/nir",
			title: "Near infrared spectroscopy for diagnosis",
			authors: ["Alice Author"],
			year: 2024,
		});
	});

	it("normalizes Semantic Scholar paper search results", async () => {
		const provider = createSemanticScholarProvider({
			fetch: async () =>
				jsonResponse({
					data: [
						{
							paperId: "s2-1",
							title: "Near infrared imaging in medicine",
							authors: [{ name: "Bob Author" }],
							year: 2025,
							venue: "Medical Imaging",
							abstract: "Abstract text",
							citationCount: 12,
							url: "https://semanticscholar.org/paper/s2-1",
							externalIds: { DOI: "10.2000/nir" },
						},
					],
				}),
		});

		const result = await provider.search({ query: "near infrared imaging", maxResults: 5 });

		expect(result.provider).toBe("semantic-scholar");
		expect(result.candidates[0]).toMatchObject({
			provider: "semantic-scholar",
			providerRecordId: "s2-1",
			doi: "10.2000/nir",
			citationCount: 12,
		});
	});
});
```

- [ ] **Step 2: Run provider tests and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-providers.test.ts
```

Expected: FAIL because provider modules do not exist.

- [ ] **Step 3: Implement Crossref provider**

Create `packages/lead-agent/src/literature/providers/crossref.ts`:

```ts
import type { LiteratureSearchProvider } from "../types.js";
import { normalizeDoi } from "../normalize.js";

interface CrossrefProviderOptions {
	fetch?: typeof fetch;
	mailto?: string;
	userAgent?: string;
}

function authorName(author: { given?: string; family?: string }): string {
	return [author.given, author.family].filter(Boolean).join(" ").trim();
}

function yearFromWork(work: { published?: { "date-parts"?: number[][] }; issued?: { "date-parts"?: number[][] } }): number | undefined {
	return work.published?.["date-parts"]?.[0]?.[0] ?? work.issued?.["date-parts"]?.[0]?.[0];
}

export function createCrossrefProvider(options: CrossrefProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "crossref",
		async search(request) {
			const url = new URL("https://api.crossref.org/works");
			url.searchParams.set("query", request.query);
			url.searchParams.set("rows", String(request.maxResults));
			if (request.fromYear) url.searchParams.append("filter", `from-pub-date:${request.fromYear}`);
			if (request.toYear) url.searchParams.append("filter", `until-pub-date:${request.toYear}`);
			if (options.mailto) url.searchParams.set("mailto", options.mailto);
			const response = await fetchImpl(url, {
				signal: request.signal,
				headers: options.userAgent ? { "user-agent": options.userAgent } : undefined,
			});
			if (!response.ok) throw new Error(`Crossref request failed: ${response.status}`);
			const body = (await response.json()) as {
				message?: {
					items?: Array<{
						DOI?: string;
						title?: string[];
						author?: Array<{ given?: string; family?: string }>;
						"container-title"?: string[];
						published?: { "date-parts"?: number[][] };
						issued?: { "date-parts"?: number[][] };
						URL?: string;
						type?: string;
					}>;
				};
			};
			const retrievedAt = new Date().toISOString();
			return {
				provider: "crossref",
				warnings: [],
				candidates: (body.message?.items ?? []).map((work, index) => ({
					id: `crossref-${work.DOI ?? index}`,
					provider: "crossref",
					providerRecordId: work.DOI ?? `index-${index}`,
					title: work.title?.[0] ?? "(untitled)",
					authors: (work.author ?? []).map(authorName).filter((name) => name.length > 0),
					year: yearFromWork(work),
					venue: work["container-title"]?.[0],
					doi: normalizeDoi(work.DOI),
					url: work.URL,
					publicationType: work.type,
					sourceQuery: request.query,
					retrievedAt,
				})),
			};
		},
	};
}
```

- [ ] **Step 4: Implement Semantic Scholar provider**

Create `packages/lead-agent/src/literature/providers/semantic-scholar.ts`:

```ts
import type { LiteratureSearchProvider } from "../types.js";
import { normalizeDoi } from "../normalize.js";

interface SemanticScholarProviderOptions {
	fetch?: typeof fetch;
	apiKey?: string;
}

export function createSemanticScholarProvider(options: SemanticScholarProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "semantic-scholar",
		async search(request) {
			const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
			url.searchParams.set("query", request.query);
			url.searchParams.set("limit", String(request.maxResults));
			url.searchParams.set("fields", "paperId,title,authors,year,venue,abstract,citationCount,url,externalIds,openAccessPdf");
			if (request.fromYear || request.toYear) {
				url.searchParams.set("year", `${request.fromYear ?? ""}-${request.toYear ?? ""}`);
			}
			const response = await fetchImpl(url, {
				signal: request.signal,
				headers: options.apiKey ? { "x-api-key": options.apiKey } : undefined,
			});
			if (!response.ok) throw new Error(`Semantic Scholar request failed: ${response.status}`);
			const body = (await response.json()) as {
				data?: Array<{
					paperId: string;
					title?: string;
					authors?: Array<{ name?: string }>;
					year?: number;
					venue?: string;
					abstract?: string;
					citationCount?: number;
					url?: string;
					externalIds?: { DOI?: string };
					openAccessPdf?: { url?: string };
				}>;
			};
			const retrievedAt = new Date().toISOString();
			return {
				provider: "semantic-scholar",
				warnings: [],
				candidates: (body.data ?? []).map((paper) => ({
					id: `semantic-scholar-${paper.paperId}`,
					provider: "semantic-scholar",
					providerRecordId: paper.paperId,
					title: paper.title ?? "(untitled)",
					authors: (paper.authors ?? []).map((author) => author.name ?? "").filter((name) => name.length > 0),
					year: paper.year,
					venue: paper.venue,
					doi: normalizeDoi(paper.externalIds?.DOI),
					url: paper.url ?? paper.openAccessPdf?.url,
					abstract: paper.abstract,
					citationCount: paper.citationCount,
					isOpenAccess: paper.openAccessPdf?.url !== undefined,
					sourceQuery: request.query,
					retrievedAt,
				})),
			};
		},
	};
}
```

- [ ] **Step 5: Run provider tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-providers.test.ts
```

Expected: PASS for the two provider tests.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add packages/lead-agent/src/literature/providers/crossref.ts packages/lead-agent/src/literature/providers/semantic-scholar.ts packages/lead-agent/test/literature-providers.test.ts
git commit -m "feat(lead-agent): add general literature providers"
```

---

## Task 6: Implement PubMed and arXiv Providers

**Files:**
- Create: `packages/lead-agent/src/literature/providers/pubmed.ts`
- Create: `packages/lead-agent/src/literature/providers/arxiv.ts`
- Modify: `packages/lead-agent/test/literature-providers.test.ts`

- [ ] **Step 1: Add failing PubMed and arXiv tests**

Append these tests to `packages/lead-agent/test/literature-providers.test.ts`:

```ts
it("normalizes PubMed ESummary results", async () => {
	const provider = createPubMedProvider({
		fetch: async (input) => {
			const url = String(input);
			if (url.includes("esearch.fcgi")) {
				return jsonResponse({ esearchresult: { idlist: ["123"] } });
			}
			return jsonResponse({
				result: {
					"123": {
						uid: "123",
						title: "Near infrared diagnosis in PubMed",
						fulljournalname: "PubMed Journal",
						pubdate: "2023 Jan",
						authors: [{ name: "Carol Author" }],
						articleids: [{ idtype: "doi", value: "10.3000/nir" }],
					},
				},
			});
		},
	});

	const result = await provider.search({ query: "near infrared diagnosis", maxResults: 5 });

	expect(result.provider).toBe("pubmed");
	expect(result.candidates[0]).toMatchObject({
		provider: "pubmed",
		pmid: "123",
		doi: "10.3000/nir",
		title: "Near infrared diagnosis in PubMed",
		year: 2023,
	});
});

it("normalizes arXiv Atom feed results", async () => {
	const provider = createArxivProvider({
		fetch: async () =>
			new Response(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Near infrared imaging preprint</title>
    <summary>Preprint abstract.</summary>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Dana Author</name></author>
    <category term="cs.CV"/>
    <link href="http://arxiv.org/abs/2401.00001v1"/>
  </entry>
</feed>`, { status: 200 }),
	});

	const result = await provider.search({ query: "near infrared imaging", maxResults: 5 });

	expect(result.provider).toBe("arxiv");
	expect(result.candidates[0]).toMatchObject({
		provider: "arxiv",
		arxivId: "2401.00001v1",
		title: "Near infrared imaging preprint",
		authors: ["Dana Author"],
		year: 2024,
	});
});
```

Also add imports:

```ts
import { createArxivProvider } from "../src/literature/providers/arxiv.js";
import { createPubMedProvider } from "../src/literature/providers/pubmed.js";
```

- [ ] **Step 2: Run provider tests and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-providers.test.ts
```

Expected: FAIL because PubMed and arXiv providers do not exist.

- [ ] **Step 3: Implement PubMed provider**

Create `packages/lead-agent/src/literature/providers/pubmed.ts`:

```ts
import type { LiteratureSearchProvider } from "../types.js";
import { normalizeDoi } from "../normalize.js";

interface PubMedProviderOptions {
	fetch?: typeof fetch;
	apiKey?: string;
	tool?: string;
	email?: string;
}

function yearFromPubDate(value: string | undefined): number | undefined {
	const match = /^(\d{4})/.exec(value ?? "");
	return match ? Number(match[1]) : undefined;
}

export function createPubMedProvider(options: PubMedProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	const applyCommonParams = (url: URL): void => {
		url.searchParams.set("retmode", "json");
		if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
		if (options.tool) url.searchParams.set("tool", options.tool);
		if (options.email) url.searchParams.set("email", options.email);
	};
	return {
		id: "pubmed",
		async search(request) {
			const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
			searchUrl.searchParams.set("db", "pubmed");
			searchUrl.searchParams.set("term", request.query);
			searchUrl.searchParams.set("retmax", String(request.maxResults));
			if (request.fromYear || request.toYear) {
				searchUrl.searchParams.set("mindate", String(request.fromYear ?? ""));
				searchUrl.searchParams.set("maxdate", String(request.toYear ?? ""));
				searchUrl.searchParams.set("datetype", "pdat");
			}
			applyCommonParams(searchUrl);
			const searchResponse = await fetchImpl(searchUrl, { signal: request.signal });
			if (!searchResponse.ok) throw new Error(`PubMed ESearch failed: ${searchResponse.status}`);
			const searchBody = (await searchResponse.json()) as { esearchresult?: { idlist?: string[] } };
			const ids = searchBody.esearchresult?.idlist ?? [];
			if (ids.length === 0) {
				return { provider: "pubmed", warnings: [], candidates: [] };
			}
			const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
			summaryUrl.searchParams.set("db", "pubmed");
			summaryUrl.searchParams.set("id", ids.join(","));
			applyCommonParams(summaryUrl);
			const summaryResponse = await fetchImpl(summaryUrl, { signal: request.signal });
			if (!summaryResponse.ok) throw new Error(`PubMed ESummary failed: ${summaryResponse.status}`);
			const summaryBody = (await summaryResponse.json()) as {
				result?: Record<string, {
					uid?: string;
					title?: string;
					fulljournalname?: string;
					pubdate?: string;
					authors?: Array<{ name?: string }>;
					articleids?: Array<{ idtype?: string; value?: string }>;
				}>;
			};
			const retrievedAt = new Date().toISOString();
			return {
				provider: "pubmed",
				warnings: [],
				candidates: ids.flatMap((id) => {
					const record = summaryBody.result?.[id];
					if (!record) return [];
					const doi = record.articleids?.find((articleId) => articleId.idtype === "doi")?.value;
					return [{
						id: `pubmed-${id}`,
						provider: "pubmed",
						providerRecordId: id,
						title: record.title ?? "(untitled)",
						authors: (record.authors ?? []).map((author) => author.name ?? "").filter((name) => name.length > 0),
						year: yearFromPubDate(record.pubdate),
						venue: record.fulljournalname,
						doi: normalizeDoi(doi),
						pmid: record.uid ?? id,
						url: `https://pubmed.ncbi.nlm.nih.gov/${record.uid ?? id}/`,
						sourceQuery: request.query,
						retrievedAt,
					}];
				}),
			};
		},
	};
}
```

- [ ] **Step 4: Implement arXiv provider**

Create `packages/lead-agent/src/literature/providers/arxiv.ts`:

```ts
import type { LiteratureSearchProvider } from "../types.js";
import { normalizeDoi } from "../normalize.js";

interface ArxivProviderOptions {
	fetch?: typeof fetch;
}

function decodeXml(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&apos;/g, "'");
}

function firstTagText(xml: string, tag: string): string | undefined {
	const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
	const value = pattern.exec(xml)?.[1]?.trim();
	return value && value.length > 0 ? value.replace(/\s+/g, " ") : undefined;
}

function tagTexts(xml: string, tag: string): string[] {
	const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
	return [...xml.matchAll(pattern)]
		.map((match) => decodeXml(match[1]?.trim().replace(/\s+/g, " ") ?? ""))
		.filter((value) => value.length > 0);
}

function arxivIdFromUrl(value: string | undefined): string | undefined {
	return value?.split("/abs/")[1];
}

export function createArxivProvider(options: ArxivProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "arxiv",
		async search(request) {
			const url = new URL("https://export.arxiv.org/api/query");
			url.searchParams.set("search_query", `all:${request.query}`);
			url.searchParams.set("start", "0");
			url.searchParams.set("max_results", String(request.maxResults));
			url.searchParams.set("sortBy", "relevance");
			const response = await fetchImpl(url, { signal: request.signal });
			if (!response.ok) throw new Error(`arXiv request failed: ${response.status}`);
			const xml = await response.text();
			const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1] ?? "");
			const retrievedAt = new Date().toISOString();
			return {
				provider: "arxiv",
				warnings: [],
				candidates: entries.map((entry, index) => {
					const idUrl = decodeXml(firstTagText(entry, "id") ?? "");
					const arxivId = arxivIdFromUrl(idUrl);
					const published = firstTagText(entry, "published");
					const doi = firstTagText(entry, "arxiv:doi") ?? firstTagText(entry, "doi");
					return {
						id: `arxiv-${arxivId ?? index}`,
						provider: "arxiv",
						providerRecordId: arxivId ?? `index-${index}`,
						title: decodeXml(firstTagText(entry, "title") ?? "(untitled)"),
						authors: tagTexts(entry, "name"),
						year: published ? Number(published.slice(0, 4)) : undefined,
						arxivId,
						doi: normalizeDoi(doi),
						url: idUrl,
						abstract: decodeXml(firstTagText(entry, "summary") ?? ""),
						sourceQuery: request.query,
						retrievedAt,
					};
				}),
			};
		},
	};
}
```

- [ ] **Step 5: Run provider tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/literature-providers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add packages/lead-agent/src/literature/providers/pubmed.ts packages/lead-agent/src/literature/providers/arxiv.ts packages/lead-agent/test/literature-providers.test.ts
git commit -m "feat(lead-agent): add biomedical and preprint literature providers"
```

---

## Task 7: Add Profile Worker Runner

**Files:**
- Create: `packages/lead-agent/src/workers/profile-worker-runner.ts`
- Modify: `packages/lead-agent/src/index.ts`
- Create: `packages/lead-agent/test/profile-worker-runner.test.ts`

- [ ] **Step 1: Write failing runner test**

Create `packages/lead-agent/test/profile-worker-runner.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import { afterEach, describe, expect, it } from "vitest";
import { createProfileWorkerRunner, extractLiteratureSearchToolOutputs } from "../src/workers/profile-worker-runner.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-profile-worker-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("profile worker runner", () => {
	it("rejects unknown profile tools before execution", async () => {
		const runner = createProfileWorkerRunner({
			cwd: makeTempDir(),
			store: new FileSystemArtifactStore(makeTempDir()),
			toolDefinitions: [],
		});
		const request: WorkerRequest = {
			taskId: "task-runner",
			workerType: "literature-searcher",
			objective: "Find NIR papers.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["literature-search-results"],
			acceptanceCriteria: [],
			profile: {
				id: "literature-searcher",
				name: "Literature Searcher",
				capabilities: ["literature-search"],
				allowedTools: ["literature.search"],
			},
		};

		const result = await runner(request);

		expect(result.status).toBe("failed");
		expect(result.failureReason).toContain("Unknown allowed tool");
	});

	it("extracts literature tool outputs from tool result messages", () => {
		const output = {
			retrievalRunId: "run-1",
			providers: [],
			artifactRefs: [{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" }],
			candidatesPreview: [],
			warnings: ["partial"],
		};

		expect(
			extractLiteratureSearchToolOutputs([
				{
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "literature.search",
					content: [],
					details: output,
					isError: false,
					timestamp: Date.now(),
				},
			]),
		).toEqual([output]);
	});
});
```

- [ ] **Step 2: Run runner test and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
```

Expected: FAIL because the runner module does not exist.

- [ ] **Step 3: Implement runner extraction and validation**

Create `packages/lead-agent/src/workers/profile-worker-runner.ts`:

```ts
import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createAgentHostSession } from "@mariozechner/pi-agent-host";
import type { ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";
import type { LiteratureSearchToolOutput } from "../literature/types.js";

export interface CreateProfileWorkerRunnerOptions {
	cwd: string;
	store: ArtifactStore;
	toolDefinitions: readonly ToolDefinition[];
}

function failedResult(request: WorkerRequest, reason: string): WorkerResult {
	return {
		taskId: request.taskId,
		status: "failed",
		summary: "Profile worker failed before producing an accepted result.",
		producedArtifacts: [],
		warnings: [reason],
		openQuestions: [],
		executionTrace: createExecutionTrace(`profile-worker-${request.taskId}`),
		failureReason: reason,
	};
}

export function extractLiteratureSearchToolOutputs(messages: readonly unknown[]): LiteratureSearchToolOutput[] {
	return messages.flatMap((message) => {
		const toolResult = message as Partial<ToolResultMessage>;
		if (toolResult.role !== "toolResult" || toolResult.toolName !== "literature.search" || toolResult.isError) {
			return [];
		}
		const details = toolResult.details as Partial<LiteratureSearchToolOutput> | undefined;
		if (!details || typeof details.retrievalRunId !== "string" || !Array.isArray(details.artifactRefs)) {
			return [];
		}
		return [details as LiteratureSearchToolOutput];
	});
}

function validateAllowedTools(request: WorkerRequest, toolDefinitions: readonly ToolDefinition[]): string | undefined {
	const available = new Set(toolDefinitions.map((tool) => tool.name));
	for (const name of request.profile?.allowedTools ?? []) {
		if (!available.has(name)) {
			return `Unknown allowed tool: ${name}`;
		}
	}
	return undefined;
}

function buildPrompt(request: WorkerRequest): string {
	return [
		request.profile?.rolePrompt ?? request.objective,
		"",
		`Objective: ${request.objective}`,
		`Expected outputs: ${request.expectedOutputs.join(", ") || "(none)"}`,
		`Acceptance criteria: ${request.acceptanceCriteria.join(", ") || "(none)"}`,
		"Return a concise final summary after using any required tools.",
	].join("\n");
}

export function createProfileWorkerRunner(options: CreateProfileWorkerRunnerOptions): LeadAgentWorkerRunner {
	return async (request) => {
		const validationError = validateAllowedTools(request, options.toolDefinitions);
		if (validationError) {
			return failedResult(request, validationError);
		}
		const allowedTools = request.profile?.allowedTools ?? [];
		const { session } = await createAgentHostSession({
			cwd: options.cwd,
			customTools: [...options.toolDefinitions],
			tools: allowedTools.length > 0 ? allowedTools : undefined,
			noTools: allowedTools.length > 0 ? undefined : "all",
			resourceLoaderOptions: {
				systemPromptOverride: () => request.profile?.rolePrompt ?? "You are an academic profile worker.",
			},
		});
		await session.prompt(buildPrompt(request));
		const toolOutputs = extractLiteratureSearchToolOutputs(session.messages);
		const producedArtifacts = toolOutputs.flatMap((output) => output.artifactRefs);
		const warnings = toolOutputs.flatMap((output) => output.warnings);
		const latestSummary = session.messages
			.filter((message) => message.role === "assistant")
			.flatMap((message) => (Array.isArray(message.content) ? message.content : []))
			.filter((part): part is { type: "text"; text: string } => typeof part === "object" && part !== null && "type" in part && part.type === "text")
			.map((part) => part.text)
			.at(-1);
		return {
			taskId: request.taskId,
			status: producedArtifacts.length > 0 ? "success" : "failed",
			summary: latestSummary ?? "Profile worker completed.",
			structuredOutputs: {
				literatureSearchRuns: toolOutputs.map((output) => output.retrievalRunId),
			},
			producedArtifacts,
			artifactBriefs: toolOutputs.flatMap((output) =>
				output.artifactRefs.map((artifact) => ({
					artifactId: artifact.id,
					kind: artifact.kind,
					title: artifact.title,
					brief: `Literature search run ${output.retrievalRunId} produced ${output.candidatesPreview.length} preview candidates.`,
					keyFindings: output.candidatesPreview.map((candidate) => candidate.title).slice(0, 5),
					limitations: output.warnings,
				})),
			),
			warnings,
			openQuestions: producedArtifacts.length > 0 ? [] : [{ question: "No literature search artifact was produced." }],
			executionTrace: createExecutionTrace(`profile-worker-${request.taskId}`),
			failureReason: producedArtifacts.length > 0 ? undefined : "Profile worker did not produce a literature artifact.",
		};
	};
}
```

- [ ] **Step 4: Run runner test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

Run:

```bash
git add packages/lead-agent/src/workers/profile-worker-runner.ts packages/lead-agent/test/profile-worker-runner.test.ts
git commit -m "feat(lead-agent): add tool-aware profile worker runner"
```

---

## Task 8: Wire Retrieval Tools Into Lead Runtime

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/src/orchestration/executor.ts`
- Modify: `packages/lead-agent/src/orchestration/acceptance.ts`
- Modify: `packages/lead-agent/test/orchestration-acceptance.test.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add acceptance regression**

In `packages/lead-agent/test/orchestration-acceptance.test.ts`, add:

```ts
it("rejects provider-backed literature search without artifact refs", () => {
	const request = {
		...baseRequest,
		workerType: "literature-searcher",
		expectedOutputs: ["literature-search-results"],
	};

	const report = createLeadAcceptanceReport(
		request,
		result({
			status: "success",
			summary: "Provider-backed search completed.",
			structuredOutputs: {
				literatureSearchRuns: ["run-1"],
			},
			producedArtifacts: [],
			artifactBriefs: [],
		}),
	);

	expect(report.accepted).toBe(false);
	expect(report.issues.some((issue) => issue.code === "expected_output_missing")).toBe(true);
});
```

- [ ] **Step 2: Run acceptance test and verify failure if current acceptance is too permissive**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-acceptance.test.ts
```

Expected: FAIL if acceptance relies on summary text alone for provider-backed search.

- [ ] **Step 3: Tighten acceptance for literature-search-results**

In `packages/lead-agent/src/orchestration/acceptance.ts`, add a helper:

```ts
function requiresArtifactRef(expectedOutput: string): boolean {
	const normalized = normalizeOutputLabel(expectedOutput);
	return normalized === "literaturesearchresults" || normalized === "bibliographycandidates";
}
```

In the expected output loop, before accepting a text match, enforce:

```ts
if (requiresArtifactRef(expectedOutput) && !matchesArtifact) {
	issues.push({
		code: "expected_output_missing",
		message: `Worker result did not satisfy expected output: ${expectedOutput}`,
		severity: "error",
	});
	continue;
}
```

Keep existing semantic matching for non-retrieval outputs.

- [ ] **Step 4: Add runtime wiring test**

In `packages/lead-agent/test/lead-agent.test.ts`, add a test that constructs runtime with a custom `workerRunner` first. This verifies existing external runners still override default wiring:

```ts
it("keeps explicit worker runner override for literature tasks", async () => {
	let called = false;
	const runtime = createLeadAgentRuntime({
		workerRunner: async (request) => {
			called = true;
			return {
				taskId: request.taskId,
				status: "success",
				summary: "custom runner",
				producedArtifacts: [
					{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" },
				],
				artifactBriefs: [
					{
						artifactId: "artifact-1",
						kind: "literature-search-results",
						brief: "custom runner artifact",
					},
				],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("custom-runner"),
			};
		},
	});

	const result = await runtime.run({
		taskId: "task-custom-runner",
		objective: "帮我寻找一些关于NIR的文献",
		expectedOutputs: ["literature-search-results"],
	});

	expect(called).toBe(true);
	expect(result.acceptanceReport?.accepted).toBe(true);
});
```

- [ ] **Step 5: Wire default profile runner only when no workerRunner is passed**

In `packages/lead-agent/src/index.ts`, extend runtime options with:

```ts
literatureSearch?: LiteratureSearchConfig;
```

Add imports for:

```ts
import { createLiteratureSearchTool } from "./literature/tools.js";
import { createCrossrefProvider } from "./literature/providers/crossref.js";
import { createSemanticScholarProvider } from "./literature/providers/semantic-scholar.js";
import { createPubMedProvider } from "./literature/providers/pubmed.js";
import { createArxivProvider } from "./literature/providers/arxiv.js";
import { createProfileWorkerRunner } from "./workers/profile-worker-runner.js";
```

When creating the runtime, if `options.workerRunner` is undefined, construct:

```ts
const literatureTool = createLiteratureSearchTool({
	store: workspace.store,
	providers: [
		createCrossrefProvider({ mailto: options.literatureSearch?.contactEmail ?? process.env.CROSSREF_MAILTO ?? process.env.PI_LITERATURE_CONTACT_EMAIL }),
		createSemanticScholarProvider({ apiKey: options.literatureSearch?.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY }),
		createPubMedProvider({
			apiKey: options.literatureSearch?.ncbiApiKey ?? process.env.NCBI_API_KEY,
			tool: options.literatureSearch?.ncbiTool ?? process.env.NCBI_TOOL,
			email: options.literatureSearch?.ncbiEmail ?? process.env.NCBI_EMAIL ?? process.env.PI_LITERATURE_CONTACT_EMAIL,
		}),
		createArxivProvider(),
	],
});
const workerRunner = options.workerRunner ?? createProfileWorkerRunner({
	cwd,
	store: workspace.store,
	toolDefinitions: [literatureTool],
});
```

Use this `workerRunner` in workflow execution.

- [ ] **Step 6: Run runtime and acceptance tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/orchestration-acceptance.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 8**

Run:

```bash
git add packages/lead-agent/src/index.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/src/orchestration/acceptance.ts packages/lead-agent/test/orchestration-acceptance.test.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): wire literature retrieval into workflows"
```

---

## Task 9: Smoke Coverage and Optional Live Check

**Files:**
- Modify: `packages/lead-agent/src/academic-smoke.ts`
- Modify: `packages/lead-agent/test/academic-smoke.test.ts`
- Modify: `academic-smoke-test.sh` if it already supports flags in this repo

- [ ] **Step 1: Add deterministic smoke assertion**

In `packages/lead-agent/test/academic-smoke.test.ts`, extend the existing literature search smoke assertions with:

```ts
const literatureCase = report.cases.find((entry) => entry.name === "literature-search");
expect(literatureCase?.result.artifactBriefs?.some((brief) => brief.kind === "literature-search-results")).toBe(true);
expect(literatureCase?.result.workerResult?.producedArtifacts.some((artifact) => artifact.kind === "literature-search-results")).toBe(true);
```

- [ ] **Step 2: Run smoke test and verify current deterministic path**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: PASS if current deterministic worker already produces the artifact; otherwise FAIL and proceed.

- [ ] **Step 3: Add optional live smoke flag**

In `packages/lead-agent/src/academic-smoke.ts`, add an option:

```ts
liveLiteratureSearch?: boolean;
```

When false, keep the deterministic worker runner. When true, use the default runtime worker runner so `literature.search` may call real providers. The live path should record provider/network failures as case failures with diagnostic messages, but deterministic smoke remains the required gate.

- [ ] **Step 4: Run deterministic smoke**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run root smoke**

Run:

```bash
./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke-literature-tools --json
```

Expected: `passed: true`.

Remove the generated smoke directory:

```bash
rm -rf .tmp/academic-smoke-literature-tools
```

- [ ] **Step 6: Commit Task 9**

Run:

```bash
git add packages/lead-agent/src/academic-smoke.ts packages/lead-agent/test/academic-smoke.test.ts academic-smoke-test.sh
git commit -m "test(lead-agent): add retrieval tool smoke coverage"
```

Use this command instead when `academic-smoke-test.sh` has no diff:

```bash
git add packages/lead-agent/src/academic-smoke.ts packages/lead-agent/test/academic-smoke.test.ts
git commit -m "test(lead-agent): add retrieval tool smoke coverage"
```

---

## Task 10: Full Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: PASS.

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/literature-normalize.test.ts test/literature-providers.test.ts test/literature-tool.test.ts test/profile-worker-runner.test.ts test/orchestration-acceptance.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no warnings or infos.

- [ ] **Step 3: Run deterministic smoke**

Run:

```bash
./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke-literature-tools --json
```

Expected: JSON output contains `"passed": true` and the literature case includes a `literature-search-results` artifact.

Cleanup:

```bash
rm -rf .tmp/academic-smoke-literature-tools
```

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing files remain, or a clean tree if no other agent/user changes exist.

- [ ] **Step 5: Stop at verified state**

Do not create a catch-all final commit. All source changes should already be committed at
the task boundaries above. When `npm run check` formats a file, return to the task that
introduced that file, run its focused test again, and amend that task's commit by staging
only the formatted file from that task.
