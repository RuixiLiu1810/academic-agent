# Academic Workflow Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable academic workflow smoke suite that uses realistic manuscript/reviewer/evidence fixtures to validate `lead-agent` routing, worker acceptance, profile use, and artifact manifest generation.

**Architecture:** Keep PaperOrchestra as a reference pattern, not a runtime dependency. Add a small `lead-agent` smoke module that runs realistic academic tasks through the existing lead runtime, uses deterministic worker responses for CI-safe tests, and writes academic artifacts through `artifact-core`; expose it through a root-level shell runner similar to `pi-test.sh`.

**Tech Stack:** TypeScript, Vitest, existing `@mariozechner/pi-lead-agent`, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-artifact-core`, root `tsx`, existing repo check command `npm run check`.

---

## Scope

This plan implements the next practical step after the initial `lead-agent` migration: a real academic workflow smoke layer. It does not implement the full PaperOrchestra LaTeX paper pipeline. It borrows three ideas from PaperOrchestra:

- structured pre-writing inputs such as `idea.md` and `experimental_log.md`
- stage-specific roles such as literature/research, review, method audit, and writing
- deterministic gates for routing, acceptance, artifact refs, and manifest reconstruction

The implementation remains local to this repo and does not call PaperOrchestra, PaperBanana, Exa, Semantic Scholar, or any network API.

## File Structure

Create:

- `packages/lead-agent/src/academic-smoke.ts`
  - Defines smoke case types and `runAcademicSmokeSuite()`.
  - Uses `createLeadAgentRuntime()` and a deterministic worker runner to produce `WorkerResult` objects.
  - Uses `artifact-core` stores to persist expected academic artifacts.

- `packages/lead-agent/test/academic-smoke.test.ts`
  - CI-safe Vitest coverage for smoke routing, acceptance, and artifacts.

- `packages/lead-agent/test/fixtures/academic-smoke/manuscript_excerpt.md`
  - Short realistic manuscript excerpt with one overclaim and one citation-dependent statement.

- `packages/lead-agent/test/fixtures/academic-smoke/review_comments.md`
  - Reviewer comments requiring methods and citation checks.

- `packages/lead-agent/test/fixtures/academic-smoke/method_section.md`
  - Methods excerpt with sample-flow and missing-data assumptions.

- `packages/lead-agent/test/fixtures/academic-smoke/evidence_notes.md`
  - Evidence notes for citation and claim support tasks.

- `packages/lead-agent/test/fixtures/academic-smoke/idea.md`
  - Minimal PaperOrchestra-inspired idea input.

- `packages/lead-agent/test/fixtures/academic-smoke/experimental_log.md`
  - Minimal PaperOrchestra-inspired experiment log input.

- `academic-smoke-test.sh`
  - Root source runner similar to `pi-test.sh`.
  - Runs the smoke suite from source with `tsx`.

Modify:

- `packages/lead-agent/package.json`
  - Add dependency on `@mariozechner/pi-artifact-core`.

- `packages/lead-agent/src/index.ts`
  - Export academic smoke APIs.

- `packages/lead-agent/README.md`
  - Document how to run smoke suite and how it relates to PaperOrchestra.

- `packages/lead-agent/CHANGELOG.md`
  - Add Unreleased entry for academic smoke suite.

- `tsconfig.json`
  - No change expected because `@mariozechner/pi-artifact-core` paths already exist. If missing during execution, add `"@mariozechner/pi-artifact-core": ["./packages/artifact-core/src/index.ts"]`.

---

### Task 1: Add Academic Smoke Fixtures

**Files:**
- Create: `packages/lead-agent/test/fixtures/academic-smoke/manuscript_excerpt.md`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/review_comments.md`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/method_section.md`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/evidence_notes.md`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/idea.md`
- Create: `packages/lead-agent/test/fixtures/academic-smoke/experimental_log.md`

- [ ] **Step 1: Create the fixture directory**

Run:

```bash
mkdir -p packages/lead-agent/test/fixtures/academic-smoke
```

Expected: command exits with status 0.

- [ ] **Step 2: Create `manuscript_excerpt.md`**

Write this exact file:

```markdown
# Manuscript Excerpt

## Background

Sleep disruption is strongly associated with later depressive symptoms in longitudinal cohorts. Our preliminary model suggests that sleep quality fully explains the relationship between baseline stress and follow-up depression.

## Results

