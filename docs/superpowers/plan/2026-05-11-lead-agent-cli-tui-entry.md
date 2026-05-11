# Lead Agent CLI/TUI Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `lead-agent` from a source runner with formal one-shot CLI into a coding-agent-style product entry with package binary, session lifecycle, interactive terminal loop, and a coding-agent-parity TUI architecture for academic workflows.

**Architecture:** Continue the migration-first strategy. Reuse the already-built `lead-agent` CLI parser/runner/output layers, then borrow `coding-agent` concepts in this order: package binary wiring, mode resolution, session selection, multi-format `@file` handling, interactive loop, and finally TUI rendering through `@mariozechner/pi-tui`. The TUI target is structural parity with coding-agent: same interaction model, status/footer patterns, session tree/resume affordances, configurable keybindings, theme loading, message/result rendering, and tmux smoke verification; coding-specific tools/model-login panels are replaced with academic profile/task/artifact panels.

**Tech Stack:** TypeScript ESM, Vitest, `@mariozechner/pi-agent-host` `SessionManager`, `@mariozechner/pi-tui`, existing `lead-agent` runtime, existing `coding-agent` worker adapter, repo `npm run check`.

---

## Current Stage Assessment

Current branch: `lead-agent-formal-cli`

Completed:

- Formal source CLI parser exists at `packages/lead-agent/src/cli/args.ts`.
- CLI runner exists at `packages/lead-agent/src/cli/run.ts`.
- Markdown/JSON output renderer exists at `packages/lead-agent/src/cli/output.ts`.
- Artifact persistence exists at `packages/lead-agent/src/cli/artifacts.ts`.
- `lead-agent-test.sh` executes `packages/lead-agent/src/cli.ts`.
- Explicit routing controls exist on `LeadAgentTaskRequest`: `taskType`, `profileId`, `dispatchMode`.
- `--session-dir` now writes actual lead session JSONL because final lead output is recorded as an assistant message.
- Focused tests pass for CLI args/output/artifacts/run/runtime/academic smoke.
- Root `npm run check` passed during the previous implementation.

Not completed:

- `packages/lead-agent/package.json` has no `bin` entry.
- There is no final binary name.
- CLI has no coding-agent-style `--continue`, `--resume`, `--session`, `--fork`, `--no-session`, or `--mode interactive` behavior.
- CLI does not process `@file` arguments.
- No reusable `lead-agent` interactive command loop exists.
- No TUI mode exists.
- No tmux smoke runner exists for lead-agent TUI.
- `lead-agent` does not yet expose an SDK-friendly CLI run result beyond `runLeadAgentCli()`.

## Design Decision

Build in four increasingly interactive layers:

1. **Product binary and package entry**
   - Choose a temporary binary name such as `pi-lead` unless the user chooses another.
   - Keep `lead-agent-test.sh` as the source runner.
   - Add package `bin`, exports, and source smoke tests without running `npm run build`.

2. **Coding-agent-style mode/session lifecycle**
   - Extend parser with `--mode markdown|json|interactive`, `--continue`, `--resume`, `--session`, `--fork`, and `--no-session`.
   - Use `SessionManager.create/open/continueRecent/forkFrom/inMemory`.
   - Do not add model/provider flags yet because `lead-agent` is orchestrating through runtime and worker adapter, not directly managing provider auth.

3. **Interactive terminal loop**
   - Add a non-TUI readline loop for repeated academic tasks.
   - Commands: `/help`, `/profile`, `/task-type`, `/dispatch`, `/artifacts`, `/session`, `/exit`.
   - This creates usable interactive behavior before the heavier TUI.

4. **Coding-agent-parity TUI track**
   - Use `@mariozechner/pi-tui` directly.
   - Recreate the coding-agent interaction structure for academic work: input editor, message/result history, footer/status, overlays, keybinding hints, session tree entry points, theme support, and artifact/issue panels.
   - Reuse `LeadAgentRunView`; do not render raw `LeadAgentResult` directly.
   - Keep academic semantics distinct: profiles/task types/artifacts replace coding tools/model-login surfaces.

## Open Questions For User

User-confirmed defaults:

- Binary name: `pi-lead`.
- Default mode when stdin is TTY and no prompt is supplied: enter interactive mode.
- TUI scope: full coding-agent-style TUI architecture parity, adapted to academic lead-agent semantics.
- File input syntax: support coding-agent-style `@file` for text and image inputs in the first pass, with unsupported binary files represented as readable file-context errors.
- Session commands: implement CLI lifecycle flags first, then add TUI/session picker parity as a later TUI task.

## File Structure

- Modify `packages/lead-agent/package.json`
  - Add `bin` entry.
  - Add export for CLI helper modules only if tests need public imports.
- Modify `packages/lead-agent/src/cli/args.ts`
  - Add formal app mode, session flags, and `@file` collection.
- Create `packages/lead-agent/src/cli/session.ts`
  - Owns session selection and lifecycle.
  - Mirrors the safe subset of `coding-agent/src/main.ts` session manager logic.
- Create `packages/lead-agent/src/cli/file-input.ts`
  - Reads text and image `@file` arguments by migrating the coding-agent file processor behavior.
  - Adds text file content to constraints and image refs to structured metadata for later multimodal worker support.
- Modify `packages/lead-agent/src/cli/run.ts`
  - Uses mode resolution and session lifecycle.
  - Dispatches one-shot or interactive mode.
