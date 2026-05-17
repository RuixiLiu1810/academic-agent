# Literature Searcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-ready `literature-searcher` workflow role while first shipping only offline structured literature-search planning.

**Architecture:** `lead-agent` owns the new academic orchestration semantics. `literature-searcher` becomes a Markdown-backed profile and workflow-template option; `researcher` remains responsible for evidence synthesis. `artifact-core` gets stable academic artifact kind constants for search outputs, but no real search provider is wired in this phase.

**Tech Stack:** TypeScript, npm workspaces, Vitest focused tests, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, `packages/lead-agent` orchestration/profile system.

---

## File Structure

- Modify `packages/artifact-core/src/index.ts`
  - Add academic artifact kind constants: `literatureSearchResults`, `bibliographyCandidates`, `searchStrategy`.
- Create `packages/lead-agent/profiles/literature-searcher.md`
  - Defines the offline structured search role, capabilities, output requirements, and acceptance checklist.
- Modify `packages/lead-agent/src/orchestration/templates.ts`
  - Add `literature-search` and `literature-to-evidence` templates.
- Modify `packages/lead-agent/src/index.ts`
  - Add default in-memory fallback profile for `literature-searcher`.
  - Keep `AcademicTaskType` unchanged in phase 1; the LLM planner and templates own automatic literature-search workflow choice.
- Modify `packages/lead-agent/src/academic-smoke.ts`
  - Add a deterministic smoke case for literature search.
  - Make deterministic worker output use search artifact kinds for `literature-searcher`.
- Modify `packages/lead-agent/test/lead-agent.test.ts`
  - Update profile-loading expectations.
  - Add runtime tests for searcher-only and searcher-to-researcher flows.
- Modify `packages/lead-agent/test/academic-smoke.test.ts`
  - Update expected cases and artifact kinds.
- Modify `packages/lead-agent/test/orchestration-acceptance.test.ts`
  - Add a searcher-specific acceptance regression for search outputs.

Existing dirty files before execution must be protected. At the time this plan was written, these files had unrelated uncommitted changes and should not be reverted or accidentally staged unless the implementation intentionally builds on them:

- `packages/coding-agent/src/core/orchestration/coding-worker.ts`
- `packages/coding-agent/test/suite/orchestration/coding-worker.test.ts`
- `packages/lead-agent/src/orchestration/acceptance.ts`
- `packages/lead-agent/test/lead-agent.test.ts`
- `packages/lead-agent/test/orchestration-acceptance.test.ts`
- `docs/superpowers/specs/2026-05-15-llm-workflow-planner-design.md`

## Task 1: Add Search Artifact Kinds And Profile

**Files:**
- Modify: `packages/artifact-core/src/index.ts`
- Create: `packages/lead-agent/profiles/literature-searcher.md`
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Write the failing profile-loading test**

Modify the first test in `packages/lead-agent/test/lead-agent.test.ts` so profile loading expects `literature-searcher`.

```ts
expect(profiles.map((profile) => profile.id)).toEqual([
	"citation-checker",
	"literature-searcher",
	"method-auditor",
	"researcher",
	"reviewer",
	"reviser",
	"writer",
]);

const searcher = profiles.find((profile) => profile.id === "literature-searcher");
expect(searcher?.rolePrompt).toContain("literature search planner");
expect(searcher?.expectedOutputs).toContain("search strategy");
expect(searcher?.expectedOutputs).toContain("bibliography candidates");
expect(searcher?.acceptanceChecklist).toContain("Candidate bibliography is separated from verified evidence");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because `literature-searcher.md` does not exist and default profiles do not include it.

- [ ] **Step 3: Add academic artifact kind constants**

Modify `packages/artifact-core/src/index.ts`:

```ts
export const ACADEMIC_ARTIFACT_KINDS = {
	evidenceTable: "evidence-table",
	outline: "outline",
	claimAudit: "claim-audit",
	reviewCommentMap: "review-comment-map",
	revisionPlan: "revision-plan",
	responseLetterDraft: "response-letter-draft",
	literatureSearchResults: "literature-search-results",
	bibliographyCandidates: "bibliography-candidates",
	searchStrategy: "search-strategy",
} as const;
```

- [ ] **Step 4: Add the Markdown profile**

Create `packages/lead-agent/profiles/literature-searcher.md`:

```markdown
# Literature Searcher

Plan and triage academic literature searches. Produce structured search strategy, query terms, candidate bibliography hints, and retrieval gaps without claiming that offline candidates are verified database results.

