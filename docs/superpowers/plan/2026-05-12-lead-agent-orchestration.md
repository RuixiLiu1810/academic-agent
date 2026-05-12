# Lead Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a schema-validated, artifact-aware academic workflow orchestrator for `packages/lead-agent`.

**Architecture:** `lead-agent` selects a candidate template, asks an injectable planner to review/adapt it into a structured `WorkflowPlan`, then a deterministic executor dispatches worker steps, persists artifacts in one session-scoped workspace, and synthesizes the final user-facing answer from summaries and artifact briefs. `agent-host` remains product-agnostic; `coding-agent` remains a worker.

**Tech Stack:** TypeScript, npm workspaces, Vitest via `npx tsx ../../node_modules/vitest/dist/cli.js --run ...`, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, `@mariozechner/pi-agent-host`.

---

## Source Spec

Implement this plan against:

- `docs/superpowers/specs/2026-05-12-lead-agent-orchestration-design.md`

## Repository Rules

- Do not use `git add .` or `git add -A`.
- Stage only files changed by the current task.
- After code changes, run `npm run check`.
- If a task creates or modifies a test file, run that specific test from the package root.
- Do not run `npm test`, `npm run build`, or `npm run dev`.
- Do not put academic orchestration into `packages/agent-host`.

## Working Tree Preflight

The repository may contain unrelated or previous-phase edits. Before implementing this plan:

- [ ] Run `git status --short`.
- [ ] Confirm whether previous boundary-migration changes should be committed, kept, or moved to a separate branch.
- [ ] Do not stage existing unrelated files while implementing this plan.

## File Structure

Create or modify these files:

- Modify: `packages/agent-contracts/src/index.ts`
  - Add workflow and artifact-brief contracts, schemas, and helpers.
- Modify: `packages/agent-contracts/test/contracts.test.ts`
  - Add serialization and validation tests for workflow contracts.
- Create: `packages/lead-agent/src/orchestration/types.ts`
  - Lead-local orchestration runtime types and planner/executor interfaces.
- Create: `packages/lead-agent/src/orchestration/intake.ts`
  - Normalize user task requests into task context.
- Create: `packages/lead-agent/src/orchestration/templates.ts`
  - Candidate template selection and built-in template definitions.
- Create: `packages/lead-agent/src/orchestration/planner.ts`
  - Injectable planner interface, faux planner, plan validation.
- Create: `packages/lead-agent/src/orchestration/workspace.ts`
  - Session-scoped artifact workspace and persistence helpers.
- Create: `packages/lead-agent/src/orchestration/acceptance.ts`
  - Move lead worker acceptance logic out of `src/index.ts`.
- Create: `packages/lead-agent/src/orchestration/executor.ts`
  - Sequential workflow step executor and step decision logic.
- Create: `packages/lead-agent/src/orchestration/synthesis.ts`
  - Final output construction from accepted summaries and artifact briefs.
- Create: `packages/lead-agent/src/orchestration/index.ts`
  - Public exports for orchestration modules.
- Modify: `packages/lead-agent/src/index.ts`
  - Wire runtime to the new planner/executor while preserving current public API.
- Modify: `packages/lead-agent/src/cli/args.ts`
  - Add `--confirm-plan` if not already present.
- Modify: `packages/lead-agent/src/cli/run.ts`
  - Pass artifact workspace and confirm-plan options into runtime.
- Modify: `packages/lead-agent/src/cli/artifacts.ts`
  - Replace one-shot artifact persistence with session workspace persistence.
- Modify: `packages/lead-agent/src/academic-smoke.ts`
  - Upgrade smoke cases to multi-step workflows.
- Add tests under `packages/lead-agent/test/`:
  - `orchestration-planner.test.ts`
  - `orchestration-workspace.test.ts`
  - `orchestration-executor.test.ts`
  - Update `lead-agent.test.ts`, `cli-run.test.ts`, `cli-artifacts.test.ts`, `academic-smoke.test.ts`.

## Task 1: Add Workflow Contracts

**Files:**
- Modify: `packages/agent-contracts/src/index.ts`
- Modify: `packages/agent-contracts/test/contracts.test.ts`

- [ ] **Step 1: Write contract tests**

Append tests to `packages/agent-contracts/test/contracts.test.ts`:

```ts
import {
	createWorkflowPlan,
	isWorkflowPlan,
	type WorkflowPlan,
	type ArtifactBrief,
} from "../src/index.js";

it("round-trips workflow plans", () => {
	const plan = createWorkflowPlan({
		taskId: "task-1",
		sessionId: "session-1",
		objective: "Audit citation support.",
		rationale: "Citation support is separable from final writing.",
		userVisibleSummary: "I will audit citations, then synthesize the result.",
		mode: "workflow",
		steps: [
			{
				id: "citation-audit",
				order: 1,
				profileId: "citation-checker",
				objective: "Identify unsupported claims.",
				inputArtifactRefs: [],
				expectedArtifactKinds: ["claim-audit"],
				expectedOutputs: ["citation audit"],
				acceptanceCriteria: ["Unsupported claims are identified"],
			},
		],
		stopConditions: ["Accepted citation audit is available"],
	});

	expect(isWorkflowPlan(plan)).toBe(true);
	expect(JSON.parse(JSON.stringify(plan))).toMatchObject<WorkflowPlan>({
		taskId: "task-1",
		sessionId: "session-1",
		mode: "workflow",
		steps: [{ profileId: "citation-checker" }],
	});
});

it("round-trips artifact briefs", () => {
	const brief: ArtifactBrief = {
		artifactId: "artifact-1",
		kind: "claim-audit",
		title: "Citation audit",
		brief: "Two claims need citation support.",
		keyFindings: ["Claim A lacks a source"],
		limitations: ["Full bibliography was not supplied"],
	};

	expect(JSON.parse(JSON.stringify(brief))).toEqual(brief);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run from `packages/agent-contracts`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: FAIL with missing `createWorkflowPlan`, `isWorkflowPlan`, `WorkflowPlan`, or `ArtifactBrief`.

- [ ] **Step 3: Add contract types and helpers**

In `packages/agent-contracts/src/index.ts`, add:

```ts
export interface ArtifactBrief {
	artifactId: string;
	kind: string;
	title?: string;
	brief: string;
	keyFindings?: string[];
	limitations?: string[];
}

export interface WorkflowClarification {
	question: string;
	reason: string;
	blocksExecution: boolean;
}

export type WorkflowPlanMode = "direct" | "workflow";

export interface WorkflowStep {
	id: string;
	order: number;
	profileId: string;
	objective: string;
	inputArtifactRefs: ArtifactRef[];
	expectedArtifactKinds: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	budget?: WorkerBudget;
}

export interface WorkflowPlan {
	taskId: string;
	sessionId: string;
	objective: string;
	rationale: string;
	userVisibleSummary: string;
	mode: WorkflowPlanMode;
	steps: WorkflowStep[];
	stopConditions: string[];
	requiresClarification?: WorkflowClarification;
}

export type StepDecisionKind = "continue" | "retry" | "ask_user" | "stop" | "synthesize";

export interface StepDecision {
	kind: StepDecisionKind;
	reason: string;
	question?: string;
}

