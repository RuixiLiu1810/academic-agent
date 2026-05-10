# Lead Agent Formal CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a formal source-level `lead-agent` CLI with task type, profile, artifact directory, session directory, and JSON/Markdown output modes while keeping the design ready for a later TUI entry.

**Architecture:** Migrate the proven `coding-agent` CLI shape first: separate argument parsing, runner orchestration, and output formatting instead of keeping all behavior in `src/cli.ts`. `lead-agent` remains the product orchestrator; `agent-host` supplies session persistence through `SessionManager`, and `artifact-core` supplies artifact persistence when `--artifact-dir` is provided. The first TUI step is a renderer-neutral view model, not a full port of `coding-agent`'s TUI.

**Tech Stack:** TypeScript ESM, Vitest, `@mariozechner/pi-agent-host` `SessionManager`, `@mariozechner/pi-artifact-core`, existing `lead-agent` runtime and `coding-agent` worker adapter.

---

## Current Repo Context

- `packages/lead-agent/src/cli.ts` currently contains argument parsing, stdin reading, runtime construction, direct-mode worker disabling, and output printing in one file.
- `lead-agent-test.sh` invokes `packages/lead-agent/src/cli.ts` through root `node_modules/.bin/tsx`.
- `packages/coding-agent/src/cli/args.ts` is the migration reference for parse/diagnostics/help shape.
- `packages/coding-agent/src/modes/print-mode.ts` is the migration reference for text/json output separation, but its event-stream behavior is coding-agent-specific and should not be copied.
- `packages/agent-host/src/session-manager.ts` already supports `SessionManager.create(cwd, sessionDir)` and `SessionManager.inMemory(cwd)`.
- `packages/artifact-core/src/index.ts` already exposes `FileSystemArtifactStore` and `MemoryArtifactStore`.

## File Structure

- Create `packages/lead-agent/src/cli/args.ts`
  - Owns CLI types, `parseLeadCliArgs()`, `printLeadCliHelp()`, and diagnostics.
  - Mirrors `coding-agent/src/cli/args.ts`: no runtime construction, no process access.
- Create `packages/lead-agent/src/cli/output.ts`
  - Owns Markdown and JSON rendering.
  - Produces a renderer-neutral `LeadAgentRunView` for future TUI reuse.
- Create `packages/lead-agent/src/cli/artifacts.ts`
  - Owns CLI-level artifact persistence for final output, acceptance report, and full result.
  - Uses `FileSystemArtifactStore` when `--artifact-dir` is set.
- Create `packages/lead-agent/src/cli/run.ts`
  - Owns stdin/objective resolution, runtime creation, session manager selection, request building, and exit codes.
  - Accepts injected IO and worker runner for deterministic tests.
- Modify `packages/lead-agent/src/cli.ts`
  - Shrinks to a thin executable wrapper around `runLeadAgentCli()`.
- Modify `packages/lead-agent/src/index.ts`
  - Adds explicit routing controls to `LeadAgentTaskRequest`: `taskType`, `profileId`, and `dispatchMode`.
  - Keeps existing runtime API compatible for current tests.
- Modify `packages/lead-agent/test/lead-agent.test.ts`
  - Adds runtime tests for explicit task type, profile, and dispatch override behavior.
- Create `packages/lead-agent/test/cli-args.test.ts`
  - Tests parser behavior based on the `coding-agent` parser style.
- Create `packages/lead-agent/test/cli-output.test.ts`
  - Tests Markdown/JSON rendering without spawning a process.
- Create `packages/lead-agent/test/cli-run.test.ts`
  - Tests full CLI runner behavior with injected IO and deterministic worker runner.
- Modify `packages/lead-agent/README.md`
  - Documents formal source CLI usage and examples.
- Modify `packages/lead-agent/CHANGELOG.md`
  - Adds `[Unreleased]` entry under `### Added`.

## CLI Contract

The formal source CLI should support:

```bash
./lead-agent-test.sh [options] <academic task>
```

Options:

```text
--task-type <type>          Task type: auto, writing, research, review, revision, methods, citation
--profile <id>              Force an academic profile id such as reviewer or citation-checker
--profile-dir <path>        Load academic profiles from a Markdown directory
--dispatch <mode>           Routing mode: auto, direct, worker
--constraint <text>         Add a task constraint
--expected-output <text>    Add an expected worker output
--acceptance <text>         Add an acceptance criterion
--artifact-dir <path>       Persist CLI artifacts to this directory
--session-dir <path>        Persist lead-agent session JSONL files to this directory
--cwd <path>                Working directory for the lead session
--output <mode>             Output mode: markdown or json
--json                      Alias for --output json
--markdown                  Alias for --output markdown
--help, -h                  Show help
```

Definitions:

- `--task-type auto` means the runtime uses the existing objective keyword router.
- `--task-type writing` defaults to direct lead-author mode.
- `--task-type research` maps to `researcher`.
- `--task-type review` maps to `reviewer`.
- `--task-type revision` maps to `reviser`.
- `--task-type methods` maps to `method-auditor`.
- `--task-type citation` maps to `citation-checker`.
- `--profile <id>` overrides the profile chosen by `--task-type`.
- `--dispatch direct` forces direct lead-agent synthesis.
- `--dispatch worker` forces worker dispatch. If neither `--profile` nor `--task-type` maps to a profile, the runtime uses `researcher` as the conservative worker profile and records the reason.
- `--artifact-dir` writes `final-output.md`, `lead-result.json`, `acceptance-report.json` when present, and an `artifacts.json` manifest.
- `--session-dir` uses `SessionManager.create(cwd, sessionDir)`. Without `--session-dir`, the CLI keeps current source-runner behavior by using `SessionManager.inMemory(cwd)`.

