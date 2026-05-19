# Lead Agent Working Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn lead-agent session persistence into controlled academic working memory across planner, worker, direct, and compaction paths.

**Architecture:** `SessionManager` remains the source of truth. `LeadConversationContext` derives bounded lead memory from session branches; planner receives a compact summary, workers receive a narrow `WorkerContextPackage`, and direct mode first consumes lead context before later dropping its long-lived cached direct session.

**Tech Stack:** TypeScript, npm workspace, Vitest, `@mariozechner/pi-agent-host`, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, `@mariozechner/pi-ai`.

---

## Source Spec

Implement from:

- `docs/superpowers/specs/2026-05-19-lead-agent-working-memory-design.md`

Use this plan from repo root:

```bash
cd /Users/liuruixi/Documents/Code/pi-mono
```

Do not use `git add .` or `git add -A`. Add only the files touched by each task.

## File Structure

### New Files

- `packages/lead-agent/src/orchestration/lead-context.ts`
  - Builds bounded `LeadConversationContext` from `SessionManager.buildSessionContext()` and `SessionManager.getBranch()`.
  - Extracts recent user objectives, lead outputs, decisions, workflow summaries, artifact refs/briefs, and compaction data.
  - Owns budget trimming and debug formatting.

- `packages/lead-agent/src/orchestration/worker-context.ts`
  - Derives a step-scoped `WorkerContextPackage` from `LeadConversationContext`.
  - Keeps artifact refs/briefs only; never loads full artifact content.

- `packages/lead-agent/src/orchestration/academic-compaction.ts`
  - Builds `AcademicCompactionDetails`.
  - Creates manual academic compaction summaries from session/context state.

- `packages/lead-agent/test/lead-context.test.ts`
  - Unit tests for context extraction, budget trimming, artifact preservation, and compaction recognition.

- `packages/lead-agent/test/worker-context.test.ts`
  - Unit tests for worker context package derivation.

- `packages/lead-agent/test/academic-compaction.test.ts`
  - Unit tests for academic compaction details and no-large-artifact behavior.

### Modified Files

- `packages/lead-agent/src/orchestration/executor.ts`
  - Add context package support.
  - Preserve existing contract/attempt behavior.
  - Write context debug snapshots to workspace.

- `packages/lead-agent/src/orchestration/types.ts`
  - Extend `LeadTaskPlanningInput` with `conversationContext` and `availableArtifactRefs`.
  - Add `DirectRunContext` and update `LeadAgentDirectRunner` in the later direct-runner phase.

- `packages/lead-agent/src/orchestration/intake.ts`
  - Build `availableArtifactRefs` from request input artifacts plus context prior artifacts.

- `packages/lead-agent/src/orchestration/planner.ts`
  - Validate step artifact refs against `availableArtifactRefs`.

- `packages/lead-agent/src/orchestration/llm-planner.ts`
  - Render conversation context into planner prompt.
  - Add continuity rules.

- `packages/lead-agent/src/prompts.ts`
  - Extend `buildLeadDirectMessage()` with optional conversation context.

- `packages/lead-agent/src/workers/profile-worker-runner.ts`
  - Stop treating missing artifacts as universal failure.
  - Render output contract, attempt context, and worker context package.

- `packages/lead-agent/src/index.ts`
  - Build lead context in `runImpl()`.
  - Pass context into planner, executor, and direct synthesis.
  - Later remove long-lived direct `cachedSession`.

- `packages/lead-agent/src/modes/interactive-loop.ts`
  - Add `/compact academic` in non-TUI interactive mode.

- `packages/lead-agent/src/modes/tui/lead-tui-mode.ts`
  - Add `/compact academic` slash command in TUI.

- `packages/lead-agent/CHANGELOG.md`
  - Add entries under `## [Unreleased]`.

- Existing tests:
  - `packages/lead-agent/test/orchestration-executor.test.ts`
  - `packages/lead-agent/test/orchestration-contract-acceptance.test.ts`
  - `packages/lead-agent/test/profile-worker-runner.test.ts`
  - `packages/lead-agent/test/orchestration-llm-planner.test.ts`
  - `packages/lead-agent/test/lead-agent.test.ts`
  - `packages/lead-agent/test/interactive-loop.test.ts`
  - `packages/lead-agent/test/tui-smoke.test.ts`

## Phase 1: Foundation

### Task 1: Add Executor Retry AttemptContext Regression

**Files:**
- Modify: `packages/lead-agent/test/orchestration-executor.test.ts`

- [ ] **Step 1: Read current executor tests**

Run:

```bash
sed -n '1,280p' packages/lead-agent/test/orchestration-executor.test.ts
```

Expected: existing tests show how to create a `WorkflowPlan`, fake profiles, fake workspace, and `executeWorkflowPlan()`.

- [ ] **Step 2: Add failing retry attemptContext test**

Append this test in `describe("executeWorkflowPlan", ...)`:

```ts
it("passes previous acceptance issues into attemptContext on retry", async () => {
	const workerRequests: WorkerRequest[] = [];
	const result = await executeWorkflowPlan({
		plan: {
			taskId: "task-attempt-context",
			sessionId: "session-attempt-context",
			mode: "workflow",
			rationale: "Exercise retry context.",
			userVisibleSummary: "Run one retrying step.",
			stopConditions: ["accepted"],
			steps: [
				{
					id: "step-1",
					order: 1,
					profileId: "researcher",
					objective: "Summarize the evidence.",
					expectedOutputs: ["evidence summary"],
					acceptanceCriteria: [],
					inputArtifactRefs: [],
				},
			],
		},
		profiles: [
			{
				id: "researcher",
				name: "Researcher",
				description: "Research worker",
				rolePrompt: "You are a researcher.",
				capabilities: [],
				expectedOutputs: [],
				acceptanceChecklist: [],
			},
		],
		workspace,
		workerRunner: async (request) => {
			workerRequests.push(request);
			return {
				taskId: request.taskId,
				status: "success",
				summary: workerRequests.length === 1 ? "Incomplete response" : "evidence summary complete",
				structuredOutputs: {},
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace(`attempt-${workerRequests.length}`),
			};
		},
	});

	expect(result.accepted).toBe(true);
	expect(workerRequests).toHaveLength(2);
	expect(workerRequests[0]!.attemptContext?.attempt).toBe(1);
	expect(workerRequests[0]!.attemptContext?.previousIssues).toBeUndefined();
	expect(workerRequests[1]!.attemptContext?.attempt).toBe(2);
	expect(workerRequests[1]!.attemptContext?.previousIssues?.[0]?.code).toBe("expected_output_missing");
	expect(workerRequests[1]!.attemptContext?.previousFailureReason).toContain("evidence summary");
});
```

- [ ] **Step 3: Run the test and verify failure or pass**

Run from package root:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-executor.test.ts
```

Expected before implementation: either PASS because executor already supports it, or FAIL on helper/type import gaps. Fix only test setup gaps in this task.

- [ ] **Step 4: Add missing imports and workspace setup**

If TypeScript errors mention missing names, add top-level imports:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";
```

Wrap the test body in the same temp workspace pattern used by current executor tests:

```ts
const cwd = mkdtempSync(join(tmpdir(), "lead-executor-attempt-context-"));
try {
	const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-attempt-context" });
	// Place the executeWorkflowPlan() call and assertions here.
} finally {
	rmSync(cwd, { recursive: true, force: true });
}
```

- [ ] **Step 5: Re-run test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

Only if the user has approved commits for implementation:

```bash
git status --short
git add packages/lead-agent/test/orchestration-executor.test.ts
git commit -m "test(lead-agent): cover retry attempt context"
```

### Task 2: Add Contract Acceptance Priority Regression

**Files:**
- Modify: `packages/lead-agent/test/orchestration-contract-acceptance.test.ts`

- [ ] **Step 1: Add failing priority test**

Append a test:

```ts
it("uses outputContract before legacy expected outputs", () => {
	const report = createLeadAcceptanceReport(
		{
			taskId: "contract-priority",
			workerType: "writer",
			objective: "Write a short summary.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["bibliography candidates"],
			acceptanceCriteria: [],
			outputContract: {
				contractId: "contract:writer:narrative",
				profileId: "writer",
				successMode: "all-required",
				requirements: [
					{
						id: "summary",
						kind: "narrative",
						label: "summary",
						required: true,
						section: "summary",
						minChars: 10,
					},
				],
			},
			producedArtifacts: [],
		},
		{
			taskId: "contract-priority",
			status: "success",
			summary: "This summary is long enough.",
			structuredOutputs: {},
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("contract-priority"),
		},
	);

	expect(report.accepted).toBe(true);
	expect(report.issues.find((issue) => issue.code === "expected_output_missing")).toBeUndefined();
});
```

