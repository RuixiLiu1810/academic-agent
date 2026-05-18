# Contract-First Agent Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current string-matching academic worker contract with a contract-first output requirement path that planner, executor, runner, artifact store, and acceptance can all consume.

**Architecture:** Introduce `OutputRequirement` and `ExpectedWorkerOutput` in `agent-contracts`, then bridge existing `expectedOutputs` / `acceptanceCriteria` through a compatibility adapter. Move acceptance from text heuristics toward contract checks, add typed artifact writers for known academic artifacts, and route profile workers through a dispatcher rather than a single literature-only runner. Keep the migration hybrid until contract-first smoke is green.

**Tech Stack:** TypeScript, existing JSON-schema-style `JsonObject` contracts, Vitest, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, `@mariozechner/pi-agent-host`.

---

## Current Repo Facts This Plan Assumes

- `WorkerRequest` still carries `expectedOutputs: string[]` and `acceptanceCriteria: string[]`.
- `WorkflowStep` has `expectedArtifactKinds`, but `workerRequestForStep()` does not pass it into `WorkerRequest`.
- `acceptance.ts` mainly checks summary, artifact refs, artifact briefs, and structured outputs by string matching.
- `acceptanceCriteria` is not executed as machine-verifiable criteria.
- `executeWorkflowPlan()` retries the same `workerRequest` without feeding back previous acceptance issues.
- `summarizeWorkflowTemplatesForPlanner()` drops `expectedArtifactKinds` and `expectedOutputs`.
- `createSingleStepWorkflowPlan()` currently uses `profile.expectedOutputs` as `expectedArtifactKinds`, which mixes narrative labels with artifact kinds.
- Default workflow execution now creates a `literature.search` tool-backed profile runner, but that runner still treats only extracted literature tool artifacts as success.

## File Structure

Create:

- `packages/agent-contracts/src/output-contracts.ts`  
  Defines output requirement types, typed academic payload interfaces, compatibility helpers, and type guards.
- `packages/lead-agent/src/orchestration/output-contracts.ts`  
  Builds profile/template/request output contracts and maps legacy fields into contracts.
- `packages/lead-agent/src/orchestration/contract-acceptance.ts`  
  Contract-first acceptance checker with artifact payload lookup and schema validation hooks.
- `packages/lead-agent/src/workers/profile-worker-dispatcher.ts`  
  Dispatches profile-specific workers.
- `packages/lead-agent/src/workers/structured-profile-runner.ts`  
  Model-backed runner for non-literature academic profiles.
- `packages/lead-agent/test/orchestration-contract-acceptance.test.ts`
- `packages/lead-agent/test/orchestration-contract-executor.test.ts`
- `packages/lead-agent/test/profile-worker-dispatcher.test.ts`
- `packages/lead-agent/test/contract-first-smoke.test.ts`

Modify:

- `packages/agent-contracts/src/index.ts`
- `packages/agent-contracts/test/contracts.test.ts`
- `packages/artifact-core/src/index.ts`
- `packages/artifact-core/test/artifact-store.test.ts`
- `packages/lead-agent/src/orchestration/types.ts`
- `packages/lead-agent/src/orchestration/templates.ts`
- `packages/lead-agent/src/orchestration/planner.ts`
- `packages/lead-agent/src/orchestration/llm-planner.ts`
- `packages/lead-agent/src/orchestration/executor.ts`
- `packages/lead-agent/src/orchestration/acceptance.ts`
- `packages/lead-agent/src/workers/profile-worker-runner.ts`
- `packages/lead-agent/src/index.ts`
- `packages/lead-agent/src/academic-smoke.ts`
- `packages/lead-agent/test/lead-agent.test.ts`
- `packages/lead-agent/test/orchestration-planner.test.ts`
- `packages/lead-agent/test/orchestration-llm-planner.test.ts`
- `packages/lead-agent/test/orchestration-executor.test.ts`
- `packages/lead-agent/test/academic-smoke.test.ts`

Do not modify:

- `packages/ai/src/models.generated.ts`
- `packages/coding-agent` unless TypeScript compile errors show a contract import must be updated.

## Task 1: Add Output Contract Types

**Files:**
- Create: `packages/agent-contracts/src/output-contracts.ts`
- Modify: `packages/agent-contracts/src/index.ts`
- Modify: `packages/agent-contracts/test/contracts.test.ts`