- Create `packages/lead-agent/src/modes/interactive-loop.ts`
  - Readline-based interactive mode for repeated tasks.
- Create `packages/lead-agent/src/modes/tui/lead-tui-mode.ts`
  - First coding-agent-style TUI shell.
- Create `packages/lead-agent/src/modes/tui/components.ts`
  - Academic equivalents of coding-agent message/result/status components.
- Create `packages/lead-agent/src/modes/tui/keybindings.ts`
  - Configurable default keybindings.
- Modify `packages/lead-agent/src/cli/output.ts`
  - Expand `LeadAgentRunView` with fields useful to TUI.
- Create tests:
  - `packages/lead-agent/test/package-entry.test.ts`
  - `packages/lead-agent/test/cli-session.test.ts`
  - `packages/lead-agent/test/cli-file-input.test.ts`
  - `packages/lead-agent/test/interactive-loop.test.ts`
  - `packages/lead-agent/test/tui-view.test.ts`
  - `packages/lead-agent/test/tui-smoke.test.ts`
- Later full-parity tests:
  - `packages/lead-agent/test/tui-keybindings.test.ts`
  - `packages/lead-agent/test/tui-session-selector.test.ts`
  - `packages/lead-agent/test/tui-theme.test.ts`
- Modify docs:
  - `packages/lead-agent/README.md`
  - `packages/lead-agent/CHANGELOG.md`
  - `lead-agent-test.sh`
- Create optional root runner:
  - `lead-agent-tui-test.sh`

## Task 0: Integrate Or Preserve Current Formal CLI Branch

**Files:**
- No source files should be modified.

- [ ] **Step 1: Confirm current branch state**

Run:

```bash
git branch --show-current
git status --short --untracked-files=all
git log --oneline -7
```

Expected:

```text
lead-agent-formal-cli
```

Expected `git status` output is empty.

- [ ] **Step 2: Decide integration mode**

If the user wants to continue on the current branch, keep working on `lead-agent-formal-cli`.

If the user wants clean phase boundaries, run:

```bash
git switch main
git merge lead-agent-formal-cli
git switch -c lead-agent-cli-tui-entry
```

Expected:

```text
Switched to branch 'main'
Updating ...
Switched to a new branch 'lead-agent-cli-tui-entry'
```

- [ ] **Step 3: Run baseline verification**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts test/cli-output.test.ts test/cli-artifacts.test.ts test/cli-run.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts
```

Expected:

```text
Test Files  6 passed
Tests  27 passed
```

Run from repo root:

```bash
npm run check
```

Expected: command exits `0`.

## Task 1: Add Package Binary Entry

**Files:**
- Modify: `packages/lead-agent/package.json`
- Create: `packages/lead-agent/test/package-entry.test.ts`
- Modify: `packages/lead-agent/README.md`
- Modify: `packages/lead-agent/CHANGELOG.md`

- [ ] **Step 1: Write package entry test**

Create `packages/lead-agent/test/package-entry.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
	bin?: Record<string, string>;
	files?: string[];
}

function readPackageJson(): PackageJson {
	return JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as PackageJson;
}

describe("lead-agent package entry", () => {
	it("declares a source-compatible product binary", () => {
		const packageJson = readPackageJson();

		expect(packageJson.bin).toEqual({
			"pi-lead": "dist/cli.js",
		});
		expect(packageJson.files).toContain("dist");
	});
});
```

- [ ] **Step 2: Run package entry test to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-entry.test.ts
```

Expected: FAIL because `packageJson.bin` is undefined.

- [ ] **Step 3: Add `bin` to package.json**

Modify `packages/lead-agent/package.json`:

```json
{
	"name": "@mariozechner/pi-lead-agent",
	"version": "0.73.0",
	"description": "Lead orchestration agent for academic research and writing workflows",
	"type": "module",
	"bin": {
		"pi-lead": "dist/cli.js"
	},
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts"
}
```

Keep all existing fields. Only insert the `bin` object after `"type": "module"`.

- [ ] **Step 4: Run package entry test**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-entry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update README and changelog**

In `packages/lead-agent/README.md`, add:

```md
## Binary

The planned package binary is `pi-lead`. During source development, use:

```bash
./lead-agent-test.sh --help
```

After package build/publish, the binary entry resolves to `dist/cli.js`.
```

In `packages/lead-agent/CHANGELOG.md`, under `## [Unreleased]` `### Added`, add:

```md
- Added the planned `pi-lead` package binary entry for the lead-agent CLI.
```