## Task 1: Extract Lead CLI Argument Parser

**Files:**
- Create: `packages/lead-agent/src/cli/args.ts`
- Create: `packages/lead-agent/test/cli-args.test.ts`
- Modify: `packages/lead-agent/src/cli.ts`

- [ ] **Step 1: Write parser tests**

Create `packages/lead-agent/test/cli-args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLeadCliArgs } from "../src/cli/args.js";

describe("parseLeadCliArgs", () => {
	it("parses formal lead-agent routing and output flags", () => {
		const result = parseLeadCliArgs([
			"--task-type",
			"citation",
			"--profile",
			"citation-checker",
			"--dispatch",
			"worker",
			"--artifact-dir",
			".tmp/artifacts",
			"--session-dir",
			".tmp/sessions",
			"--output",
			"json",
			"Check citation support.",
		]);

		expect(result.taskType).toBe("citation");
		expect(result.profileId).toBe("citation-checker");
		expect(result.dispatchMode).toBe("worker");
		expect(result.artifactDir).toBe(".tmp/artifacts");
		expect(result.sessionDir).toBe(".tmp/sessions");
		expect(result.outputMode).toBe("json");
		expect(result.objectiveParts).toEqual(["Check citation support."]);
		expect(result.diagnostics).toEqual([]);
	});

	it("parses repeatable academic request fields", () => {
		const result = parseLeadCliArgs([
			"--constraint",
			"Do not add claims.",
			"--constraint",
			"Use concise Chinese.",
			"--expected-output",
			"citation audit",
			"--acceptance",
			"Unsupported claims are identified",
			"Review this excerpt.",
		]);

		expect(result.constraints).toEqual(["Do not add claims.", "Use concise Chinese."]);
		expect(result.expectedOutputs).toEqual(["citation audit"]);
		expect(result.acceptanceCriteria).toEqual(["Unsupported claims are identified"]);
		expect(result.objectiveParts).toEqual(["Review this excerpt."]);
	});

	it("records invalid enum values as diagnostics", () => {
		const result = parseLeadCliArgs([
			"--task-type",
			"unknown",
			"--dispatch",
			"later",
			"--output",
			"xml",
			"Review this excerpt.",
		]);

		expect(result.taskType).toBeUndefined();
		expect(result.dispatchMode).toBeUndefined();
		expect(result.outputMode).toBe("markdown");
		expect(result.diagnostics).toEqual([
			{ type: "error", message: 'Invalid task type "unknown". Valid values: auto, writing, research, review, revision, methods, citation' },
			{ type: "error", message: 'Invalid dispatch mode "later". Valid values: auto, direct, worker' },
			{ type: "error", message: 'Invalid output mode "xml". Valid values: markdown, json' },
		]);
	});

	it("supports --json and --markdown aliases", () => {
		expect(parseLeadCliArgs(["--json", "Review."]).outputMode).toBe("json");
		expect(parseLeadCliArgs(["--markdown", "Review."]).outputMode).toBe("markdown");
	});

	it("supports --direct and --worker aliases for migration compatibility", () => {
		expect(parseLeadCliArgs(["--direct", "Rewrite."]).dispatchMode).toBe("direct");
		expect(parseLeadCliArgs(["--worker", "Review."]).dispatchMode).toBe("worker");
	});

	it("marks missing option values as errors", () => {
		const result = parseLeadCliArgs(["--profile"]);

		expect(result.diagnostics).toEqual([{ type: "error", message: "--profile requires a value" }]);
	});
});
```

- [ ] **Step 2: Run parser tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts
```

Expected: FAIL because `../src/cli/args.js` does not exist.

- [ ] **Step 3: Implement parser**

Create `packages/lead-agent/src/cli/args.ts`:

```ts
export const LEAD_TASK_TYPES = ["auto", "writing", "research", "review", "revision", "methods", "citation"] as const;
export const LEAD_DISPATCH_MODES = ["auto", "direct", "worker"] as const;
export const LEAD_OUTPUT_MODES = ["markdown", "json"] as const;

export type LeadCliTaskType = (typeof LEAD_TASK_TYPES)[number];
export type LeadCliDispatchMode = (typeof LEAD_DISPATCH_MODES)[number];
export type LeadCliOutputMode = (typeof LEAD_OUTPUT_MODES)[number];

export interface LeadCliDiagnostic {
	type: "warning" | "error";
	message: string;
}

export interface LeadCliArgs {
	objectiveParts: string[];
	constraints: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	taskType?: LeadCliTaskType;
	profileId?: string;
	profileDir?: string;
	dispatchMode?: LeadCliDispatchMode;
	artifactDir?: string;
	sessionDir?: string;
	cwd?: string;
	outputMode: LeadCliOutputMode;
	help: boolean;
	diagnostics: LeadCliDiagnostic[];
}

function hasValue<T extends string>(values: readonly T[], value: string): value is T {
	return values.includes(value as T);
}

function missingValue(args: string[], index: number): boolean {
	const value = args[index + 1];
	return value === undefined || value.startsWith("--");
}