If `WorkerRequest` does not accept `producedArtifacts`, remove that field from the request object. It belongs on `WorkerResult`.

- [ ] **Step 2: Add missing import**

Ensure imports include:

```ts
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { createLeadAcceptanceReport } from "../src/orchestration/acceptance.js";
```

- [ ] **Step 3: Run test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-contract-acceptance.test.ts
```

Expected: PASS. If FAIL because `minChars` checks a named section rather than `summary`, update `structuredOutputs` to include the expected section:

```ts
structuredOutputs: {
	summary: "This summary is long enough.",
},
```

- [ ] **Step 4: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/test/orchestration-contract-acceptance.test.ts
git commit -m "test(lead-agent): cover contract acceptance priority"
```

### Task 3: Refactor Profile Worker Success and Prompt Sections

**Files:**
- Modify: `packages/lead-agent/src/workers/profile-worker-runner.ts`
- Modify: `packages/lead-agent/test/profile-worker-runner.test.ts`

- [ ] **Step 1: Add pure profile worker status tests first**

In `packages/lead-agent/test/profile-worker-runner.test.ts`, add tests for non-literature and literature status behavior. These tests must not call a real model; they target the pure helper added in Step 3.

```ts
it("allows non-literature profiles to succeed with narrative output", () => {
	expect(
		inferProfileWorkerStatus({
			request: {
				workerType: "writer",
				profile: {
					id: "writer",
					name: "Writer",
					description: "Writes academic prose",
					capabilities: [],
					expectedOutputs: [],
					acceptanceChecklist: [],
				},
			},
			summary: "Drafted abstract summary.",
			toolOutputs: [],
			producedArtifacts: [],
		}),
	).toBe("success");
});

it("requires literature-searcher to produce literature output", () => {
	expect(
		inferProfileWorkerStatus({
			request: {
				workerType: "literature-searcher",
				profile: {
					id: "literature-searcher",
					name: "Literature Searcher",
					capabilities: ["literature-search"],
				},
			},
			summary: "I found papers but did not use the retrieval tool.",
			toolOutputs: [],
			producedArtifacts: [],
		}),
	).toBe("failed");

	expect(
		inferProfileWorkerStatus({
			request: {
				workerType: "literature-searcher",
				profile: {
					id: "literature-searcher",
					name: "Literature Searcher",
					capabilities: ["literature-search"],
				},
			},
			summary: "Retrieval complete.",
			toolOutputs: [
				{
					retrievalRunId: "run-1",
					providers: [],
					artifactRefs: [{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" }],
					candidatesPreview: [],
					warnings: [],
				},
			],
			producedArtifacts: [],
		}),
	).toBe("success");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
```

Expected: FAIL on non-literature status if current artifact-only logic is covered.

- [ ] **Step 3: Add success inference helpers**

In `profile-worker-runner.ts`, add:

```ts
function requiresLiteratureArtifact(request: WorkerRequest): boolean {
	return request.profile?.id === "literature-searcher" || request.workerType === "literature-searcher";
}

export function inferProfileWorkerStatus(options: {
	request: Pick<WorkerRequest, "workerType" | "profile" | "outputContract">;
	summary: string | undefined;
	toolOutputs: LiteratureSearchToolOutput[];
	producedArtifacts: ArtifactRef[];
}): WorkerResult["status"] {
	if (requiresLiteratureArtifact(options.request as WorkerRequest)) {
		return options.toolOutputs.length > 0 || options.producedArtifacts.length > 0 ? "success" : "failed";
	}
	if ((options.summary ?? "").trim().length > 0) {
		return "success";
	}
	const hasStructuredContract =
		options.outputContract?.requirements.some((requirement) => requirement.kind === "structured") ?? false;
	return hasStructuredContract ? "success" : "failed";
}

function failureReasonForProfileWorker(
	request: WorkerRequest,
	status: WorkerResult["status"],
): string | undefined {
	if (status === "success") {
		return undefined;
	}
	if (requiresLiteratureArtifact(request)) {
		return "Profile worker did not produce a literature artifact.";
	}
	return "Profile worker did not produce a narrative or structured result.";
}
```

Add `ArtifactRef` to the imports:

```ts
import { createExecutionTrace, type ArtifactRef, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
```

- [ ] **Step 4: Render output contract and attempt context**

Add formatting helpers:

```ts
function formatOutputContract(request: WorkerRequest): string {
	const contract = request.outputContract;
	if (!contract) {
		return "none";
	}
	return contract.requirements
		.map((requirement) => {
			if (requirement.kind === "artifact") {
				return `- ${requirement.id}: artifact ${requirement.artifactKind}, required=${requirement.required}`;
			}
			if (requirement.kind === "structured") {
				return `- ${requirement.id}: structured path ${requirement.path}, required=${requirement.required}`;
			}
			return `- ${requirement.id}: narrative section ${requirement.section}, required=${requirement.required}`;
		})
		.join("\n");
}

function formatAttemptContext(request: WorkerRequest): string {
	const attempt = request.attemptContext;
	if (!attempt) {
		return "Attempt: 1/1\nPrevious acceptance issues: none";
	}
	const issues =
		attempt.previousIssues && attempt.previousIssues.length > 0
			? attempt.previousIssues.map((issue) => `- ${issue.code}: ${issue.message}`).join("\n")
			: "none";
	return [
		`Attempt: ${attempt.attempt}/${attempt.maxAttempts}`,
		`Previous acceptance issues:\n${issues}`,
		`Previous failure reason: ${attempt.previousFailureReason || "none"}`,
	].join("\n");
}
```

Update `buildPrompt()`:

```ts
function buildPrompt(request: WorkerRequest): string {
	return [
		request.profile?.rolePrompt ?? request.objective,
		"",
		"## Objective",
		request.objective,
		"",
		"## Output Contract",
		formatOutputContract(request),
		"",
		"## Attempt Context",
		formatAttemptContext(request),
		"",
		"## Acceptance Criteria",
		request.acceptanceCriteria.join("\n") || "none",
		"",
		"## Final Response Rules",
		"- Explicitly satisfy each required output contract.",
		"- If this is a retry, directly address previous acceptance issues.",
		"- Do not claim artifact-based evidence unless full artifact content or explicit evidence is provided.",
		"- Return a concise final summary after using any required tools.",
	].join("\n");
}
```

- [ ] **Step 5: Use inferred status in result**

Replace the final return status block:

```ts
const summary = latestAssistantText(session.messages) ?? "Profile worker completed.";
const status = inferProfileWorkerStatus({
	request,
	summary,
	toolOutputs,
	producedArtifacts,
});
const failureReason = failureReasonForProfileWorker(request, status);
```

Then return:

```ts
status,
summary,
...
openQuestions:
	status === "success"
		? []
		: [{ question: failureReason ?? "Profile worker did not produce a usable result." }],
failureReason,
```

- [ ] **Step 6: Run profile worker test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/workers/profile-worker-runner.ts packages/lead-agent/test/profile-worker-runner.test.ts
git commit -m "fix(lead-agent): decouple profile worker success from artifacts"
```

### Task 4: Add LeadConversationContext Adapter

**Files:**
- Create: `packages/lead-agent/src/orchestration/lead-context.ts`
- Create: `packages/lead-agent/test/lead-context.test.ts`
- Modify: `packages/lead-agent/src/orchestration/index.ts`

- [ ] **Step 1: Write tests for extraction and trimming**

Create `packages/lead-agent/test/lead-context.test.ts` with:

```ts
import { SessionManager } from "@mariozechner/pi-agent-host";
import { describe, expect, it } from "vitest";
import { buildLeadConversationContext } from "../src/orchestration/lead-context.js";