export interface WorkflowStepResult {
	step: WorkflowStep;
	workerRequest?: WorkerRequest;
	workerResult?: WorkerResult;
	artifactBriefs: ArtifactBrief[];
	acceptanceReport?: AcceptanceReport;
	decision: StepDecision;
}

export function createWorkflowPlan(input: WorkflowPlan): WorkflowPlan {
	return input;
}

export function isWorkflowPlan(value: unknown): value is WorkflowPlan {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<WorkflowPlan>;
	return (
		typeof candidate.taskId === "string" &&
		typeof candidate.sessionId === "string" &&
		typeof candidate.objective === "string" &&
		typeof candidate.rationale === "string" &&
		typeof candidate.userVisibleSummary === "string" &&
		(candidate.mode === "direct" || candidate.mode === "workflow") &&
		Array.isArray(candidate.steps) &&
		Array.isArray(candidate.stopConditions)
	);
}
```

Also extend `WorkerResult`:

```ts
artifactBriefs?: ArtifactBrief[];
```

- [ ] **Step 4: Add JSON schema exports**

Add schema constants in `packages/agent-contracts/src/index.ts`:

```ts
export const ArtifactBriefSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/artifact-brief.json",
	title: "ArtifactBrief",
	type: "object",
	required: ["artifactId", "kind", "brief"],
	properties: {
		artifactId: { type: "string" },
		kind: { type: "string" },
		title: { type: "string" },
		brief: { type: "string" },
		keyFindings: stringArraySchema,
		limitations: stringArraySchema,
	},
	additionalProperties: false,
};

export const WorkflowStepSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/workflow-step.json",
	title: "WorkflowStep",
	type: "object",
	required: [
		"id",
		"order",
		"profileId",
		"objective",
		"inputArtifactRefs",
		"expectedArtifactKinds",
		"expectedOutputs",
		"acceptanceCriteria",
	],
	properties: {
		id: { type: "string" },
		order: { type: "number" },
		profileId: { type: "string" },
		objective: { type: "string" },
		inputArtifactRefs: { type: "array", items: ArtifactRefSchema },
		expectedArtifactKinds: stringArraySchema,
		expectedOutputs: stringArraySchema,
		acceptanceCriteria: stringArraySchema,
		budget: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const WorkflowPlanSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/workflow-plan.json",
	title: "WorkflowPlan",
	type: "object",
	required: ["taskId", "sessionId", "objective", "rationale", "userVisibleSummary", "mode", "steps", "stopConditions"],
	properties: {
		taskId: { type: "string" },
		sessionId: { type: "string" },
		objective: { type: "string" },
		rationale: { type: "string" },
		userVisibleSummary: { type: "string" },
		mode: { enum: ["direct", "workflow"] },
		steps: { type: "array", items: WorkflowStepSchema },
		stopConditions: stringArraySchema,
		requiresClarification: jsonObjectSchema,
	},
	additionalProperties: false,
};
```

Update `WorkerResultSchema.properties`:

```ts
artifactBriefs: { type: "array", items: ArtifactBriefSchema },
```

- [ ] **Step 5: Run the contract test**

Run:

```bash
cd packages/agent-contracts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit contract changes**

```bash
git status --short
git add packages/agent-contracts/src/index.ts packages/agent-contracts/test/contracts.test.ts
git commit -m "feat(agent-contracts): add workflow orchestration contracts"
```

## Task 2: Add Session Artifact Workspace

**Files:**
- Create: `packages/lead-agent/src/orchestration/workspace.ts`
- Create: `packages/lead-agent/test/orchestration-workspace.test.ts`

- [ ] **Step 1: Write workspace tests**

Create `packages/lead-agent/test/orchestration-workspace.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-workspace-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("createLeadSessionWorkspace", () => {
	it("creates a default session-scoped workspace", () => {
		const cwd = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });

		expect(workspace.rootDir).toBe(join(cwd, ".lead-agent", "artifacts", "sessions", "session-1"));
		expect(existsSync(workspace.rootDir)).toBe(true);
		expect(existsSync(workspace.manifestPath)).toBe(true);
	});

	it("uses a provided artifact directory as the session workspace root", () => {
		const cwd = makeTempDir();
		const artifactDir = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1", artifactDir });

		expect(workspace.rootDir).toBe(artifactDir);
		expect(existsSync(workspace.manifestPath)).toBe(true);
	});

	it("writes task plans, step files, artifact briefs, and final output", () => {
		const cwd = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });
		const taskDir = workspace.ensureTaskDir("task-1");

		workspace.writeTaskJson("task-1", "workflow-plan.json", { taskId: "task-1" });
		workspace.writeStepJson("task-1", 1, "reviewer", "worker-result.json", { status: "success" });
		workspace.writeStepJson("task-1", 1, "reviewer", "artifact-briefs.json", [{ artifactId: "a1" }]);
		workspace.writeFinalOutput("task-1", "Final answer.");

		expect(taskDir).toBe(join(workspace.rootDir, "tasks", "task-1"));
		expect(readFileSync(join(taskDir, "workflow-plan.json"), "utf8")).toContain("task-1");
		expect(readFileSync(join(taskDir, "steps", "01-reviewer", "worker-result.json"), "utf8")).toContain("success");
		expect(readFileSync(join(taskDir, "final-output.md"), "utf8")).toBe("Final answer.\n");
	});
});
```

- [ ] **Step 2: Run workspace test and verify it fails**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-workspace.test.ts
```

Expected: FAIL because `src/orchestration/workspace.ts` does not exist.

- [ ] **Step 3: Implement workspace module**

Create `packages/lead-agent/src/orchestration/workspace.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";

export interface LeadSessionWorkspaceOptions {
	cwd: string;
	sessionId: string;
	artifactDir?: string;
}