function readValue(args: string[], index: number, optionName: string, diagnostics: LeadCliDiagnostic[]): string | undefined {
	if (missingValue(args, index)) {
		diagnostics.push({ type: "error", message: `${optionName} requires a value` });
		return undefined;
	}
	return args[index + 1];
}

export function parseLeadCliArgs(args: string[]): LeadCliArgs {
	const result: LeadCliArgs = {
		objectiveParts: [],
		constraints: [],
		expectedOutputs: [],
		acceptanceCriteria: [],
		outputMode: "markdown",
		help: false,
		diagnostics: [],
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--task-type") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_TASK_TYPES, value)) {
					result.taskType = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid task type "${value}". Valid values: ${LEAD_TASK_TYPES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--profile") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.profileId = value;
				index++;
			}
		} else if (arg === "--profile-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.profileDir = value;
				index++;
			}
		} else if (arg === "--dispatch") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_DISPATCH_MODES, value)) {
					result.dispatchMode = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid dispatch mode "${value}". Valid values: ${LEAD_DISPATCH_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--direct") {
			result.dispatchMode = "direct";
		} else if (arg === "--worker") {
			result.dispatchMode = "worker";
		} else if (arg === "--constraint") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.constraints.push(value);
				index++;
			}
		} else if (arg === "--expected-output") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.expectedOutputs.push(value);
				index++;
			}
		} else if (arg === "--acceptance") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.acceptanceCriteria.push(value);
				index++;
			}
		} else if (arg === "--artifact-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.artifactDir = value;
				index++;
			}
		} else if (arg === "--session-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.sessionDir = value;
				index++;
			}
		} else if (arg === "--cwd") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.cwd = value;
				index++;
			}
		} else if (arg === "--output") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_OUTPUT_MODES, value)) {
					result.outputMode = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid output mode "${value}". Valid values: ${LEAD_OUTPUT_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--json") {
			result.outputMode = "json";
		} else if (arg === "--markdown") {
			result.outputMode = "markdown";
		} else if (arg.startsWith("-")) {
			result.diagnostics.push({ type: "error", message: `Unknown option: ${arg}` });
		} else {
			result.objectiveParts.push(arg);
		}
	}

	return result;
}

export function leadCliHelp(): string {
	return `pi lead-agent - academic research and writing orchestrator

Usage:
  ./lead-agent-test.sh [options] <academic task>

Options:
  --task-type <type>          Task type: auto, writing, research, review, revision, methods, citation
  --profile <id>              Force an academic profile id such as reviewer or citation-checker
  --profile-dir <path>        Load academic profiles from a Markdown directory
  --dispatch <mode>           Routing mode: auto, direct, worker
  --constraint <text>         Add a task constraint
  --expected-output <text>    Add an expected worker output
  --acceptance <text>         Add an acceptance criterion
  --artifact-dir <path>       Persist CLI artifacts to this directory
  --session-dir <path>        Persist lead-agent session JSONL files to this directory
  --cwd <path>                Working directory for the lead session
  --output <mode>             Output mode: markdown or json
  --json                      Alias for --output json
  --markdown                  Alias for --output markdown
  --direct                    Alias for --dispatch direct
  --worker                    Alias for --dispatch worker
  --help, -h                  Show this help

If no task argument is provided, the task is read from stdin.`;
}
```

- [ ] **Step 4: Keep `src/cli.ts` temporarily working**

Modify `packages/lead-agent/src/cli.ts` only enough to import the new parser in a later task. Do not rewrite behavior yet. This prevents a partial CLI migration from blocking the parser tests.

- [ ] **Step 5: Run parser tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit parser extraction**

```bash
git add packages/lead-agent/src/cli/args.ts packages/lead-agent/test/cli-args.test.ts
git commit -m "feat(lead-agent): add formal cli argument parser"
```

## Task 2: Add Runtime Routing Overrides

**Files:**
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`

- [ ] **Step 1: Add runtime tests for explicit routing**

Append these tests to `packages/lead-agent/test/lead-agent.test.ts`:

```ts
	it("routes explicit citation task type to the citation checker profile", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "citation audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-explicit-citation"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-explicit-citation",
			objective: "Check this paragraph.",
			taskType: "citation",
			expectedOutputs: ["citation audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "citation-checker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("lets explicit profile override task type", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "methods audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-profile-override"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-profile-override",
			objective: "Review this paragraph.",
			taskType: "citation",
			profileId: "method-auditor",
			expectedOutputs: ["methods audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "method-auditor",
			workerType: "method-auditor",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("honors direct dispatch override even when a worker profile matches", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		const result = await runtime.run({
			taskId: "task-direct-override",
			objective: "Review this manuscript for citation gaps.",
			dispatchMode: "direct",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toContain("Review this manuscript");
	});
```

- [ ] **Step 2: Run runtime tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: FAIL because `LeadAgentTaskRequest` does not yet expose `taskType`, `profileId`, or `dispatchMode`.

- [ ] **Step 3: Add request routing types**

Modify `packages/lead-agent/src/index.ts` near `LeadAgentTaskRequest`:

```ts
export type AcademicTaskType = "writing" | "research" | "review" | "revision" | "methods" | "citation";
export type LeadAgentDispatchMode = "auto" | "direct" | "worker";

export interface LeadAgentTaskRequest {
	taskId?: string;
	objective: string;
	constraints?: string[];
	inputArtifacts?: ArtifactRef[];
	expectedOutputs?: string[];
	acceptanceCriteria?: string[];
	metadata?: JsonObject;
	taskType?: AcademicTaskType;
	profileId?: string;
	dispatchMode?: LeadAgentDispatchMode;
}
```