describe("buildLeadConversationContext", () => {
	it("extracts recent user objectives and lead outputs", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-test");
		sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Find NIR literature." }],
			timestamp: Date.now(),
		});
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "I found a short summary." }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-synthesis",
			timestamp: Date.now(),
			usage: { input: 0, output: 0 },
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Continue the search.",
		});

		expect(context.currentObjective).toBe("Continue the search.");
		expect(context.recentUserObjectives).toContain("Find NIR literature.");
		expect(context.recentLeadOutputs).toContain("I found a short summary.");
	});

	it("extracts lead decision custom entries", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-decision");
		sessionManager.appendCustomEntry("lead-agent.decision", {
			taskId: "task-1",
			mode: "worker",
			profileId: "researcher",
			reason: "Needs specialist review.",
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Continue.",
		});

		expect(context.recentDecisions).toEqual([
			{
				taskId: "task-1",
				mode: "worker",
				profileId: "researcher",
				reason: "Needs specialist review.",
			},
		]);
	});

	it("preserves artifact refs while trimming verbose outputs", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-budget");
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "x".repeat(1000) }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-synthesis",
			timestamp: Date.now(),
			usage: { input: 0, output: 0 },
		});
		sessionManager.appendCustomEntry("lead-agent.result", {
			taskId: "task-1",
			finalOutput: "done",
			accepted: true,
			producedArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Use artifact.",
			maxChars: 240,
		});

		expect(context.priorArtifacts.map((artifact) => artifact.id)).toContain("artifact-1");
		expect(context.budget.truncatedSections).toContain("recentLeadOutputs");
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-context.test.ts
```

Expected: FAIL because `lead-context.ts` does not exist.

- [ ] **Step 3: Implement lead-context.ts**

Create `packages/lead-agent/src/orchestration/lead-context.ts`:

```ts
import type { ArtifactBrief, ArtifactRef, JsonObject } from "@mariozechner/pi-agent-contracts";
import type { SessionEntry, SessionManager } from "@mariozechner/pi-agent-host";

export interface LeadDecisionSummary {
	taskId?: string;
	mode: "direct" | "worker";
	profileId?: string;
	reason?: string;
}

export interface LeadWorkflowResultSummary {
	taskId: string;
	accepted: boolean;
	producedArtifactKinds: string[];
	issues: string[];
}

export interface LeadConversationContextBudget {
	maxChars: number;
	usedChars: number;
	truncatedSections: string[];
}

export interface LeadConversationContext {
	sessionId: string;
	currentObjective: string;
	recentUserObjectives: string[];
	recentLeadOutputs: string[];
	recentDecisions: LeadDecisionSummary[];
	recentWorkflowResults: LeadWorkflowResultSummary[];
	priorArtifacts: ArtifactRef[];
	artifactBriefs: ArtifactBrief[];
	compactionSummary?: string;
	compactionDetails?: JsonObject;
	budget: LeadConversationContextBudget;
}

export interface BuildLeadConversationContextOptions {
	sessionManager: SessionManager;
	currentObjective: string;
	maxChars?: number;
}

const DEFAULT_MAX_CHARS = 12000;
const MAX_RECENT_MESSAGES = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromContent(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	const parts = content
		.filter((part): part is { type: "text"; text: string } => isRecord(part) && part.type === "text" && typeof part.text === "string")
		.map((part) => part.text);
	return parts.length > 0 ? parts.join("\n") : undefined;
}

function asArtifactRef(value: unknown): ArtifactRef | undefined {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string" || typeof value.uri !== "string") {
		return undefined;
	}
	return {
		id: value.id,
		kind: value.kind,
		uri: value.uri,
		title: typeof value.title === "string" ? value.title : undefined,
		mediaType: typeof value.mediaType === "string" ? value.mediaType : undefined,
	};
}

function customData(entry: SessionEntry): Record<string, unknown> | undefined {
	return entry.type === "custom" && isRecord(entry.data) ? entry.data : undefined;
}

function extractDecisions(branch: SessionEntry[]): LeadDecisionSummary[] {
	return branch
		.filter((entry) => entry.type === "custom" && entry.customType === "lead-agent.decision")
		.map(customData)
		.filter((data): data is Record<string, unknown> => data !== undefined)
		.flatMap((data) => {
			if (data.mode !== "direct" && data.mode !== "worker") return [];
			return [{
				taskId: typeof data.taskId === "string" ? data.taskId : undefined,
				mode: data.mode,
				profileId: typeof data.profileId === "string" ? data.profileId : undefined,
				reason: typeof data.reason === "string" ? data.reason : undefined,
			}];
		})
		.slice(-6);
}

function extractArtifacts(branch: SessionEntry[]): ArtifactRef[] {
	const artifacts = new Map<string, ArtifactRef>();
	for (const entry of branch) {
		const data = customData(entry);
		const produced = data?.producedArtifacts;
		if (!Array.isArray(produced)) continue;
		for (const item of produced) {
			const ref = asArtifactRef(item);
			if (ref) artifacts.set(ref.id, ref);
		}
	}
	return [...artifacts.values()];
}

function extractCompaction(branch: SessionEntry[]): { summary?: string; details?: JsonObject } {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry?.type !== "compaction") continue;
		return {
			summary: entry.summary,
			details: isRecord(entry.details) ? (entry.details as JsonObject) : undefined,
		};
	}
	return {};
}

function totalChars(context: Omit<LeadConversationContext, "budget">): number {
	return JSON.stringify(context).length;
}

function applyBudget(
	context: Omit<LeadConversationContext, "budget">,
	maxChars: number,
): LeadConversationContext {
	const truncatedSections: string[] = [];
	let next = { ...context };
	if (totalChars(next) > maxChars && next.recentLeadOutputs.length > 0) {
		next = { ...next, recentLeadOutputs: next.recentLeadOutputs.map((output) => output.slice(0, 240)) };
		truncatedSections.push("recentLeadOutputs");
	}
	if (totalChars(next) > maxChars && next.artifactBriefs.length > 0) {
		next = {
			...next,
			artifactBriefs: next.artifactBriefs.map((brief) => ({
				artifactId: brief.artifactId,
				kind: brief.kind,
				title: brief.title,
				brief: brief.brief.slice(0, 240),
			})),
		};
		truncatedSections.push("artifactBriefs");
	}
	return {
		...next,
		budget: {
			maxChars,
			usedChars: totalChars(next),
			truncatedSections,
		},
	};
}

export function buildLeadConversationContext(options: BuildLeadConversationContextOptions): LeadConversationContext {
	const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
	const sessionContext = options.sessionManager.buildSessionContext();
	const branch = options.sessionManager.getBranch();
	const recentUserObjectives = sessionContext.messages
		.filter((message) => message.role === "user")
		.flatMap((message) => textFromContent(message.content) ?? [])
		.slice(-MAX_RECENT_MESSAGES);
	const recentLeadOutputs = sessionContext.messages
		.filter((message) => message.role === "assistant")
		.flatMap((message) => textFromContent(message.content) ?? [])
		.slice(-MAX_RECENT_MESSAGES);
	const compaction = extractCompaction(branch);
	return applyBudget(
		{
			sessionId: options.sessionManager.getSessionId(),
			currentObjective: options.currentObjective,
			recentUserObjectives,
			recentLeadOutputs,
			recentDecisions: extractDecisions(branch),
			recentWorkflowResults: [],
			priorArtifacts: extractArtifacts(branch),
			artifactBriefs: [],
			compactionSummary: compaction.summary,
			compactionDetails: compaction.details,
		},
		maxChars,
	);
}
```

If `SessionEntry` is not exported from `@mariozechner/pi-agent-host`, import it from `@mariozechner/pi-agent-host/session-manager`.

- [ ] **Step 4: Export context module**

In `packages/lead-agent/src/orchestration/index.ts`, add:

```ts
export * from "./lead-context.js";
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/lead-context.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/lead-context.test.ts
git commit -m "feat(lead-agent): add conversation context adapter"
```

## Phase 2: Memory-Aware Orchestration

### Task 5: Extend Planner Input and Artifact Validation

**Files:**
- Modify: `packages/lead-agent/src/orchestration/types.ts`
- Modify: `packages/lead-agent/src/orchestration/intake.ts`
- Modify: `packages/lead-agent/src/orchestration/planner.ts`
- Modify: `packages/lead-agent/test/orchestration-planner.test.ts`

- [ ] **Step 1: Extend types**

In `types.ts`, import `LeadConversationContext` and add fields:

```ts
import type { LeadConversationContext } from "./lead-context.js";