export interface LeadSessionWorkspace {
	rootDir: string;
	manifestPath: string;
	store: FileSystemArtifactStore;
	ensureTaskDir(taskId: string): string;
	writeTaskJson(taskId: string, filename: string, value: unknown): string;
	writeStepJson(taskId: string, order: number, profileId: string, filename: string, value: unknown): string;
	writeFinalOutput(taskId: string, content: string): string;
	appendWorkflowLog(value: unknown): string;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stepDirName(order: number, profileId: string): string {
	return `${String(order).padStart(2, "0")}-${profileId}`;
}

export function createLeadSessionWorkspace(options: LeadSessionWorkspaceOptions): LeadSessionWorkspace {
	const rootDir = options.artifactDir ?? join(options.cwd, ".lead-agent", "artifacts", "sessions", options.sessionId);
	mkdirSync(rootDir, { recursive: true });
	const store = new FileSystemArtifactStore(rootDir);
	const manifestPath = join(rootDir, "artifacts.json");
	if (!store.manifest().artifacts.length) {
		writeJson(manifestPath, store.manifest());
	}

	const ensureTaskDir = (taskId: string): string => {
		const dir = join(rootDir, "tasks", taskId);
		mkdirSync(dir, { recursive: true });
		return dir;
	};

	const ensureStepDir = (taskId: string, order: number, profileId: string): string => {
		const dir = join(ensureTaskDir(taskId), "steps", stepDirName(order, profileId));
		mkdirSync(dir, { recursive: true });
		return dir;
	};

	return {
		rootDir,
		manifestPath,
		store,
		ensureTaskDir,
		writeTaskJson(taskId, filename, value) {
			const path = join(ensureTaskDir(taskId), filename);
			writeJson(path, value);
			return path;
		},
		writeStepJson(taskId, order, profileId, filename, value) {
			const path = join(ensureStepDir(taskId, order, profileId), filename);
			writeJson(path, value);
			return path;
		},
		writeFinalOutput(taskId, content) {
			const path = join(ensureTaskDir(taskId), "final-output.md");
			writeFileSync(path, `${content}\n`);
			return path;
		},
		appendWorkflowLog(value) {
			const path = join(rootDir, "session-workflow-log.jsonl");
			writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: "a" });
			return path;
		},
	};
}
```

- [ ] **Step 4: Run workspace test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit workspace changes**

```bash
git status --short
git add packages/lead-agent/src/orchestration/workspace.ts packages/lead-agent/test/orchestration-workspace.test.ts
git commit -m "feat(lead-agent): add session artifact workspace"
```

## Task 3: Add Templates and Planner Validation

**Files:**
- Create: `packages/lead-agent/src/orchestration/types.ts`
- Create: `packages/lead-agent/src/orchestration/templates.ts`
- Create: `packages/lead-agent/src/orchestration/planner.ts`
- Create: `packages/lead-agent/src/orchestration/index.ts`
- Create: `packages/lead-agent/test/orchestration-planner.test.ts`

- [ ] **Step 1: Write planner tests**

Create `packages/lead-agent/test/orchestration-planner.test.ts`:

```ts
import type { WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { createFauxWorkflowPlanner, validateWorkflowPlan } from "../src/orchestration/planner.js";
import { selectWorkflowTemplateCandidates } from "../src/orchestration/templates.js";

describe("workflow planner", () => {
	it("selects templates only as candidates", () => {
		const candidates = selectWorkflowTemplateCandidates({
			objective: "Review reviewer comments and draft a response strategy.",
			expectedOutputs: [],
			inputArtifacts: [],
		});

		expect(candidates.map((candidate) => candidate.id)).toContain("revision-response");
		expect(candidates[0]?.steps.length).toBeGreaterThan(0);
	});

	it("validates profile ids, duplicate steps, and direct plans", () => {
		const plan: WorkflowPlan = {
			taskId: "task-1",
			sessionId: "session-1",
			objective: "Write concise text.",
			rationale: "Small writing task.",
			userVisibleSummary: "I will handle this directly.",
			mode: "direct",
			steps: [],
			stopConditions: ["Final answer produced"],
		};

		expect(validateWorkflowPlan(plan, DEFAULT_ACADEMIC_PROFILES)).toEqual([]);
		expect(
			validateWorkflowPlan(
				{
					...plan,
					mode: "workflow",
					steps: [
						{
							id: "x",
							order: 1,
							profileId: "missing-profile",
							objective: "Invalid step",
							inputArtifactRefs: [],
							expectedArtifactKinds: [],
							expectedOutputs: [],
							acceptanceCriteria: [],
						},
					],
				},
				DEFAULT_ACADEMIC_PROFILES,
			),
		).toContain("Unknown workflow step profileId: missing-profile");
	});

	it("uses an injectable faux planner that may adapt template candidates", async () => {
		const planner = createFauxWorkflowPlanner((input) => ({
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "The method audit should run before reviewer synthesis.",
			userVisibleSummary: "I will audit methods, then synthesize a review memo.",
			mode: "workflow",
			steps: [
				{
					id: "method-audit",
					order: 1,
					profileId: "method-auditor",
					objective: "Audit reproducibility assumptions.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["revision-plan"],
					expectedOutputs: ["methods audit"],
					acceptanceCriteria: ["Missing assumptions are explicit"],
				},
				{
					id: "reviewer-synthesis",
					order: 2,
					profileId: "reviewer",
					objective: "Synthesize severity ordered findings.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["review-comment-map"],
					expectedOutputs: ["review memo"],
					acceptanceCriteria: ["Findings are severity ordered"],
				},
			],
			stopConditions: ["Review memo accepted"],
		}));

		const plan = await planner.plan({
			taskId: "task-1",
			sessionId: "session-1",
			objective: "Review methods and comments.",
			constraints: [],
			expectedOutputs: ["review memo"],
			inputArtifacts: [],
			profiles: DEFAULT_ACADEMIC_PROFILES,
			artifactBriefs: [],
			templateCandidates: [],
		});

		expect(plan.steps.map((step) => step.profileId)).toEqual(["method-auditor", "reviewer"]);
	});
});
```

- [ ] **Step 2: Run planner test and verify it fails**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts
```

Expected: FAIL because orchestration modules do not exist.

- [ ] **Step 3: Add orchestration types**

Create `packages/lead-agent/src/orchestration/types.ts`:

```ts
import type { ArtifactBrief, ArtifactRef, WorkflowPlan, WorkerProfile } from "@mariozechner/pi-agent-contracts";

export interface LeadTaskPlanningInput {
	taskId: string;
	sessionId: string;
	objective: string;
	constraints: string[];
	expectedOutputs: string[];
	inputArtifacts: ArtifactRef[];
	profiles: readonly WorkerProfile[];
	artifactBriefs: ArtifactBrief[];
	templateCandidates: WorkflowTemplate[];
}

export interface WorkflowTemplateStep {
	id: string;
	profileId: string;
	objective: string;
	expectedArtifactKinds: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
}

export interface WorkflowTemplate {
	id: string;
	title: string;
	description: string;
	steps: WorkflowTemplateStep[];
}

export interface WorkflowPlanner {
	plan(input: LeadTaskPlanningInput): Promise<WorkflowPlan>;
}
```

- [ ] **Step 4: Add intake normalization**

Create `packages/lead-agent/src/orchestration/intake.ts`:

```ts
import type { ArtifactBrief, ArtifactRef, WorkerProfile } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentTaskRequest } from "../index.js";
import type { LeadTaskPlanningInput, WorkflowTemplate } from "./types.js";

export interface CreateLeadTaskPlanningInputOptions {
	request: LeadAgentTaskRequest;
	taskId: string;
	sessionId: string;
	profiles: readonly WorkerProfile[];
	artifactBriefs?: ArtifactBrief[];
	templateCandidates: WorkflowTemplate[];
}

export function createLeadTaskPlanningInput(options: CreateLeadTaskPlanningInputOptions): LeadTaskPlanningInput {
	return {
		taskId: options.taskId,
		sessionId: options.sessionId,
		objective: options.request.objective,
		constraints: options.request.constraints ?? [],
		expectedOutputs: options.request.expectedOutputs ?? [],
		inputArtifacts: options.request.inputArtifacts ?? [],
		profiles: options.profiles,
		artifactBriefs: options.artifactBriefs ?? [],
		templateCandidates: options.templateCandidates,
	};
}

export function collectPlanningArtifactRefs(request: LeadAgentTaskRequest): ArtifactRef[] {
	return request.inputArtifacts ?? [];
}
```

- [ ] **Step 5: Add template selection**

Create `packages/lead-agent/src/orchestration/templates.ts`:

```ts
import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { WorkflowTemplate } from "./types.js";

export interface TemplateSelectionInput {
	objective: string;
	expectedOutputs: string[];
	inputArtifacts: ArtifactRef[];
}

function includesAny(text: string, terms: readonly string[]): boolean {
	const normalized = text.toLowerCase();
	return terms.some((term) => normalized.includes(term));
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
	{
		id: "direct-writing",
		title: "Direct Writing",
		description: "Single lead-author pass for small writing or polishing tasks.",
		steps: [],
	},
	{
		id: "citation-audit",
		title: "Citation Audit",
		description: "Check claim support before revision.",
		steps: [
			{
				id: "citation-audit",
				profileId: "citation-checker",
				objective: "Identify unsupported or citation-dependent claims.",
				expectedArtifactKinds: ["claim-audit"],
				expectedOutputs: ["citation audit"],
				acceptanceCriteria: ["Unsupported claims are identified"],
			},
		],
	},
	{
		id: "method-audit",
		title: "Method Audit",
		description: "Check reproducibility and methods assumptions.",
		steps: [
			{
				id: "method-audit",
				profileId: "method-auditor",
				objective: "Audit methods, statistics, and reproducibility details.",
				expectedArtifactKinds: ["revision-plan"],
				expectedOutputs: ["methods audit"],
				acceptanceCriteria: ["Missing assumptions are explicit"],
			},
		],
	},
	{
		id: "revision-response",
		title: "Revision Response",
		description: "Map review comments, plan revisions, and draft response text.",
		steps: [
			{
				id: "review-comment-map",
				profileId: "reviewer",
				objective: "Map reviewer comments into actionable issues.",
				expectedArtifactKinds: ["review-comment-map"],
				expectedOutputs: ["review memo"],
				acceptanceCriteria: ["Findings are actionable"],
			},
			{
				id: "revision-plan",
				profileId: "reviser",
				objective: "Create a revision plan and response strategy.",
				expectedArtifactKinds: ["revision-plan"],
				expectedOutputs: ["revision plan"],
				acceptanceCriteria: ["Reviewer requests are addressed"],
			},
		],
	},
	{
		id: "evidence-synthesis",
		title: "Evidence Synthesis",
		description: "Extract evidence and prepare a writing outline.",
		steps: [
			{
				id: "evidence-summary",
				profileId: "researcher",
				objective: "Separate evidence from interpretation.",
				expectedArtifactKinds: ["evidence-table"],
				expectedOutputs: ["evidence summary"],
				acceptanceCriteria: ["Uncertainty is explicit"],
			},
			{
				id: "outline",
				profileId: "writer",
				objective: "Turn accepted evidence into an outline.",
				expectedArtifactKinds: ["outline"],
				expectedOutputs: ["outline"],
				acceptanceCriteria: ["Claims are bounded"],
			},
		],
	},
];

export function selectWorkflowTemplateCandidates(input: TemplateSelectionInput): WorkflowTemplate[] {
	const text = [input.objective, ...input.expectedOutputs, ...input.inputArtifacts.map((artifact) => artifact.kind)].join("\n");
	const selected = WORKFLOW_TEMPLATES.filter((template) => {
		if (template.id === "citation-audit") return includesAny(text, ["citation", "reference", "引用", "参考文献"]);
		if (template.id === "method-audit") return includesAny(text, ["method", "statistics", "方法", "统计", "reproducibility"]);
		if (template.id === "revision-response") return includesAny(text, ["reviewer", "comment", "response", "退修", "审稿", "意见"]);
		if (template.id === "evidence-synthesis") return includesAny(text, ["evidence", "literature", "文献", "证据", "outline"]);
		return false;
	});
	return selected.length > 0 ? selected : [WORKFLOW_TEMPLATES[0]];
}
```

- [ ] **Step 6: Add planner validation**

Create `packages/lead-agent/src/orchestration/planner.ts`:

```ts
import type { WorkflowPlan, WorkerProfile } from "@mariozechner/pi-agent-contracts";
import type { LeadTaskPlanningInput, WorkflowPlanner } from "./types.js";

export function validateWorkflowPlan(plan: WorkflowPlan, profiles: readonly WorkerProfile[]): string[] {
	const errors: string[] = [];
	const profileIds = new Set(profiles.map((profile) => profile.id));
	const stepIds = new Set<string>();
	if (plan.mode === "direct" && plan.steps.length > 0) {
		errors.push("Direct workflow plans must not contain worker steps");
	}
	if (plan.mode === "workflow" && plan.steps.length === 0) {
		errors.push("Workflow plans must contain at least one step");
	}
	for (const step of plan.steps) {
		if (stepIds.has(step.id)) errors.push(`Duplicate workflow step id: ${step.id}`);
		stepIds.add(step.id);
		if (!profileIds.has(step.profileId)) errors.push(`Unknown workflow step profileId: ${step.profileId}`);
		if (step.order < 1) errors.push(`Workflow step ${step.id} has invalid order ${step.order}`);
	}
	return errors;
}

export function assertValidWorkflowPlan(plan: WorkflowPlan, profiles: readonly WorkerProfile[]): void {
	const errors = validateWorkflowPlan(plan, profiles);
	if (errors.length > 0) {
		throw new Error(`Invalid workflow plan:\n${errors.map((error) => `- ${error}`).join("\n")}`);
	}
}

export function createFauxWorkflowPlanner(factory: (input: LeadTaskPlanningInput) => WorkflowPlan): WorkflowPlanner {
	return {
		async plan(input) {
			const plan = factory(input);
			assertValidWorkflowPlan(plan, input.profiles);
			return plan;
		},
	};
}

export function createTemplateWorkflowPlanner(): WorkflowPlanner {
	return createFauxWorkflowPlanner((input) => {
		const template = input.templateCandidates[0];
		if (!template || template.steps.length === 0) {
			return {
				taskId: input.taskId,
				sessionId: input.sessionId,
				objective: input.objective,
				rationale: "The task is small enough for direct lead synthesis.",
				userVisibleSummary: "I will handle this directly.",
				mode: "direct",
				steps: [],
				stopConditions: ["Final answer produced"],
			};
		}
		return {
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: `Template ${template.id} was selected and accepted by the planner.`,
			userVisibleSummary: `I will run ${template.title.toLowerCase()} and synthesize the accepted result.`,
			mode: "workflow",
			steps: template.steps.map((step, index) => ({
				...step,
				order: index + 1,
				inputArtifactRefs: input.inputArtifacts,
			})),
			stopConditions: ["All planned steps are accepted"],
		};
	});
}
```

- [ ] **Step 7: Export orchestration modules**

Create `packages/lead-agent/src/orchestration/index.ts`:

```ts
export * from "./types.js";
export * from "./intake.js";
export * from "./templates.js";
export * from "./planner.js";
export * from "./workspace.js";
```

- [ ] **Step 8: Run planner test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit planner changes**

```bash
git status --short
git add packages/lead-agent/src/orchestration/types.ts packages/lead-agent/src/orchestration/intake.ts packages/lead-agent/src/orchestration/templates.ts packages/lead-agent/src/orchestration/planner.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/orchestration-planner.test.ts
git commit -m "feat(lead-agent): add workflow planner scaffolding"
```

## Task 4: Move Acceptance and Add Executor

**Files:**
- Create: `packages/lead-agent/src/orchestration/acceptance.ts`
- Create: `packages/lead-agent/src/orchestration/executor.ts`
- Modify: `packages/lead-agent/src/orchestration/index.ts`
- Create: `packages/lead-agent/test/orchestration-executor.test.ts`

- [ ] **Step 1: Write executor test**

Create `packages/lead-agent/test/orchestration-executor.test.ts`:

```ts
import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { executeWorkflowPlan } from "../src/orchestration/executor.js";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("executeWorkflowPlan", () => {
	it("runs steps in order and carries artifact refs forward", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });
			const seenInputs: string[][] = [];
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-1",
					sessionId: "session-1",
					objective: "Audit then revise.",
					rationale: "Two-step workflow.",
					userVisibleSummary: "I will audit citations, then revise.",
					mode: "workflow",
					steps: [
						{
							id: "citation-audit",
							order: 1,
							profileId: "citation-checker",
							objective: "Audit citations.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["claim-audit"],
							expectedOutputs: ["citation audit"],
							acceptanceCriteria: ["Unsupported claims are identified"],
						},
						{
							id: "revision-plan",
							order: 2,
							profileId: "reviser",
							objective: "Plan revisions.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["revision-plan"],
							expectedOutputs: ["revision plan"],
							acceptanceCriteria: ["Reviewer requests are addressed"],
						},
					],
					stopConditions: ["Revision plan accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					seenInputs.push(request.inputArtifacts.map((artifact) => artifact.kind));
					return {
						taskId: request.taskId,
						status: "success",
						summary: `${request.expectedOutputs.join(", ")} completed`,
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								uri: `memory://${request.workerType}`,
								title: `${request.workerType} artifact`,
							},
						],
						artifactBriefs: [
							{
								artifactId: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								brief: `${request.workerType} brief`,
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace(`run-${request.workerType}`),
					};
				},
			});

			expect(result.stepResults).toHaveLength(2);
			expect(result.accepted).toBe(true);
			expect(result.artifactBriefs.map((brief) => brief.kind)).toEqual(["claim-audit", "revision-plan"]);
			expect(seenInputs).toEqual([[], ["claim-audit"]]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
```

- [ ] **Step 2: Run executor test and verify it fails**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-executor.test.ts
```

Expected: FAIL because executor does not exist.

- [ ] **Step 3: Move acceptance logic**

Create `packages/lead-agent/src/orchestration/acceptance.ts` with the existing logic currently in `packages/lead-agent/src/index.ts`:

```ts
import type { AcceptanceIssue, AcceptanceReport, ArtifactRef, JsonValue, WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createAcceptanceReport } from "@mariozechner/pi-agent-contracts";

function normalizeForMatch(value: string): string {
	return value.trim().toLowerCase();
}

function textIncludesExpected(text: string, expected: string): boolean {
	const normalizedText = normalizeForMatch(text);
	const normalizedExpected = normalizeForMatch(expected);
	return normalizedExpected.length === 0 || normalizedText.includes(normalizedExpected);
}

function artifactMatchesExpected(artifact: ArtifactRef, expected: string): boolean {
	return [artifact.id, artifact.kind, artifact.uri, artifact.title ?? "", artifact.mediaType ?? ""].some((value) =>
		textIncludesExpected(value, expected),
	);
}

function jsonValueMatchesExpected(value: JsonValue | undefined, expected: string): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return textIncludesExpected(value, expected);
	if (typeof value === "number" || typeof value === "boolean") return textIncludesExpected(String(value), expected);
	if (Array.isArray(value)) return value.some((item) => jsonValueMatchesExpected(item, expected));
	return Object.entries(value).some(
		([key, item]) => textIncludesExpected(key, expected) || jsonValueMatchesExpected(item, expected),
	);
}

export function workerResultSatisfiesExpectedOutput(workerResult: WorkerResult, expectedOutput: string): boolean {
	return (
		textIncludesExpected(workerResult.summary, expectedOutput) ||
		workerResult.producedArtifacts.some((artifact) => artifactMatchesExpected(artifact, expectedOutput)) ||
		jsonValueMatchesExpected(workerResult.structuredOutputs, expectedOutput)
	);
}

export function acceptanceIssuesForWorkerResult(workerRequest: WorkerRequest, workerResult: WorkerResult): AcceptanceIssue[] {
	const issues: AcceptanceIssue[] = [];
	if (workerResult.status !== "success") {
		issues.push({
			code: "worker_failed",
			message: workerResult.failureReason ?? `Worker returned status ${workerResult.status}.`,
			severity: "error",
		});
	}
	for (const expectedOutput of workerRequest.expectedOutputs) {
		if (!workerResultSatisfiesExpectedOutput(workerResult, expectedOutput)) {
			issues.push({
				code: "expected_output_missing",
				message: `Worker result did not satisfy expected output: ${expectedOutput}`,
				severity: "error",
			});
		}
	}
	for (const warning of workerResult.warnings) {
		issues.push({ code: "worker_warning", message: warning, severity: "warning" });
	}
	for (const question of workerResult.openQuestions) {
		issues.push({ code: "worker_open_question", message: question, severity: "info" });
	}
	return issues;
}

export function createLeadAcceptanceReport(workerRequest: WorkerRequest, workerResult: WorkerResult): AcceptanceReport {
	return createAcceptanceReport(workerResult, acceptanceIssuesForWorkerResult(workerRequest, workerResult));
}
```

- [ ] **Step 4: Implement executor**

Create `packages/lead-agent/src/orchestration/executor.ts`:

```ts
import type {
	ArtifactBrief,
	ArtifactRef,
	WorkflowPlan,
	WorkflowStep,
	WorkflowStepResult,
	WorkerProfile,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import type { LeadAgentWorkerRunner } from "../index.js";
import { createLeadAcceptanceReport } from "./acceptance.js";
import type { LeadSessionWorkspace } from "./workspace.js";

export interface ExecuteWorkflowPlanOptions {
	plan: WorkflowPlan;
	profiles: readonly WorkerProfile[];
	workspace: LeadSessionWorkspace;
	workerRunner: LeadAgentWorkerRunner;
}

export interface ExecuteWorkflowPlanResult {
	accepted: boolean;
	stepResults: WorkflowStepResult[];
	artifactBriefs: ArtifactBrief[];
	producedArtifacts: ArtifactRef[];
	summaries: string[];
}

function profileForStep(step: WorkflowStep, profiles: readonly WorkerProfile[]): WorkerProfile | undefined {
	return profiles.find((profile) => profile.id === step.profileId);
}

function toWorkerRequest(plan: WorkflowPlan, step: WorkflowStep, profile: WorkerProfile | undefined, inputs: ArtifactRef[]): WorkerRequest {
	return {
		taskId: `${plan.taskId}:${step.id}`,
		workerType: step.profileId,
		objective: step.objective,
		constraints: [],
		inputArtifacts: inputs,
		expectedOutputs: step.expectedOutputs,
		acceptanceCriteria: step.acceptanceCriteria,
		executionBudget: step.budget,
		profile,
		metadata: {
			parentTaskId: plan.taskId,
			workflowStepId: step.id,
		},
	};
}

function decideStep(workerResult: WorkerResult, accepted: boolean, isLastStep: boolean): WorkflowStepResult["decision"] {
	if (workerResult.status !== "success") return { kind: "stop", reason: "Worker failed." };
	if (!accepted) return { kind: "stop", reason: "Worker result failed acceptance." };
	if (workerResult.openQuestions.length > 0) {
		return { kind: "ask_user", reason: "Worker returned a blocking open question.", question: workerResult.openQuestions[0] };
	}
	return isLastStep ? { kind: "synthesize", reason: "Final workflow step accepted." } : { kind: "continue", reason: "Step accepted." };
}

export async function executeWorkflowPlan(options: ExecuteWorkflowPlanOptions): Promise<ExecuteWorkflowPlanResult> {
	const stepResults: WorkflowStepResult[] = [];
	const artifactBriefs: ArtifactBrief[] = [];
	const producedArtifacts: ArtifactRef[] = [];
	const summaries: string[] = [];
	let accepted = true;

	options.workspace.writeTaskJson(options.plan.taskId, "workflow-plan.json", options.plan);

	const sortedSteps = [...options.plan.steps].sort((a, b) => a.order - b.order);
	for (let index = 0; index < sortedSteps.length; index++) {
		const step = sortedSteps[index];
		const profile = profileForStep(step, options.profiles);
		const inputs = [...step.inputArtifactRefs, ...producedArtifacts];
		const workerRequest = toWorkerRequest(options.plan, step, profile, inputs);
		options.workspace.writeStepJson(options.plan.taskId, step.order, step.profileId, "worker-request.json", workerRequest);

		const workerResult = await options.workerRunner(workerRequest);
		const acceptanceReport = createLeadAcceptanceReport(workerRequest, workerResult);
		const stepAccepted = acceptanceReport.accepted;
		const briefs = workerResult.artifactBriefs ?? [];
		const decision = decideStep(workerResult, stepAccepted, index === sortedSteps.length - 1);

		options.workspace.writeStepJson(options.plan.taskId, step.order, step.profileId, "worker-result.json", workerResult);
		options.workspace.writeStepJson(options.plan.taskId, step.order, step.profileId, "artifact-briefs.json", briefs);

		stepResults.push({ step, workerRequest, workerResult, artifactBriefs: briefs, acceptanceReport, decision });
		artifactBriefs.push(...briefs);
		producedArtifacts.push(...workerResult.producedArtifacts);
		summaries.push(workerResult.summary);

		if (!stepAccepted || decision.kind === "stop" || decision.kind === "ask_user") {
			accepted = false;
			break;
		}
	}

	return { accepted, stepResults, artifactBriefs, producedArtifacts, summaries };
}
```

- [ ] **Step 5: Export executor and acceptance**

Update `packages/lead-agent/src/orchestration/index.ts`:

```ts
export * from "./types.js";
export * from "./templates.js";
export * from "./planner.js";
export * from "./workspace.js";
export * from "./acceptance.js";
export * from "./executor.js";
```

- [ ] **Step 6: Run executor test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-executor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit executor changes**

```bash
git status --short
git add packages/lead-agent/src/orchestration/acceptance.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/orchestration-executor.test.ts
git commit -m "feat(lead-agent): execute workflow plans"
```

## Task 5: Integrate Planner and Executor into Runtime

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Create: `packages/lead-agent/src/orchestration/synthesis.ts`
- Modify: `packages/lead-agent/src/orchestration/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add runtime integration tests**

Append to `packages/lead-agent/test/lead-agent.test.ts`:

```ts
it("runs a multi-step workflow through the planner and executor", async () => {
	const seenWorkers: string[] = [];
	const runtime = createLeadAgentRuntime({
		workflowPlanner: createFauxWorkflowPlanner((input) => ({
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "Citation audit should precede revision planning.",
			userVisibleSummary: "I will audit citations, then prepare a revision plan.",
			mode: "workflow",
			steps: [
				{
					id: "citation-audit",
					order: 1,
					profileId: "citation-checker",
					objective: "Audit citation support.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["claim-audit"],
					expectedOutputs: ["citation audit"],
					acceptanceCriteria: ["Unsupported claims are identified"],
				},
				{
					id: "revision-plan",
					order: 2,
					profileId: "reviser",
					objective: "Create a revision plan.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["revision-plan"],
					expectedOutputs: ["revision plan"],
					acceptanceCriteria: ["Reviewer requests are addressed"],
				},
			],
			stopConditions: ["Revision plan accepted"],
		})),
		workerRunner: async (request) => {
			seenWorkers.push(request.workerType);
			return {
				taskId: request.taskId,
				status: "success",
				summary: `${request.expectedOutputs.join(", ")} completed`,
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [
					{
						id: `${request.workerType}-artifact`,
						kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
						uri: `memory://${request.workerType}`,
					},
				],
				artifactBriefs: [
					{
						artifactId: `${request.workerType}-artifact`,
						kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
						brief: `${request.workerType} brief`,
					},
				],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace(`run-${request.workerType}`),
			};
		},
	});

	const result = await runtime.run({
		taskId: "task-workflow",
		objective: "Check citations and plan revisions.",
		expectedOutputs: ["revision plan"],
	});

	expect(seenWorkers).toEqual(["citation-checker", "reviser"]);
	expect(result.finalOutput).toContain("citation audit completed");
	expect(result.finalOutput).toContain("revision plan completed");
	expect(result.workflowPlan?.userVisibleSummary).toContain("audit citations");
});
```

Add imports at the top:

```ts
import { createFauxWorkflowPlanner } from "../src/orchestration/planner.js";
```

- [ ] **Step 2: Run runtime test and verify it fails**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because `LeadAgentRuntimeOptions.workflowPlanner`, `LeadAgentResult.workflowPlan`, and runtime workflow execution are not wired.

- [ ] **Step 3: Extend runtime public types**

In `packages/lead-agent/src/index.ts`, add imports:

```ts
import type { ArtifactBrief, WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import {
	createLeadTaskPlanningInput,
	createLeadSessionWorkspace,
	createTemplateWorkflowPlanner,
	executeWorkflowPlan,
	synthesizeWorkflowFinalOutput,
	type LeadSessionWorkspace,
	type WorkflowPlanner,
	selectWorkflowTemplateCandidates,
} from "./orchestration/index.js";
```

Extend `LeadAgentResult`:

```ts
workflowPlan?: WorkflowPlan;
artifactBriefs?: ArtifactBrief[];
```

Extend `LeadAgentRuntimeOptions`:

```ts
workflowPlanner?: WorkflowPlanner;
workspace?: LeadSessionWorkspace;
artifactDir?: string;
confirmPlan?: boolean;
```

- [ ] **Step 4: Add workflow synthesis helper**

Create `packages/lead-agent/src/orchestration/synthesis.ts`:

```ts
import type { ArtifactBrief, WorkflowPlan } from "@mariozechner/pi-agent-contracts";

export interface WorkflowSynthesisInput {
	plan: WorkflowPlan;
	accepted: boolean;
	summaries: string[];
	artifactBriefs: ArtifactBrief[];
}

export function synthesizeWorkflowFinalOutput(input: WorkflowSynthesisInput): string {
	const status = input.accepted ? "Workflow accepted." : "Workflow stopped before full acceptance.";
	const summaries = input.summaries.map((summary) => `- ${summary}`).join("\n");
	const briefs = input.artifactBriefs.map((brief) => `- ${brief.kind}: ${brief.brief}`).join("\n");
	return [
		input.plan.userVisibleSummary,
		status,
		summaries ? `Step summaries:\n${summaries}` : "",
		briefs ? `Artifact briefs:\n${briefs}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}
```

Update `packages/lead-agent/src/orchestration/index.ts`:

```ts
export * from "./types.js";
export * from "./intake.js";
export * from "./templates.js";
export * from "./planner.js";
export * from "./workspace.js";
export * from "./acceptance.js";
export * from "./executor.js";
export * from "./synthesis.js";
```

- [ ] **Step 5: Replace one-worker path with workflow path**

In `createLeadAgentRuntime()`, initialize:

```ts
const workflowPlanner = options.workflowPlanner ?? createTemplateWorkflowPlanner();
const workspace =
	options.workspace ??
	createLeadSessionWorkspace({
		cwd: options.cwd ?? process.cwd(),
		sessionId: sessionManager.getSessionId(),
		artifactDir: options.artifactDir,
	});
```

Inside `runImpl`, after recording the user message, build template candidates and planner input:

```ts
const templateCandidates = selectWorkflowTemplateCandidates({
	objective: request.objective,
	expectedOutputs: request.expectedOutputs ?? [],
	inputArtifacts: request.inputArtifacts ?? [],
});
const workflowPlan = await workflowPlanner.plan(createLeadTaskPlanningInput({
	request,
	taskId,
	sessionId,
	profiles,
	artifactBriefs: [],
	templateCandidates,
}));
recordLeadEvent(sessionManager, "lead-agent.workflow_plan", {
	taskId,
	mode: workflowPlan.mode,
	userVisibleSummary: workflowPlan.userVisibleSummary,
});
workspace.writeTaskJson(taskId, "workflow-plan.json", workflowPlan);
```

For `workflowPlan.mode === "direct"`, keep direct synthesis and attach `workflowPlan` to the result.

For workflow mode, call:

```ts
const workflowResult = await executeWorkflowPlan({
	plan: workflowPlan,
	profiles,
	workspace,
	workerRunner,
});
const finalOutput = synthesizeWorkflowFinalOutput({
	plan: workflowPlan,
	accepted: workflowResult.accepted,
	summaries: workflowResult.summaries,
	artifactBriefs: workflowResult.artifactBriefs,
});
workspace.writeFinalOutput(taskId, finalOutput);
```

- [ ] **Step 6: Preserve existing public compatibility within lead-agent API**

Keep `plan(request)` returning the existing `LeadAgentDecision` for now. It can continue using `planLeadAgentTask()` as a preview helper. Do not remove current tests that assert one-worker planning yet; update only tests whose expected final output must include workflow summaries.

- [ ] **Step 7: Run lead-agent tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/orchestration-executor.test.ts test/orchestration-planner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit runtime integration**

```bash
git status --short
git add packages/lead-agent/src/index.ts packages/lead-agent/src/orchestration/synthesis.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): run structured workflows"
```

## Task 6: Wire CLI Session Workspace

**Files:**
- Modify: `packages/lead-agent/src/cli/args.ts`
- Modify: `packages/lead-agent/src/cli/run.ts`
- Modify: `packages/lead-agent/src/cli/artifacts.ts`
- Modify: `packages/lead-agent/test/cli-run.test.ts`
- Modify: `packages/lead-agent/test/cli-artifacts.test.ts`

- [ ] **Step 1: Write CLI workspace tests**

Update `packages/lead-agent/test/cli-run.test.ts` artifact test to expect a session workspace:

```ts
expect(stdout.join("")).toContain(`- Artifact manifest: ${join(artifactDir, "artifacts.json")}`);
expect(readdirSync(join(artifactDir, "tasks")).length).toBeGreaterThan(0);
```

Add a new test:

```ts
it("uses one artifact directory across multiple calls with the same explicit artifact dir", async () => {
	const artifactDir = makeTempDir();
	const sessionDir = makeTempDir();
	const stdout: string[] = [];

	const first = await runLeadAgentCli(["--dispatch", "direct", "--artifact-dir", artifactDir, "--session-dir", sessionDir, "First task"], {
		stdin: "",
		stdout: (text) => stdout.push(text),
		stderr: () => {},
		directRunner: async (req) => `Direct: ${req.objective}`,
		workerRunner: createWorkerRunner(),
	});
	const second = await runLeadAgentCli(["--dispatch", "direct", "--artifact-dir", artifactDir, "--session-dir", sessionDir, "Second task"], {
		stdin: "",
		stdout: (text) => stdout.push(text),
		stderr: () => {},
		directRunner: async (req) => `Direct: ${req.objective}`,
		workerRunner: createWorkerRunner(),
	});

	expect(first).toBe(0);
	expect(second).toBe(0);
	expect(readdirSync(join(artifactDir, "tasks")).length).toBe(2);
});
```

- [ ] **Step 2: Run CLI tests and verify failures**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-run.test.ts test/cli-artifacts.test.ts
```

Expected: FAIL until CLI uses the new workspace shape.

- [ ] **Step 3: Add `--confirm-plan` parser support**

In `packages/lead-agent/src/cli/args.ts`, add a boolean `confirmPlan` to `LeadCliArgs`, default `false`, and parse:

```ts
case "--confirm-plan":
	args.confirmPlan = true;
	break;
```

Update `leadCliHelp()` with:

```text
  --confirm-plan           Print and require confirmation before workflow execution
```

This phase records the flag and passes it into runtime options. It does not add a blocking confirmation prompt in non-interactive mode.

- [ ] **Step 4: Pass workspace options into runtime**

In `packages/lead-agent/src/cli/run.ts`, change `createLeadAgentRuntime({ ... })`:

```ts
const runtime = createLeadAgentRuntime({
	cwd,
	profiles,
	sessionManager,
	workerRunner: io.workerRunner,
	directRunner: io.directRunner,
	model: resolvedModel,
	thinkingLevel: args.thinking,
	tools: toolsArg,
	noTools: noToolsArg,
	artifactDir: args.artifactDir,
	confirmPlan: args.confirmPlan,
});
```

- [ ] **Step 5: Make `persistLeadCliArtifacts` use runtime workspace results**

Keep `persistLeadCliArtifacts()` for output compatibility, but make it avoid duplicating one-shot folders. It should write final view files only when called with an explicit `artifactDir`; workflow internals already live under the same root.

Use this implementation shape:

```ts
export function persistLeadCliArtifacts(result: LeadAgentResult, artifactDir: string): PersistedLeadCliArtifacts {
	const finalOutputPath = join(artifactDir, "tasks", result.taskId, "final-output.md");
	const resultJsonPath = join(artifactDir, "tasks", result.taskId, "lead-result.json");
	const acceptanceReportPath = result.acceptanceReport
		? join(artifactDir, "tasks", result.taskId, "acceptance-report.json")
		: undefined;
	mkdirSync(join(artifactDir, "tasks", result.taskId), { recursive: true });
	writeFileSync(finalOutputPath, `${result.finalOutput}\n`);
	writeJson(resultJsonPath, result);
	if (result.acceptanceReport && acceptanceReportPath) writeJson(acceptanceReportPath, result.acceptanceReport);
	return {
		finalOutputPath,
		resultJsonPath,
		acceptanceReportPath,
		manifestPath: join(artifactDir, "artifacts.json"),
	};
}
```

Add `mkdirSync` import.

- [ ] **Step 6: Run CLI tests**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-run.test.ts test/cli-artifacts.test.ts test/cli-args.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit CLI workspace changes**

```bash
git status --short
git add packages/lead-agent/src/cli/args.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/src/cli/artifacts.ts packages/lead-agent/test/cli-run.test.ts packages/lead-agent/test/cli-artifacts.test.ts packages/lead-agent/test/cli-args.test.ts
git commit -m "feat(lead-agent): use session artifact workspaces"
```

## Task 7: Upgrade Academic Smoke to Multi-Step Workflows

**Files:**
- Modify: `packages/lead-agent/src/academic-smoke.ts`
- Modify: `packages/lead-agent/test/academic-smoke.test.ts`

- [ ] **Step 1: Update smoke tests**

Modify `packages/lead-agent/test/academic-smoke.test.ts`:

```ts
it("passes multi-step workflow smoke cases with deterministic workers", async () => {
	const result = await runAcademicSmokeSuite();

	expect(result.passed).toBe(true);
	expect(result.results.some((caseResult) => caseResult.result.workflowPlan?.steps.length! >= 2)).toBe(true);
	expect(result.artifactRefs.length).toBeGreaterThanOrEqual(4);
	for (const caseResult of result.results) {
		if (caseResult.result.workflowPlan?.mode === "workflow") {
			expect(caseResult.result.artifactBriefs?.length).toBeGreaterThan(0);
		}
	}
});
```

- [ ] **Step 2: Run smoke test and verify it fails**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: FAIL until smoke uses workflow planner and artifact briefs.

- [ ] **Step 3: Update deterministic smoke worker**

In `packages/lead-agent/src/academic-smoke.ts`, update worker results to include `artifactBriefs`:

```ts
artifactBriefs: [
	{
		artifactId: artifact.id,
		kind: artifact.kind,
		title: artifact.title,
		brief: `${request.workerType} produced ${request.expectedOutputs.join(", ")}.`,
		keyFindings: request.expectedOutputs,
	},
],
```

- [ ] **Step 4: Inject a multi-step faux planner into smoke runtime**

In `runAcademicSmokeSuite()`, create runtime with a planner:

```ts
const runtime = createLeadAgentRuntime({
	workerRunner,
	workspace: options.artifactDir
		? createLeadSessionWorkspace({ cwd: fixtureDir, sessionId: "academic-smoke", artifactDir: options.artifactDir })
		: undefined,
	workflowPlanner: createFauxWorkflowPlanner((input) => {
		const template = input.templateCandidates[0];
		const steps = template?.steps ?? [];
		return {
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "Academic smoke uses deterministic template-reviewed workflows.",
			userVisibleSummary: steps.length > 0 ? `I will run ${template?.title.toLowerCase()}.` : "I will handle this directly.",
			mode: steps.length > 0 ? "workflow" : "direct",
			steps: steps.map((step, index) => ({
				...step,
				order: index + 1,
				inputArtifactRefs: input.inputArtifacts,
			})),
			stopConditions: ["Smoke workflow accepted"],
		};
	}),
});
```

Import `createFauxWorkflowPlanner` and `createLeadSessionWorkspace`.

- [ ] **Step 5: Ensure at least one smoke case has two steps**

Make `mini-paperorchestra-inputs` use an objective that selects `evidence-synthesis`, which has two steps:

```ts
objective: "Use the idea and experimental log to produce an evidence summary and outline.",
expectedOutputs: ["outline"],
```

- [ ] **Step 6: Run smoke test**

Run:

```bash
cd packages/lead-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit smoke changes**

```bash
git status --short
git add packages/lead-agent/src/academic-smoke.ts packages/lead-agent/test/academic-smoke.test.ts
git commit -m "test(lead-agent): smoke multi-step academic workflows"
```

## Task 8: Final Verification

**Files:**
- No new files unless earlier tasks reveal missing exports.

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
npx tsx ../../node_modules/vitest/dist/cli.js --run test/orchestration-planner.test.ts test/orchestration-workspace.test.ts test/orchestration-executor.test.ts test/lead-agent.test.ts test/cli-run.test.ts test/cli-artifacts.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos requiring changes.

- [ ] **Step 3: Boundary scan**

Run:

```bash
rg -n "WorkflowPlan|WorkflowStep|ArtifactBrief|academic|orchestration" packages/agent-host/src
```

Expected: no output for academic/workflow orchestration terms in `agent-host`.

Run:

```bash
rg -n "@mariozechner/pi-coding-agent(?!/worker)" packages/lead-agent/src packages/lead-agent/test
```

Expected: no root `@mariozechner/pi-coding-agent` imports in `lead-agent`.

- [ ] **Step 4: Final commit if needed**

If verification required small fixes:

```bash
git status --short
git add packages/agent-contracts/src/index.ts packages/agent-contracts/test/contracts.test.ts packages/lead-agent/src/index.ts packages/lead-agent/src/academic-smoke.ts packages/lead-agent/src/cli/args.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/src/cli/artifacts.ts packages/lead-agent/src/orchestration/types.ts packages/lead-agent/src/orchestration/intake.ts packages/lead-agent/src/orchestration/templates.ts packages/lead-agent/src/orchestration/planner.ts packages/lead-agent/src/orchestration/workspace.ts packages/lead-agent/src/orchestration/acceptance.ts packages/lead-agent/src/orchestration/executor.ts packages/lead-agent/src/orchestration/synthesis.ts packages/lead-agent/src/orchestration/index.ts packages/lead-agent/test/orchestration-planner.test.ts packages/lead-agent/test/orchestration-workspace.test.ts packages/lead-agent/test/orchestration-executor.test.ts packages/lead-agent/test/lead-agent.test.ts packages/lead-agent/test/cli-run.test.ts packages/lead-agent/test/cli-artifacts.test.ts packages/lead-agent/test/cli-args.test.ts packages/lead-agent/test/academic-smoke.test.ts
git commit -m "fix(lead-agent): finalize workflow orchestration"
```

If no fixes were needed, do not create an empty commit.

## Implementation Notes

1. The first implementation uses an injectable planner and deterministic template-backed planner. A real LLM planner should be added in a subsequent spec behind the same `WorkflowPlanner` interface.
2. The current `LeadAgentRuntime.plan()` API can remain as a compatibility preview for `LeadAgentDecision`; do not remove it in this phase.
3. User-visible output should show concise plan summaries, not JSON.
4. Large worker content must stay in artifacts. Only `summary`, `artifactBriefs`, warnings, and open questions enter lead context by default.
5. If TypeScript cyclic imports appear between `src/index.ts` and `src/orchestration/executor.ts`, move shared `LeadAgentWorkerRunner` type into `src/orchestration/types.ts`.
