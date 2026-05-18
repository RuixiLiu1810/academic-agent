# Main Branch Re-evaluation: Contract-First Refactor Spec for `academic-agent`

**Repository:** `https://github.com/RuixiLiu1810/academic-agent`  
**Branch evaluated:** `main`  
**Date:** 2026-05-18  
**Scope:** `packages/agent-contracts`, `packages/artifact-core`, `packages/lead-agent`, workflow planning, worker execution, acceptance, artifacts, smoke testing.

---

## 0. Correction

The earlier review was based on the `agent-boundary-migration` branch. This document re-evaluates the repository from `main`.

The main branch already contains the same core academic-agent additions: `packages/lead-agent`, `packages/agent-contracts`, `packages/artifact-core`, `academic-smoke-test.sh`, `lead-agent-test.sh`, profile parsing, LLM workflow planner, workflow executor, and a default profile worker runner. The central diagnosis remains valid, but this evaluation is restated against `main` only.

---

## 1. Executive Assessment

The project has a useful architectural direction: it introduces a lead-agent orchestration layer over a Pi-style monorepo, with academic profiles, workflow planning, artifact persistence, and acceptance reports. However, the implementation is currently in an unstable intermediate state.

The main architectural defect is not one isolated bug. It is a contract mismatch across four layers:

```text
Workflow templates declare artifact-level outputs
        ↓
Planner emits WorkflowPlan with string expectedOutputs + artifact kinds
        ↓
WorkerRequest drops expectedArtifactKinds
        ↓
Profile worker runner only extracts literature.search artifacts
        ↓
Acceptance checks string expectedOutputs, with special-case artifact rules
        ↓
Executor retries the same request without acceptance feedback
```

This means the system can generate workflow plans that the runtime is structurally incapable of satisfying.

The recurring errors are therefore expected behavior:

```text
worker_failed: Profile worker did not produce a literature artifact.
expected_output_missing: bibliography candidates
expected_output_missing: evidence-table
worker_warning: Domain-agnostic query
```

These errors are symptoms of a broken output-contract layer.

---

## 2. Files Evaluated and Practical Findings

### 2.1 `packages/agent-contracts/src/index.ts`

Current contract types define:

- `WorkerProfile.expectedOutputs?: string[]`
- `WorkerRequest.expectedOutputs: string[]`
- `WorkflowStep.expectedArtifactKinds: string[]`
- `WorkflowStep.expectedOutputs: string[]`
- `WorkerResult.structuredOutputs?: JsonObject`
- `WorkerResult.producedArtifacts: ArtifactRef[]`

This is insufficient for a reliable academic workflow system.

The core problem is that `expectedOutputs: string[]` is overloaded. It currently acts as:

1. user-facing requested output labels;
2. machine-readable acceptance requirements;
3. implicit artifact requirements;
4. prompt instructions;
5. compatibility hints for planner and profiles.

Those are different concepts and should not share one field.

#### Required change

Introduce structured output contracts:

```ts
export type OutputRequirementKind =
  | "summary"
  | "text-section"
  | "artifact"
  | "structured";

export interface OutputRequirement {
  id: string;
  label: string;
  kind: OutputRequirementKind;
  required: boolean;
  artifactKind?: string;
  structuredPath?: string;
  minItems?: number;
  aliases?: string[];
  description?: string;
}

export interface ArtifactRequirement {
  kind: string;
  required: boolean;
  minCount?: number;
  mediaType?: string;
  titlePattern?: string;
  description?: string;
}
```

Then update:

```ts
export interface WorkerProfile {
  ...
  outputContract?: OutputRequirement[];
  artifactContract?: ArtifactRequirement[];
}

export interface WorkerRequest {
  ...
  outputContract: OutputRequirement[];
  artifactContract: ArtifactRequirement[];
  expectedOutputs?: string[]; // backward compatibility only
}

export interface WorkflowStep {
  ...
  outputContract: OutputRequirement[];
  artifactContract: ArtifactRequirement[];
  expectedOutputs?: string[]; // deprecated
  expectedArtifactKinds?: string[]; // deprecated
}
```

### 2.2 `packages/artifact-core/src/index.ts`

Artifact kinds are already enumerated:

```ts
evidence-table
outline
claim-audit
review-comment-map
revision-plan
response-letter-draft
literature-search-results
bibliography-candidates
search-strategy
```