- [ ] **Step 1: Add failing contract test**

Append a test that constructs a `WorkerRequest` with both legacy fields and an `outputContract` requiring one `evidence-table` artifact. The test should serialize and deserialize the request, then assert `isWorkerRequest(parsed) === true`.

- [ ] **Step 2: Run contract test and verify failure**

Run from `packages/agent-contracts`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: FAIL because `outputContract` is not accepted by `WorkerRequest`.

- [ ] **Step 3: Add output contract types**

Create `packages/agent-contracts/src/output-contracts.ts` with:

```ts
import type { AcceptanceIssue, JsonObject, WorkerRequest } from "./index.js";

export type OutputRequirementKind = "artifact" | "structured" | "narrative";

export interface SchemaRef {
	id: string;
	version: "v1";
}

export interface OutputRequirementBase {
	id: string;
	label: string;
	required: boolean;
	description?: string;
}

export interface ArtifactOutputRequirement extends OutputRequirementBase {
	kind: "artifact";
	artifactKind: string;
	minCount?: number;
	schemaRef?: SchemaRef;
}

export interface StructuredOutputRequirement extends OutputRequirementBase {
	kind: "structured";
	path: string;
	schemaRef?: SchemaRef;
}

export interface NarrativeOutputRequirement extends OutputRequirementBase {
	kind: "narrative";
	section: string;
	minChars?: number;
	mustMention?: string[];
}

export type OutputRequirement =
	| ArtifactOutputRequirement
	| StructuredOutputRequirement
	| NarrativeOutputRequirement;

export interface ExpectedWorkerOutput {
	contractId: string;
	profileId: string;
	requirements: OutputRequirement[];
	successMode: "all-required";
}

export interface WorkerAttemptContext {
	attempt: number;
	maxAttempts: number;
	previousIssues?: AcceptanceIssue[];
	previousFailureReason?: string;
}

export interface EvidenceTableRow {
	claimId: string;
	claim: string;
	support: "supported" | "partial" | "uncertain" | "contradicted";
	sourceArtifactIds: string[];
	notes?: string;
}

export interface EvidenceTableArtifactPayload {
	kind: "evidence-table";
	rows: EvidenceTableRow[];
	uncertaintySummary: string;
}

export interface CitationAuditEntry {
	claimId: string;
	claim: string;
	status: "supported" | "missing-citation" | "mismatch";
	sourceArtifactIds: string[];
	rationale: string;
}

export interface CitationAuditArtifactPayload {
	kind: "claim-audit";
	entries: CitationAuditEntry[];
	unsupportedCount: number;
}

export interface BibliographyCandidate {
	title: string;
	authors?: string[];
	year?: number;
	doi?: string;
	sourceProvider?: string;
	note?: string;
}

export interface BibliographyCandidatesArtifactPayload {
	kind: "bibliography-candidates";
	queryPlan: string[];
	candidates: BibliographyCandidate[];
	retrievalGaps: string[];
}

export type TypedArtifactPayload =
	| EvidenceTableArtifactPayload
	| CitationAuditArtifactPayload
	| BibliographyCandidatesArtifactPayload;

export interface ContractWorkerRequestFields {
	outputContract?: ExpectedWorkerOutput;
	attemptContext?: WorkerAttemptContext;
	legacyExpectedOutputs?: string[];
	legacyAcceptanceCriteria?: string[];
}

export function legacyOutputsToContract(request: WorkerRequest): ExpectedWorkerOutput {
	const profileId = request.profile?.id ?? request.workerType;
	return {
		contractId: `legacy:${profileId}`,
		profileId,
		successMode: "all-required",
		requirements: request.expectedOutputs.map((label) => ({
			kind: "narrative",
			id: label,
			label,
			required: true,
			section: label,
		})),
	};
}

export function isExpectedWorkerOutput(value: unknown): value is ExpectedWorkerOutput {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.contractId === "string" &&
		typeof record.profileId === "string" &&
		record.successMode === "all-required" &&
		Array.isArray(record.requirements)
	);
}

export function isWorkerAttemptContext(value: unknown): value is WorkerAttemptContext {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return typeof record.attempt === "number" && typeof record.maxAttempts === "number";
}

export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Extend `WorkerRequest` and schema**

In `packages/agent-contracts/src/index.ts`, export the new types and add optional fields to `WorkerRequest`:

```ts
outputContract?: ExpectedWorkerOutput;
attemptContext?: WorkerAttemptContext;
legacyExpectedOutputs?: string[];
legacyAcceptanceCriteria?: string[];
```

Add schema entries for `outputContract` and `attemptContext` as permissive `jsonObjectSchema` first. Do not replace legacy fields yet.

- [ ] **Step 5: Extend `isWorkerRequest`**

Update `isWorkerRequest()` so optional `outputContract` and `attemptContext` use the type guards from `output-contracts.ts`.

- [ ] **Step 6: Run contract test**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-contracts/src/output-contracts.ts packages/agent-contracts/src/index.ts packages/agent-contracts/test/contracts.test.ts
git commit -m "feat(agent-contracts): add worker output contracts"
```