Among 1,284 participants, higher baseline sleep disturbance was associated with increased depressive symptom scores at 12 months. The manuscript currently states that the intervention prevents depression, but the available data are observational.
```

- [ ] **Step 3: Create `review_comments.md`**

Write this exact file:

```markdown
# Reviewer Comments

1. Please clarify whether the longitudinal analysis can support causal claims.
2. The methods section does not describe how missing follow-up data were handled.
3. Several claims in the background appear citation-dependent and need stronger support.
4. Please provide a concise revision plan before rewriting the manuscript.
```

- [ ] **Step 4: Create `method_section.md`**

Write this exact file:

```markdown
# Methods Excerpt

Participants were enrolled from two outpatient clinics and completed baseline questionnaires. Follow-up depressive symptoms were measured after 12 months. We used linear regression adjusted for age and sex.

The current draft does not report the number of excluded participants, the missing follow-up rate, whether complete-case analysis or imputation was used, or whether model assumptions were checked.
```

- [ ] **Step 5: Create `evidence_notes.md`**

Write this exact file:

```markdown
# Evidence Notes

- Observational longitudinal data can support temporal association but not definitive prevention claims.
- Missing follow-up data require explicit handling; complete-case analysis can bias estimates if missingness is related to outcome.
- Background claims about sleep and depression require citations from longitudinal cohort studies or systematic reviews.
```

- [ ] **Step 6: Create `idea.md`**

Write this exact file:

```markdown
# Idea

Write a concise academic revision workflow for a longitudinal sleep and depression manuscript. The workflow should identify unsupported causal wording, methods-reporting gaps, and citation-dependent claims before drafting revised prose.
```

- [ ] **Step 7: Create `experimental_log.md`**

Write this exact file:

```markdown
# Experimental Log

## Data

- Cohort size reported in draft: 1,284 participants.
- Outcome: depressive symptom score at 12 months.
- Predictors: baseline sleep disturbance and baseline stress.

## Current Analysis

- Linear regression adjusted for age and sex.
- Missing data handling is not reported.
- No model diagnostics are reported.

## Writing Risks

- Draft uses prevention language despite observational design.
- Background has citation-dependent sleep-depression claims.
```

- [ ] **Step 8: Verify fixtures exist**

Run:

```bash
find packages/lead-agent/test/fixtures/academic-smoke -maxdepth 1 -type f | sort
```

Expected output contains exactly these filenames:

```text
packages/lead-agent/test/fixtures/academic-smoke/evidence_notes.md
packages/lead-agent/test/fixtures/academic-smoke/experimental_log.md
packages/lead-agent/test/fixtures/academic-smoke/idea.md
packages/lead-agent/test/fixtures/academic-smoke/manuscript_excerpt.md
packages/lead-agent/test/fixtures/academic-smoke/method_section.md
packages/lead-agent/test/fixtures/academic-smoke/review_comments.md
```

- [ ] **Step 9: Checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/test/fixtures/academic-smoke/manuscript_excerpt.md \
  packages/lead-agent/test/fixtures/academic-smoke/review_comments.md \
  packages/lead-agent/test/fixtures/academic-smoke/method_section.md \
  packages/lead-agent/test/fixtures/academic-smoke/evidence_notes.md \
  packages/lead-agent/test/fixtures/academic-smoke/idea.md \
  packages/lead-agent/test/fixtures/academic-smoke/experimental_log.md
git commit -m "test(lead-agent): add academic smoke fixtures"
```

If commit authorization is not active, skip this checkpoint and leave the files unstaged.

---

### Task 2: Add the Academic Smoke Runner Module

**Files:**
- Create: `packages/lead-agent/src/academic-smoke.ts`
- Modify: `packages/lead-agent/package.json`
- Modify: `packages/lead-agent/src/index.ts`

- [ ] **Step 1: Add `artifact-core` to `lead-agent` dependencies**

Modify `packages/lead-agent/package.json` so `dependencies` contains:

```json
{
	"@mariozechner/pi-agent-contracts": "^0.73.0",
	"@mariozechner/pi-agent-host": "^0.73.0",
	"@mariozechner/pi-artifact-core": "^0.73.0",
	"@mariozechner/pi-coding-agent": "^0.73.0"
}
```

- [ ] **Step 2: Create `packages/lead-agent/src/academic-smoke.ts`**