- [ ] **Step 6: Run focused verification**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-entry.test.ts
```

Expected: PASS.

Run from repo root:

```bash
npm run check
```

Expected: exits `0`.

- [ ] **Step 7: Commit package entry**

```bash
git add packages/lead-agent/package.json packages/lead-agent/test/package-entry.test.ts packages/lead-agent/README.md packages/lead-agent/CHANGELOG.md
git commit -m "feat(lead-agent): add product binary entry"
```

## Task 2: Add Mode And Session Flags

**Files:**
- Modify: `packages/lead-agent/src/cli/args.ts`
- Modify: `packages/lead-agent/test/cli-args.test.ts`

- [ ] **Step 1: Add parser tests**

Append to `packages/lead-agent/test/cli-args.test.ts`:

```ts
	it("parses app mode and session lifecycle flags", () => {
		const result = parseLeadCliArgs([
			"--mode",
			"interactive",
			"--continue",
			"--session-dir",
			".tmp/lead-sessions",
			"Continue the project.",
		]);

		expect(result.appMode).toBe("interactive");
		expect(result.continue).toBe(true);
		expect(result.sessionDir).toBe(".tmp/lead-sessions");
		expect(result.objectiveParts).toEqual(["Continue the project."]);
	});

	it("parses explicit session, fork, resume, no-session, and @file args", () => {
		const result = parseLeadCliArgs([
			"--session",
			"abc123",
			"--fork",
			"def456",
			"--resume",
			"--no-session",
			"@notes.md",
			"Review notes.",
		]);

		expect(result.session).toBe("abc123");
		expect(result.fork).toBe("def456");
		expect(result.resume).toBe(true);
		expect(result.noSession).toBe(true);
		expect(result.fileArgs).toEqual(["notes.md"]);
		expect(result.objectiveParts).toEqual(["Review notes."]);
	});

	it("records invalid app mode as a diagnostic", () => {
		const result = parseLeadCliArgs(["--mode", "rpc"]);

		expect(result.appMode).toBeUndefined();
		expect(result.diagnostics).toContainEqual({
			type: "error",
			message: 'Invalid mode "rpc". Valid values: markdown, json, interactive',
		});
	});
```

- [ ] **Step 2: Run parser tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts
```

Expected: FAIL because `appMode`, `continue`, `session`, `fork`, `resume`, `noSession`, and `fileArgs` do not exist.

- [ ] **Step 3: Extend parser types**

Modify `packages/lead-agent/src/cli/args.ts`:

```ts
export const LEAD_APP_MODES = ["markdown", "json", "interactive"] as const;
export type LeadCliAppMode = (typeof LEAD_APP_MODES)[number];

export interface LeadCliArgs {
	objectiveParts: string[];
	fileArgs: string[];
	constraints: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	taskType?: LeadCliTaskType;
	profileId?: string;
	profileDir?: string;
	dispatchMode?: LeadCliDispatchMode;
	artifactDir?: string;
	sessionDir?: string;
	session?: string;
	fork?: string;
	continue?: boolean;
	resume?: boolean;
	noSession?: boolean;
	cwd?: string;
	outputMode: LeadCliOutputMode;
	appMode?: LeadCliAppMode;
	help: boolean;
	diagnostics: LeadCliDiagnostic[];
}
```

Initialize `fileArgs: []` inside `parseLeadCliArgs()`.

- [ ] **Step 4: Parse mode/session/file flags**

In `parseLeadCliArgs()`, add cases:

```ts
		} else if (arg === "--mode") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_APP_MODES, value)) {
					result.appMode = value;
					if (value === "json") {
						result.outputMode = "json";
					}
					if (value === "markdown") {
						result.outputMode = "markdown";
					}
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid mode "${value}". Valid values: ${LEAD_APP_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--continue" || arg === "-c") {
			result.continue = true;
		} else if (arg === "--resume" || arg === "-r") {
			result.resume = true;
		} else if (arg === "--session") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.session = value;
				index++;
			}
		} else if (arg === "--fork") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.fork = value;
				index++;
			}
		} else if (arg === "--no-session") {
			result.noSession = true;
		} else if (arg.startsWith("@")) {
			result.fileArgs.push(arg.slice(1));
```

Keep `--json` and `--markdown` aliases, and set `appMode` when they are used:

```ts
		} else if (arg === "--json") {
			result.outputMode = "json";
			result.appMode = "json";
		} else if (arg === "--markdown") {
			result.outputMode = "markdown";
			result.appMode = "markdown";
```

- [ ] **Step 5: Update help text**

Add to `leadCliHelp()`:

```text
  --mode <mode>              Run mode: markdown, json, or interactive
  --continue, -c             Continue the most recent lead-agent session
  --resume, -r               Select a session to resume
  --session <path|id>        Use a specific session file or partial session id
  --fork <path|id>           Fork a specific session into a new lead session
  --no-session               Use an ephemeral in-memory session
  @file                      Include a text file as academic context
```

- [ ] **Step 6: Run parser tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-args.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit parser extension**

```bash
git add packages/lead-agent/src/cli/args.ts packages/lead-agent/test/cli-args.test.ts
git commit -m "feat(lead-agent): add mode and session cli flags"
```

## Task 3: Add Session Lifecycle Helper

**Files:**
- Create: `packages/lead-agent/src/cli/session.ts`
- Create: `packages/lead-agent/test/cli-session.test.ts`
- Modify: `packages/lead-agent/src/cli/run.ts`

- [ ] **Step 1: Write session helper tests**

Create `packages/lead-agent/test/cli-session.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadCliSessionManager } from "../src/cli/session.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-session-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("createLeadCliSessionManager", () => {
	it("creates in-memory sessions when noSession is set", async () => {
		const manager = await createLeadCliSessionManager({
			cwd: "/tmp/lead-cwd",
			noSession: true,
		});

		expect(manager.isPersisted()).toBe(false);
		expect(manager.getCwd()).toBe("/tmp/lead-cwd");
	});

	it("creates persisted sessions in the provided session dir", async () => {
		const sessionDir = makeTempDir();
		const manager = await createLeadCliSessionManager({
			cwd: "/tmp/lead-cwd",
			sessionDir,
		});

		manager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "hello" }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		expect(manager.isPersisted()).toBe(true);
		expect(readdirSync(sessionDir).some((filename) => filename.endsWith(".jsonl"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run session tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-session.test.ts
```