- [ ] **Step 4: Implement explicit profile and task type selection**

Modify the existing profile chooser logic in `packages/lead-agent/src/index.ts`:

```ts
function profileIdForTaskType(taskType: AcademicTaskType): string | undefined {
	switch (taskType) {
		case "writing":
			return undefined;
		case "research":
			return "researcher";
		case "review":
			return "reviewer";
		case "revision":
			return "reviser";
		case "methods":
			return "method-auditor";
		case "citation":
			return "citation-checker";
	}
}

function findProfile(profiles: readonly WorkerProfile[], profileId: string | undefined): WorkerProfile | undefined {
	if (!profileId) {
		return undefined;
	}
	return profiles.find((profile) => profile.id === profileId);
}

function chooseWorkerProfile(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[],
): WorkerProfile | undefined {
	const explicitProfile = findProfile(profiles, request.profileId);
	if (explicitProfile) {
		return explicitProfile;
	}
	if (request.taskType) {
		const taskProfile = findProfile(profiles, profileIdForTaskType(request.taskType));
		if (taskProfile) {
			return taskProfile;
		}
		if (request.taskType === "writing") {
			return undefined;
		}
	}
	const objective = request.objective;
	if (includesAny(objective, ["citation", "reference", "引用", "参考文献"])) {
		return profiles.find((profile) => profile.id === "citation-checker");
	}
	if (includesAny(objective, ["method", "statistics", "统计", "方法", "reproducibility", "复现"])) {
		return profiles.find((profile) => profile.id === "method-auditor");
	}
	if (includesAny(objective, ["review", "审稿", "退修", "comment", "意见", "核查"])) {
		return profiles.find((profile) => profile.id === "reviewer");
	}
	if (includesAny(objective, ["literature", "evidence", "research", "文献", "证据", "检索"])) {
		return profiles.find((profile) => profile.id === "researcher");
	}
	for (const profile of profiles) {
		if (includesAny(objective, [profile.id, profile.name, ...profile.capabilities])) {
			return profile;
		}
	}
	return undefined;
}
```

- [ ] **Step 5: Implement dispatch override in planning**

Modify `planLeadAgentTask()` in `packages/lead-agent/src/index.ts`:

```ts
export function planLeadAgentTask(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[] = DEFAULT_ACADEMIC_PROFILES,
): LeadAgentDecision {
	if (request.dispatchMode === "direct") {
		return {
			mode: "direct",
			reason: "Task was forced into direct lead-author mode by dispatchMode.",
		};
	}
	const profile = chooseWorkerProfile(request, profiles);
	if (!profile) {
		if (request.dispatchMode === "worker") {
			const fallbackProfile = profiles.find((candidate) => candidate.id === "researcher") ?? profiles[0];
			if (fallbackProfile) {
				return {
					mode: "worker",
					workerType: fallbackProfile.id,
					profileId: fallbackProfile.id,
					reason: "Worker dispatch was forced; no explicit profile matched, so the researcher profile was selected.",
				};
			}
		}
		return {
			mode: "direct",
			reason: "Task appears to require unified lead-author writing or revision rather than a separable worker pass.",
		};
	}
	return {
		mode: "worker",
		workerType: profile.id,
		profileId: profile.id,
		reason: `Task has a separable ${profile.name} pass with structured acceptance criteria.`,
	};
}
```

- [ ] **Step 6: Run runtime tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit runtime routing controls**

```bash
git add packages/lead-agent/src/index.ts packages/lead-agent/test/lead-agent.test.ts
git commit -m "feat(lead-agent): add explicit routing controls"
```

## Task 3: Add Markdown and JSON Output Rendering

**Files:**
- Create: `packages/lead-agent/src/cli/output.ts`
- Create: `packages/lead-agent/test/cli-output.test.ts`

- [ ] **Step 1: Write output rendering tests**

Create `packages/lead-agent/test/cli-output.test.ts`:

```ts
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createLeadAgentRunView, renderLeadAgentJson, renderLeadAgentMarkdown } from "../src/cli/output.js";
import type { LeadAgentResult } from "../src/index.js";

function resultFixture(): LeadAgentResult {
	return {
		taskId: "task-cli-output",
		sessionId: "session-1",
		finalOutput: "citation audit completed",
		decision: {
			mode: "worker",
			workerType: "citation-checker",
			profileId: "citation-checker",
			reason: "Explicit citation task.",
		},
		acceptanceReport: {
			id: "acceptance-1",
			workerResultId: "task-cli-output",
			accepted: true,
			issues: [],
			createdAt: "2026-05-10T00:00:00.000Z",
		},
		workerResult: {
			taskId: "task-cli-output",
			status: "success",
			summary: "citation audit completed",
			producedArtifacts: [
				{
					id: "artifact-1",
					kind: "claim-audit",
					uri: "memory://artifact-1",
					title: "Claim audit",
				},
			],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-cli-output"),
		},
	};
}

describe("lead-agent CLI output", () => {
	it("creates a renderer-neutral run view", () => {
		const view = createLeadAgentRunView(resultFixture(), { artifactManifestPath: ".tmp/artifacts/artifacts.json" });

		expect(view).toMatchObject({
			taskId: "task-cli-output",
			sessionId: "session-1",
			decision: "worker/citation-checker",
			accepted: true,
			artifactManifestPath: ".tmp/artifacts/artifacts.json",
		});
		expect(view.artifacts).toEqual([
			{
				id: "artifact-1",
				kind: "claim-audit",
				uri: "memory://artifact-1",
				title: "Claim audit",
			},
		]);
	});

	it("renders Markdown for humans", () => {
		const markdown = renderLeadAgentMarkdown(createLeadAgentRunView(resultFixture()));

		expect(markdown).toContain("# Lead Agent Result");
		expect(markdown).toContain("citation audit completed");
		expect(markdown).toContain("- Decision: worker/citation-checker");
		expect(markdown).toContain("- Accepted: yes");
		expect(markdown).toContain("- claim-audit: Claim audit");
	});

	it("renders JSON for scripts", () => {
		const json = renderLeadAgentJson(createLeadAgentRunView(resultFixture()));

		expect(JSON.parse(json)).toMatchObject({
			taskId: "task-cli-output",
			decision: "worker/citation-checker",
			accepted: true,
			finalOutput: "citation audit completed",
		});
		expect(json.endsWith("\n")).toBe(true);
	});
});
```