## Role Prompt

Act as an academic literature search planner and retrieval triage worker. Convert broad research requests into precise search questions, synonyms, database recommendations, query strings, inclusion and exclusion criteria, candidate bibliography hints, and retrieval gaps. Clearly label offline or model-derived candidates as candidates, not verified retrieval results.

## Capabilities

- literature-search
- search-strategy
- query-planning
- bibliography-triage
- screening-plan
- retrieval-gap-analysis

## Input Requirements

- Research topic, acronym, claim, or research question
- Domain constraints when available
- Preferred databases, date range, language, or evidence type when available

## Output Requirements

- search strategy
- query plan
- bibliography candidates
- screening notes
- retrieval gaps

## Acceptance Checklist

- Search scope and key concepts are explicit
- Query terms include synonyms and field variants
- Candidate bibliography is separated from verified evidence
- Retrieval gaps and database limitations are explicit
```

- [ ] **Step 5: Add the default fallback profile**

Modify `DEFAULT_ACADEMIC_PROFILES` in `packages/lead-agent/src/index.ts` by inserting the profile after `researcher` or before it. Use this exact object:

```ts
{
	id: "literature-searcher",
	name: "Literature Searcher",
	description: "Plans and triages academic literature searches before evidence synthesis.",
	capabilities: [
		"literature-search",
		"search-strategy",
		"query-planning",
		"bibliography-triage",
		"screening-plan",
		"retrieval-gap-analysis",
	],
	expectedOutputs: ["search strategy", "query plan", "bibliography candidates", "screening notes", "retrieval gaps"],
	acceptanceChecklist: [
		"Search scope and key concepts are explicit",
		"Candidate bibliography is separated from verified evidence",
		"Retrieval gaps and database limitations are explicit",
	],
},
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS for the updated profile-loading test and no regressions in the file.

- [ ] **Step 7: Commit Task 1**

Stage only these paths:

```bash
git add packages/artifact-core/src/index.ts
git add packages/lead-agent/profiles/literature-searcher.md
git add packages/lead-agent/src/index.ts
git add packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): add literature searcher profile"
```

Do not stage unrelated dirty files unless this task intentionally modified them.

## Task 2: Add Search Workflow Templates