## Task 2: Add Typed Artifact Writer

**Files:**
- Modify: `packages/artifact-core/src/index.ts`
- Modify: `packages/artifact-core/test/artifact-store.test.ts`

- [ ] **Step 1: Add failing writer test**

Add a test that creates a `MemoryArtifactStore`, writes an `evidence-table` payload with a new `createTypedArtifactWriter(store)`, then asserts the stored artifact has `mediaType: "application/json"` and parseable JSON content.

- [ ] **Step 2: Run artifact-core test and verify failure**

Run from `packages/artifact-core`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/artifact-store.test.ts
```

Expected: FAIL because `createTypedArtifactWriter` does not exist.

- [ ] **Step 3: Implement writer**

In `packages/artifact-core/src/index.ts`, import `TypedArtifactPayload` from `@mariozechner/pi-agent-contracts` and add:

```ts
export interface TypedArtifactWriter {
	write<K extends TypedArtifactPayload["kind"]>(input: {
		kind: K;
		title: string;
		payload: Extract<TypedArtifactPayload, { kind: K }>;
		lineage?: string[];
		metadata?: JsonObject;
	}): StoredArtifact;
}

export function createTypedArtifactWriter(store: ArtifactStore): TypedArtifactWriter {
	return {
		write(input) {
			return store.create({
				kind: input.kind,
				title: input.title,
				mediaType: "application/json",
				lineage: input.lineage,
				metadata: input.metadata,
				content: `${JSON.stringify(input.payload, null, 2)}\n`,
			});
		},
	};
}
```

- [ ] **Step 4: Run artifact-core test**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/artifact-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/artifact-core/src/index.ts packages/artifact-core/test/artifact-store.test.ts
git commit -m "feat(artifact-core): add typed academic artifact writer"
```

## Task 3: Build Contract-Aware Acceptance

**Files:**
- Create: `packages/lead-agent/src/orchestration/contract-acceptance.ts`
- Modify: `packages/lead-agent/src/orchestration/acceptance.ts`
- Create: `packages/lead-agent/test/orchestration-contract-acceptance.test.ts`

- [ ] **Step 1: Add failing acceptance tests**

Create tests covering:

- valid `evidence-table` artifact passes when required by `outputContract`
- missing artifact fails with `artifact_missing`
- malformed artifact JSON fails with `artifact_unreadable`
- legacy request still passes through compatibility adapter

- [ ] **Step 2: Run acceptance tests and verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-acceptance.test.ts
```

Expected: FAIL because contract acceptance does not exist.

- [ ] **Step 3: Implement contract checker**

Create `contract-acceptance.ts` with:

```ts
import type {
	AcceptanceIssue,
	AcceptanceReport,
	ArtifactRef,
	JsonValue,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import {
	createAcceptanceReport,
	legacyOutputsToContract,
	type ExpectedWorkerOutput,
	type OutputRequirement,
} from "@mariozechner/pi-agent-contracts";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";

function issue(code: string, message: string, severity: AcceptanceIssue["severity"], artifactId?: string): AcceptanceIssue {
	return { code, message, severity, artifactId };
}

function artifactMatchesKind(artifact: ArtifactRef, kind: string): boolean {
	return artifact.kind === kind;
}

function valueAtPath(value: JsonValue | undefined, path: string): JsonValue | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	let current: JsonValue | undefined = value;
	for (const part of path.split(".")) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = current[part];
	}
	return current;
}