export interface LeadTaskPlanningInput {
	taskId: string;
	sessionId: string;
	objective: string;
	constraints: string[];
	expectedOutputs: string[];
	inputArtifacts: ArtifactRef[];
	availableArtifactRefs: ArtifactRef[];
	profiles: readonly WorkerProfile[];
	artifactBriefs: ArtifactBrief[];
	conversationContext?: LeadConversationContext;
}

export interface PlannerValidationContext {
	profiles: readonly WorkerProfile[];
	templates: WorkflowTemplate[];
	inputArtifacts: ArtifactRef[];
	availableArtifactRefs?: ArtifactRef[];
}
```

- [ ] **Step 2: Build available artifact refs in intake**

In `intake.ts`, extend options:

```ts
import type { LeadConversationContext } from "./lead-context.js";

export interface CreateLeadTaskPlanningInputOptions {
	request: LeadAgentTaskRequest;
	taskId: string;
	sessionId: string;
	profiles: readonly WorkerProfile[];
	artifactBriefs?: ArtifactBrief[];
	conversationContext?: LeadConversationContext;
}
```

Set fields:

```ts
const inputArtifacts = options.request.inputArtifacts ?? [];
const contextArtifacts = options.conversationContext?.priorArtifacts ?? [];
return {
	...
	inputArtifacts,
	availableArtifactRefs: [...inputArtifacts, ...contextArtifacts],
	conversationContext: options.conversationContext,
};
```

- [ ] **Step 3: Validate available artifact refs**

In `planner.ts`, replace artifact id set construction:

```ts
const inputArtifactIds = new Set(
	(context.availableArtifactRefs ?? context.inputArtifacts).map((artifact) => artifact.id),
);
```

Keep error messages as artifact validation errors.

- [ ] **Step 4: Add planner validation tests**

In `orchestration-planner.test.ts`, add:

```ts
it("allows workflow steps to reference prior context artifacts", () => {
	const researcherProfile = DEFAULT_ACADEMIC_PROFILES.find((profile) => profile.id === "researcher")!;
	const errors = validateWorkflowPlan(
		{
			taskId: "task-context-artifacts",
			sessionId: "session-context-artifacts",
			mode: "workflow",
			rationale: "Use prior artifact.",
			userVisibleSummary: "Use prior artifact.",
			stopConditions: ["done"],
			steps: [
				{
					id: "step-1",
					order: 1,
					profileId: "researcher",
					objective: "Use prior artifact.",
					expectedOutputs: [],
					acceptanceCriteria: [],
					inputArtifactRefs: [{ id: "prior-1", kind: "literature-search-results", uri: "artifact://prior-1" }],
				},
			],
		},
		{
			profiles: [researcherProfile],
			templates: [],
			inputArtifacts: [],
			availableArtifactRefs: [{ id: "prior-1", kind: "literature-search-results", uri: "artifact://prior-1" }],
		},
	);

	expect(errors).toEqual([]);
});

it("rejects invented prior context artifact ids", () => {
	const researcherProfile = DEFAULT_ACADEMIC_PROFILES.find((profile) => profile.id === "researcher")!;
	const errors = validateWorkflowPlan(
		{
			taskId: "task-missing-context-artifacts",
			sessionId: "session-missing-context-artifacts",
			mode: "workflow",
			rationale: "Use missing artifact.",
			userVisibleSummary: "Use missing artifact.",
			stopConditions: ["done"],
			steps: [
				{
					id: "step-1",
					order: 1,
					profileId: "researcher",
					objective: "Use missing artifact.",
					expectedOutputs: [],
					acceptanceCriteria: [],
					inputArtifactRefs: [{ id: "missing-prior", kind: "literature-search-results", uri: "artifact://missing-prior" }],
				},
			],
		},
		{
			profiles: [researcherProfile],
			templates: [],
			inputArtifacts: [],
			availableArtifactRefs: [{ id: "prior-1", kind: "literature-search-results", uri: "artifact://prior-1" }],
		},
	);

	expect(errors.some((error) => error.includes("missing-prior"))).toBe(true);
});
```

Ensure imports include:

```ts
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
```

- [ ] **Step 5: Run planner tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/types.ts packages/lead-agent/src/orchestration/intake.ts packages/lead-agent/src/orchestration/planner.ts packages/lead-agent/test/orchestration-planner.test.ts
git commit -m "feat(lead-agent): validate planner context artifacts"
```

### Task 6: Inject Conversation Context into LLM Planner Prompt

**Files:**
- Modify: `packages/lead-agent/src/orchestration/llm-planner.ts`
- Modify: `packages/lead-agent/test/orchestration-llm-planner.test.ts`

- [ ] **Step 1: Export prompt builder for tests**

Change:

```ts
function buildUserMessage(input: LeadTaskPlanningInput, config: LlmWorkflowPlannerConfig): string {
```

to:

```ts
export function buildPlannerUserMessage(input: LeadTaskPlanningInput, config: LlmWorkflowPlannerConfig): string {
```

Update internal calls to use `buildPlannerUserMessage`.

- [ ] **Step 2: Add context formatter**

Add:

```ts
function formatConversationContext(input: LeadTaskPlanningInput): string {
	const context = input.conversationContext;
	if (!context) {
		return "none";
	}
	return [
		`Recent user objectives:\n${formatList(context.recentUserObjectives)}`,
		`Recent lead outputs:\n${formatList(context.recentLeadOutputs)}`,
		`Recent workflow results:\n${context.recentWorkflowResults.map((r) => `- ${r.taskId}: accepted=${r.accepted}; artifacts=${formatList(r.producedArtifactKinds)}; issues=${formatList(r.issues)}`).join("\n") || "none"}`,
		`Prior artifacts:\n${formatArtifacts(context.priorArtifacts)}`,
		`Artifact briefs:\n${context.artifactBriefs.map((brief) => `- ${brief.artifactId} (${brief.kind}): ${brief.brief}`).join("\n") || "none"}`,
		`Compaction summary:\n${context.compactionSummary ?? "none"}`,
	].join("\n");
}
```

Add this section before available profiles:

```ts
`Conversation context:\n${formatConversationContext(input)}`,
```

- [ ] **Step 3: Add continuity rules to system prompt**

Append to `SYSTEM_PROMPT`:

```text
- Before choosing direct/workflow mode, decide internally whether the current request is new_task, continue_previous_task, revise_previous_output, inspect_or_use_prior_artifact, or direct_followup.
- Prefer new_task unless clear lexical, artifact-reference, or instruction continuity exists.
- Artifact refs and briefs are pointers, not full artifact content.
```

- [ ] **Step 4: Add prompt test**

In `orchestration-llm-planner.test.ts`, add:

```ts
it("renders conversation context without full artifact content", () => {
	const faux = registerFauxProvider();
	try {
		const message = buildPlannerUserMessage(
			{
				taskId: "task-ctx",
				sessionId: "session-ctx",
				objective: "Continue with the prior literature results.",
				constraints: [],
				expectedOutputs: [],
				inputArtifacts: [],
				availableArtifactRefs: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
				profiles: [],
				artifactBriefs: [],
				conversationContext: {
					sessionId: "session-ctx",
					currentObjective: "Continue with the prior literature results.",
					recentUserObjectives: ["Find NIR literature."],
					recentLeadOutputs: ["Found representative sources."],
					recentDecisions: [],
					recentWorkflowResults: [],
					priorArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
					artifactBriefs: [{ artifactId: "artifact-1", kind: "literature-search-results", brief: "NIR literature search results." }],
					budget: { maxChars: 1000, usedChars: 100, truncatedSections: [] },
				},
			},
			{ model: faux.getModel(), templates: [], profiles: [] },
		);

		expect(message).toContain("Conversation context:");
		expect(message).toContain("Find NIR literature.");
		expect(message).toContain("artifact-1");
		expect(message).not.toContain("fullText");
	} finally {
		faux.unregister();
	}
});
```

Ensure the import list includes the exported builder:

```ts
import { buildPlannerUserMessage, createLlmWorkflowPlanner, PlannerValidationError } from "../src/orchestration/llm-planner.js";
```