This is a good start. The weakness is that artifact kinds are defined, but the live worker system does not have production paths for most of them.

Currently, the live profile worker runner only extracts artifacts from `literature.search`. It does not produce:

- `evidence-table`
- `claim-audit`
- `review-comment-map`
- `revision-plan`
- `outline`
- `draft-text`
- `response-letter-draft`

Therefore templates that require these artifacts can fail even if the worker produced usable text.

#### Required change

Move artifact kind definitions closer to schema definitions. Define typed artifact content schemas:

```ts
export interface EvidenceTableArtifactContent {
  columns: string[];
  rows: Array<{
    sourceId?: string;
    citation?: string;
    populationOrModel?: string;
    method?: string;
    outcome?: string;
    finding?: string;
    limitation?: string;
    confidence?: "low" | "moderate" | "high";
  }>;
  uncertaintyNotes: string[];
}

export interface ClaimAuditArtifactContent {
  claims: Array<{
    claim: string;
    supportStatus: "supported" | "unsupported" | "needs-citation" | "overstated";
    supportingSources: string[];
    recommendation: string;
  }>;
}
```

Do not merely declare artifact kinds; define their content contracts.

### 2.3 `packages/lead-agent/src/orchestration/templates.ts`

Templates are conceptually useful but currently overpromise.

Examples:

- `literature-to-evidence` requires `evidence-table`.
- `citation-audit` requires `claim-audit`.
- `method-audit` requires `revision-plan`.
- `review-memo` requires `review-comment-map`.
- `evidence-synthesis` requires `evidence-table` and `outline`.
- `outline-to-draft` requires `draft-text`.

The runtime does not actually generate these artifact kinds except through the literature search tool.

#### Required change

Templates should reference `outputContract` and `artifactContract`, not plain strings.

Example:

```ts
{
  id: "literature-to-evidence",
  steps: [
    {
      id: "literature-search",
      profileId: "literature-searcher",
      artifactContract: [
        { kind: "literature-search-results", required: true, minCount: 1 }
      ],
      outputContract: [
        { id: "search-strategy", label: "Search Strategy", kind: "text-section", required: true },
        { id: "retrieval-gaps", label: "Retrieval Gaps", kind: "text-section", required: true }
      ]
    },
    {
      id: "evidence-summary",
      profileId: "researcher",
      artifactContract: [
        { kind: "evidence-table", required: true, minCount: 1 }
      ],
      outputContract: [
        { id: "evidence-summary", label: "Evidence Summary", kind: "text-section", required: true },
        { id: "uncertainty-notes", label: "Uncertainty Notes", kind: "structured", structuredPath: "uncertaintyNotes", required: true, minItems: 1 }
      ]
    }
  ]
}
```

### 2.4 `packages/lead-agent/src/orchestration/planner.ts`

Current validation checks basic shape:

- plan mode;
- steps array;
- known profileId;
- duplicate step id;
- positive order;
- objective contains `User objective:` and `Step objective:`;
- artifact ref ids exist;
- arrays are strings.

It does not enforce:

- plan `taskId` equals planning input `taskId`;
- plan `sessionId` equals planning input `sessionId`;
- plan objective equals the original objective;
- step order uniqueness and continuity;
- profile can produce declared artifacts;
- output contract compatibility;
- `User objective:` section is truly verbatim.

#### Required change

Extend `PlannerValidationContext`:

```ts
export interface PlannerValidationContext {
  taskId: string;
  sessionId: string;
  objective: string;
  profiles: readonly WorkerProfile[];
  templates: readonly WorkflowTemplate[];
  inputArtifacts: readonly ArtifactRef[];
  profileContracts: ProfileContractRegistry;
}
```

Add validations:

1. `p.taskId === context.taskId`
2. `p.sessionId === context.sessionId`
3. `p.objective === context.objective`
4. step orders are unique and continuous from 1
5. every required artifact kind is supported by that profile
6. every output contract is supported by that profile
7. `User objective:` content exactly equals `context.objective`

### 2.5 `packages/lead-agent/src/orchestration/llm-planner.ts`

The LLM planner is structurally sensible: it uses a `submit_workflow_plan` tool call, validates, then attempts one repair. This is the right direction.