function issuesForRequirement(
	requirement: OutputRequirement,
	result: WorkerResult,
	artifactStore: Pick<ArtifactStore, "get"> | undefined,
): AcceptanceIssue[] {
	if (!requirement.required) return [];
	if (requirement.kind === "artifact") {
		const matches = result.producedArtifacts.filter((artifact) => artifactMatchesKind(artifact, requirement.artifactKind));
		if (matches.length < (requirement.minCount ?? 1)) {
			return [issue("artifact_missing", `Missing artifact kind: ${requirement.artifactKind}`, "error")];
		}
		if (!artifactStore || !requirement.schemaRef) return [];
		return matches.flatMap((artifact) => {
			const stored = artifactStore.get(artifact.id);
			if (!stored) return [issue("artifact_unreadable", `Artifact not found: ${artifact.id}`, "error", artifact.id)];
			try {
				JSON.parse(stored.content);
				return [];
			} catch {
				return [issue("artifact_unreadable", `Artifact content is not valid JSON: ${artifact.id}`, "error", artifact.id)];
			}
		});
	}
	if (requirement.kind === "structured") {
		const value = valueAtPath(result.structuredOutputs, requirement.path);
		return value === undefined
			? [issue("structured_output_missing", `Missing structured output at ${requirement.path}`, "error")]
			: [];
	}
	const text = result.summary.trim();
	if (text.length === 0) return [issue("narrative_output_missing", `Missing narrative output: ${requirement.section}`, "error")];
	if (requirement.minChars && text.length < requirement.minChars) {
		return [issue("narrative_output_too_short", `${requirement.section} shorter than ${requirement.minChars}`, "error")];
	}
	for (const token of requirement.mustMention ?? []) {
		if (!text.toLowerCase().includes(token.toLowerCase())) {
			return [issue("narrative_output_missing_token", `${requirement.section} missing token: ${token}`, "error")];
		}
	}
	return [];
}

export function outputContractForRequest(request: WorkerRequest): ExpectedWorkerOutput {
	return request.outputContract ?? legacyOutputsToContract(request);
}

export function createLeadContractAcceptanceReport(
	request: WorkerRequest,
	result: WorkerResult,
	options: { artifactStore?: Pick<ArtifactStore, "get"> } = {},
): AcceptanceReport {
	const issues: AcceptanceIssue[] = [];
	if (result.status !== "success") {
		issues.push(issue("worker_failed", result.failureReason ?? `Worker returned status ${result.status}.`, "error"));
	}
	const contract = outputContractForRequest(request);
	for (const requirement of contract.requirements) {
		issues.push(...issuesForRequirement(requirement, result, options.artifactStore));
	}
	for (const warning of result.warnings) issues.push(issue("worker_warning", warning, "warning"));
	for (const question of result.openQuestions) issues.push(issue("worker_open_question", question.question, "info"));
	return createAcceptanceReport(result, issues);
}
```

- [ ] **Step 4: Switch public acceptance wrapper**

In `acceptance.ts`, keep existing string helper exports for legacy tests, but update `createLeadAcceptanceReport()` to delegate to `createLeadContractAcceptanceReport()` when `workerRequest.outputContract` exists.

- [ ] **Step 5: Run tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-acceptance.test.ts test/orchestration-acceptance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lead-agent/src/orchestration/contract-acceptance.ts packages/lead-agent/src/orchestration/acceptance.ts packages/lead-agent/test/orchestration-contract-acceptance.test.ts
git commit -m "feat(lead-agent): add contract-aware acceptance"
```

## Task 4: Preserve Step Artifact Requirements In Worker Requests

**Files:**
- Modify: `packages/lead-agent/src/orchestration/output-contracts.ts`
- Modify: `packages/lead-agent/src/orchestration/executor.ts`
- Modify: `packages/lead-agent/test/orchestration-contract-executor.test.ts`

- [ ] **Step 1: Add failing executor test**