- [ ] **Step 5: Run LLM planner tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-llm-planner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/llm-planner.ts packages/lead-agent/test/orchestration-llm-planner.test.ts
git commit -m "feat(lead-agent): inject memory into planner prompt"
```

### Task 7: Add WorkerContextPackage and Executor Injection

**Files:**
- Create: `packages/lead-agent/src/orchestration/worker-context.ts`
- Create: `packages/lead-agent/test/worker-context.test.ts`
- Modify: `packages/lead-agent/src/orchestration/executor.ts`
- Modify: `packages/lead-agent/src/orchestration/index.ts`
- Modify: `packages/lead-agent/test/orchestration-executor.test.ts`

- [ ] **Step 1: Write worker-context tests**

Create `test/worker-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWorkerContextPackage } from "../src/orchestration/worker-context.js";

describe("buildWorkerContextPackage", () => {
	it("derives a narrow worker context package", () => {
		const pkg = buildWorkerContextPackage({
			conversationContext: {
				sessionId: "session-1",
				currentObjective: "Use previous literature.",
				recentUserObjectives: ["Find NIR literature."],
				recentLeadOutputs: ["Found sources."],
				recentDecisions: [],
				recentWorkflowResults: [{ taskId: "task-1", accepted: true, producedArtifactKinds: ["literature-search-results"], issues: [] }],
				priorArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
				artifactBriefs: [{ artifactId: "artifact-1", kind: "literature-search-results", brief: "NIR search results." }],
				compactionSummary: "Earlier work searched NIR sources.",
				budget: { maxChars: 1000, usedChars: 100, truncatedSections: [] },
			},
			currentStepObjective: "Review prior literature.",
			inputArtifacts: [],
			maxChars: 1000,
		});

		expect(pkg.currentObjective).toBe("Use previous literature.");
		expect(pkg.currentStepObjective).toBe("Review prior literature.");
		expect(pkg.allowedArtifactIds).toContain("artifact-1");
		expect(JSON.stringify(pkg)).not.toContain("fullText");
	});
});
```

- [ ] **Step 2: Implement worker-context.ts**

Create:

```ts
import type { ArtifactBrief, ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { LeadConversationContext, LeadWorkflowResultSummary } from "./lead-context.js";

export interface WorkerContextPackage {
	currentObjective: string;
	currentStepObjective: string;
	relevantPriorObjectives: string[];
	relevantLeadOutputs: string[];
	relevantArtifacts: ArtifactRef[];
	allowedArtifactIds: string[];
	artifactBriefs: ArtifactBrief[];
	previousWorkflowResults: LeadWorkflowResultSummary[];
	compactionSummary?: string;
	budget: {
		maxChars: number;
		usedChars: number;
		truncatedSections: string[];
	};
}

export interface BuildWorkerContextPackageOptions {
	conversationContext?: LeadConversationContext;
	currentStepObjective: string;
	inputArtifacts: readonly ArtifactRef[];
	maxChars?: number;
}

const DEFAULT_MAX_CHARS = 8000;

function uniqueArtifacts(artifacts: readonly ArtifactRef[]): ArtifactRef[] {
	const byId = new Map<string, ArtifactRef>();
	for (const artifact of artifacts) {
		byId.set(artifact.id, artifact);
	}
	return [...byId.values()];
}

function usedChars(value: unknown): number {
	return JSON.stringify(value).length;
}

export function buildWorkerContextPackage(options: BuildWorkerContextPackageOptions): WorkerContextPackage {
	const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
	const context = options.conversationContext;
	const relevantArtifacts = uniqueArtifacts([...(context?.priorArtifacts ?? []), ...options.inputArtifacts]);
	let pkg: Omit<WorkerContextPackage, "budget"> = {
		currentObjective: context?.currentObjective ?? "",
		currentStepObjective: options.currentStepObjective,
		relevantPriorObjectives: context?.recentUserObjectives ?? [],
		relevantLeadOutputs: context?.recentLeadOutputs ?? [],
		relevantArtifacts,
		allowedArtifactIds: relevantArtifacts.map((artifact) => artifact.id),
		artifactBriefs: context?.artifactBriefs ?? [],
		previousWorkflowResults: context?.recentWorkflowResults ?? [],
		compactionSummary: context?.compactionSummary,
	};
	const truncatedSections: string[] = [];
	if (usedChars(pkg) > maxChars) {
		pkg = { ...pkg, relevantLeadOutputs: pkg.relevantLeadOutputs.map((output) => output.slice(0, 240)) };
		truncatedSections.push("relevantLeadOutputs");
	}
	if (usedChars(pkg) > maxChars) {
		pkg = {
			...pkg,
			artifactBriefs: pkg.artifactBriefs.map((brief) => ({
				artifactId: brief.artifactId,
				kind: brief.kind,
				title: brief.title,
				brief: brief.brief.slice(0, 240),
			})),
		};
		truncatedSections.push("artifactBriefs");
	}
	return {
		...pkg,
		budget: { maxChars, usedChars: usedChars(pkg), truncatedSections },
	};
}
```

- [ ] **Step 3: Export worker context module**

In `orchestration/index.ts`, add:

```ts
export * from "./worker-context.js";
```

- [ ] **Step 4: Inject package in executor**

In `executor.ts`, import:

```ts
import type { LeadConversationContext } from "./lead-context.js";
import { buildWorkerContextPackage } from "./worker-context.js";
```

Extend options:

```ts
conversationContext?: LeadConversationContext;
```

Before `workerRequestForStep(...)`:

```ts
const contextPackage = buildWorkerContextPackage({
	conversationContext: options.conversationContext,
	currentStepObjective: step.objective,
	inputArtifacts,
});
```

Pass metadata:

```ts
retrievedArtifacts
	? {
			...(options.metadata ?? {}),
			retrievedArtifacts,
			contextPackage,
		}
	: {
			...(options.metadata ?? {}),
			contextPackage,
		}
```

- [ ] **Step 5: Add executor test for metadata.contextPackage**

In `orchestration-executor.test.ts`, add:

```ts
it("passes worker context package through request metadata", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "lead-executor-worker-context-"));
	let seenRequest: WorkerRequest | undefined;
	try {
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-worker-context" });
		await executeWorkflowPlan({
			plan: {
				taskId: "task-worker-context",
				sessionId: "session-worker-context",
				objective: "Use previous result.",
				rationale: "Use prior context.",
				userVisibleSummary: "Use prior context.",
				mode: "workflow",
				steps: [
					{
						id: "step-1",
						order: 1,
						profileId: "researcher",
						objective: "Review prior artifact.",
						inputArtifactRefs: [],
						expectedArtifactKinds: [],
						expectedOutputs: [],
						acceptanceCriteria: [],
					},
				],
				stopConditions: ["done"],
			},
			profiles: DEFAULT_ACADEMIC_PROFILES,
			workspace,
			conversationContext: {
				sessionId: "session-worker-context",
				currentObjective: "Use previous result.",
				recentUserObjectives: ["Find NIR literature."],
				recentLeadOutputs: [],
				recentDecisions: [],
				recentWorkflowResults: [],
				priorArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
				artifactBriefs: [{ artifactId: "artifact-1", kind: "literature-search-results", brief: "NIR results." }],
				budget: { maxChars: 1000, usedChars: 100, truncatedSections: [] },
			},
			workerRunner: async (request) => {
				seenRequest = request;
				return {
					taskId: request.taskId,
					status: "success",
					summary: "done",
					structuredOutputs: {},
					producedArtifacts: [],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("worker-context"),
				};
			},
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}

	expect(seenRequest?.metadata?.contextPackage).toMatchObject({
		currentObjective: "Use previous result.",
		allowedArtifactIds: ["artifact-1"],
	});
});
```

Ensure imports include:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/worker-context.test.ts test/orchestration-executor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/worker-context.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/test/worker-context.test.ts packages/lead-agent/test/orchestration-executor.test.ts
git commit -m "feat(lead-agent): pass memory packages to workers"
```

### Task 8: Render Worker Context in Profile Worker Prompt

**Files:**
- Modify: `packages/lead-agent/src/workers/profile-worker-runner.ts`
- Modify: `packages/lead-agent/test/profile-worker-runner.test.ts`

- [ ] **Step 1: Export buildPrompt for tests**

Change:

```ts
function buildPrompt(request: WorkerRequest): string {
```

to:

```ts
export function buildProfileWorkerPrompt(request: WorkerRequest): string {
```