However, it lacks contract awareness. It gives the LLM workflow templates as guidance but does not tell it which outputs are actually producible by each profile. It also allows the planner to ask for artifacts that the worker runner cannot create.

#### Required change

Planner prompt must include a generated capability table:

```text
Available output contracts by profile:

literature-searcher:
- artifact: literature-search-results
- text-section: search-strategy
- text-section: query-plan
- text-section: retrieval-gaps

researcher:
- artifact: evidence-table
- structured: evidenceTable.rows
- text-section: evidence-summary
- structured: uncertaintyNotes

citation-checker:
- artifact: claim-audit
- structured: citationAudit.claims
...
```

Hard rule:

```text
A workflow step may only request artifacts and structured outputs listed in that profile's contract.
```

### 2.6 `packages/lead-agent/src/orchestration/executor.ts`

The executor performs ordered, linear execution and does basic retry. It also retrieves small artifacts from the artifact store and injects them into metadata. This is useful.

The critical problem: retry is blind. If acceptance fails, the same `workerRequest` is passed again. No previous acceptance issues are added to the second attempt.

#### Required change

Retry loop must pass feedback:

```ts
let previousAcceptanceIssues: AcceptanceIssue[] = [];

while (...) {
  const attemptRequest: WorkerRequest = {
    ...workerRequest,
    metadata: {
      ...(workerRequest.metadata ?? {}),
      attempt,
      previousAcceptanceIssues,
    },
  };

  workerResult = await workerRunner(attemptRequest);
  acceptanceReport = createLeadAcceptanceReport(attemptRequest, workerResult);

  if (acceptanceReport.accepted || ...) break;

  previousAcceptanceIssues = acceptanceReport.issues.filter(i => i.severity === "error");
}
```

Also, `workerRequestForStep()` must include `artifactContract` and `outputContract`, not only `expectedOutputs`.

### 2.7 `packages/lead-agent/src/orchestration/acceptance.ts`

This file contains the most direct cause of the observed errors.

Current logic:

```ts
function requiresArtifactRef(expectedOutput: string): boolean {
  const normalized = normalizeOutputLabel(expectedOutput);
  return normalized === "literaturesearchresults" || normalized === "bibliographycandidates";
}
```

So `bibliography candidates` is treated as an artifact requirement. But templates and prompts use it as a natural-language output label. This is why a worker can produce a textual bibliography section and still fail if it does not produce an artifact.

Acceptance then checks whether each expected output string appears in summary, artifacts, artifact briefs, or JSON. This is fragile and semantically shallow.

#### Required change

Replace string matching acceptance with contract checking.

```ts
function checkOutputRequirement(
  result: WorkerResult,
  requirement: OutputRequirement,
): AcceptanceIssue[] {
  switch (requirement.kind) {
    case "summary":
      return result.summary.trim().length > 0 ? [] : missing(requirement);

    case "text-section":
      return sectionPresent(result.summary, requirement) ? [] : missing(requirement);

    case "artifact":
      return result.producedArtifacts.some(a => a.kind === requirement.artifactKind)
        ? []
        : missing(requirement);

    case "structured":
      return structuredPathSatisfies(result.structuredOutputs, requirement)
        ? []
        : missing(requirement);
  }
}
```

Then acceptance report should be:

```ts
const issues = [
  ...checkWorkerStatus(result),
  ...artifactContract.flatMap(req => checkArtifactRequirement(result, req)),
  ...outputContract.flatMap(req => checkOutputRequirement(result, req)),
  ...warningsAsNonBlockingIssues(result),
];
```

### 2.8 `packages/lead-agent/src/workers/profile-worker-runner.ts`

This is the most important live-runtime bug.

Current runner:

1. validates allowed tools;
2. starts an agent-host session;
3. builds a weak prompt;
4. extracts only `literature.search` tool outputs;
5. sets `status = success` only if `producedArtifacts.length > 0`.

Therefore every profile worker is implicitly treated as a literature-search worker.

This is why reviewer, method-auditor, writer, reviser, researcher, and citation-checker can be wrongly marked as failed.

#### Required change

Replace one generic profile runner with a dispatcher:

```ts
export function createAcademicWorkerRunner(options): LeadAgentWorkerRunner {
  const runners = {
    "literature-searcher": createLiteratureSearchWorkerRunner(options),
    researcher: createEvidenceSynthesisWorkerRunner(options),
    reviewer: createReviewWorkerRunner(options),
    "method-auditor": createMethodAuditWorkerRunner(options),
    "citation-checker": createCitationCheckWorkerRunner(options),
    writer: createWritingWorkerRunner(options),
    reviser: createRevisionWorkerRunner(options),
  };

  return request => runners[request.workerType]?.(request)
    ?? createUnsupportedProfileResult(request);
}
```

Profile-specific success criteria:

| Profile | Success condition |
|---|---|
| literature-searcher | produces `literature-search-results` artifact and text search strategy |
| researcher | produces `evidence-table` artifact or structured `evidenceTable.rows` |
| citation-checker | produces `claim-audit` artifact or structured `citationAudit.claims` |
| method-auditor | produces structured `methodsAudit.issues` and optionally `revision-plan` |
| reviewer | produces `review-comment-map` or structured `reviewComments` |
| writer | produces `draft-text` artifact or accepted draft section |
| reviser | produces `revision-plan` / revised text artifact or structured revision output |

### 2.9 `packages/lead-agent/src/index.ts`

`createLeadAgentRuntime()` still mixes three planners:

1. heuristic `planLeadAgentTask`;
2. LLM `workflowPlanner`;
3. fallback `createSingleStepWorkflowPlan`.

This causes unclear authority. A heuristic decision can override or reshape an LLM plan.

`createSingleStepWorkflowPlan()` has a serious bug-like design issue:

```ts
expectedArtifactKinds: profile?.expectedOutputs ?? ["worker-summary"]
```

This sets artifact kinds from output labels. For example `["citation audit"]` becomes an artifact kind, which is conceptually wrong.

#### Required change

- Heuristic planner should become a `routingHint`, not an override.
- `createSingleStepWorkflowPlan()` must use profile artifact contract, not `profile.expectedOutputs`.
- If no artifact contract exists, `expectedArtifactKinds` should be empty, not `"worker-summary"`.

### 2.10 `packages/lead-agent/src/orchestration/synthesis.ts`

Final synthesis currently concatenates worker summaries and artifact briefs. This is simple but too weak for research workflows.

It does not verify that synthesis uses only accepted outputs, and it does not reason over structured artifacts.

#### Required change

Create profile-aware synthesis:

```ts
synthesizeWorkflowFinalOutput(plan, execution) {
  const acceptedSteps = execution.stepResults.filter(s => s.acceptanceReport?.accepted);
  const evidenceArtifacts = collectArtifacts(acceptedSteps, "evidence-table");
  const claimAudits = collectArtifacts(acceptedSteps, "claim-audit");
  ...
}
```

For failed workflows, report structured acceptance failures, not just the last worker summary.

### 2.11 `packages/lead-agent/src/academic-smoke-cli.ts` and smoke tests

`academic-smoke-test.sh` invokes `academic-smoke-cli.ts`. It supports `--live-literature-search`, otherwise it likely uses deterministic smoke wiring.

The risk is that deterministic smoke can pass while live agent worker fails. That is exactly the class of problem currently observed.

#### Required change

Add test tiers:

1. contract unit tests;
2. deterministic runner integration tests;
3. live-runner dry tests with mocked tools;
4. optional live provider tests.

At minimum, add tests that assert these failures do not recur:

- reviewer does not fail for lack of literature artifact;
- method-auditor does not fail for lack of literature artifact;
- `bibliography candidates` text section does not require artifact unless artifact contract says so;
- `evidence-table` requirement fails only when declared as artifact or structured output requirement;
- retry prompt contains previous acceptance issues.

---

## 3. Root Cause Matrix

| Symptom | Real cause | File |
|---|---|---|
| `Profile worker did not produce a literature artifact` | Generic profile runner uses literature artifact as universal success condition | `profile-worker-runner.ts` |
| `bibliography candidates` missing | Acceptance hard-codes bibliography candidates as artifact requirement | `acceptance.ts` |
| `evidence-table` missing | Template asks for artifact that runner cannot produce | `templates.ts`, `profile-worker-runner.ts` |
| Retry repeats same failure | Executor does not pass acceptance feedback to next attempt | `executor.ts` |
| Planner emits impossible plan | Validator does not check profile-output compatibility | `planner.ts`, `llm-planner.ts` |
| Single-step fallback has wrong artifact kinds | `profile.expectedOutputs` used as `expectedArtifactKinds` | `index.ts` |
| Smoke test passes but live run fails | Deterministic test path does not exercise live profile runner constraints | `academic-smoke-cli.ts`, smoke suite |