Create a test where a workflow step has `expectedArtifactKinds: ["evidence-table"]`. Assert the `WorkerRequest` received by the fake runner contains an `outputContract` with an artifact requirement for `evidence-table`.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-executor.test.ts
```

Expected: FAIL because `workerRequestForStep()` does not create `outputContract`.

- [ ] **Step 3: Add contract builder**

Create `packages/lead-agent/src/orchestration/output-contracts.ts`:

```ts
import type { WorkerProfile, WorkflowStep } from "@mariozechner/pi-agent-contracts";
import type { ExpectedWorkerOutput, OutputRequirement } from "@mariozechner/pi-agent-contracts";

export function outputContractForStep(step: WorkflowStep, profile: WorkerProfile | undefined): ExpectedWorkerOutput {
	const artifactRequirements: OutputRequirement[] = step.expectedArtifactKinds.map((artifactKind) => ({
		kind: "artifact",
		id: artifactKind,
		label: artifactKind,
		required: true,
		artifactKind,
		minCount: 1,
	}));
	const narrativeRequirements: OutputRequirement[] = step.expectedOutputs
		.filter((label) => !step.expectedArtifactKinds.includes(label))
		.map((label) => ({
			kind: "narrative",
			id: label,
			label,
			required: true,
			section: label,
		}));
	return {
		contractId: `step:${step.profileId}:${step.id}`,
		profileId: profile?.id ?? step.profileId,
		successMode: "all-required",
		requirements: [...artifactRequirements, ...narrativeRequirements],
	};
}
```

- [ ] **Step 4: Wire executor**

In `workerRequestForStep()`, set:

```ts
outputContract: outputContractForStep(step, profile),
legacyExpectedOutputs: step.expectedOutputs,
legacyAcceptanceCriteria: step.acceptanceCriteria,
```

- [ ] **Step 5: Run executor tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-executor.test.ts test/orchestration-executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lead-agent/src/orchestration/output-contracts.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/test/orchestration-contract-executor.test.ts
git commit -m "feat(lead-agent): carry output contracts into worker requests"
```

## Task 5: Expose Output Contracts To Planner And Validator

**Files:**
- Modify: `packages/lead-agent/src/orchestration/templates.ts`
- Modify: `packages/lead-agent/src/orchestration/planner.ts`
- Modify: `packages/lead-agent/src/orchestration/llm-planner.ts`
- Modify: `packages/lead-agent/test/orchestration-planner.test.ts`
- Modify: `packages/lead-agent/test/orchestration-llm-planner.test.ts`

- [ ] **Step 1: Add failing template summary test**

Assert `summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES)` includes `expectedArtifactKinds` and `expectedOutputs` for `literature-search`.

- [ ] **Step 2: Add failing validator compatibility test**

Use a profile list without `citation-checker` support and a step that asks `researcher` for `claim-audit`; assert `validateWorkflowPlan()` reports an output compatibility error.

- [ ] **Step 3: Run planner tests and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts test/orchestration-llm-planner.test.ts
```

Expected: FAIL on missing summary fields and missing compatibility validation.

- [ ] **Step 4: Expand template summaries**

Change `WorkflowTemplateSummary.steps` to:

```ts
steps: {
	profileId: string;
	role: string;
	expectedArtifactKinds: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
}[];
```

Update `summarizeWorkflowTemplatesForPlanner()` to include those fields.

- [ ] **Step 5: Expand LLM planner prompt**

In `buildUserMessage()`, render each template step as:

```text
- <profileId>: <role>
  required artifacts: <expectedArtifactKinds or none>
  expected outputs: <expectedOutputs or none>
  acceptance criteria: <acceptanceCriteria or none>
```

- [ ] **Step 6: Add validator compatibility rule**

In `validateWorkflowPlan()`, after checking string arrays, reject any `expectedArtifactKinds` entry that is not present in the selected template step for the same `profileId`, unless no matching template step exists. This keeps validation conservative without inventing profile YAML yet.

- [ ] **Step 7: Run planner tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts test/orchestration-llm-planner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/lead-agent/src/orchestration/templates.ts packages/lead-agent/src/orchestration/planner.ts packages/lead-agent/src/orchestration/llm-planner.ts packages/lead-agent/test/orchestration-planner.test.ts packages/lead-agent/test/orchestration-llm-planner.test.ts
git commit -m "feat(lead-agent): expose output contracts to planner"
```

## Task 6: Add Retry Feedback Context