Update call site:

```ts
await session.prompt(buildProfileWorkerPrompt(request));
```

- [ ] **Step 2: Add context package formatter**

Add:

```ts
function formatContextPackage(request: WorkerRequest): string {
	const value = request.metadata?.contextPackage;
	if (!value || typeof value !== "object") {
		return "none";
	}
	return JSON.stringify(value, null, 2);
}
```

In prompt sections, add:

```ts
"## Lead Context Package",
formatContextPackage(request),
"",
```

- [ ] **Step 3: Add prompt test**

In `profile-worker-runner.test.ts`, add:

```ts
it("renders lead context package in worker prompt", () => {
	const prompt = buildProfileWorkerPrompt({
		taskId: "worker-context-prompt",
		workerType: "researcher",
		objective: "Use previous results.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs: [],
		acceptanceCriteria: [],
		metadata: {
			contextPackage: {
				currentObjective: "Use previous results.",
				currentStepObjective: "Review prior artifact.",
				allowedArtifactIds: ["artifact-1"],
			},
		},
	});

	expect(prompt).toContain("## Lead Context Package");
	expect(prompt).toContain("artifact-1");
	expect(prompt).toContain("Artifact refs and briefs");
});
```

If the last assertion is not present in the prompt, add this rule to `Final Response Rules`:

```ts
"- Artifact refs and briefs are pointers, not full artifact content.",
```

- [ ] **Step 4: Run test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/profile-worker-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/workers/profile-worker-runner.ts packages/lead-agent/test/profile-worker-runner.test.ts
git commit -m "feat(lead-agent): render worker memory context"
```

### Task 9: Build Lead Context in Runtime and Pass to Planner/Executor

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Import context builder**

In `index.ts`, add:

```ts
import { buildLeadConversationContext } from "./orchestration/lead-context.js";
```

- [ ] **Step 2: Build context in runImpl**

After appending the user message in `runImpl()`:

```ts
const conversationContext = buildLeadConversationContext({
	sessionManager,
	currentObjective: request.objective,
});
```

- [ ] **Step 3: Pass context to planning input**

Update:

```ts
const planningInput = createLeadTaskPlanningInput({
	request,
	taskId,
	sessionId,
	profiles,
	conversationContext,
});
```

- [ ] **Step 4: Pass context to executor**

In `executeWorkflowPlan(...)` call, add:

```ts
conversationContext,
```

- [ ] **Step 5: Add runtime test**

In `lead-agent.test.ts`, add:

```ts
it("passes session-derived context into workflow planning", async () => {
	let sawContext = false;
	const sessionManager = SessionManager.inMemory("/tmp/lead-runtime-context");
	sessionManager.appendMessage({
		role: "user",
		content: [{ type: "text", text: "Find NIR literature." }],
		timestamp: Date.now(),
	});
	sessionManager.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "Found preliminary NIR sources." }],
		api: "lead-agent",
		provider: "lead-agent",
		model: "lead-agent-synthesis",
		timestamp: Date.now(),
		usage: { input: 0, output: 0 },
	});
	const runtime = createLeadAgentRuntime({
		sessionManager,
		workflowPlanner: {
			async plan(input) {
				sawContext = input.conversationContext?.recentUserObjectives.includes("Find NIR literature.") ?? false;
				return {
					taskId: input.taskId,
					sessionId: input.sessionId,
					mode: "direct",
					rationale: "Direct follow-up.",
					userVisibleSummary: "Direct follow-up.",
					steps: [],
					stopConditions: ["answered"],
				};
			},
		},
		directRunner: async () => "done",
	});

	await runtime.run({ objective: "Continue that work." });

	expect(sawContext).toBe(true);
});
```

- [ ] **Step 6: Run test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): build runtime working memory"
```

### Task 10: Direct Runner Weak Unification

**Files:**
- Modify: `packages/lead-agent/src/prompts.ts`
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Extend direct prompt API**

In `prompts.ts`, import:

```ts
import type { LeadConversationContext } from "./orchestration/lead-context.js";
```

Add:

```ts
export interface BuildLeadDirectMessageOptions {
	conversationContext?: LeadConversationContext;
}
```

Change signature:

```ts
export function buildLeadDirectMessage(
	request: LeadDirectMessageOptions,
	options: BuildLeadDirectMessageOptions = {},
): string {
```

- [ ] **Step 2: Render context section**

Add helper:

```ts
function formatDirectConversationContext(context: LeadConversationContext | undefined): string | undefined {
	if (!context) return undefined;
	return [
		"Lead Conversation Context:",
		`Recent user objectives: ${context.recentUserObjectives.join("; ") || "none"}`,
		`Recent lead outputs: ${context.recentLeadOutputs.join("; ") || "none"}`,
		`Prior artifacts: ${context.priorArtifacts.map((artifact) => `${artifact.id} (${artifact.kind})`).join(", ") || "none"}`,
		`Compaction summary: ${context.compactionSummary ?? "none"}`,
		"",
		"Context rules:",
		"- Use prior context only when directly relevant.",
		"- Treat artifact refs and briefs as pointers, not full artifact content.",
		"- If this request is unrelated to prior context, answer as a new task.",
	].join("\n");
}
```

Before return:

```ts
const contextText = formatDirectConversationContext(options.conversationContext);
if (contextText) {
	parts.push(contextText);
}
```

- [ ] **Step 3: Update direct runner request path**

In `index.ts`, extend direct runner request type if needed by adding `conversationContext?: LeadConversationContext` to the direct internal request object.

When calling:

```ts
await cachedSession.prompt(buildLeadDirectMessage(request, { conversationContext: request.conversationContext }));
```

When invoking direct synthesis, pass the `conversationContext` built in `runImpl()`.

- [ ] **Step 4: Add prompt test**

In `lead-agent.test.ts`, add:

```ts
it("includes conversation context in direct prompt", () => {
	const prompt = buildLeadDirectMessage(
		{ objective: "Continue." },
		{
			conversationContext: {
				sessionId: "session-direct-context",
				currentObjective: "Continue.",
				recentUserObjectives: ["Find NIR literature."],
				recentLeadOutputs: ["Found preliminary sources."],
				recentDecisions: [],
				recentWorkflowResults: [],
				priorArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
				artifactBriefs: [],
				budget: { maxChars: 1000, usedChars: 100, truncatedSections: [] },
			},
		},
	);

	expect(prompt).toContain("Lead Conversation Context:");
	expect(prompt).toContain("Find NIR literature.");
	expect(prompt).toContain("artifact-1");
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/prompts.ts packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): include memory in direct prompt"
```

## Phase 3: Session Authority

### Task 11: Add DirectRunContext Boundary

**Files:**
- Modify: `packages/lead-agent/src/orchestration/types.ts`
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add DirectRunContext type**

In `types.ts` or `index.ts`, define:

```ts
export interface DirectRunContext {
	conversationContext?: LeadConversationContext;
	model?: LeadAgentModel;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	noTools?: "all" | "builtin";
}
```

Update direct runner type:

```ts
export type LeadAgentDirectRunner = (
	request: LeadAgentTaskRequest,
	context: DirectRunContext,
) => Promise<string>;
```

If `LeadAgentModel` and `ThinkingLevel` currently live in `index.ts`, keep this type in `index.ts` to avoid circular imports.

- [ ] **Step 2: Update all directRunner call sites**

Change:

```ts
const finalOutput = await directRunner(request);
```

to:

```ts
const finalOutput = await directRunner(request, {
	conversationContext,
	model: modelRef.value,
	thinkingLevel: thinkingLevelRef.value,
	tools: toolsRef.value,
	noTools: noToolsRef.value,
});
```

- [ ] **Step 3: Update tests with directRunner callbacks**

Find tests:

```bash
rg -n "directRunner: async" packages/lead-agent/test
```

Update callbacks from:

```ts
directRunner: async () => "done",
```

to:

```ts
directRunner: async (_request, _context) => "done",
```

- [ ] **Step 4: Add direct context type test**

In `lead-agent.test.ts`, add:

```ts
it("passes DirectRunContext to injected direct runner", async () => {
	let seenContext: DirectRunContext | undefined;
	const runtime = createLeadAgentRuntime({
		directRunner: async (_request, context) => {
			seenContext = context;
			return "done";
		},
	});

	await runtime.run({ objective: "Answer directly.", dispatchMode: "direct" });

	expect(seenContext).toBeDefined();
	expect(seenContext?.conversationContext?.currentObjective).toBe("Answer directly.");
});
```