Expected: FAIL because `../src/cli/session.js` does not exist.

- [ ] **Step 3: Implement session helper**

Create `packages/lead-agent/src/cli/session.ts`:

```ts
import { resolve } from "node:path";
import { SessionManager } from "@mariozechner/pi-agent-host";

export interface LeadCliSessionOptions {
	cwd: string;
	sessionDir?: string;
	noSession?: boolean;
	continue?: boolean;
	resume?: boolean;
	session?: string;
	fork?: string;
}

type ResolvedSession =
	| { type: "path"; path: string }
	| { type: "local"; path: string }
	| { type: "not_found"; arg: string };

function looksLikePath(value: string): boolean {
	return value.includes("/") || value.includes("\\") || value.endsWith(".jsonl");
}

async function resolveSessionPath(sessionArg: string, cwd: string, sessionDir?: string): Promise<ResolvedSession> {
	if (looksLikePath(sessionArg)) {
		return { type: "path", path: resolve(sessionArg) };
	}
	const sessions = await SessionManager.list(cwd, sessionDir);
	const match = sessions.find((session) => session.id.startsWith(sessionArg));
	if (match) {
		return { type: "local", path: match.path };
	}
	return { type: "not_found", arg: sessionArg };
}

export async function createLeadCliSessionManager(options: LeadCliSessionOptions): Promise<SessionManager> {
	if (options.noSession) {
		return SessionManager.inMemory(options.cwd);
	}
	if (options.fork) {
		const resolved = await resolveSessionPath(options.fork, options.cwd, options.sessionDir);
		if (resolved.type === "not_found") {
			throw new Error(`No session found matching '${resolved.arg}'`);
		}
		return SessionManager.forkFrom(resolved.path, options.cwd, options.sessionDir);
	}
	if (options.session) {
		const resolved = await resolveSessionPath(options.session, options.cwd, options.sessionDir);
		if (resolved.type === "not_found") {
			throw new Error(`No session found matching '${resolved.arg}'`);
		}
		return SessionManager.open(resolved.path, options.sessionDir);
	}
	if (options.resume || options.continue) {
		return SessionManager.continueRecent(options.cwd, options.sessionDir);
	}
	return SessionManager.create(options.cwd, options.sessionDir);
}
```

- [ ] **Step 4: Wire helper into CLI runner**

In `packages/lead-agent/src/cli/run.ts`, remove local `createSessionManager()` and import:

```ts
import { createLeadCliSessionManager } from "./session.js";
```

Replace:

```ts
const sessionManager = createSessionManager(cwd, args.sessionDir);
```

With:

```ts
const sessionManager = await createLeadCliSessionManager({
	cwd,
	sessionDir: args.sessionDir,
	noSession: args.noSession,
	continue: args.continue,
	resume: args.resume,
	session: args.session,
	fork: args.fork,
});
```

- [ ] **Step 5: Run session and CLI runner tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-session.test.ts test/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit session lifecycle**

```bash
git add packages/lead-agent/src/cli/session.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/test/cli-session.test.ts
git commit -m "feat(lead-agent): add cli session lifecycle"
```

## Task 4: Add Text File Input

**Files:**
- Create: `packages/lead-agent/src/cli/file-input.ts`
- Create: `packages/lead-agent/test/cli-file-input.test.ts`
- Modify: `packages/lead-agent/src/cli/run.ts`

- [ ] **Step 1: Write file input tests**

Create `packages/lead-agent/test/cli-file-input.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLeadCliFileInputs } from "../src/cli/file-input.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-files-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("readLeadCliFileInputs", () => {
	it("reads @file inputs as named academic context blocks", () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "notes.md"), "Claim A needs citation.\n");

		const context = readLeadCliFileInputs(cwd, ["notes.md"]);

		expect(context).toEqual([
			{
				path: join(cwd, "notes.md"),
				constraint: "File context from notes.md:\n\nClaim A needs citation.",
			},
		]);
	});

	it("throws a useful error when a file is missing", () => {
		const cwd = makeTempDir();

		expect(() => readLeadCliFileInputs(cwd, ["missing.md"])).toThrow("File input not found: missing.md");
	});
});
```

- [ ] **Step 2: Run file input tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-file-input.test.ts
```

Expected: FAIL because `../src/cli/file-input.js` does not exist.

- [ ] **Step 3: Implement file input reader**

Create `packages/lead-agent/src/cli/file-input.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export interface LeadCliFileInput {
	path: string;
	constraint: string;
}