Write this exact file:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef, WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import {
	ACADEMIC_ARTIFACT_KINDS,
	createAcademicArtifact,
	type ArtifactStore,
	FileSystemArtifactStore,
	MemoryArtifactStore,
} from "@mariozechner/pi-artifact-core";
import { createLeadAgentRuntime, type LeadAgentResult, type LeadAgentWorkerRunner } from "./index.js";

export interface AcademicSmokeCase {
	id: string;
	objective: string;
	fixtureFiles: string[];
	expectedProfileId?: string;
	expectedOutputs: string[];
	artifactKind?: string;
}

export interface AcademicSmokeCaseResult {
	caseId: string;
	result: LeadAgentResult;
	passed: boolean;
	failures: string[];
}

export interface AcademicSmokeSuiteResult {
	results: AcademicSmokeCaseResult[];
	artifactRefs: ArtifactRef[];
	manifestPath?: string;
	passed: boolean;
}

export interface RunAcademicSmokeSuiteOptions {
	fixtureDir?: string;
	artifactDir?: string;
	workerRunner?: LeadAgentWorkerRunner;
}

export const DEFAULT_ACADEMIC_SMOKE_CASES: AcademicSmokeCase[] = [
	{
		id: "direct-writing",
		objective: "Rewrite the manuscript background excerpt into concise academic Chinese without adding claims.",
		fixtureFiles: ["manuscript_excerpt.md"],
		expectedOutputs: [],
	},
	{
		id: "citation-check",
		objective: "Review the manuscript evidence notes and identify citation gaps.",
		fixtureFiles: ["manuscript_excerpt.md", "evidence_notes.md"],
		expectedProfileId: "citation-checker",
		expectedOutputs: ["citation audit"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.claimAudit,
	},
	{
		id: "method-audit",
		objective: "Audit the methods section for reproducibility and missing-data assumptions.",
		fixtureFiles: ["method_section.md", "review_comments.md"],
		expectedProfileId: "method-auditor",
		expectedOutputs: ["methods audit"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.revisionPlan,
	},
	{
		id: "review-memo",
		objective: "Review the manuscript and reviewer comments, then produce severity ordered findings.",
		fixtureFiles: ["manuscript_excerpt.md", "review_comments.md"],
		expectedProfileId: "reviewer",
		expectedOutputs: ["review memo"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.reviewCommentMap,
	},
	{
		id: "mini-paperorchestra-inputs",
		objective: "Use the idea and experimental log to produce an outline and revision plan.",
		fixtureFiles: ["idea.md", "experimental_log.md"],
		expectedProfileId: "researcher",
		expectedOutputs: ["evidence summary"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.outline,
	},
];

function defaultFixtureDir(): string {
	return join(import.meta.dirname, "../test/fixtures/academic-smoke");
}

function readFixtureContext(fixtureDir: string, fixtureFiles: string[]): string {
	return fixtureFiles
		.map((filename) => {
			const content = readFileSync(join(fixtureDir, filename), "utf8").trim();
			return `## ${filename}\n\n${content}`;
		})
		.join("\n\n");
}

function createStore(options: RunAcademicSmokeSuiteOptions): ArtifactStore {
	return options.artifactDir ? new FileSystemArtifactStore(options.artifactDir) : new MemoryArtifactStore();
}

function deterministicWorkerRunner(store: ArtifactStore): LeadAgentWorkerRunner {
	return async (request: WorkerRequest): Promise<WorkerResult> => {
		const artifact = createAcademicArtifact(store, {
			kind:
				request.workerType === "citation-checker"
					? ACADEMIC_ARTIFACT_KINDS.claimAudit
					: request.workerType === "method-auditor"
						? ACADEMIC_ARTIFACT_KINDS.revisionPlan
						: request.workerType === "reviewer"
							? ACADEMIC_ARTIFACT_KINDS.reviewCommentMap
							: ACADEMIC_ARTIFACT_KINDS.evidenceTable,
			title: `${request.workerType} smoke artifact`,
			content: `${request.workerType}: ${request.expectedOutputs.join(", ")}`,
			metadata: {
				taskId: request.taskId,
				workerType: request.workerType,
			},
		});
		const expectedText = request.expectedOutputs.join("; ");
		return {
			taskId: request.taskId,
			status: "success",
			summary: `${expectedText} completed for ${request.workerType}.`,
			structuredOutputs: {
				expectedOutputs: request.expectedOutputs,
				workerType: request.workerType,
			},
			producedArtifacts: [
				{
					id: artifact.id,
					kind: artifact.kind,
					uri: artifact.uri,
					title: artifact.title,
					version: artifact.version,
				},
			],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace(`academic-smoke-${request.taskId}`),
		};
	};
}

function failuresForCase(testCase: AcademicSmokeCase, result: LeadAgentResult): string[] {
	const failures: string[] = [];
	if (testCase.expectedProfileId && result.decision.profileId !== testCase.expectedProfileId) {
		failures.push(`expected profile ${testCase.expectedProfileId}, got ${result.decision.profileId ?? "none"}`);
	}
	if (testCase.expectedOutputs.length === 0 && result.decision.mode !== "direct") {
		failures.push(`expected direct mode, got ${result.decision.mode}`);
	}
	if (testCase.expectedOutputs.length > 0 && result.decision.mode !== "worker") {
		failures.push(`expected worker mode, got ${result.decision.mode}`);
	}
	if (result.acceptanceReport && !result.acceptanceReport.accepted) {
		failures.push(`acceptance rejected: ${result.acceptanceReport.issues.map((issue) => issue.code).join(", ")}`);
	}
	if (testCase.artifactKind && !result.workerResult?.producedArtifacts.some((artifact) => artifact.kind === testCase.artifactKind)) {
		failures.push(`expected artifact kind ${testCase.artifactKind}`);
	}
	return failures;
}

export async function runAcademicSmokeSuite(
	options: RunAcademicSmokeSuiteOptions = {},
): Promise<AcademicSmokeSuiteResult> {
	const fixtureDir = options.fixtureDir ?? defaultFixtureDir();
	const store = createStore(options);
	const workerRunner = options.workerRunner ?? deterministicWorkerRunner(store);
	const runtime = createLeadAgentRuntime({
		workerRunner,
	});
	const results: AcademicSmokeCaseResult[] = [];
	for (const testCase of DEFAULT_ACADEMIC_SMOKE_CASES) {
		const context = readFixtureContext(fixtureDir, testCase.fixtureFiles);
		const result = await runtime.run({
			taskId: testCase.id,
			objective: `${testCase.objective}\n\n${context}`,
			expectedOutputs: testCase.expectedOutputs.length > 0 ? testCase.expectedOutputs : undefined,
		});
		const failures = failuresForCase(testCase, result);
		results.push({
			caseId: testCase.id,
			result,
			failures,
			passed: failures.length === 0,
		});
	}
	return {
		results,
		artifactRefs: store.manifest().artifacts,
		manifestPath: options.artifactDir ? join(options.artifactDir, "artifacts.json") : undefined,
		passed: results.every((result) => result.passed),
	};
}
```

- [ ] **Step 3: Export the smoke APIs from `packages/lead-agent/src/index.ts`**

Add this line at the end of `packages/lead-agent/src/index.ts`:

```ts
export * from "./academic-smoke.js";
```

- [ ] **Step 4: Run focused typecheck**

Run:

```bash
npx tsgo --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 5: Checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/package.json packages/lead-agent/src/academic-smoke.ts packages/lead-agent/src/index.ts
git commit -m "feat(lead-agent): add academic smoke runner"
```

If commit authorization is not active, skip this checkpoint and leave the files unstaged.

---

### Task 3: Add Academic Smoke Tests

**Files:**
- Create: `packages/lead-agent/test/academic-smoke.test.ts`

- [ ] **Step 1: Create the test file**

Write this exact file:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_SMOKE_CASES, runAcademicSmokeSuite } from "../src/academic-smoke.js";

describe("academic workflow smoke suite", () => {
	it("defines realistic academic smoke cases", () => {
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.map((testCase) => testCase.id)).toEqual([
			"direct-writing",
			"citation-check",
			"method-audit",
			"review-memo",
			"mini-paperorchestra-inputs",
		]);
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "citation-check")).toMatchObject({
			expectedProfileId: "citation-checker",
			expectedOutputs: ["citation audit"],
		});
	});

	it("passes routing, acceptance, and artifact gates with deterministic workers", async () => {
		const result = await runAcademicSmokeSuite();

		expect(result.passed).toBe(true);
		expect(result.results).toHaveLength(5);
		expect(result.results.map((caseResult) => [caseResult.caseId, caseResult.result.decision.mode])).toEqual([
			["direct-writing", "direct"],
			["citation-check", "worker"],
			["method-audit", "worker"],
			["review-memo", "worker"],
			["mini-paperorchestra-inputs", "worker"],
		]);
		expect(result.artifactRefs.map((artifact) => artifact.kind)).toEqual([
			"claim-audit",
			"revision-plan",
			"review-comment-map",
			"evidence-table",
		]);
	});

	it("writes a manifest when artifactDir is provided", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "lead-agent-smoke-"));
		try {
			const result = await runAcademicSmokeSuite({ artifactDir: tempDir });

			expect(result.passed).toBe(true);
			expect(result.manifestPath).toBe(join(tempDir, "artifacts.json"));
			expect(result.artifactRefs).toHaveLength(4);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
```

- [ ] **Step 2: Run the new smoke tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Run existing lead-agent tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts
```

Expected: existing lead-agent tests pass.

- [ ] **Step 4: Checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/test/academic-smoke.test.ts
git commit -m "test(lead-agent): cover academic smoke suite"
```

If commit authorization is not active, skip this checkpoint and leave the files unstaged.

---

### Task 4: Add a Root Academic Smoke Runner

**Files:**
- Create: `packages/lead-agent/src/academic-smoke-cli.ts`
- Create: `academic-smoke-test.sh`

- [ ] **Step 1: Create `packages/lead-agent/src/academic-smoke-cli.ts`**

Write this exact file:

```ts
#!/usr/bin/env node
import { runAcademicSmokeSuite } from "./academic-smoke.js";

interface CliOptions {
	artifactDir?: string;
	json: boolean;
	help: boolean;
}

function usage(): string {
	return `Usage: ./academic-smoke-test.sh [options]

Options:
  --artifact-dir <path>   Persist smoke artifacts and manifest to this directory
  --json                  Print the full smoke suite result as JSON
  --help                  Show this help`;
}

function readOptionValue(args: string[], index: number, optionName: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${optionName} requires a value`);
	}
	return value;
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		json: false,
		help: false,
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		switch (arg) {
			case "--artifact-dir":
				options.artifactDir = readOptionValue(args, index, arg);
				index++;
				break;
			case "--json":
				options.json = true;
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	const result = await runAcademicSmokeSuite({
		artifactDir: options.artifactDir,
	});
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		for (const caseResult of result.results) {
			console.log(`${caseResult.passed ? "PASS" : "FAIL"} ${caseResult.caseId}`);
			for (const failure of caseResult.failures) {
				console.log(`  - ${failure}`);
			}
		}
		console.log(`artifacts: ${result.artifactRefs.length}`);
		if (result.manifestPath) {
			console.log(`manifest: ${result.manifestPath}`);
		}
	}
	if (!result.passed) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
```

- [ ] **Step 2: Create root `academic-smoke-test.sh`**

Write this exact file:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TSX_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
if [[ ! -x "$TSX_BIN" ]]; then
  echo "tsx not found at $TSX_BIN. Run npm install from the repo root first." >&2
  exit 1
fi

"$TSX_BIN" "$SCRIPT_DIR/packages/lead-agent/src/academic-smoke-cli.ts" "$@"
```

- [ ] **Step 3: Make the runner executable**

Run:

```bash
chmod +x academic-smoke-test.sh
```

Expected: command exits with status 0.

- [ ] **Step 4: Run smoke CLI without artifact dir**

Run from repo root:

```bash
./academic-smoke-test.sh
```

Expected output:

```text
PASS direct-writing
PASS citation-check
PASS method-audit
PASS review-memo
PASS mini-paperorchestra-inputs
artifacts: 4
```

- [ ] **Step 5: Run smoke CLI with artifact manifest**

Run from repo root:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke
```

Expected output includes:

```text
manifest: .tmp/academic-smoke/artifacts.json
```

Then run:

```bash
test -f .tmp/academic-smoke/artifacts.json
```

Expected: command exits with status 0.

- [ ] **Step 6: Checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/src/academic-smoke-cli.ts academic-smoke-test.sh
git commit -m "feat(lead-agent): add academic smoke CLI"
```

If commit authorization is not active, skip this checkpoint and leave the files unstaged.

---

### Task 5: Document the PaperOrchestra-Inspired Smoke Boundary

**Files:**
- Modify: `packages/lead-agent/README.md`
- Modify: `packages/lead-agent/CHANGELOG.md`

- [ ] **Step 1: Add README section**

Append this section to `packages/lead-agent/README.md`:

```markdown
## Academic Workflow Smoke

The repo-level `academic-smoke-test.sh` runner validates a lightweight academic workflow using realistic manuscript, reviewer, methods, evidence, and PaperOrchestra-style pre-writing fixtures.

It intentionally does not run the full PaperOrchestra pipeline. It borrows PaperOrchestra's useful boundaries: structured pre-writing inputs, staged academic roles, and deterministic gates. The local smoke suite checks:

- direct writing remains in the lead agent
- citation, methods, review, and research tasks route to the expected profile
- worker outputs satisfy expected-output acceptance gates
- artifact refs are produced for claim audit, revision plan, review comment map, and evidence table outputs
- optional artifact persistence writes an `artifacts.json` manifest

Run:

```bash
./academic-smoke-test.sh
```

Persist artifacts:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke
```
```

- [ ] **Step 2: Add changelog entry**

Under `## [Unreleased]` / `### Added` in `packages/lead-agent/CHANGELOG.md`, add:

```markdown
- Added an academic workflow smoke suite and root runner with realistic manuscript, methods, evidence, reviewer, and PaperOrchestra-style fixtures.
```

- [ ] **Step 3: Run README and changelog formatting check**

Run from repo root:

```bash
npm run check
```

Expected: command exits with status 0. If Biome reports that it fixed files, continue to Task 6 and rerun focused tests after formatting.

- [ ] **Step 4: Checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/README.md packages/lead-agent/CHANGELOG.md
git commit -m "docs(lead-agent): document academic smoke workflow"
```

If commit authorization is not active, skip this checkpoint and leave the files unstaged.

---

### Task 6: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run lead-agent smoke tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/academic-smoke.test.ts test/lead-agent.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run artifact-core tests**

Run from `packages/artifact-core`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/artifact-store.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run coding-agent worker adapter test**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: command exits with status 0.

- [ ] **Step 5: Run smoke CLI**

Run from repo root:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke --json
```

Expected: JSON output contains:

```json
{
  "passed": true
}
```

and `.tmp/academic-smoke/artifacts.json` exists.

- [ ] **Step 6: Inspect git status**

Run:

```bash
git status --short --untracked-files=all
```

Expected: changed files are limited to the files listed in this plan plus pre-existing uncommitted Phase 4-7 files if they have not already been committed.

- [ ] **Step 7: Final checkpoint**

If the user has explicitly allowed commits in the current execution session, run:

```bash
git add packages/lead-agent/package.json \
  packages/lead-agent/src/academic-smoke.ts \
  packages/lead-agent/src/academic-smoke-cli.ts \
  packages/lead-agent/src/index.ts \
  packages/lead-agent/test/academic-smoke.test.ts \
  packages/lead-agent/test/fixtures/academic-smoke/manuscript_excerpt.md \
  packages/lead-agent/test/fixtures/academic-smoke/review_comments.md \
  packages/lead-agent/test/fixtures/academic-smoke/method_section.md \
  packages/lead-agent/test/fixtures/academic-smoke/evidence_notes.md \
  packages/lead-agent/test/fixtures/academic-smoke/idea.md \
  packages/lead-agent/test/fixtures/academic-smoke/experimental_log.md \
  packages/lead-agent/README.md \
  packages/lead-agent/CHANGELOG.md \
  academic-smoke-test.sh
git commit -m "feat(lead-agent): add academic workflow smoke suite"
```

If commit authorization is not active, skip this checkpoint and report the uncommitted files.

---

## Self-Review

**Spec coverage:** This plan covers the requested next step: using PaperOrchestra as a reference while making the current `lead-agent` capable of running a realistic academic workflow smoke. It includes fixtures, deterministic worker output, acceptance checks, artifacts, a root runner, and verification commands.

**Placeholder scan:** The plan contains no deferred implementation markers and no references to undefined functions. Every new file has concrete content.

**Type consistency:** `AcademicSmokeCase`, `AcademicSmokeCaseResult`, `AcademicSmokeSuiteResult`, and `RunAcademicSmokeSuiteOptions` are defined before use. The smoke runner uses existing `LeadAgentResult`, `LeadAgentWorkerRunner`, `WorkerRequest`, `WorkerResult`, `ArtifactRef`, and `artifact-core` APIs that already exist or are created in the current migration branch.