- [ ] **Step 5: Run test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): add direct run context boundary"
```

### Task 12: Remove Long-Lived Cached Direct Session

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add no cached session regression test**

In `lead-agent.test.ts`, add:

```ts
it("does not rely on cached direct session across direct runs", async () => {
	const sessionManager = SessionManager.inMemory("/tmp/lead-direct-authority");
	const runtime = createLeadAgentRuntime({
		sessionManager,
		directRunner: async (request, context) => `${request.objective}:${context.conversationContext?.recentUserObjectives.length ?? 0}`,
	});

	await runtime.run({ objective: "First direct run.", dispatchMode: "direct" });
	await runtime.run({ objective: "Second direct run.", dispatchMode: "direct" });

	const branch = sessionManager.getBranch();
	const userMessages = branch.filter((entry) => entry.type === "message" && entry.message.role === "user");
	const assistantMessages = branch.filter((entry) => entry.type === "message" && entry.message.role === "assistant");
	expect(userMessages).toHaveLength(2);
	expect(assistantMessages).toHaveLength(2);
});
```

- [ ] **Step 2: Refactor createDefaultDirectRunner**

Remove:

```ts
let cachedSession: Awaited<ReturnType<typeof createAgentHostSession>>["session"] | undefined;
```

Inside returned function, create a per-call session:

```ts
const { session } = await createAgentHostSession({
	cwd,
	model: context.model ?? modelRef.value,
	thinkingLevel: context.thinkingLevel ?? thinkingLevelRef.value,
	tools: context.tools ?? toolsRef.value,
	noTools: context.tools ?? toolsRef.value ? undefined : (context.noTools ?? noToolsRef.value),
	resourceLoaderOptions: {
		systemPromptOverride: () => LEAD_AGENT_SYSTEM_PROMPT,
	},
	sessionManager: SessionManager.inMemory(cwd),
});
```

Then use:

```ts
await session.prompt(buildLeadDirectMessage(request, { conversationContext: context.conversationContext }));
const text = extractLastAssistantText(session.messages as readonly { role: string; content: unknown }[]);
```

Keep event subscription on this per-call session.

- [ ] **Step 3: Remove resetRef use for direct cache**

If `resetRef` is now unused in direct runner, remove it from `createDefaultDirectRunner()` parameters and call sites. Keep model/thinking setters updating refs.

- [ ] **Step 4: Run lead-agent tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "refactor(lead-agent): make direct runner per-call"
```

## Phase 4: Compaction

### Task 13: Recognize Generic Compaction in LeadConversationContext

**Files:**
- Modify: `packages/lead-agent/src/orchestration/lead-context.ts`
- Modify: `packages/lead-agent/test/lead-context.test.ts`

- [ ] **Step 1: Add compaction recognition tests**

In `lead-context.test.ts`, add:

```ts
it("extracts compaction summary without treating it as lead output", () => {
	const sessionManager = SessionManager.inMemory("/tmp/lead-context-compaction");
	const userId = sessionManager.appendMessage({
		role: "user",
		content: [{ type: "text", text: "Original task." }],
		timestamp: Date.now(),
	});
	sessionManager.appendCompaction(
		"Compacted academic history.",
		userId,
		1200,
		{ kind: "custom-compaction", retained: true },
		true,
	);

	const context = buildLeadConversationContext({
		sessionManager,
		currentObjective: "Continue.",
	});

	expect(context.compactionSummary).toBe("Compacted academic history.");
	expect(context.compactionDetails).toEqual({ kind: "custom-compaction", retained: true });
	expect(context.recentLeadOutputs).not.toContain("Compacted academic history.");
});
```

- [ ] **Step 2: Update extraction logic**

If not already passing, update `extractCompaction()` in `lead-context.ts` to preserve:

```ts
return {
	summary: entry.summary,
	details: isRecord(entry.details) ? (entry.details as JsonObject) : undefined,
};
```

Ensure `recentLeadOutputs` filters out messages with role `"compactionSummary"` if `buildSessionContext()` emits those as messages:

```ts
.filter((message) => message.role === "assistant")
```

Keep it assistant-only so compaction summary messages are excluded.

- [ ] **Step 3: Run context tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-context.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/lead-context.ts packages/lead-agent/test/lead-context.test.ts
git commit -m "feat(lead-agent): recognize session compaction memory"
```

### Task 14: Add Academic Compaction Details Builder

**Files:**
- Create: `packages/lead-agent/src/orchestration/academic-compaction.ts`
- Create: `packages/lead-agent/test/academic-compaction.test.ts`
- Modify: `packages/lead-agent/src/orchestration/index.ts`

- [ ] **Step 1: Write academic compaction tests**

Create `academic-compaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAcademicCompactionDetails } from "../src/orchestration/academic-compaction.js";

describe("buildAcademicCompactionDetails", () => {
	it("builds structured academic compaction details without full artifact content", () => {
		const details = buildAcademicCompactionDetails({
			context: {
				sessionId: "session-compact",
				currentObjective: "Continue NIR review.",
				recentUserObjectives: ["Find NIR literature."],
				recentLeadOutputs: ["Accepted final output."],
				recentDecisions: [],
				recentWorkflowResults: [{ taskId: "task-1", accepted: true, producedArtifactKinds: ["literature-search-results"], issues: [] }],
				priorArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1", title: "NIR results" }],
				artifactBriefs: [{ artifactId: "artifact-1", kind: "literature-search-results", brief: "NIR search results.", keyFindings: ["finding"], limitations: ["gap"] }],
				budget: { maxChars: 1000, usedChars: 100, truncatedSections: [] },
			},
		});

		expect(details.kind).toBe("lead-agent.academic-compaction");
		expect(details.version).toBe("v1");
		expect(details.artifactLineage[0]?.artifactId).toBe("artifact-1");
		expect(JSON.stringify(details)).not.toContain("fullText");
	});
});
```

- [ ] **Step 2: Implement academic-compaction.ts**

Create:

```ts
import type { JsonObject } from "@mariozechner/pi-agent-contracts";
import type { LeadConversationContext, LeadWorkflowResultSummary } from "./lead-context.js";

export interface AcademicCompactionDetails extends JsonObject {
	kind: "lead-agent.academic-compaction";
	version: "v1";
	researchObjective?: string;
	lastAcceptedFinalOutput?: string;
	artifactLineage: Array<{
		artifactId: string;
		kind: string;
		title?: string;
		producedByTaskId?: string;
		producedByStepId?: string;
		sourceArtifactIds: string[];
	}>;
	acceptedWorkflowResults: LeadWorkflowResultSummary[];
	claimEvidenceMap?: Array<{
		claim: string;
		supportStatus: "supported" | "weak" | "unsupported" | "unknown";
		artifactIds: string[];
		notes?: string;
	}>;
	unresolvedIssues: string[];
	openQuestions: string[];
	retrievalGaps: string[];
	pendingOutputContracts: string[];
}

export interface BuildAcademicCompactionDetailsOptions {
	context: LeadConversationContext;
}

export function buildAcademicCompactionDetails(
	options: BuildAcademicCompactionDetailsOptions,
): AcademicCompactionDetails {
	const context = options.context;
	return {
		kind: "lead-agent.academic-compaction",
		version: "v1",
		researchObjective: context.currentObjective,
		lastAcceptedFinalOutput: context.recentLeadOutputs.at(-1),
		artifactLineage: context.priorArtifacts.map((artifact) => ({
			artifactId: artifact.id,
			kind: artifact.kind,
			title: artifact.title,
			sourceArtifactIds: [],
		})),
		acceptedWorkflowResults: context.recentWorkflowResults.filter((result) => result.accepted),
		unresolvedIssues: context.recentWorkflowResults.flatMap((result) => result.issues),
		openQuestions: [],
		retrievalGaps: context.artifactBriefs.flatMap((brief) => brief.limitations ?? []),
		pendingOutputContracts: [],
	};
}