**Files:**
- Modify: `packages/lead-agent/src/orchestration/templates.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Write failing template-guidance tests**

Add this import to `packages/lead-agent/test/lead-agent.test.ts`:

```ts
import { summarizeWorkflowTemplatesForPlanner, WORKFLOW_TEMPLATES } from "../src/orchestration/index.js";
```

Append this template test to `packages/lead-agent/test/lead-agent.test.ts`:

```ts
it("exposes literature search templates to the workflow planner", () => {
	const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
	const literatureSearch = summaries.find((template) => template.id === "literature-search");
	const literatureToEvidence = summaries.find((template) => template.id === "literature-to-evidence");

	expect(literatureSearch).toMatchObject({
		id: "literature-search",
		steps: [{ profileId: "literature-searcher" }],
	});
	expect(literatureToEvidence).toMatchObject({
		id: "literature-to-evidence",
		steps: [{ profileId: "literature-searcher" }, { profileId: "researcher" }],
	});
});
```

Append two runtime tests to the same file.

First runtime test: search-only output should accept searcher-specific deliverables without `evidence-table`.

First test: search-only output should accept searcher-specific deliverables without `evidence-table`.

```ts
it("accepts literature-searcher outputs without requiring evidence synthesis", async () => {
	const runtime = createLeadAgentRuntime({
		cwd: makeTempDir(),
		workflowPlanner: {
			async plan(input) {
				return {
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "The request asks for literature discovery, not evidence synthesis.",
					userVisibleSummary: "I will run a literature searcher pass and return candidate search outputs.",
					mode: "workflow",
					steps: [
						{
							id: "literature-search",
							order: 1,
							profileId: "literature-searcher",
							objective: `User objective: ${input.objective}\n\nStep objective: Build an offline structured search strategy and candidate bibliography hints.`,
							inputArtifactRefs: input.inputArtifacts,
							expectedArtifactKinds: ["literature-search-results"],
							expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
							acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
						},
					],
					stopConditions: ["Literature search plan accepted"],
				};
			},
		},
		workerRunner: async (request) => ({
			taskId: request.taskId,
			status: "success",
			summary: "Offline structured literature search plan completed for NIR.",
			structuredOutputs: {
				"search strategy": {
					retrievalMode: "offline-structured",
					providerAvailable: false,
				},
				"bibliography candidates": ["near-infrared spectroscopy review candidates"],
				"retrieval gaps": ["NIR application domain is broad"],
			},
			producedArtifacts: [],
			artifactBriefs: [
				{
					artifactId: "nir-literature-search",
					kind: "literature-search-results",
					title: "NIR literature search plan",
					brief: "Offline structured search plan and candidate bibliography hints.",
					limitations: ["Not verified database retrieval results"],
				},
			],
			warnings: ["Offline structured mode; verify candidates with a database search before citation use."],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-literature-searcher"),
		}),
	});

	const result = await runtime.run({
		taskId: "task-literature-searcher",
		objective: "帮我寻找一些关于NIR的文献",
		expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
	});

	expect(result.decision).toMatchObject({
		mode: "worker",
		profileId: "literature-searcher",
		workerType: "literature-searcher",
	});
	expect(result.acceptanceReport?.accepted).toBe(true);
	expect(result.acceptanceReport?.issues.some((issue) => issue.code === "expected_output_missing")).toBe(false);
	expect(result.finalOutput).toContain("Offline structured literature search plan completed");
});
```

Second test: search-to-research workflow should pass searcher artifact briefs into the next step.

```ts
it("carries literature-searcher artifact briefs into researcher synthesis", async () => {
	const seenRequests: string[] = [];
	const runtime = createLeadAgentRuntime({
		cwd: makeTempDir(),
		workflowPlanner: {
			async plan(input) {
				return {
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "The request needs search planning before evidence synthesis.",
					userVisibleSummary: "I will search first, then synthesize evidence from the accepted search outputs.",
					mode: "workflow",
					steps: [
						{
							id: "literature-search",
							order: 1,
							profileId: "literature-searcher",
							objective: `User objective: ${input.objective}\n\nStep objective: Build search strategy and bibliography candidates.`,
							inputArtifactRefs: [],
							expectedArtifactKinds: ["literature-search-results"],
							expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
							acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
						},
						{
							id: "evidence-summary",
							order: 2,
							profileId: "researcher",
							objective: `User objective: ${input.objective}\n\nStep objective: Synthesize accepted search outputs into evidence notes.`,
							inputArtifactRefs: [],
							expectedArtifactKinds: ["evidence-table"],
							expectedOutputs: ["evidence summary", "evidence-table", "uncertainty notes"],
							acceptanceCriteria: ["Uncertainty is explicit"],
						},
					],
					stopConditions: ["Evidence synthesis accepted"],
				};
			},
		},
		workerRunner: async (request) => {
			seenRequests.push(`${request.workerType}:${request.inputArtifacts.map((artifact) => artifact.kind).join(",")}`);
			if (request.workerType === "literature-searcher") {
				return {
					taskId: request.taskId,
					status: "success",
					summary: "search strategy, bibliography candidates, and retrieval gaps completed",
					structuredOutputs: {
						"search strategy": "offline structured",
						"bibliography candidates": ["NIR spectroscopy review"],
						"retrieval gaps": ["Specify application domain"],
					},
					producedArtifacts: [
						{
							id: "search-artifact-1",
							kind: "literature-search-results",
							uri: "memory://search-artifact-1",
							title: "NIR search results",
						},
					],
					artifactBriefs: [
						{
							artifactId: "search-artifact-1",
							kind: "literature-search-results",
							title: "NIR search results",
							brief: "Search strategy and candidate bibliography hints.",
						},
					],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("run-searcher"),
				};
			}
			return {
				taskId: request.taskId,
				status: "success",
				summary: "evidence summary, evidence-table, and uncertainty notes completed",
				structuredOutputs: {
					"evidence summary": "NIR literature spans spectroscopy and imaging.",
					"evidence-table": [{ topic: "NIR spectroscopy" }],
					"uncertainty notes": ["Search candidates require database verification."],
				},
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-researcher"),
			};
		},
	});

	const result = await runtime.run({
		taskId: "task-literature-to-evidence",
		objective: "寻找NIR相关文献并整理证据表",
	});

	expect(result.acceptanceReport?.accepted).toBe(true);
	expect(result.workflowPlan?.steps.map((step) => step.profileId)).toEqual(["literature-searcher", "researcher"]);
	expect(seenRequests).toEqual(["literature-searcher:", "researcher:literature-search-results"]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because `literature-search` and `literature-to-evidence` templates do not exist.

- [ ] **Step 3: Add workflow templates**

Modify `WORKFLOW_TEMPLATES` in `packages/lead-agent/src/orchestration/templates.ts` by adding these entries after `direct-writing`:

```ts
{
	id: "literature-search",
	title: "Literature Search",
	description: "Plan and triage literature discovery before source-backed evidence synthesis.",
	steps: [
		{
			id: "literature-search",
			profileId: "literature-searcher",
			objective: "Build an offline structured search strategy, query plan, candidate bibliography hints, and retrieval gaps.",
			expectedArtifactKinds: ["literature-search-results"],
			expectedOutputs: ["search strategy", "query plan", "bibliography candidates", "retrieval gaps"],
			acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
		},
	],
},
{
	id: "literature-to-evidence",
	title: "Literature To Evidence",
	description: "Search first, then synthesize accepted search outputs into evidence notes.",
	steps: [
		{
			id: "literature-search",
			profileId: "literature-searcher",
			objective: "Build an offline structured search strategy, query plan, candidate bibliography hints, and retrieval gaps.",
			expectedArtifactKinds: ["literature-search-results"],
			expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
			acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
		},
		{
			id: "evidence-summary",
			profileId: "researcher",
			objective: "Synthesize accepted search outputs into evidence summary, evidence table, and uncertainty notes.",
			expectedArtifactKinds: ["evidence-table"],
			expectedOutputs: ["evidence summary", "evidence-table", "uncertainty notes"],
			acceptanceCriteria: ["Uncertainty is explicit"],
		},
	],
},
```

- [ ] **Step 4: Ensure fallback keyword planning can still pick searcher**

Modify the literature branch in `chooseWorkerProfile()` so explicit worker dispatch and non-LLM fallback planning choose searcher for discovery tasks:

```ts
if (includesAny(objective, ["literature", "文献", "检索", "search papers", "find papers", "寻找"])) {
	return profiles.find((profile) => profile.id === "literature-searcher");
}
if (includesAny(objective, ["evidence", "research", "证据"])) {
	return profiles.find((profile) => profile.id === "researcher");
}
```

Keep citation and method branches above this branch.

- [ ] **Step 5: Run focused lead-agent tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Stage only intended files:

```bash
git add packages/lead-agent/src/orchestration/templates.ts
git add packages/lead-agent/src/index.ts
git add packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): add literature search workflows"
```

## Task 3: Add Literature Search Smoke Coverage

**Files:**
- Modify: `packages/lead-agent/src/academic-smoke.ts`
- Modify: `packages/lead-agent/test/academic-smoke.test.ts`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/nir_literature_prompt.md`

- [ ] **Step 1: Write the failing smoke expectations**

Modify `packages/lead-agent/test/academic-smoke.test.ts`:

```ts
expect(DEFAULT_ACADEMIC_SMOKE_CASES.map((testCase) => testCase.id)).toEqual([
	"direct-writing",
	"literature-search",
	"citation-check",
	"method-audit",
	"review-memo",
	"mini-paperorchestra-inputs",
]);

expect(DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "literature-search")).toMatchObject({
	expectedProfileId: "literature-searcher",
	expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
	artifactKinds: ["literature-search-results"],
});
```

Update result length and artifact expectations:

```ts
expect(result.results).toHaveLength(6);
expect(result.results.map((caseResult) => [caseResult.caseId, caseResult.result.decision.mode])).toEqual([
	["direct-writing", "direct"],
	["literature-search", "worker"],
	["citation-check", "worker"],
	["method-audit", "worker"],
	["review-memo", "worker"],
	["mini-paperorchestra-inputs", "worker"],
]);
expect(result.artifactRefs.map((artifact) => artifact.kind)).toEqual([
	"literature-search-results",
	"claim-audit",
	"revision-plan",
	"review-comment-map",
	"evidence-table",
	"outline",
]);
```

Update manifest length:

```ts
expect(result.artifactRefs).toHaveLength(6);
```

- [ ] **Step 2: Run smoke test and verify it fails**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: FAIL because the smoke case and artifact are not implemented.

- [ ] **Step 3: Add the NIR fixture**

Create `packages/lead-agent/test/fixtures/academic-smoke/nir_literature_prompt.md`:

```markdown
# NIR Literature Search Prompt

The user asks for literature about NIR. The request is intentionally broad and should be treated as a literature discovery task first.

Known ambiguity:

- NIR can refer to near-infrared spectroscopy, near-infrared imaging, or near-infrared device development.
- The searcher should surface this as a retrieval gap or non-blocking open question.
```

- [ ] **Step 4: Add the smoke case**

Modify `DEFAULT_ACADEMIC_SMOKE_CASES` in `packages/lead-agent/src/academic-smoke.ts` by inserting this case after `direct-writing`:

```ts
{
	id: "literature-search",
	objective: "Find literature about NIR and return a structured literature search plan with candidate bibliography hints.",
	fixtureFiles: ["nir_literature_prompt.md"],
	expectedProfileId: "literature-searcher",
	expectedStepProfileIds: ["literature-searcher"],
	expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
	artifactKinds: [ACADEMIC_ARTIFACT_KINDS.literatureSearchResults],
},
```

- [ ] **Step 5: Update deterministic worker artifact selection**

Modify `deterministicWorkerRunner()` in `packages/lead-agent/src/academic-smoke.ts` so `literature-searcher` maps to `literatureSearchResults` before other fallbacks:

```ts
kind:
	request.workerType === "literature-searcher"
		? ACADEMIC_ARTIFACT_KINDS.literatureSearchResults
		: request.workerType === "citation-checker"
			? ACADEMIC_ARTIFACT_KINDS.claimAudit
			: request.workerType === "method-auditor"
				? ACADEMIC_ARTIFACT_KINDS.revisionPlan
				: request.workerType === "reviewer"
					? ACADEMIC_ARTIFACT_KINDS.reviewCommentMap
					: request.workerType === "reviser"
						? ACADEMIC_ARTIFACT_KINDS.revisionPlan
						: request.workerType === "writer"
							? ACADEMIC_ARTIFACT_KINDS.outline
							: ACADEMIC_ARTIFACT_KINDS.evidenceTable,
```

- [ ] **Step 6: Update the smoke planner**

Modify `createAcademicSmokePlanner()` so the new case uses `literature-searcher`:

```ts
if (input.taskId === "literature-search") {
	return {
		taskId: input.taskId,
		sessionId: input.sessionId,
		objective: input.objective,
		rationale: "The smoke case asks for literature discovery before evidence synthesis.",
		userVisibleSummary: "I will run a literature searcher pass and return accepted search outputs.",
		mode: "workflow",
		steps: [
			{
				id: "literature-search",
				order: 1,
				profileId: "literature-searcher",
				objective: `User objective: ${input.objective}\n\nStep objective: Build an offline structured search strategy and candidate bibliography hints.`,
				inputArtifactRefs: input.inputArtifacts,
				expectedArtifactKinds: [ACADEMIC_ARTIFACT_KINDS.literatureSearchResults],
				expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
				acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
			},
		],
		stopConditions: ["Literature search plan accepted"],
	};
}
```

Keep the existing `mini-paperorchestra-inputs` workflow intact.

- [ ] **Step 7: Run smoke test**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Stage only intended files:

```bash
git add packages/lead-agent/src/academic-smoke.ts
git add packages/lead-agent/test/academic-smoke.test.ts
git add packages/lead-agent/test/fixtures/academic-smoke/nir_literature_prompt.md
git commit -m "test(lead-agent): add literature search smoke coverage"
```

## Task 4: Provider-Ready Output Semantics Without Provider Execution

**Files:**
- Modify: `packages/coding-agent/src/core/orchestration/coding-worker.ts`
- Modify: `packages/coding-agent/test/suite/orchestration/coding-worker.test.ts`
- Modify: `packages/lead-agent/test/orchestration-acceptance.test.ts`

- [ ] **Step 1: Write or extend coding-worker prompt test**

In `packages/coding-agent/test/suite/orchestration/coding-worker.test.ts`, extend the prompt assertion test to include literature-searcher semantics:

```ts
const literaturePrompt = buildCodingWorkerPrompt({
	taskId: "task-literature",
	workerType: "literature-searcher",
	objective: "Find literature about NIR.",
	constraints: [],
	inputArtifacts: [],
	expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
	acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
	profile: {
		id: "literature-searcher",
		name: "Literature Searcher",
		rolePrompt: "Act as an academic literature search planner.",
		capabilities: ["literature-search"],
	},
});

expect(literaturePrompt).toContain("retrievalMode");
expect(literaturePrompt).toContain("offline-structured");
expect(literaturePrompt).toContain("providerAvailable");
expect(literaturePrompt).toContain("Do not present offline candidates as verified database retrieval results");
```

- [ ] **Step 2: Run coding-worker test and verify it fails**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Expected: FAIL because the prompt does not yet include the provider-state guidance.

- [ ] **Step 3: Add prompt guidance**

Modify the final machine-readable block text in `packages/coding-agent/src/core/orchestration/coding-worker.ts`. Keep existing `artifactBriefs` guidance, and add:

```ts
For literature-searcher tasks, use retrievalMode="offline-structured" and providerAvailable=false unless a real search provider was explicitly supplied.
Do not present offline candidates as verified database retrieval results.
```

Add this example field under `structuredOutputs`:

```json
"retrieval": {
  "retrievalMode": "offline-structured",
  "providerAvailable": false
}
```

- [ ] **Step 4: Add acceptance regression for search artifact briefs**

Add this test to `packages/lead-agent/test/orchestration-acceptance.test.ts`:

```ts
it("accepts literature search artifact briefs as search deliverables", () => {
	const report = createLeadAcceptanceReport(
		request(["search strategy", "bibliography candidates", "retrieval gaps"]),
		result({
			artifactBriefs: [
				{
					artifactId: "search-artifact-1",
					kind: "literature-search-results",
					title: "NIR search strategy",
					brief: "Search strategy, bibliography candidates, and retrieval gaps for NIR.",
					keyFindings: ["bibliography candidates"],
					limitations: ["retrieval gaps"],
				},
			],
		}),
	);

	expect(report.accepted).toBe(true);
});
```

- [ ] **Step 5: Run focused tests**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-acceptance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Stage only intended files:

```bash
git add packages/coding-agent/src/core/orchestration/coding-worker.ts
git add packages/coding-agent/test/suite/orchestration/coding-worker.test.ts
git add packages/lead-agent/test/orchestration-acceptance.test.ts
git commit -m "feat(coding-agent): guide literature search worker output"
```

## Task 5: Full Verification And Final Gate

**Files:**
- No new files expected.
- Only fix files touched by Tasks 1-4 if verification finds issues.

- [ ] **Step 1: Run all focused tests touched by this plan**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/academic-smoke.test.ts test/orchestration-acceptance.test.ts
```

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repo check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no Biome fixes, warnings, type errors, browser-smoke failures, or web-ui check failures.

- [ ] **Step 3: Run source-level smoke**

Run from repo root:

```bash
./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke-literature-searcher --json
```

Expected:

- JSON includes `"passed": true`.
- One case id is `"literature-search"`.
- At least one artifact kind is `"literature-search-results"`.

- [ ] **Step 4: Inspect generated artifact folder**

Run from repo root:

```bash
find .tmp/academic-smoke-literature-searcher -maxdepth 5 -type f | sort
```

Expected files include:

```text
.tmp/academic-smoke-literature-searcher/artifacts.json
.tmp/academic-smoke-literature-searcher/session-workflow-log.jsonl
```

Also expect a task folder containing:

```text
workflow-plan.json
steps/01-literature-searcher/worker-request.json
steps/01-literature-searcher/worker-result.json
steps/01-literature-searcher/artifact-briefs.json
steps/01-literature-searcher/acceptance-report.json
```

- [ ] **Step 5: Commit any verification-only fixes**

If verification required fixes, stage only the fixed files and commit:

```bash
git add <specific-fixed-file>
git commit -m "fix(lead-agent): stabilize literature search workflow"
```

If no fixes were required, do not create an empty commit.

## Self-Review

Spec coverage:

- Dedicated `literature-searcher` profile: Task 1.
- Searcher vs researcher boundary: Task 1 profile text and Task 2 workflow tests/templates.
- Provider-ready but offline-only phase 1: Task 4 prompt semantics; no provider runtime implementation.
- Session artifact folder and artifact briefs: Task 2 carried-artifact test and Task 3 smoke artifact checks.
- Search-specific acceptance outputs: Task 2 search-only runtime test and Task 4 acceptance regression.
- Academic smoke case: Task 3.

Scope check:

- This plan intentionally does not implement real external retrieval providers.
- This plan intentionally does not add DOI parsing, citation formatting, deduplication, PDF fetching, or citation-manager integration.
- This plan stays inside `lead-agent`, `coding-agent` worker prompt output guidance, and `artifact-core` artifact kind constants.

Verification:

- Every modified test file has a specific Vitest command.
- Final verification includes focused tests, root `npm run check`, and source-level academic smoke.