---

## 4. Target Architecture

### 4.1 Contract-first workflow

The long-term architecture should be:

```text
ProfileContractRegistry
        ↓
WorkflowTemplate uses contracts
        ↓
LLM Planner selects only supported contracts
        ↓
Validator enforces profile-contract compatibility
        ↓
Executor passes contracts into WorkerRequest
        ↓
Profile-specific Runner produces structured outputs/artifacts
        ↓
Acceptance checks contracts deterministically
        ↓
Retry injects acceptance feedback
        ↓
Synthesis uses accepted outputs only
```

### 4.2 Package-level responsibilities

```text
agent-contracts
  Owns versioned TypeScript interfaces and JSON schemas.

artifact-core
  Owns artifact store and typed academic artifact kind registry.

lead-agent/orchestration
  Owns planning, validation, execution, acceptance, synthesis.

lead-agent/workers
  Owns profile-specific worker runners and output extraction.

lead-agent/literature
  Owns literature retrieval tool and search-result artifact production.

lead-agent/profiles
  Owns human-readable role prompts, not machine contracts.
```

Important: profile markdown should not be the only source of machine-readable contract truth. Use markdown for role prompt and boundaries; use TypeScript registry for contracts.

---

## 5. Implementation Plan

### Phase 1 — Add contract types without breaking current API

**Goal:** Introduce new contract fields while keeping existing string fields.

Files:

- `packages/agent-contracts/src/index.ts`
- tests for serialization/deserialization

Tasks:

1. Add `OutputRequirement`, `ArtifactRequirement`, `WorkerOutputContract`.
2. Add optional `outputContract` and `artifactContract` to `WorkerProfile`.
3. Add required or optional `outputContract` and `artifactContract` to `WorkerRequest`.
4. Add `outputContract` and `artifactContract` to `WorkflowStep`.
5. Keep `expectedOutputs` and `expectedArtifactKinds` as deprecated compatibility fields.
6. Update JSON schemas and runtime type guards.
7. Bump `CONTRACT_SCHEMA_VERSION`.

### Phase 2 — Build profile contract registry

Files:

- `packages/lead-agent/src/workers/contracts.ts`
- `packages/lead-agent/src/index.ts`

Tasks:

1. Define canonical contract for each profile.
2. Add helper:

```ts
getProfileContract(profileId: string): ProfileRuntimeContract
```

3. Merge markdown profile prompts with TypeScript contracts at runtime.
4. Stop deriving artifact requirements from profile `expectedOutputs`.

### Phase 3 — Rewrite templates to use contracts

Files:

- `packages/lead-agent/src/orchestration/templates.ts`

Tasks:

1. Replace `expectedOutputs` string usage with `outputContract`.
2. Replace `expectedArtifactKinds` with `artifactContract`.
3. Generate deprecated fields from contracts only for backward compatibility.
4. Add template validation tests.

### Phase 4 — Strengthen planner validation

Files:

- `packages/lead-agent/src/orchestration/planner.ts`
- `packages/lead-agent/src/orchestration/llm-planner.ts`

Tasks:

1. Add context fields: `taskId`, `sessionId`, `objective`, `profileContracts`.
2. Validate IDs and objective preservation.
3. Validate order uniqueness and continuity.
4. Validate `User objective:` exact copy.
5. Validate each step's artifact/output contracts are supported by selected profile.
6. Improve repair prompt to include contract compatibility errors.

### Phase 5 — Replace acceptance logic

Files:

- `packages/lead-agent/src/orchestration/acceptance.ts`

Tasks:

1. Delete `requiresArtifactRef(expectedOutput)`.
2. Implement `checkArtifactRequirement`.
3. Implement `checkOutputRequirement`.
4. Implement JSON path checks for structured outputs.
5. Keep legacy string matching only as fallback mode.
6. Add unit tests for every observed error.

### Phase 6 — Replace generic profile worker runner with dispatching runner

Files:

- `packages/lead-agent/src/workers/profile-worker-runner.ts`
- new files:
  - `literature-search-runner.ts`
  - `evidence-synthesis-runner.ts`
  - `citation-check-runner.ts`
  - `method-audit-runner.ts`
  - `review-runner.ts`
  - `writing-runner.ts`
  - `revision-runner.ts`

Tasks:

1. Implement dispatcher by profile id.
2. Literature runner must call/extract `literature.search`.
3. Researcher runner must produce `evidenceTable` structured output and optionally `evidence-table` artifact.
4. Citation checker must produce `citationAudit`.
5. Method auditor must produce `methodsAudit`.
6. Reviewer must produce `reviewComments`.
7. Writer/reviser must produce `draftText` or corresponding artifact.

### Phase 7 — Fix executor retry

Files:

- `packages/lead-agent/src/orchestration/executor.ts`
- `packages/lead-agent/src/workers/*`

Tasks:

1. Pass attempt number and previous acceptance issues into worker request metadata.
2. Add retry-aware prompt sections.
3. Ensure second attempts target missing contract items.
4. Add tests for retry feedback.

### Phase 8 — Refactor planner authority in runtime

Files:

- `packages/lead-agent/src/index.ts`

Tasks:

1. Change heuristic result to `routingHint`.
2. Only hard override when user explicitly requests `dispatchMode` or `profileId`.
3. Fix `createSingleStepWorkflowPlan()` so it uses contracts.
4. Remove `profile.expectedOutputs` as artifact kind source.

### Phase 9 — Improve synthesis

Files:

- `packages/lead-agent/src/orchestration/synthesis.ts`

Tasks:

1. Synthesize from accepted steps only.
2. Render contract-specific sections.
3. For failed execution, render acceptance issue summary.
4. Include artifact provenance and limitations.

### Phase 10 — Test matrix

Files:

- `packages/lead-agent/src/**/*.test.ts`
- smoke scripts

Required tests:

1. reviewer success with no literature artifact.
2. method-auditor success with no literature artifact.
3. literature-searcher fails if required artifact absent.
4. `bibliography candidates` text requirement does not require artifact.
5. `evidence-table` artifact requirement fails if no artifact exists.
6. `evidenceTable.rows` structured requirement passes with valid structured output.
7. LLM planner validation rejects unsupported artifact kind.
8. retry receives previous acceptance issues.
9. single-step fallback does not put output labels into artifact kinds.
10. final synthesis ignores rejected steps.

---

## 6. Recommended Commit Sequence

1. `agent-contracts: add output and artifact requirement contracts`
2. `lead-agent: add profile runtime contract registry`
3. `lead-agent: migrate workflow templates to contract-first requirements`
4. `lead-agent: validate planner output against profile contracts`
5. `lead-agent: replace string acceptance with contract acceptance`
6. `lead-agent: add retry feedback to workflow executor`
7. `lead-agent: split profile worker runner by academic profile`
8. `lead-agent: fix single-step fallback artifact requirements`
9. `lead-agent: synthesize only accepted contract outputs`
10. `lead-agent: add regression tests for literature artifact failure modes`

---

## 7. Immediate Patch Before Full Refactor

If you need a temporary fix while implementing the long-term refactor:

1. In `profile-worker-runner.ts`, only require literature artifact for `literature-searcher` or `toolPolicy.requireArtifactOutput`.
2. In `acceptance.ts`, remove `bibliographycandidates` from `requiresArtifactRef`.
3. In `index.ts`, fix `createSingleStepWorkflowPlan()` so `expectedArtifactKinds` is not set from `profile.expectedOutputs`.
4. In `executor.ts`, pass `previousAcceptanceIssues` into retry metadata.
5. In `templates.ts`, remove artifact requirements for artifact kinds not yet produced by live runners.

These patches do not replace the contract-first refactor, but they will reduce the current false failures.

---

## 8. Final Evaluation

The main branch is not fundamentally broken as a project direction. It is broken at the contract boundary.

The project is currently between two designs:

1. simple string-based worker summary orchestration;
2. artifact-based academic workflow runtime.

The code has already moved templates and artifact storage toward the second design, but `agent-contracts`, worker runner, acceptance, and retry still behave like the first design. That mismatch is the reason workers frequently fail schema or acceptance checks.

The correct long-term solution is not stronger prompt wording. It is to make contracts first-class, profile-specific, planner-visible, validator-enforced, runner-produced, and acceptance-checked.