export function buildAcademicCompactionSummary(details: AcademicCompactionDetails): string {
	return [
		`Research objective: ${details.researchObjective ?? "unspecified"}`,
		`Artifacts retained: ${details.artifactLineage.length}`,
		`Accepted workflows retained: ${details.acceptedWorkflowResults.length}`,
		`Open questions retained: ${details.openQuestions.length}`,
		`Retrieval gaps retained: ${details.retrievalGaps.length}`,
	].join("\n");
}
```

- [ ] **Step 3: Export module**

In `orchestration/index.ts`, add:

```ts
export * from "./academic-compaction.js";
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-compaction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/orchestration/academic-compaction.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/academic-compaction.test.ts
git commit -m "feat(lead-agent): add academic compaction details"
```

### Task 15: Add Manual `/compact academic` Command

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/src/modes/interactive-loop.ts`
- Modify: `packages/lead-agent/src/modes/tui/lead-tui-mode.ts`
- Modify: `packages/lead-agent/test/interactive-loop.test.ts`
- Modify: `packages/lead-agent/test/tui-smoke.test.ts`

- [ ] **Step 1: Add runtime compact method**

Extend `LeadAgentRuntime` interface:

```ts
compactAcademic(): Promise<{ summary: string; artifactCount: number; acceptedWorkflowCount: number; openQuestionCount: number; retrievalGapCount: number }>;
```

Implement in `createLeadAgentRuntime()`:

```ts
async function compactAcademic() {
	const context = buildLeadConversationContext({
		sessionManager,
		currentObjective: "",
	});
	const details = buildAcademicCompactionDetails({ context });
	const summary = buildAcademicCompactionSummary(details);
	const branch = sessionManager.getBranch();
	const firstKeptEntryId = branch.at(-1)?.id ?? sessionManager.appendCustomEntry("lead-agent.compaction-anchor", {});
	sessionManager.appendCompaction(summary, firstKeptEntryId, context.budget.usedChars, details, true);
	return {
		summary,
		artifactCount: details.artifactLineage.length,
		acceptedWorkflowCount: details.acceptedWorkflowResults.length,
		openQuestionCount: details.openQuestions.length,
		retrievalGapCount: details.retrievalGaps.length,
	};
}
```

Add `compactAcademic` to returned runtime object.

- [ ] **Step 2: Add readline slash command**

In `interactive-loop.ts`, handle:

```ts
if (line === "/compact academic" || line === "/compact") {
	const result = await options.runtime.compactAcademic();
	stdout(
		[
			"academic compaction written",
			`artifacts: ${result.artifactCount}`,
			`accepted-workflows: ${result.acceptedWorkflowCount}`,
			`open-questions: ${result.openQuestionCount}`,
			`retrieval-gaps: ${result.retrievalGapCount}`,
			"",
		].join("\n"),
	);
	continue;
}
```

- [ ] **Step 3: Add TUI slash command**

In `lead-tui-mode.ts`, add case:

```ts
case "compact":
	if (value && value !== "academic") {
		footer.setText(theme.error("compact supports: /compact academic"));
		break;
	}
	options.runtime
		.compactAcademic()
		.then((result) => {
			chatContainer.addChild(
				new Text(
					theme.dim(
						[
							"academic compaction written",
							`artifacts: ${result.artifactCount}`,
							`accepted-workflows: ${result.acceptedWorkflowCount}`,
							`open-questions: ${result.openQuestionCount}`,
							`retrieval-gaps: ${result.retrievalGapCount}`,
						].join("\n"),
					),
					1,
					0,
				),
			);
			tui.requestRender();
		})
		.catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			footer.setText(theme.error(message));
			tui.requestRender();
		});
	break;
```

- [ ] **Step 4: Add interactive loop test**

In `interactive-loop.test.ts`, add:

```ts
it("runs manual academic compaction command", async () => {
	const stdout: string[] = [];
	const runtime = createLeadAgentRuntime();

	const exitCode = await runLeadInteractiveLoop({
		runtime,
		inputs: ["/compact academic", "/exit"],
		stdout: (text) => stdout.push(text),
		stderr: () => {},
	});

	expect(exitCode).toBe(0);
	expect(stdout.join("")).toContain("academic compaction written");
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-loop.test.ts test/tui-smoke.test.ts test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit phase checkpoint**

```bash
git status --short
git add packages/lead-agent/src/index.ts packages/lead-agent/src/modes/interactive-loop.ts packages/lead-agent/src/modes/tui/lead-tui-mode.ts packages/lead-agent/test/interactive-loop.test.ts packages/lead-agent/test/tui-smoke.test.ts
git commit -m "feat(lead-agent): add manual academic compaction"
```

## Final Verification

### Task 16: Run Full Lead-Agent Suite and Repo Check

**Files:**
- Modify: `packages/lead-agent/CHANGELOG.md`

- [ ] **Step 1: Update changelog**

Under `packages/lead-agent/CHANGELOG.md` `## [Unreleased]` / `### Added`, append:

```md
- Added lead-agent working memory context, planner/worker context injection, direct-runner context support, and manual academic compaction.
```

Under `### Changed`, append or create:

```md
- Changed profile worker success inference to leave contract satisfaction to acceptance checks instead of requiring artifacts for every profile.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run \
  test/orchestration-executor.test.ts \
  test/orchestration-contract-acceptance.test.ts \
  test/profile-worker-runner.test.ts \
  test/lead-context.test.ts \
  test/worker-context.test.ts \
  test/orchestration-planner.test.ts \
  test/orchestration-llm-planner.test.ts \
  test/lead-agent.test.ts \
  test/academic-compaction.test.ts \
  test/interactive-loop.test.ts \
  test/tui-smoke.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 3: Run package check**

Run:

```bash
cd packages/lead-agent
npm run check
```

Expected: typecheck passes.

- [ ] **Step 4: Run repo check**

Run from repo root:

```bash
cd /Users/liuruixi/Documents/Code/pi-mono
npm run check
```

Expected: `biome check`, `tsgo --noEmit`, browser smoke, and web-ui checks all pass.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only files touched by this plan plus pre-existing unrelated untracked docs appear.

- [ ] **Step 6: Final commit**

Only if user approved commits:

```bash
git add packages/lead-agent/CHANGELOG.md
git commit -m "docs(lead-agent): document working memory changes"
```

If implementation changes remain uncommitted because task commits were skipped, add only the touched implementation files explicitly and commit:

```bash
git add packages/lead-agent/src/orchestration/lead-context.ts
git add packages/lead-agent/src/orchestration/worker-context.ts
git add packages/lead-agent/src/orchestration/academic-compaction.ts
git add packages/lead-agent/src/orchestration/index.ts
git add packages/lead-agent/src/orchestration/types.ts
git add packages/lead-agent/src/orchestration/intake.ts
git add packages/lead-agent/src/orchestration/planner.ts
git add packages/lead-agent/src/orchestration/llm-planner.ts
git add packages/lead-agent/src/orchestration/executor.ts
git add packages/lead-agent/src/workers/profile-worker-runner.ts
git add packages/lead-agent/src/prompts.ts
git add packages/lead-agent/src/index.ts
git add packages/lead-agent/src/modes/interactive-loop.ts
git add packages/lead-agent/src/modes/tui/lead-tui-mode.ts
git add packages/lead-agent/test/lead-context.test.ts
git add packages/lead-agent/test/worker-context.test.ts
git add packages/lead-agent/test/academic-compaction.test.ts
git add packages/lead-agent/test/orchestration-executor.test.ts
git add packages/lead-agent/test/orchestration-contract-acceptance.test.ts
git add packages/lead-agent/test/profile-worker-runner.test.ts
git add packages/lead-agent/test/orchestration-planner.test.ts
git add packages/lead-agent/test/orchestration-llm-planner.test.ts
git add packages/lead-agent/test/lead-agent.test.ts
git add packages/lead-agent/test/interactive-loop.test.ts
git add packages/lead-agent/test/tui-smoke.test.ts
git add packages/lead-agent/CHANGELOG.md
git commit -m "feat(lead-agent): add academic working memory"
```

## Execution Notes

- Run all Vitest commands from `packages/lead-agent`.
- Run `npm run check` from repo root after code changes.
- Never run `npm run dev`, `npm run build`, or `npm test`.
- Do not use real provider APIs in tests.
- Do not load full artifact content in `lead-context.ts` or `worker-context.ts`.
- Preserve unrelated untracked docs and unrelated workspace changes.