- [ ] **Step 2: Run output tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-output.test.ts
```

Expected: FAIL because `../src/cli/output.js` does not exist.

- [ ] **Step 3: Implement output rendering**

Create `packages/lead-agent/src/cli/output.ts`:

```ts
import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentResult } from "../index.js";

export interface LeadAgentRunView {
	taskId: string;
	sessionId: string;
	decision: string;
	accepted?: boolean;
	finalOutput: string;
	issues: Array<{ severity: string; code: string; message: string }>;
	artifacts: ArtifactRef[];
	warnings: string[];
	openQuestions: string[];
	artifactManifestPath?: string;
}

export interface LeadAgentRunViewOptions {
	artifactManifestPath?: string;
}

export function createLeadAgentRunView(
	result: LeadAgentResult,
	options: LeadAgentRunViewOptions = {},
): LeadAgentRunView {
	const profileSuffix = result.decision.profileId ? `/${result.decision.profileId}` : "";
	return {
		taskId: result.taskId,
		sessionId: result.sessionId,
		decision: `${result.decision.mode}${profileSuffix}`,
		accepted: result.acceptanceReport?.accepted,
		finalOutput: result.finalOutput,
		issues: result.acceptanceReport?.issues ?? [],
		artifacts: result.workerResult?.producedArtifacts ?? [],
		warnings: result.workerResult?.warnings ?? [],
		openQuestions: result.workerResult?.openQuestions ?? [],
		artifactManifestPath: options.artifactManifestPath,
	};
}

function yesNo(value: boolean | undefined): string {
	if (value === undefined) {
		return "n/a";
	}
	return value ? "yes" : "no";
}