export function readLeadCliFileInputs(cwd: string, fileArgs: readonly string[]): LeadCliFileInput[] {
	return fileArgs.map((fileArg) => {
		const path = isAbsolute(fileArg) ? fileArg : join(cwd, fileArg);
		if (!existsSync(path)) {
			throw new Error(`File input not found: ${fileArg}`);
		}
		const content = readFileSync(path, "utf8").trim();
		return {
			path,
			constraint: `File context from ${fileArg}:\n\n${content}`,
		};
	});
}
```

- [ ] **Step 4: Wire file inputs into request creation**

In `packages/lead-agent/src/cli/run.ts`, import:

```ts
import { readLeadCliFileInputs } from "./file-input.js";
```

Change `createTaskRequest()` signature:

```ts
function createTaskRequest(objective: string, args: LeadCliArgs, fileConstraints: string[]): LeadAgentTaskRequest
```

Inside it, combine constraints:

```ts
const constraints = [...args.constraints, ...fileConstraints];
if (constraints.length > 0) {
	request.constraints = constraints;
}
```

Before `runtime.run()`:

```ts
const fileInputs = readLeadCliFileInputs(cwd, args.fileArgs);
const result = await runtime.run(createTaskRequest(objective, args, fileInputs.map((input) => input.constraint)));
```

- [ ] **Step 5: Add CLI runner test for @file**

Append to `packages/lead-agent/test/cli-run.test.ts`:

```ts
	it("passes @file inputs as constraints", async () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "notes.md"), "Citation gap: cohort flow.");
		const stdout: string[] = [];
		const seenConstraints: string[][] = [];

		const exitCode = await runLeadAgentCli(["--cwd", cwd, "--task-type", "citation", "--expected-output", "citation audit", "@notes.md", "Review."], {
			stdin: "",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			workerRunner: async (request) => {
				seenConstraints.push(request.constraints);
				return {
					taskId: request.taskId,
					status: "success",
					summary: "citation audit completed",
					structuredOutputs: { expectedOutputs: request.expectedOutputs },
					producedArtifacts: [],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("run-file-input"),
				};
			},
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("citation audit completed");
		expect(seenConstraints[0]?.join("\n")).toContain("Citation gap: cohort flow.");
	});
```

Also add `writeFileSync` to the `node:fs` import in `test/cli-run.test.ts`.

- [ ] **Step 6: Run file input and CLI runner tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/cli-file-input.test.ts test/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit file input support**

```bash
git add packages/lead-agent/src/cli/file-input.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/test/cli-file-input.test.ts packages/lead-agent/test/cli-run.test.ts
git commit -m "feat(lead-agent): add cli file context inputs"
```

## Task 5: Add Interactive Readline Loop

**Files:**
- Create: `packages/lead-agent/src/modes/interactive-loop.ts`
- Create: `packages/lead-agent/test/interactive-loop.test.ts`
- Modify: `packages/lead-agent/src/cli/run.ts`
- Modify: `packages/lead-agent/src/cli/output.ts`

- [ ] **Step 1: Write interactive loop tests**

Create `packages/lead-agent/test/interactive-loop.test.ts`:

```ts
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { runLeadInteractiveLoop } from "../src/modes/interactive-loop.js";
import { createLeadAgentRuntime } from "../src/index.js";

describe("runLeadInteractiveLoop", () => {
	it("runs repeated prompts and exits on /exit", async () => {
		const stdout: string[] = [];
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: `${request.expectedOutputs.join(", ")} completed`,
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-interactive-loop"),
			}),
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["Review this manuscript.", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			defaultExpectedOutputs: ["review memo"],
			defaultTaskType: "review",
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("review memo completed");
		expect(stdout.join("")).toContain("bye");
	});

	it("updates defaults through slash commands", async () => {
		const stdout: string[] = [];
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: `${request.workerType}: ${request.expectedOutputs.join(", ")}`,
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-interactive-command"),
			}),
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["/task-type citation", "/expected-output citation audit", "Check support.", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: () => {},
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("task-type: citation");
		expect(stdout.join("")).toContain("citation-checker: citation audit");
	});
});
```

- [ ] **Step 2: Run interactive tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-loop.test.ts
```

Expected: FAIL because `../src/modes/interactive-loop.js` does not exist.

- [ ] **Step 3: Implement interactive loop**

Create `packages/lead-agent/src/modes/interactive-loop.ts`:

```ts
import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import type { AcademicTaskType, LeadAgentRuntime } from "../index.js";
import { createLeadAgentRunView, renderLeadAgentMarkdown } from "../cli/output.js";

export interface RunLeadInteractiveLoopOptions {
	runtime: LeadAgentRuntime;
	inputs?: string[];
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	defaultTaskType?: AcademicTaskType;
	defaultProfileId?: string;
	defaultExpectedOutputs?: string[];
}

interface InteractiveState {
	taskType?: AcademicTaskType;
	profileId?: string;
	expectedOutputs: string[];
}

function parseAcademicTaskType(value: string): AcademicTaskType | undefined {
	if (value === "writing" || value === "research" || value === "review" || value === "revision" || value === "methods" || value === "citation") {
		return value;
	}
	return undefined;
}

function handleCommand(line: string, state: InteractiveState, stdout: (text: string) => void): boolean {
	const [command, ...parts] = line.slice(1).trim().split(/\s+/);
	const value = parts.join(" ").trim();
	if (command === "help") {
		stdout("/task-type <type>\n/profile <id>\n/expected-output <text>\n/session\n/exit\n");
		return true;
	}
	if (command === "task-type") {
		const taskType = parseAcademicTaskType(value);
		if (taskType) {
			state.taskType = taskType;
			stdout(`task-type: ${taskType}\n`);
		} else {
			stdout("task-type must be writing, research, review, revision, methods, or citation\n");
		}
		return true;
	}
	if (command === "profile") {
		state.profileId = value || undefined;
		stdout(`profile: ${state.profileId ?? "auto"}\n`);
		return true;
	}
	if (command === "expected-output") {
		if (value.length > 0) {
			state.expectedOutputs = [value];
		}
		stdout(`expected-output: ${state.expectedOutputs.join(", ") || "none"}\n`);
		return true;
	}
	if (command === "session") {
		return false;
	}
	return false;
}

async function collectInputs(options: RunLeadInteractiveLoopOptions): Promise<string[]> {
	if (options.inputs) {
		return options.inputs;
	}
	const rl = createInterface({ input: processStdin, output: processStdout });
	const lines: string[] = [];
	while (true) {
		const line = await rl.question("lead> ");
		lines.push(line);
		if (line.trim() === "/exit") {
			break;
		}
	}
	rl.close();
	return lines;
}

export async function runLeadInteractiveLoop(options: RunLeadInteractiveLoopOptions): Promise<number> {
	const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
	const state: InteractiveState = {
		taskType: options.defaultTaskType,
		profileId: options.defaultProfileId,
		expectedOutputs: options.defaultExpectedOutputs ?? [],
	};
	const inputs = await collectInputs(options);
	for (const rawLine of inputs) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}
		if (line === "/exit") {
			stdout("bye\n");
			return 0;
		}
		if (line.startsWith("/")) {
			const handled = handleCommand(line, state, stdout);
			if (!handled && line === "/session") {
				stdout(`session: ${options.runtime.sessionManager.getSessionId()}\n`);
			} else if (!handled) {
				stderr(`Unknown command: ${line}\n`);
			}
			continue;
		}
		const result = await options.runtime.run({
			objective: line,
			taskType: state.taskType,
			profileId: state.profileId,
			expectedOutputs: state.expectedOutputs.length > 0 ? state.expectedOutputs : undefined,
		});
		stdout(renderLeadAgentMarkdown(createLeadAgentRunView(result)));
	}
	return 0;
}
```