**Files:**
- Modify: `packages/lead-agent/src/orchestration/types.ts`
- Modify: `packages/lead-agent/src/orchestration/executor.ts`
- Modify: `packages/lead-agent/src/workers/profile-worker-runner.ts`
- Modify: `packages/lead-agent/test/orchestration-contract-executor.test.ts`

- [ ] **Step 1: Add failing retry test**

Write a fake runner that fails the first attempt and succeeds only when `request.attemptContext.previousIssues` contains an error. Assert the workflow accepts on the second attempt.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-executor.test.ts
```

Expected: FAIL because previous issues are not injected.

- [ ] **Step 3: Inject attempt context**

In `executeWorkflowPlan()`, track `previousAcceptanceReport`, then call the runner with:

```ts
workerResult = await workerRunner({
	...workerRequest,
	attemptContext: {
		attempt,
		maxAttempts,
		previousIssues: previousAcceptanceReport?.issues,
		previousFailureReason: previousAcceptanceReport?.issues
			.filter((issue) => issue.severity === "error")
			.map((issue) => issue.message)
			.join("; "),
	},
});
```

Set `previousAcceptanceReport = acceptanceReport` before retry.

- [ ] **Step 4: Render retry issues in profile prompt**

In `profile-worker-runner.ts`, append:

```ts
`Attempt: ${request.attemptContext?.attempt ?? 1}/${request.attemptContext?.maxAttempts ?? 1}`,
`Previous acceptance issues: ${
	request.attemptContext?.previousIssues?.map((issue) => `${issue.code}: ${issue.message}`).join("; ") ?? "none"
}`,
```

to `buildPrompt()`.

- [ ] **Step 5: Run executor tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-executor.test.ts test/orchestration-executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lead-agent/src/orchestration/types.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/src/workers/profile-worker-runner.ts packages/lead-agent/test/orchestration-contract-executor.test.ts
git commit -m "feat(lead-agent): inject acceptance feedback into retries"
```

## Task 7: Add Profile Worker Dispatcher

**Files:**
- Create: `packages/lead-agent/src/workers/profile-worker-dispatcher.ts`
- Create: `packages/lead-agent/src/workers/structured-profile-runner.ts`
- Modify: `packages/lead-agent/src/index.ts`
- Create: `packages/lead-agent/test/profile-worker-dispatcher.test.ts`

- [ ] **Step 1: Add failing dispatcher tests**

Cover:

- `literature-searcher` routes to literature runner
- `researcher` routes to structured runner
- unknown profile returns failed `WorkerResult`

- [ ] **Step 2: Run dispatcher test and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-dispatcher.test.ts
```

Expected: FAIL because dispatcher does not exist.

- [ ] **Step 3: Implement dispatcher**

Create `profile-worker-dispatcher.ts`:

```ts
import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";

export interface ProfileWorkerDispatcherOptions {
	literatureRunner: LeadAgentWorkerRunner;
	structuredRunner: LeadAgentWorkerRunner;
}

export function createProfileWorkerDispatcher(options: ProfileWorkerDispatcherOptions): LeadAgentWorkerRunner {
	return async (request) => {
		const profileId = request.profile?.id ?? request.workerType;
		if (profileId === "literature-searcher") return options.literatureRunner(request);
		if (["researcher", "citation-checker", "reviewer", "writer", "reviser", "method-auditor"].includes(profileId)) {
			return options.structuredRunner(request);
		}
		const result: WorkerResult = {
			taskId: request.taskId,
			status: "failed",
			summary: "No runner available for profile.",
			producedArtifacts: [],
			warnings: [`Unhandled profile: ${profileId}`],
			openQuestions: [],
			executionTrace: createExecutionTrace(`dispatcher-${request.taskId}`),
			failureReason: `Unhandled profile: ${profileId}`,
		};
		return result;
	};
}
```

- [ ] **Step 4: Implement minimal structured runner**

Create `structured-profile-runner.ts` as a deterministic first pass that writes a typed artifact matching the first artifact requirement in `request.outputContract`. This is intentionally narrow; LLM-backed structured generation can follow after contract smoke is stable.

- [ ] **Step 5: Wire default runtime**

In `createDefaultWorkflowWorkerRunner()`, create:

- `literatureRunner` from current `createProfileWorkerRunner()`
- `structuredRunner` from `createStructuredProfileRunner()`
- return `createProfileWorkerDispatcher({ literatureRunner, structuredRunner })`

- [ ] **Step 6: Run dispatcher and lead-agent tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-dispatcher.test.ts test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/lead-agent/src/workers/profile-worker-dispatcher.ts packages/lead-agent/src/workers/structured-profile-runner.ts packages/lead-agent/src/index.ts packages/lead-agent/test/profile-worker-dispatcher.test.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): dispatch academic profile workers"
```