export function renderLeadAgentMarkdown(view: LeadAgentRunView): string {
	const lines = [
		"# Lead Agent Result",
		"",
		view.finalOutput,
		"",
		"## Run",
		"",
		`- Task: ${view.taskId}`,
		`- Session: ${view.sessionId}`,
		`- Decision: ${view.decision}`,
		`- Accepted: ${yesNo(view.accepted)}`,
	];
	if (view.artifactManifestPath) {
		lines.push(`- Artifact manifest: ${view.artifactManifestPath}`);
	}
	if (view.issues.length > 0) {
		lines.push("", "## Acceptance Issues", "");
		for (const issue of view.issues) {
			lines.push(`- ${issue.severity}: ${issue.code}: ${issue.message}`);
		}
	}
	if (view.artifacts.length > 0) {
		lines.push("", "## Artifacts", "");
		for (const artifact of view.artifacts) {
			lines.push(`- ${artifact.kind}: ${artifact.title ?? artifact.id} (${artifact.uri})`);
		}
	}
	if (view.warnings.length > 0) {
		lines.push("", "## Warnings", "");
		for (const warning of view.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	if (view.openQuestions.length > 0) {
		lines.push("", "## Open Questions", "");
		for (const question of view.openQuestions) {
			lines.push(`- ${question}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

export function renderLeadAgentJson(view: LeadAgentRunView): string {
	return `${JSON.stringify(view, null, 2)}\n`;
}
```

- [ ] **Step 4: Run output tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit output layer**

```bash
git add packages/lead-agent/src/cli/output.ts packages/lead-agent/test/cli-output.test.ts
git commit -m "feat(lead-agent): add cli output renderers"
```

## Task 4: Add CLI Artifact Persistence

**Files:**
- Create: `packages/lead-agent/src/cli/artifacts.ts`
- Create: `packages/lead-agent/test/cli-artifacts.test.ts`

- [ ] **Step 1: Write artifact persistence tests**

Create `packages/lead-agent/test/cli-artifacts.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { persistLeadCliArtifacts } from "../src/cli/artifacts.js";
import type { LeadAgentResult } from "../src/index.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-artifacts-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

function resultFixture(): LeadAgentResult {
	return {
		taskId: "artifact-task",
		sessionId: "session-1",
		finalOutput: "Final academic answer.",
		decision: {
			mode: "worker",
			workerType: "reviewer",
			profileId: "reviewer",
			reason: "Explicit review.",
		},
		acceptanceReport: {
			id: "acceptance-1",
			workerResultId: "artifact-task",
			accepted: true,
			issues: [],
			createdAt: "2026-05-10T00:00:00.000Z",
		},
		workerResult: {
			taskId: "artifact-task",
			status: "success",
			summary: "review memo completed",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-artifact-task"),
		},
	};
}

describe("persistLeadCliArtifacts", () => {
	it("writes final output, result json, acceptance report, and manifest", () => {
		const artifactDir = makeTempDir();
		const persisted = persistLeadCliArtifacts(resultFixture(), artifactDir);

		expect(persisted.manifestPath).toBe(join(artifactDir, "artifacts.json"));
		expect(readFileSync(join(artifactDir, "artifacts.json"), "utf8")).toContain("lead-cli-result");
		expect(readFileSync(persisted.finalOutputPath, "utf8")).toBe("Final academic answer.\n");
		expect(JSON.parse(readFileSync(persisted.resultJsonPath, "utf8"))).toMatchObject({
			taskId: "artifact-task",
			finalOutput: "Final academic answer.",
		});
		expect(JSON.parse(readFileSync(persisted.acceptanceReportPath!, "utf8"))).toMatchObject({
			accepted: true,
		});
	});
});
```

- [ ] **Step 2: Run artifact tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-artifacts.test.ts
```

Expected: FAIL because `../src/cli/artifacts.js` does not exist.

- [ ] **Step 3: Implement artifact persistence**

Create `packages/lead-agent/src/cli/artifacts.ts`:

```ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import type { LeadAgentResult } from "../index.js";

export interface PersistedLeadCliArtifacts {
	finalOutputPath: string;
	resultJsonPath: string;
	acceptanceReportPath?: string;
	manifestPath: string;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function persistLeadCliArtifacts(result: LeadAgentResult, artifactDir: string): PersistedLeadCliArtifacts {
	const store = new FileSystemArtifactStore(artifactDir);
	const finalOutputPath = join(artifactDir, "final-output.md");
	const resultJsonPath = join(artifactDir, "lead-result.json");
	const acceptanceReportPath = result.acceptanceReport ? join(artifactDir, "acceptance-report.json") : undefined;
	writeFileSync(finalOutputPath, `${result.finalOutput}\n`);
	writeJson(resultJsonPath, result);
	if (result.acceptanceReport && acceptanceReportPath) {
		writeJson(acceptanceReportPath, result.acceptanceReport);
	}
	store.create({
		kind: "lead-cli-result",
		title: "Lead agent final output",
		mediaType: "text/markdown",
		content: result.finalOutput,
		metadata: {
			taskId: result.taskId,
			sessionId: result.sessionId,
			decisionMode: result.decision.mode,
			profileId: result.decision.profileId ?? null,
		},
	});
	return {
		finalOutputPath,
		resultJsonPath,
		acceptanceReportPath,
		manifestPath: join(artifactDir, "artifacts.json"),
	};
}
```

- [ ] **Step 4: Run artifact tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit artifact persistence**

```bash
git add packages/lead-agent/src/cli/artifacts.ts packages/lead-agent/test/cli-artifacts.test.ts
git commit -m "feat(lead-agent): persist cli artifacts"
```

## Task 5: Implement Formal CLI Runner

**Files:**
- Create: `packages/lead-agent/src/cli/run.ts`
- Create: `packages/lead-agent/test/cli-run.test.ts`
- Modify: `packages/lead-agent/src/cli.ts`

- [ ] **Step 1: Write CLI runner tests**

Create `packages/lead-agent/test/cli-run.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runLeadAgentCli } from "../src/cli/run.js";
import type { LeadAgentWorkerRunner } from "../src/index.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-run-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

function createWorkerRunner(): LeadAgentWorkerRunner {
	return async (request) => ({
		taskId: request.taskId,
		status: "success",
		summary: `${request.expectedOutputs.join(", ")} completed by ${request.workerType}`,
		structuredOutputs: {
			expectedOutputs: request.expectedOutputs,
			workerType: request.workerType,
		},
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("run-cli"),
	});
}

describe("runLeadAgentCli", () => {
	it("runs a direct markdown task from argv", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runLeadAgentCli(["--dispatch", "direct", "Rewrite this paragraph."], {
			stdin: "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.join("")).toContain("# Lead Agent Result");
		expect(stdout.join("")).toContain("- Decision: direct");
	});

	it("reads objective from stdin and prints json", async () => {
		const stdout: string[] = [];

		const exitCode = await runLeadAgentCli(["--json", "--task-type", "citation", "--expected-output", "citation audit"], {
			stdin: "Check citation support.",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.join(""))).toMatchObject({
			decision: "worker/citation-checker",
			accepted: true,
			finalOutput: "citation audit completed by citation-checker",
		});
	});

	it("returns exit code 1 for parser diagnostics", async () => {
		const stderr: string[] = [];

		const exitCode = await runLeadAgentCli(["--task-type", "bad"], {
			stdin: "",
			stdout: () => {},
			stderr: (text) => stderr.push(text),
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(1);
		expect(stderr.join("")).toContain('Invalid task type "bad"');
	});

	it("persists artifacts and sessions when directories are provided", async () => {
		const artifactDir = makeTempDir();
		const sessionDir = makeTempDir();
		const stdout: string[] = [];

		const exitCode = await runLeadAgentCli([
			"--task-type",
			"review",
			"--expected-output",
			"review memo",
			"--artifact-dir",
			artifactDir,
			"--session-dir",
			sessionDir,
			"Review this excerpt.",
		], {
			stdin: "",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain(`- Artifact manifest: ${join(artifactDir, "artifacts.json")}`);
		expect(stdout.join("")).toContain("- Decision: worker/reviewer");
	});
});
```

- [ ] **Step 2: Run CLI runner tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-run.test.ts
```

Expected: FAIL because `../src/cli/run.js` does not exist.

- [ ] **Step 3: Implement runner**

Create `packages/lead-agent/src/cli/run.ts`:

```ts
import { readFileSync } from "node:fs";
import { SessionManager } from "@mariozechner/pi-agent-host";
import { parseLeadCliArgs, leadCliHelp } from "./args.js";
import { persistLeadCliArtifacts } from "./artifacts.js";
import { createLeadAgentRunView, renderLeadAgentJson, renderLeadAgentMarkdown } from "./output.js";
import {
	createLeadAgentRuntime,
	type AcademicTaskType,
	type LeadAgentDispatchMode,
	type LeadAgentTaskRequest,
	type LeadAgentWorkerRunner,
	loadAcademicProfilesFromDir,
} from "../index.js";

export interface LeadAgentCliIo {
	stdin?: string;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	workerRunner?: LeadAgentWorkerRunner;
}

function readProcessStdin(): string {
	if (process.stdin.isTTY) {
		return "";
	}
	return readFileSync(0, "utf8");
}

function readObjective(objectiveParts: string[], stdin: string | undefined): string {
	const objective = objectiveParts.join(" ").trim();
	if (objective.length > 0) {
		return objective;
	}
	return (stdin ?? readProcessStdin()).trim();
}

function createSessionManager(cwd: string, sessionDir: string | undefined): SessionManager {
	if (sessionDir) {
		return SessionManager.create(cwd, sessionDir);
	}
	return SessionManager.inMemory(cwd);
}

function toTaskType(value: string | undefined): AcademicTaskType | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as AcademicTaskType;
}

function toDispatchMode(value: string | undefined): LeadAgentDispatchMode | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as LeadAgentDispatchMode;
}

function createTaskRequest(objective: string, args: ReturnType<typeof parseLeadCliArgs>): LeadAgentTaskRequest {
	return {
		objective,
		constraints: args.constraints.length > 0 ? args.constraints : undefined,
		expectedOutputs: args.expectedOutputs.length > 0 ? args.expectedOutputs : undefined,
		acceptanceCriteria: args.acceptanceCriteria.length > 0 ? args.acceptanceCriteria : undefined,
		taskType: toTaskType(args.taskType),
		profileId: args.profileId,
		dispatchMode: toDispatchMode(args.dispatchMode),
	};
}

export async function runLeadAgentCli(argv: string[], io: LeadAgentCliIo = {}): Promise<number> {
	const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
	const args = parseLeadCliArgs(argv);
	if (args.help) {
		stdout(`${leadCliHelp()}\n`);
		return 0;
	}
	if (args.diagnostics.some((diagnostic) => diagnostic.type === "error")) {
		for (const diagnostic of args.diagnostics) {
			stderr(`${diagnostic.type}: ${diagnostic.message}\n`);
		}
		return 1;
	}
	const objective = readObjective(args.objectiveParts, io.stdin);
	if (objective.length === 0) {
		stderr(`${leadCliHelp()}\n`);
		return 1;
	}
	const cwd = args.cwd ?? process.cwd();
	const profiles = args.profileDir ? loadAcademicProfilesFromDir(args.profileDir) : undefined;
	const sessionManager = createSessionManager(cwd, args.sessionDir);
	const runtime = createLeadAgentRuntime({
		cwd,
		profiles,
		sessionManager,
		workerRunner: io.workerRunner,
	});
	const result = await runtime.run(createTaskRequest(objective, args));
	const persisted = args.artifactDir ? persistLeadCliArtifacts(result, args.artifactDir) : undefined;
	const view = createLeadAgentRunView(result, {
		artifactManifestPath: persisted?.manifestPath,
	});
	stdout(args.outputMode === "json" ? renderLeadAgentJson(view) : renderLeadAgentMarkdown(view));
	return result.acceptanceReport && !result.acceptanceReport.accepted ? 2 : 0;
}
```

- [ ] **Step 4: Replace executable wrapper**

Replace `packages/lead-agent/src/cli.ts` with:

```ts
#!/usr/bin/env node
import { runLeadAgentCli } from "./cli/run.js";

runLeadAgentCli(process.argv.slice(2)).then((exitCode) => {
	process.exitCode = exitCode;
}).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
```

- [ ] **Step 5: Run CLI runner tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all lead-agent focused tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts test/cli-output.test.ts test/cli-artifacts.test.ts test/cli-run.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit formal runner**

```bash
git add packages/lead-agent/src/cli.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/test/cli-run.test.ts
git commit -m "feat(lead-agent): add formal cli runner"
```

## Task 6: Update Docs, Changelog, and Source Runner UX

**Files:**
- Modify: `packages/lead-agent/README.md`
- Modify: `packages/lead-agent/CHANGELOG.md`
- Modify: `lead-agent-test.sh`

- [ ] **Step 1: Update README CLI section**

Replace the current source CLI paragraph in `packages/lead-agent/README.md` with:

```md
## Source CLI

The source-level CLI is intentionally available before choosing a final binary name:

```bash
./lead-agent-test.sh --task-type writing --dispatch direct "Rewrite this paragraph into concise academic Chinese."
```

Common options:

```bash
./lead-agent-test.sh \
  --task-type citation \
  --profile citation-checker \
  --expected-output "citation audit" \
  --artifact-dir .tmp/lead-artifacts \
  --session-dir .tmp/lead-sessions \
  --output markdown \
  "Check whether the manuscript claims are supported by the evidence notes."
```

Machine-readable output:

```bash
./lead-agent-test.sh --json --task-type review --expected-output "review memo" "Review this excerpt."
```

The CLI supports `--task-type auto|writing|research|review|revision|methods|citation`, `--profile <id>`, `--dispatch auto|direct|worker`, `--artifact-dir <path>`, `--session-dir <path>`, and `--output markdown|json`.

`--session-dir` persists the lead session through `agent-host` `SessionManager`. Without `--session-dir`, the source CLI uses an in-memory session to preserve the current test-runner behavior.

`--artifact-dir` writes `final-output.md`, `lead-result.json`, `acceptance-report.json` when available, and `artifacts.json`.
```

- [ ] **Step 2: Update changelog**

Under `packages/lead-agent/CHANGELOG.md` `## [Unreleased]`, add under `### Added`:

```md
- Added a formal source CLI with task type, profile, artifact directory, session directory, and JSON/Markdown output options.
```

- [ ] **Step 3: Update source runner comment**

Keep `lead-agent-test.sh` executable and keep its behavior. No binary name is chosen in this task. If the script has no comments, add this line above the final `tsx` invocation:

```bash
# Source-level runner for the formal lead-agent CLI; final binary naming is intentionally deferred.
```

- [ ] **Step 4: Run focused tests and check**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts test/cli-output.test.ts test/cli-artifacts.test.ts test/cli-run.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos requiring changes.

- [ ] **Step 5: Commit docs and runner UX**

```bash
git add lead-agent-test.sh packages/lead-agent/README.md packages/lead-agent/CHANGELOG.md
git commit -m "docs(lead-agent): document formal source cli"
```

## Task 7: Manual Smoke Verification

**Files:**
- No source files should be modified.

- [ ] **Step 1: Verify direct Markdown CLI**

Run from repo root:

```bash
./lead-agent-test.sh --task-type writing --dispatch direct --output markdown "Rewrite this paragraph into concise academic Chinese."
```

Expected output contains:

```text
# Lead Agent Result
- Decision: direct
- Accepted: n/a
```

- [ ] **Step 2: Verify JSON worker CLI with deterministic test expectations**

Run from repo root:

```bash
./lead-agent-test.sh --task-type citation --expected-output "citation audit" --json "Review the manuscript evidence notes and identify citation gaps."
```

Expected behavior:

- The command exits `0` if the real `coding-agent` worker produces accepted output.
- The command exits `2` if the worker runs but acceptance rejects the output.
- The command prints valid JSON in both cases.

If this command attempts a real paid provider and local credentials are not configured, stop after recording the error. Do not add a fake provider path to production CLI code.

- [ ] **Step 3: Verify artifact and session directories with direct mode**

Run from repo root:

```bash
rm -rf .tmp/lead-cli-manual && ./lead-agent-test.sh \
  --task-type writing \
  --dispatch direct \
  --artifact-dir .tmp/lead-cli-manual/artifacts \
  --session-dir .tmp/lead-cli-manual/sessions \
  "Polish this academic sentence."
```

Expected files:

```text
.tmp/lead-cli-manual/artifacts/final-output.md
.tmp/lead-cli-manual/artifacts/lead-result.json
.tmp/lead-cli-manual/artifacts/artifacts.json
```

Expected session behavior:

- `.tmp/lead-cli-manual/sessions` exists.
- It contains a session JSONL file created by `SessionManager.create()`.

- [ ] **Step 4: Final status check**

Run from repo root:

```bash
git status --short --untracked-files=all
```

Expected: no uncommitted source, test, docs, or script changes.

## Self-Review

Spec coverage:

- Task type parameter is covered by Task 1 parser tests, Task 2 runtime routing, and Task 5 runner wiring.
- Profile parameter is covered by Task 1 parser tests, Task 2 profile override behavior, and Task 5 request building.
- Artifact directory is covered by Task 4 persistence and Task 5 runner wiring.
- Session directory is covered by Task 5 `SessionManager.create(cwd, sessionDir)` wiring and Task 7 manual verification.
- JSON/Markdown output modes are covered by Task 3 renderers and Task 5 runner tests.
- Migration-first approach is covered by parser separation based on `coding-agent/src/cli/args.ts`, runner/output separation based on `coding-agent` print-mode boundaries, and host session reuse through `SessionManager`.
- TUI readiness is covered by `LeadAgentRunView`; a full TUI is intentionally deferred until this CLI contract is stable.

Placeholder scan:

- No task uses "TBD", "TODO", "implement later", or "similar to Task N".
- Every code-changing step includes concrete code or exact text to add.
- Every test step includes exact commands and expected outcomes.

Type consistency:

- Parser types use `LeadCliTaskType`, `LeadCliDispatchMode`, and `LeadCliOutputMode`.
- Runtime types use `AcademicTaskType` and `LeadAgentDispatchMode`.
- `runLeadAgentCli()` converts CLI `auto` values to `undefined` before creating `LeadAgentTaskRequest`.
- `LeadAgentRunView` is renderer-neutral and reused by both Markdown and JSON output.