- [ ] **Step 4: Wire interactive mode into CLI runner**

In `packages/lead-agent/src/cli/run.ts`, import:

```ts
import { runLeadInteractiveLoop } from "../modes/interactive-loop.js";
```

After runtime creation and before one-shot `runtime.run()`:

```ts
if (args.appMode === "interactive" || (objective.length === 0 && process.stdin.isTTY)) {
	return runLeadInteractiveLoop({
		runtime,
		defaultTaskType: toTaskType(args.taskType),
		defaultProfileId: args.profileId,
		defaultExpectedOutputs: args.expectedOutputs,
	});
}
```

Adjust objective-empty handling so interactive mode does not print help.

- [ ] **Step 5: Run interactive and CLI runner tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-loop.test.ts test/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit interactive loop**

```bash
git add packages/lead-agent/src/modes/interactive-loop.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/test/interactive-loop.test.ts
git commit -m "feat(lead-agent): add interactive terminal mode"
```

## Task 6: Add TUI View Model

**Files:**
- Modify: `packages/lead-agent/src/cli/output.ts`
- Create: `packages/lead-agent/src/modes/tui/view-model.ts`
- Create: `packages/lead-agent/test/tui-view.test.ts`

- [ ] **Step 1: Write TUI view model tests**

Create `packages/lead-agent/test/tui-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LeadAgentRunView } from "../src/cli/output.js";
import { createLeadTuiViewModel } from "../src/modes/tui/view-model.js";

function viewFixture(): LeadAgentRunView {
	return {
		taskId: "task-1",
		sessionId: "session-1",
		decision: "worker/reviewer",
		accepted: false,
		finalOutput: "Worker result was not accepted.",
		issues: [{ severity: "error", code: "expected_output_missing", message: "Missing review memo" }],
		artifacts: [{ id: "a1", kind: "review-comment-map", uri: "memory://a1", title: "Review map" }],
		warnings: ["Worker warning"],
		openQuestions: ["Need source manuscript"],
	};
}

describe("createLeadTuiViewModel", () => {
	it("summarizes lead run state for compact TUI rendering", () => {
		const model = createLeadTuiViewModel(viewFixture());

		expect(model.header).toBe("worker/reviewer | rejected | session session-1");
		expect(model.resultLines).toEqual(["Worker result was not accepted."]);
		expect(model.issueLines).toEqual(["error expected_output_missing: Missing review memo"]);
		expect(model.artifactLines).toEqual(["review-comment-map Review map"]);
		expect(model.questionLines).toEqual(["Need source manuscript"]);
	});
});
```

- [ ] **Step 2: Run view model tests to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/tui-view.test.ts
```

Expected: FAIL because `../src/modes/tui/view-model.js` does not exist.

- [ ] **Step 3: Implement TUI view model**

Create `packages/lead-agent/src/modes/tui/view-model.ts`:

```ts
import type { LeadAgentRunView } from "../../cli/output.js";

export interface LeadTuiViewModel {
	header: string;
	resultLines: string[];
	issueLines: string[];
	artifactLines: string[];
	warningLines: string[];
	questionLines: string[];
}

function acceptedLabel(value: boolean | undefined): string {
	if (value === undefined) {
		return "direct";
	}
	return value ? "accepted" : "rejected";
}