## Task 8: Fix Single-Step Fallback Contract Mixing

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add failing fallback test**

Create a runtime with explicit `profileId: "researcher"` and assert the generated workflow step does not put `"evidence summary"` into `expectedArtifactKinds`.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because fallback currently uses `profile.expectedOutputs` as `expectedArtifactKinds`.

- [ ] **Step 3: Fix fallback**

In `createSingleStepWorkflowPlan()`, set:

```ts
expectedArtifactKinds: request.expectedOutputs?.filter((output) => output.endsWith("-table") || output.endsWith("-audit")) ?? [],
```

Then rely on Task 4 contract builder to turn step fields into `outputContract`.

- [ ] **Step 4: Run lead-agent test**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "fix(lead-agent): avoid fallback artifact contract mixing"
```

## Task 9: Add Contract-First Smoke

**Files:**
- Create: `packages/lead-agent/test/contract-first-smoke.test.ts`
- Modify: `packages/lead-agent/src/academic-smoke.ts`
- Modify: `packages/lead-agent/test/academic-smoke.test.ts`

- [ ] **Step 1: Add contract-first smoke test**

Use deterministic runners and assert:

- `literature-search` produces `literature-search-results`
- `mini-paperorchestra-inputs` produces `evidence-table` then `outline`
- every worker step has `workerRequest.outputContract`
- final `AcceptanceReport.accepted === true`

- [ ] **Step 2: Run smoke tests and verify failure**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contract-first-smoke.test.ts test/academic-smoke.test.ts
```

Expected: FAIL until previous tasks are wired through smoke.

- [ ] **Step 3: Update smoke runner**

Update deterministic smoke worker so it reads `request.outputContract.requirements` and creates artifacts for artifact requirements rather than inferring from `workerType`.

- [ ] **Step 4: Run smoke tests**

Run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contract-first-smoke.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run root smoke**

Run:

```bash
./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke-contract-first --json
rm -rf .tmp/academic-smoke-contract-first
```

Expected: JSON contains `"passed": true`.

- [ ] **Step 6: Commit**

```bash
git add packages/lead-agent/src/academic-smoke.ts packages/lead-agent/test/academic-smoke.test.ts packages/lead-agent/test/contract-first-smoke.test.ts
git commit -m "test(lead-agent): add contract-first academic smoke"
```

## Task 10: Full Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run focused tests**

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

```bash
cd packages/artifact-core
npx tsx ../../node_modules/vitest/dist/cli.js --run test/artifact-store.test.ts
```

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/orchestration-acceptance.test.ts test/orchestration-contract-acceptance.test.ts test/orchestration-executor.test.ts test/orchestration-contract-executor.test.ts test/orchestration-planner.test.ts test/orchestration-llm-planner.test.ts test/profile-worker-runner.test.ts test/profile-worker-dispatcher.test.ts test/academic-smoke.test.ts test/contract-first-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run root check**

```bash
npm run check
```

Expected: PASS with no warnings or infos.

- [ ] **Step 3: Run root smoke**

```bash
./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke-contract-first --json
rm -rf .tmp/academic-smoke-contract-first
```

Expected: JSON contains `"passed": true`.

- [ ] **Step 4: Inspect git status**

```bash
git status --short
```

Expected: only unrelated pre-existing files remain.

- [ ] **Step 5: Stop at verified state**

Do not create a catch-all final commit. All implementation commits should already be phase-aligned.

## Self-Review

- Spec coverage: covers contract types, artifact writer, acceptance, planner visibility, executor retry feedback, worker dispatcher, fallback contract mixing, and smoke coverage.
- Placeholder scan: no task uses TBD/TODO/fill-in language.
- Type consistency: this plan keeps `WorkerRequest` as the transitional carrier and adds optional contract fields before changing runtime behavior.