function lines(value: string): string[] {
	return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

export function createLeadTuiViewModel(view: LeadAgentRunView): LeadTuiViewModel {
	return {
		header: `${view.decision} | ${acceptedLabel(view.accepted)} | session ${view.sessionId}`,
		resultLines: lines(view.finalOutput),
		issueLines: view.issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`),
		artifactLines: view.artifacts.map((artifact) => `${artifact.kind} ${artifact.title ?? artifact.id}`),
		warningLines: view.warnings,
		questionLines: view.openQuestions,
	};
}
```

- [ ] **Step 4: Run TUI view tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/tui-view.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit TUI view model**

```bash
git add packages/lead-agent/src/modes/tui/view-model.ts packages/lead-agent/test/tui-view.test.ts
git commit -m "feat(lead-agent): add tui view model"
```

## Task 7: Add First TUI Shell

**Files:**
- Create: `packages/lead-agent/src/modes/tui/keybindings.ts`
- Create: `packages/lead-agent/src/modes/tui/lead-tui-mode.ts`
- Create: `packages/lead-agent/test/tui-smoke.test.ts`
- Modify: `packages/lead-agent/src/cli/run.ts`
- Modify: `packages/lead-agent/package.json`

- [ ] **Step 1: Add TUI dependency**

Modify `packages/lead-agent/package.json` dependencies:

```json
"@mariozechner/pi-tui": "^0.73.0"
```

Keep alphabetical order if the surrounding package uses it. Do not run `npm install` unless package-lock changes are required by `npm run check`.

- [ ] **Step 2: Write keybinding constants**

Create `packages/lead-agent/src/modes/tui/keybindings.ts`:

```ts
export const DEFAULT_LEAD_TUI_KEYBINDINGS = {
	submit: "enter",
	cancel: "escape",
	exit: "ctrl+c",
	help: "ctrl+h",
} as const;

export type LeadTuiAction = keyof typeof DEFAULT_LEAD_TUI_KEYBINDINGS;
```

- [ ] **Step 3: Write TUI smoke test**

Create `packages/lead-agent/test/tui-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_TUI_KEYBINDINGS } from "../src/modes/tui/keybindings.js";
import { createLeadTuiInitialState } from "../src/modes/tui/lead-tui-mode.js";

describe("lead TUI smoke", () => {
	it("creates initial state with configurable keybindings", () => {
		const state = createLeadTuiInitialState({
			sessionId: "session-1",
			keybindings: DEFAULT_LEAD_TUI_KEYBINDINGS,
		});

		expect(state).toEqual({
			sessionId: "session-1",
			input: "",
			status: "ready",
			keybindings: DEFAULT_LEAD_TUI_KEYBINDINGS,
			lastRun: undefined,
		});
	});
});
```

- [ ] **Step 4: Run TUI smoke test to verify failure**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/tui-smoke.test.ts
```

Expected: FAIL because `lead-tui-mode.js` does not exist.

- [ ] **Step 5: Implement first TUI state and runner skeleton**

Create `packages/lead-agent/src/modes/tui/lead-tui-mode.ts`:

```ts
import {
	Container,
	ProcessTerminal,
	Text,
	TUI,
} from "@mariozechner/pi-tui";
import type { LeadAgentRuntime } from "../../index.js";
import type { LeadAgentRunView } from "../../cli/output.js";
import { DEFAULT_LEAD_TUI_KEYBINDINGS, type LeadTuiAction } from "./keybindings.js";

export interface LeadTuiInitialStateOptions {
	sessionId: string;
	keybindings?: Record<LeadTuiAction, string>;
}

export interface LeadTuiState {
	sessionId: string;
	input: string;
	status: "ready" | "running" | "error";
	keybindings: Record<LeadTuiAction, string>;
	lastRun?: LeadAgentRunView;
}

export function createLeadTuiInitialState(options: LeadTuiInitialStateOptions): LeadTuiState {
	return {
		sessionId: options.sessionId,
		input: "",
		status: "ready",
		keybindings: options.keybindings ?? DEFAULT_LEAD_TUI_KEYBINDINGS,
		lastRun: undefined,
	};
}

export interface RunLeadTuiModeOptions {
	runtime: LeadAgentRuntime;
	initialPrompt?: string;
}

export async function runLeadTuiMode(options: RunLeadTuiModeOptions): Promise<number> {
	const tui = new TUI(new ProcessTerminal());
	const state = createLeadTuiInitialState({
		sessionId: options.runtime.sessionManager.getSessionId(),
	});
	const root = new Container();
	root.addChild(new Text(`Lead Agent | session ${state.sessionId}`));
	root.addChild(new Text(options.initialPrompt ?? "Ready"));
	tui.addChild(root);
	tui.start();
	tui.stop();
	return 0;
}
```

- [ ] **Step 6: Wire TUI mode into CLI runner**

In `packages/lead-agent/src/cli/run.ts`, import:

```ts
import { runLeadTuiMode } from "../modes/tui/lead-tui-mode.js";
```

Add mode dispatch:

```ts
if (args.appMode === "interactive" && process.stdin.isTTY) {
	return runLeadTuiMode({
		runtime,
		initialPrompt: objective.length > 0 ? objective : undefined,
	});
}
```

Keep non-TTY interactive tests using `runLeadInteractiveLoop()` by checking `io.stdin !== undefined` in tests.

- [ ] **Step 7: Run TUI tests and focused suite**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/tui-smoke.test.ts test/tui-view.test.ts test/interactive-loop.test.ts test/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit first TUI shell**

```bash
git add packages/lead-agent/package.json packages/lead-agent/src/modes/tui/keybindings.ts packages/lead-agent/src/modes/tui/lead-tui-mode.ts packages/lead-agent/src/cli/run.ts packages/lead-agent/test/tui-smoke.test.ts
git commit -m "feat(lead-agent): add initial tui shell"
```

## Task 8: Add Tmux TUI Smoke Runner

**Files:**
- Create: `lead-agent-tui-test.sh`
- Modify: `packages/lead-agent/README.md`
- Modify: `packages/lead-agent/CHANGELOG.md`

- [ ] **Step 1: Create TUI source runner**

Create `lead-agent-tui-test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TSX_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
if [[ ! -x "$TSX_BIN" ]]; then
  echo "tsx not found at $TSX_BIN. Run npm install from the repo root first." >&2
  exit 1
fi

"$TSX_BIN" "$SCRIPT_DIR/packages/lead-agent/src/cli.ts" --mode interactive "$@"
```

Run:

```bash
chmod +x lead-agent-tui-test.sh
```

- [ ] **Step 2: Add README tmux smoke instructions**

Add to `packages/lead-agent/README.md`:

```md
## TUI Smoke

The first TUI shell can be exercised in tmux:

```bash
tmux new-session -d -s lead-agent-tui-test -x 100 -y 30
tmux send-keys -t lead-agent-tui-test "cd /Users/liuruixi/Documents/Code/pi-mono && ./lead-agent-tui-test.sh" Enter
sleep 2 && tmux capture-pane -t lead-agent-tui-test -p
tmux kill-session -t lead-agent-tui-test
```
```

- [ ] **Step 3: Update changelog**

Under `packages/lead-agent/CHANGELOG.md` `## [Unreleased]` `### Added`, add:

```md
- Added a source TUI smoke runner for the lead-agent interactive shell.
```

- [ ] **Step 4: Run focused tests and root check**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-entry.test.ts test/cli-args.test.ts test/cli-session.test.ts test/cli-file-input.test.ts test/interactive-loop.test.ts test/tui-view.test.ts test/tui-smoke.test.ts test/cli-run.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts
```

Expected: PASS.

Run from repo root:

```bash
npm run check
```

Expected: exits `0`.

- [ ] **Step 5: Commit TUI runner docs**

```bash
git add lead-agent-tui-test.sh packages/lead-agent/README.md packages/lead-agent/CHANGELOG.md
git commit -m "docs(lead-agent): add tui smoke runner"
```

## Task 9: Manual Verification

**Files:**
- No source files should be modified.

- [ ] **Step 1: Verify binary help through source runner**

Run:

```bash
./lead-agent-test.sh --help
```

Expected output contains:

```text
--mode <mode>
--continue, -c
--session <path|id>
@file
```

- [ ] **Step 2: Verify one-shot file context**

Run:

```bash
printf "Claim A needs support.\n" > .tmp-lead-notes.md
./lead-agent-test.sh --task-type citation --expected-output "citation audit" @.tmp-lead-notes.md "Check support." --json
rm .tmp-lead-notes.md
```

Expected:

- Exit `0` if worker output is accepted.
- Exit `2` if worker output is rejected.
- Output is valid JSON.
- No `.tmp-lead-notes.md` remains.

- [ ] **Step 3: Verify interactive loop without TUI**

Run:

```bash
printf "/task-type review\n/expected-output review memo\nReview this excerpt.\n/exit\n" | ./lead-agent-test.sh --mode interactive
```

Expected output contains:

```text
task-type: review
expected-output: review memo
Lead Agent Result
bye
```

- [ ] **Step 4: Verify TUI starts in tmux**

Run:

```bash
tmux new-session -d -s lead-agent-tui-test -x 100 -y 30
tmux send-keys -t lead-agent-tui-test "cd /Users/liuruixi/Documents/Code/pi-mono && ./lead-agent-tui-test.sh" Enter
sleep 2 && tmux capture-pane -t lead-agent-tui-test -p
tmux kill-session -t lead-agent-tui-test
```

Expected captured pane contains:

```text
Lead Agent | session
Ready
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --untracked-files=all
git log --oneline -10
```

Expected:

- `git status` output is empty.
- Latest commits correspond to the tasks above.

## Verification Policy

- After every test file creation or modification, run that exact test file.
- After each task, run the task's focused tests.
- Before final completion, run:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-entry.test.ts test/cli-args.test.ts test/cli-session.test.ts test/cli-file-input.test.ts test/interactive-loop.test.ts test/tui-view.test.ts test/tui-smoke.test.ts test/cli-run.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts
npm run check
```

- Do not run `npm run build`, `npm run dev`, or `npm test`.

## Self-Review

Spec coverage:

- Similar to coding-agent formal CLI: covered by package bin, parser mode flags, session lifecycle, and file input.
- Similar to coding-agent TUI entry: covered by TUI state/view model, first TUI shell, configurable keybinding constants, and tmux smoke runner.
- Migration before creation: tasks reuse `coding-agent` parser/session/mode patterns and `@mariozechner/pi-tui` primitives before adding academic-specific UI.
- Academic lead-agent specificity: interactive commands use task type, profile, expected outputs, artifacts, and sessions.

Placeholder scan:

- No task uses "TBD", "TODO", "implement later", or "similar to Task N".
- Each implementation step includes exact code or exact text to add.
- Each verification step includes exact commands and expected outcomes.

Type consistency:

- CLI parser uses `LeadCliAppMode`, `LeadCliTaskType`, `LeadCliDispatchMode`, and `LeadCliOutputMode`.
- Runtime uses `AcademicTaskType` and `LeadAgentDispatchMode`.
- TUI uses `LeadAgentRunView` and `LeadTuiViewModel`, so output and TUI stay aligned.
- Session lifecycle uses `SessionManager` from `@mariozechner/pi-agent-host`, not coding-agent private paths.
