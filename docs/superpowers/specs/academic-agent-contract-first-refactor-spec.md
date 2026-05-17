# Academic Agent Long-Term Contract Refactor Spec

**Repository evaluated:** `RuixiLiu1810/academic-agent`  
**Branch inspected:** `agent-boundary-migration`  
**Primary package:** `packages/lead-agent`  
**Author of this spec:** ChatGPT  
**Date:** 2026-05-18

---

## 0. Executive Summary

The current failure pattern is not primarily caused by weak prompt wording. The deeper cause is a contract mismatch across five layers:

```text
WorkflowTemplate
  -> LLM planner
  -> WorkerRequest
  -> Profile worker runner
  -> Acceptance checker
  -> Final synthesis
```

The project has already moved conceptually toward an academic workflow runtime, but the implementation still treats worker output as a loose mixture of natural-language strings, tool artifacts, and ad-hoc summaries. This creates false failures such as:

```text
worker_failed: Profile worker did not produce a literature artifact
expected_output_missing: bibliography candidates
expected_output_missing: evidence-table
worker_warning: Domain-agnostic query
```

These errors are symptoms of the same architectural issue:

> `expectedOutputs: string[]` is being used simultaneously as user-facing instruction, machine-checkable schema, artifact requirement, and acceptance criterion.

This is the root design problem. The long-term solution is to replace string-based expectations with a structured output contract system, split worker execution by profile capability, enforce profile-output compatibility during planning, and make acceptance a deterministic contract checker rather than a fuzzy string matcher.

---

## 1. Files Reviewed and Realistic Assessment

### 1.1 `packages/agent-contracts/src/index.ts`

Current contract layer defines:

- `ArtifactRef`
- `ArtifactBrief`
- `WorkerProfile`
- `WorkerRequest`
- `WorkerResult`
- `WorkflowStep`
- `WorkflowPlan`
- `AcceptanceReport`

Relevant current shapes:

```ts
export interface WorkerRequest {
  taskId: string;
  workerType: string;
  objective: string;
  constraints: string[];
  inputArtifacts: ArtifactRef[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  executionBudget?: WorkerBudget;
  retryPolicy?: WorkerRetryPolicy;
  profile?: WorkerProfile;
  metadata?: JsonObject;
}
```

```ts
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
```

```ts
export interface WorkerResult {
  taskId: string;
  status: WorkerResultStatus;
  summary: string;
  structuredOutputs?: JsonObject;
  producedArtifacts: ArtifactRef[];
  artifactBriefs?: ArtifactBrief[];
  warnings: string[];
  openQuestions: WorkerOpenQuestion[];
  executionTrace: ExecutionTrace;
  failureReason?: string;
}
```

#### Assessment

This package is the correct place to fix the root issue. It currently has a useful baseline but lacks these concepts:

1. **Expected output contract**
2. **Structured output schema**
3. **Artifact production contract**
4. **Profile capability contract**
5. **Machine-readable acceptance policy**
6. **Versioned academic artifact schemas**

At present, `expectedOutputs: string[]` is too weak for a multi-worker workflow runtime. It should remain only as a legacy compatibility field or be replaced by typed output requirements.

---

### 1.2 `packages/artifact-core/src/index.ts`

Current `ACADEMIC_ARTIFACT_KINDS` already contains useful artifact kinds:

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

#### Assessment

This file already anticipates a multi-artifact academic workflow. However, most of these artifact kinds are not actually produced by the live profile worker runner. The artifact layer is ahead of the execution layer.

Current situation:

| Artifact kind | Declared | Produced by live runner? | Produced by smoke runner? |
|---|---:|---:|---:|
| `literature-search-results` | yes | yes, via `literature.search` | yes |
| `evidence-table` | yes | no | yes |
| `claim-audit` | yes | no | yes |
| `review-comment-map` | yes | no | yes |
| `revision-plan` | yes | no | yes |
| `outline` | yes | no | yes |
| `draft-text` | referenced in templates | not declared in `ACADEMIC_ARTIFACT_KINDS` | no clear canonical declaration |

The smoke runner masks the architectural gap because it creates whatever artifact the test expects. The live runner does not.

---

### 1.3 `packages/lead-agent/src/orchestration/types.ts`

Current `LeadTaskPlanningInput`, `WorkflowTemplateStep`, `WorkflowTemplate`, and `WorkflowPlanner` are minimal.

```ts
export interface WorkflowTemplateStep {
  id: string;
  profileId: string;
  objective: string;
  expectedArtifactKinds: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
}
```

#### Assessment

This is where the template layer begins to drift from execution reality. The template can request artifact kinds, but the worker request does not preserve `expectedArtifactKinds`. Therefore the executor loses information when converting `WorkflowStep` to `WorkerRequest`.

Current loss:

```text
WorkflowStep.expectedArtifactKinds
  -> dropped in workerRequestForStep()
  -> acceptance.ts only sees expectedOutputs
```

This causes acceptance to infer artifact requirements from strings such as `"bibliography candidates"` instead of checking explicit artifact kinds.

---

### 1.4 `packages/lead-agent/src/orchestration/templates.ts`

Current templates define workflows such as:

- `literature-search`
- `literature-to-evidence`
- `citation-audit`
- `method-audit`
- `review-memo`
- `revision-response`
- `evidence-synthesis`
- `outline-to-draft`

Example:

```ts
{
  id: "literature-to-evidence",
  steps: [
    {
      id: "literature-search",
      profileId: "literature-searcher",
      expectedArtifactKinds: ["literature-search-results"],
      expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
    },
    {
      id: "evidence-summary",
      profileId: "researcher",
      expectedArtifactKinds: ["evidence-table"],
      expectedOutputs: ["evidence summary", "evidence-table", "uncertainty notes"],
    },
  ],
}
```

#### Assessment

The templates are conceptually strong but operationally unsafe. They request artifact kinds the live runner cannot produce. They also mix natural-language output names and artifact kind identifiers in `expectedOutputs`.

Specific problems:

1. `expectedOutputs: ["evidence-table"]` duplicates `expectedArtifactKinds: ["evidence-table"]`.
2. `citation-audit` requests `claim-audit`, but no live citation checker runner creates `claim-audit`.
3. `method-audit` requests `revision-plan`, but no live method auditor runner creates `revision-plan`.
4. `review-memo` requests `review-comment-map`, but no live reviewer runner creates it.
5. `outline-to-draft` requests `draft-text`, but `draft-text` is not included in `ACADEMIC_ARTIFACT_KINDS`.

#### Realistic evaluation

These templates describe the product you want, not the runtime you currently have. They should not be used directly as executable contracts until the runner and acceptance layers support them.

---

### 1.5 `packages/lead-agent/src/orchestration/planner.ts`

Current validation checks:

- plan object shape
- mode
- steps array
- stopConditions
- known profile IDs
- duplicate step IDs
- order is number and >= 1
- objective contains `User objective:` and `Step objective:`
- input artifact refs are from initial input artifacts
- `expectedArtifactKinds`, `expectedOutputs`, and `acceptanceCriteria` are string arrays

#### Assessment

The validator is useful but incomplete.

Missing checks:

1. `taskId` equals input `taskId`.
2. `sessionId` equals input `sessionId`.
3. `objective` equals original input objective.
4. step orders are unique.
5. step orders are continuous.
6. `User objective:` section is an exact copy of the original objective.
7. `expectedArtifactKinds` are producible by the chosen profile.
8. `expectedOutputs` are allowed by the profile contract.
9. `inputArtifactRefs` cannot reference prior step artifacts, but the planner prompt says prior outputs are automatically available. This is intentional for linear flow, but it should be explicit.
10. `requiresClarification` is not checked against mode semantics.

The most important missing piece is **profile-output compatibility validation**.

---

### 1.6 `packages/lead-agent/src/orchestration/llm-planner.ts`

Current behavior:

- Uses `submit_workflow_plan` tool.
- Requires exactly one tool call.
- Runs first validation.
- If invalid, asks for repair.
- Throws `PlannerValidationError` if both attempts fail.

#### Assessment

The LLM planner is a good direction. The main issue is that the prompt asks the planner to produce valid `WorkflowPlan`, but the schema it targets is under-specified.

Specific problems:

1. Planner is told to preserve objective, but validator does not actually enforce verbatim preservation.
2. Planner is not told which artifact kinds each profile can produce.
3. Planner sees template summaries, not full machine-readable output contracts.
4. Planner may request artifacts based on templates even when the live runner cannot produce them.
5. Planner is allowed to adapt templates but has no deterministic compatibility guard.
6. `WorkflowPlanSchema` is used as plain JSON object; comment notes it is not a TypeBox schema. This is acceptable short-term, but it weakens schema rigor.

The planner itself is not the main problem. It is being asked to plan against an ambiguous contract.

---

### 1.7 `packages/lead-agent/src/orchestration/executor.ts`

Current behavior:

- Sorts workflow steps by `order`.
- Carries artifacts from previous steps to later steps.
- Retrieves stored artifact content up to `MAX_RETRIEVAL_CHARS`.
- Converts a step into `WorkerRequest`.
- Calls `workerRunner(workerRequest)`.
- Runs `createLeadAcceptanceReport`.
- Retries up to `DEFAULT_RETRY_ATTEMPTS`.
- Stops on non-accepted step.
- Writes workspace JSON.

#### Assessment

The executor is structurally good for a linear workflow runtime, but it has three serious contract problems.

#### Problem 1: `expectedArtifactKinds` are dropped

`workerRequestForStep()` includes:

```ts
expectedOutputs: step.expectedOutputs,
acceptanceCriteria: step.acceptanceCriteria,
```

But does not include:

```ts
expectedArtifactKinds: step.expectedArtifactKinds
```

Therefore acceptance must guess artifact expectations from `expectedOutputs`.

#### Problem 2: retry is blind

The retry loop repeats the same worker request. It does not add previous acceptance issues to the next attempt.

Current loop effect:

```text
Attempt 1 failed because evidence-table missing
Attempt 2 receives same prompt
Attempt 2 likely fails for the same reason
```

#### Problem 3: linear execution is implicit

The executor is linear, not DAG-based. That is acceptable for v1, but it must be declared as an explicit constraint. Otherwise planner/template authors may assume parallelism or dependency graphs.

---

### 1.8 `packages/lead-agent/src/orchestration/acceptance.ts`

Current acceptance logic:

- If worker status is not `success`, add `worker_failed`.
- For every `expectedOutput`, check whether output is satisfied by:
  - summary text
  - artifact metadata
  - artifact brief
  - structured outputs
- Special case:
  - `literaturesearchresults`
  - `bibliographycandidates`
  require at least one produced artifact.
- Warnings become warning-level issues.
- Open questions become info-level issues.
- `createAcceptanceReport` accepts when result is `success` and no error issues.

#### Assessment

This file is the immediate source of the observed errors.

The design problem is that expected output labels are being interpreted as schema. This is fragile.

Example:

```ts
function requiresArtifactRef(expectedOutput: string): boolean {
  const normalized = normalizeOutputLabel(expectedOutput);
  return normalized === "literaturesearchresults" || normalized === "bibliographycandidates";
}
```

This hard-codes a semantic assumption:

```text
bibliography candidates == must produce artifact
```

But a bibliography candidate list may exist as:

- search strategy section
- Markdown table
- JSON structured output
- `literature-search-results` artifact
- `bibliography-candidates` artifact

The acceptance layer should not infer this from a string. It should check a typed `OutputRequirement`.

#### Realistic evaluation

This is the second most urgent file after `profile-worker-runner.ts`.

---

### 1.9 `packages/lead-agent/src/workers/profile-worker-runner.ts`

Current behavior:

- Validates allowed tools exist.
- Creates an agent host session with profile tools.
- Sends `buildPrompt(request)`.
- Extracts `literature.search` tool results.
- Sets `producedArtifacts` to literature search artifacts.
- Returns `status: "success"` only if `producedArtifacts.length > 0`.
- Otherwise returns failure: `"Profile worker did not produce a literature artifact."`

#### Assessment

This is the biggest implementation flaw.

Current success logic:

```ts
status: producedArtifacts.length > 0 ? "success" : "failed"
```

This makes sense only for `literature-searcher`. It is invalid for:

- `researcher`
- `writer`
- `reviewer`
- `reviser`
- `method-auditor`
- `citation-checker`

The runner is named generically but behaves like a literature-search runner.

#### Direct consequence

Any worker that produces a good text summary but does not call `literature.search` will be marked failed. This explains the recurring error:

```text
worker_failed: Profile worker did not produce a literature artifact.
```

#### Realistic evaluation

This file must be replaced, not patched. A patch can reduce false failures, but the long-term architecture requires profile-specific worker runners or a capability-driven output adapter.

---

### 1.10 `packages/lead-agent/src/literature/tools.ts`

Current behavior:

- Defines `literature.search`.
- Calls providers.
- Dedupes and ranks candidates.
- Creates a `literature-search-results` artifact.
- Returns `LiteratureSearchToolOutput` with `artifactRefs`, `candidatesPreview`, and warnings.
- Supports caching.

#### Assessment

This is one of the stronger parts of the project. It has a real tool boundary, real artifact creation, and normalized output.

Issues:

1. No `AbortSignal` is passed into provider searches even though `LiteratureProviderRequest` supports `signal`.
2. Query quality warning is emitted downstream, but the worker runner does not have a repair loop to improve query specificity.
3. Search result artifact is only a retrieval artifact; it should not be treated as verified evidence.

This tool should remain, but its output should feed a separate evidence extraction runner.

---

### 1.11 `packages/lead-agent/src/academic-smoke.ts`

Current smoke suite defines cases for:

- direct writing
- literature search
- citation check
- method audit
- review memo
- mini PaperOrchestra-like input

It uses a deterministic worker runner that creates expected artifacts for each worker type.

#### Assessment

The smoke suite gives a false sense of readiness. It tests planner/executor wiring, but not the real worker runner.

Example:

```ts
request.workerType === "citation-checker"
  ? ACADEMIC_ARTIFACT_KINDS.claimAudit
```

The deterministic runner creates `claim-audit`, but live `profile-worker-runner.ts` never does. Therefore smoke tests pass cases that the live runtime cannot pass.

Long-term tests must include contract tests for the live runner and profile-specific output adapters.

---

## 2. Root-Cause Model

The root issue is not any single bug. It is a broken chain of responsibility.

### 2.1 Current chain

```text
User objective
  -> LLM planner emits WorkflowPlan with expectedOutputs + expectedArtifactKinds
  -> Executor drops expectedArtifactKinds when building WorkerRequest
  -> Worker prompt only says "Expected outputs: ..."
  -> Generic worker may or may not call tools
  -> Runner only recognizes literature.search tool results
  -> Runner fails unless literature artifact exists
  -> Acceptance infers artifact requirements from strings
  -> Retry repeats same request without failure feedback
```

### 2.2 Failure categories

| Failure | Primary cause | Secondary cause |
|---|---|---|
| `Profile worker did not produce a literature artifact` | runner success condition is wrong | no profile-specific runner |
| `bibliography candidates missing` | acceptance treats label as artifact requirement | executor drops `expectedArtifactKinds` |
| `evidence-table missing` | template requests artifact not produced by live runner | no evidence table output adapter |
| `Domain-agnostic query` | weak query planning prompt | no feedback repair for query warnings |
| retry does not fix output | executor repeats identical request | no previous issue injection |
| smoke tests pass but live fails | deterministic runner fabricates artifacts | no live runner contract tests |

---

## 3. Target Architecture

The target architecture should be contract-first.

```text
WorkflowTemplate
  uses OutputRequirement[]
  uses ArtifactRequirement[]

LLM Planner
  chooses profile + output contracts only from registry

Plan Validator
  checks profile-output compatibility

Executor
  preserves all output/artifact requirements into WorkerRequest

Profile Runner
  produces:
    - summary
    - structured outputs
    - artifacts
    - artifact briefs
  through profile-specific adapters

Acceptance Checker
  deterministically checks OutputRequirement[]

Retry
  injects previous AcceptanceIssue[] into the next worker attempt

Final Synthesis
  only uses accepted outputs and artifacts
```

---

## 4. New Contract Model

### 4.1 Add structured output requirements

Add to `packages/agent-contracts/src/index.ts`:

```ts
export type OutputRequirementKind =
  | "summary"
  | "text-section"
  | "structured"
  | "artifact";

export interface OutputRequirement {
  id: string;
  label: string;
  kind: OutputRequirementKind;
  required: boolean;

  /**
   * For kind = "artifact".
   */
  artifactKind?: string;

  /**
   * For kind = "structured".
   * Dot path under WorkerResult.structuredOutputs.
   * Example: "evidenceTable.rows".
   */
  structuredPath?: string;

  /**
   * For kind = "structured" arrays.
   */
  minItems?: number;

  /**
   * For kind = "text-section" or legacy matching.
   */
  matchAliases?: string[];

  /**
   * Optional short description for planner and worker prompts.
   */
  description?: string;
}
```

### 4.2 Add artifact requirements

```ts
export interface ArtifactRequirement {
  kind: string;
  required: boolean;
  minCount?: number;
  mediaType?: string;
  description?: string;
}
```

### 4.3 Extend `WorkflowStep`

```ts
export interface WorkflowStep {
  id: string;
  order: number;
  profileId: string;
  objective: string;
  inputArtifactRefs: ArtifactRef[];

  /**
   * Deprecated. Keep temporarily for migration.
   */
  expectedArtifactKinds: string[];
  expectedOutputs: string[];

  outputRequirements?: OutputRequirement[];
  artifactRequirements?: ArtifactRequirement[];

  acceptanceCriteria: string[];
  budget?: WorkerBudget;
}
```

### 4.4 Extend `WorkerRequest`

```ts
export interface WorkerRequest {
  taskId: string;
  workerType: string;
  objective: string;
  constraints: string[];
  inputArtifacts: ArtifactRef[];

  /**
   * Deprecated. Keep temporarily for compatibility.
   */
  expectedOutputs: string[];

  outputRequirements?: OutputRequirement[];
  artifactRequirements?: ArtifactRequirement[];

  acceptanceCriteria: string[];
  executionBudget?: WorkerBudget;
  retryPolicy?: WorkerRetryPolicy;
  profile?: WorkerProfile;
  metadata?: JsonObject;
}
```

### 4.5 Extend `WorkerProfile`

```ts
export interface WorkerOutputCapability {
  outputRequirementIds: string[];
  artifactKinds: string[];
  structuredOutputPaths: string[];
}

export interface WorkerProfile {
  id: string;
  name: string;
  description?: string;
  rolePrompt?: string;
  capabilities: string[];

  /**
   * Deprecated. Keep temporarily.
   */
  expectedOutputs?: string[];

  outputCapabilities?: WorkerOutputCapability;
  defaultOutputRequirements?: OutputRequirement[];
  artifactCapabilities?: string[];

  acceptanceChecklist?: string[];
  allowedTools?: string[];
  toolPolicy?: WorkerToolPolicy;
  inputRequirements?: string[];
  boundaries?: string[];
}
```

---

## 5. Canonical Academic Output Contracts

Create:

```text
packages/lead-agent/src/contracts/academic-output-contracts.ts
```

### 5.1 Literature searcher contract

```ts
export const LITERATURE_SEARCH_OUTPUTS: OutputRequirement[] = [
  {
    id: "search-strategy",
    label: "Search Strategy",
    kind: "text-section",
    required: true,
    matchAliases: ["search strategy", "检索策略"],
  },
  {
    id: "query-plan",
    label: "Query Plan",
    kind: "text-section",
    required: true,
    matchAliases: ["query plan", "检索式", "query variants"],
  },
  {
    id: "literature-search-results",
    label: "Literature Search Results",
    kind: "artifact",
    required: true,
    artifactKind: "literature-search-results",
  },
  {
    id: "retrieval-gaps",
    label: "Retrieval Gaps",
    kind: "text-section",
    required: true,
    matchAliases: ["retrieval gaps", "limitations", "检索空白"],
  },
];
```

### 5.2 Researcher contract

```ts
export const EVIDENCE_SYNTHESIS_OUTPUTS: OutputRequirement[] = [
  {
    id: "evidence-summary",
    label: "Evidence Summary",
    kind: "text-section",
    required: true,
    matchAliases: ["evidence summary", "证据总结"],
  },
  {
    id: "evidence-table",
    label: "Evidence Table",
    kind: "structured",
    required: true,
    structuredPath: "evidenceTable.rows",
    minItems: 1,
  },
  {
    id: "uncertainty-notes",
    label: "Uncertainty Notes",
    kind: "structured",
    required: true,
    structuredPath: "uncertaintyNotes",
    minItems: 1,
  },
];
```

### 5.3 Citation checker contract

```ts
export const CITATION_AUDIT_OUTPUTS: OutputRequirement[] = [
  {
    id: "claim-audit",
    label: "Claim Audit",
    kind: "structured",
    required: true,
    structuredPath: "claimAudit.claims",
    minItems: 1,
  },
  {
    id: "claim-audit-artifact",
    label: "Claim Audit Artifact",
    kind: "artifact",
    required: true,
    artifactKind: "claim-audit",
  },
];
```

### 5.4 Method auditor contract

```ts
export const METHOD_AUDIT_OUTPUTS: OutputRequirement[] = [
  {
    id: "methods-audit",
    label: "Methods Audit",
    kind: "structured",
    required: true,
    structuredPath: "methodsAudit.issues",
    minItems: 1,
  },
  {
    id: "reproducibility-checklist",
    label: "Reproducibility Checklist",
    kind: "structured",
    required: true,
    structuredPath: "methodsAudit.reproducibilityChecklist",
    minItems: 1,
  },
  {
    id: "revision-plan-artifact",
    label: "Revision Plan Artifact",
    kind: "artifact",
    required: true,
    artifactKind: "revision-plan",
  },
];
```

### 5.5 Reviewer contract

```ts
export const REVIEW_MEMO_OUTPUTS: OutputRequirement[] = [
  {
    id: "review-findings",
    label: "Review Findings",
    kind: "structured",
    required: true,
    structuredPath: "reviewMemo.findings",
    minItems: 1,
  },
  {
    id: "review-comment-map-artifact",
    label: "Review Comment Map Artifact",
    kind: "artifact",
    required: true,
    artifactKind: "review-comment-map",
  },
];
```

### 5.6 Writer contract

```ts
export const WRITER_OUTPUTS: OutputRequirement[] = [
  {
    id: "outline",
    label: "Outline",
    kind: "structured",
    required: true,
    structuredPath: "outline.sections",
    minItems: 1,
  },
  {
    id: "outline-artifact",
    label: "Outline Artifact",
    kind: "artifact",
    required: false,
    artifactKind: "outline",
  },
  {
    id: "draft-text",
    label: "Draft Text",
    kind: "text-section",
    required: false,
    matchAliases: ["draft", "正文草稿", "draft text"],
  },
];
```

---

## 6. Artifact Schemas

Create:

```text
packages/lead-agent/src/contracts/artifact-schemas.ts
```

### 6.1 `literature-search-results`

Already implemented by `literature.search`. Keep current structure, but formalize:

```ts
export interface LiteratureSearchResultsArtifact {
  retrievalRunId: string;
  input: LiteratureSearchToolInput;
  cacheKey: string;
  providers: LiteratureProviderRunSummary[];
  candidates: LiteratureCandidate[];
  warnings: string[];
  output: LiteratureSearchToolOutput;
}
```

### 6.2 `evidence-table`

```ts
export interface EvidenceTableArtifact {
  sourceArtifactIds: string[];
  topic: string;
  rows: EvidenceTableRow[];
  limitations: string[];
  createdAt: string;
}

export interface EvidenceTableRow {
  id: string;
  study: string;
  year?: number;
  populationOrModel?: string;
  method?: string;
  outcomeOrReadout?: string;
  mainFinding: string;
  evidenceStatus: "candidate-derived" | "verified" | "uncertain";
  sourceCandidateIds: string[];
  sourceArtifactIds: string[];
  limitations?: string[];
}
```

### 6.3 `claim-audit`

```ts
export interface ClaimAuditArtifact {
  sourceArtifactIds: string[];
  claims: ClaimAuditItem[];
  summary: string;
  createdAt: string;
}

export interface ClaimAuditItem {
  id: string;
  claim: string;
  supportStatus: "supported" | "unsupported" | "needs-citation" | "overstated" | "uncertain";
  supportingArtifactIds: string[];
  evidenceNotes: string[];
  recommendation: string;
}
```

### 6.4 `methods-audit` / `revision-plan`

```ts
export interface MethodsAuditOutput {
  issues: MethodIssue[];
  reproducibilityChecklist: string[];
  missingAssumptions: string[];
}

export interface MethodIssue {
  id: string;
  category: "design" | "statistics" | "sampling" | "measurement" | "missing-data" | "reproducibility" | "reporting";
  severity: "critical" | "major" | "minor";
  issue: string;
  evidence: string;
  recommendation: string;
}
```

### 6.5 `review-comment-map`

```ts
export interface ReviewCommentMapArtifact {
  findings: ReviewFinding[];
  revisionPriorities: string[];
  createdAt: string;
}

export interface ReviewFinding {
  id: string;
  severity: "critical" | "major" | "minor";
  location?: string;
  issue: string;
  rationale: string;
  recommendedAction: string;
}
```

---

## 7. Replace Generic Profile Runner

### 7.1 Current problem

`createProfileWorkerRunner()` is generic in name but literature-specific in behavior. It extracts only `literature.search` outputs and fails if no literature artifact exists.

### 7.2 Target runner architecture

Create:

```text
packages/lead-agent/src/workers/academic-worker-runner.ts
packages/lead-agent/src/workers/literature-search-worker.ts
packages/lead-agent/src/workers/evidence-synthesis-worker.ts
packages/lead-agent/src/workers/citation-check-worker.ts
packages/lead-agent/src/workers/method-audit-worker.ts
packages/lead-agent/src/workers/review-worker.ts
packages/lead-agent/src/workers/writing-worker.ts
packages/lead-agent/src/workers/worker-output-adapters.ts
```

### 7.3 Dispatcher

```ts
export function createAcademicWorkerRunner(options: CreateAcademicWorkerRunnerOptions): LeadAgentWorkerRunner {
  const runners: Record<string, LeadAgentWorkerRunner> = {
    "literature-searcher": createLiteratureSearchWorker(options),
    researcher: createEvidenceSynthesisWorker(options),
    "citation-checker": createCitationCheckWorker(options),
    "method-auditor": createMethodAuditWorker(options),
    reviewer: createReviewWorker(options),
    writer: createWritingWorker(options),
    reviser: createRevisionWorker(options),
  };

  return async (request) => {
    const runner = runners[request.profile?.id ?? request.workerType];
    if (!runner) {
      return createFailedWorkerResult(request, `No runner registered for ${request.workerType}`);
    }
    return runner(request);
  };
}
```

### 7.4 Literature search worker

Responsibilities:

1. Build domain-specific query facets.
2. Require at least one `literature.search` call.
3. Return:
   - `literature-search-results` artifact
   - search strategy section
   - query plan section
   - retrieval gaps section
4. Do not claim candidates are verified evidence.

Success condition:

```ts
producedArtifacts.some(a => a.kind === "literature-search-results")
```

### 7.5 Evidence synthesis worker

Responsibilities:

1. Read `literature-search-results` artifacts from `request.inputArtifacts` or `metadata.retrievedArtifacts`.
2. Convert candidates into structured evidence table.
3. Mark evidence status as `candidate-derived` unless full source verification exists.
4. Create `evidence-table` artifact.
5. Return `structuredOutputs.evidenceTable`.

Success condition:

```ts
structuredOutputs.evidenceTable.rows.length > 0
producedArtifacts.some(a => a.kind === "evidence-table")
```

### 7.6 Citation checker worker

Responsibilities:

1. Extract claims from manuscript or evidence notes.
2. Compare claims against accepted evidence artifacts.
3. Create `claim-audit` artifact.
4. Return `structuredOutputs.claimAudit.claims`.

Success condition:

```ts
structuredOutputs.claimAudit.claims.length > 0
producedArtifacts.some(a => a.kind === "claim-audit")
```

### 7.7 Method auditor worker

Responsibilities:

1. Analyze method text.
2. Create structured `methodsAudit`.
3. Create `revision-plan` artifact containing prioritized fixes.

Success condition:

```ts
structuredOutputs.methodsAudit.issues.length > 0
producedArtifacts.some(a => a.kind === "revision-plan")
```

### 7.8 Reviewer worker

Responsibilities:

1. Produce severity-ordered review findings.
2. Create `review-comment-map` artifact.
3. Return structured review memo.

Success condition:

```ts
structuredOutputs.reviewMemo.findings.length > 0
producedArtifacts.some(a => a.kind === "review-comment-map")
```

### 7.9 Writer and reviser workers

Writer produces:

- outline
- draft text
- optional outline artifact

Reviser produces:

- revision plan
- response letter draft
- revised text

Do not require literature artifacts unless explicitly part of the profile contract.

---

## 8. Worker Output Adapter Layer

Create a shared adapter layer that turns assistant output into structured worker result.

```ts
export interface WorkerOutputAdapter {
  profileId: string;
  parse(sessionMessages: unknown[], request: WorkerRequest, store: ArtifactStore): Promise<WorkerResult>;
}
```

Adapters:

```text
LiteratureSearchOutputAdapter
EvidenceTableOutputAdapter
ClaimAuditOutputAdapter
MethodAuditOutputAdapter
ReviewMemoOutputAdapter
WritingOutputAdapter
```

### 8.1 Why adapter layer is necessary

The model may produce:

- JSON in final text
- Markdown tables
- tool outputs
- artifacts
- mixed summaries

Acceptance should not parse free text directly. The adapter should normalize raw session output into:

```ts
WorkerResult {
  summary,
  structuredOutputs,
  producedArtifacts,
  artifactBriefs,
  warnings,
  openQuestions
}
```

Then acceptance checks the normalized result.

---

## 9. Prompt Redesign

### 9.1 Current worker prompt is insufficient

Current prompt:

```text
Objective: ...
Expected outputs: ...
Acceptance criteria: ...
Return a concise final summary after using any required tools.
```

This does not give the worker a machine-readable contract.

### 9.2 New worker prompt template

```ts
function buildContractPrompt(request: WorkerRequest): string {
  return [
    request.profile?.rolePrompt ?? "You are an academic worker.",
    "",
    "## Objective",
    request.objective,
    "",
    "## Constraints",
    formatBullets(request.constraints),
    "",
    "## Input Artifacts",
    formatArtifactList(request.inputArtifacts),
    "",
    "## Required Output Contract",
    formatOutputRequirements(request.outputRequirements),
    "",
    "## Required Artifact Contract",
    formatArtifactRequirements(request.artifactRequirements),
    "",
    "## Acceptance Criteria",
    formatBullets(request.acceptanceCriteria),
    "",
    "## Previous Acceptance Failures",
    formatPreviousIssues(request.metadata?.previousAcceptanceIssues),
    "",
    "## Final Response Rules",
    "- Explicitly cover every required output.",
    "- Do not claim retrieved candidate literature is verified evidence unless source verification was performed.",
    "- If required tools are available and necessary for the contract, call them before the final response.",
    "- End with a compact JSON block named WORKER_OUTPUT_SUMMARY when the profile requires structured output.",
  ].join("\n");
}
```

### 9.3 Profile-specific prompt additions

Literature searcher:

```text
Before calling literature.search, derive query facets:
- domain / condition
- organism / population / model
- method / assay
- outcome / readout
- synonyms
Generate at least 3 query variants for broad objectives.
Avoid domain-agnostic one-line queries.
```

Researcher:

```text
Use accepted retrieval artifacts as candidate evidence only.
Create an evidence table with row-level source artifact IDs.
Mark evidence status as candidate-derived, verified, uncertain, or unsupported.
```

Citation checker:

```text
Audit claims at claim level.
Every claim must receive a support status.
Do not invent source support.
```

Method auditor:

```text
Classify issues by design, statistics, sampling, measurement, missing-data, reproducibility, and reporting.
Every issue requires severity and recommendation.
```

---

## 10. Acceptance Refactor

### 10.1 Current acceptance should be deprecated

Do not infer artifact requirements from string labels.

Remove:

```ts
requiresArtifactRef(expectedOutput: string)
```

### 10.2 New acceptance checker

```ts
export function acceptanceIssuesForWorkerResult(
  workerRequest: WorkerRequest,
  workerResult: WorkerResult,
): AcceptanceIssue[] {
  const issues: AcceptanceIssue[] = [];

  if (workerResult.status !== "success") {
    issues.push({
      code: "worker_failed",
      message: workerResult.failureReason ?? `Worker returned status ${workerResult.status}.`,
      severity: "error",
    });
  }

  for (const requirement of resolveOutputRequirements(workerRequest)) {
    if (!satisfiesOutputRequirement(workerResult, requirement)) {
      issues.push({
        code: "output_requirement_missing",
        message: `Missing required output: ${requirement.id} (${requirement.label})`,
        severity: requirement.required ? "error" : "warning",
      });
    }
  }

  for (const requirement of resolveArtifactRequirements(workerRequest)) {
    if (!satisfiesArtifactRequirement(workerResult, requirement)) {
      issues.push({
        code: "artifact_requirement_missing",
        message: `Missing required artifact kind: ${requirement.kind}`,
        severity: requirement.required ? "error" : "warning",
      });
    }
  }

  for (const warning of workerResult.warnings) {
    issues.push({ code: "worker_warning", message: warning, severity: "warning" });
  }

  for (const q of workerResult.openQuestions) {
    issues.push({
      code: "worker_open_question",
      message: q.question,
      severity: q.blocksExecution ? "error" : "info",
    });
  }

  return issues;
}
```

### 10.3 Requirement checker

```ts
function satisfiesOutputRequirement(result: WorkerResult, req: OutputRequirement): boolean {
  if (!req.required) return true;

  switch (req.kind) {
    case "summary":
      return result.summary.trim().length > 0;

    case "text-section":
      return matchesTextSection(result.summary, req);

    case "structured":
      return hasStructuredPath(result.structuredOutputs, req.structuredPath, req.minItems);

    case "artifact":
      return result.producedArtifacts.some((artifact) => artifact.kind === req.artifactKind);

    default:
      return false;
  }
}
```

---

## 11. Planner Refactor

### 11.1 Add planner context with profile contracts

Extend `PlannerValidationContext`:

```ts
export interface PlannerValidationContext {
  profiles: readonly WorkerProfile[];
  templates: WorkflowTemplate[];
  inputArtifacts: ArtifactRef[];

  taskId: string;
  sessionId: string;
  objective: string;

  profileContracts: Record<string, WorkerProfileContract>;
}
```

### 11.2 Profile contract

```ts
export interface WorkerProfileContract {
  profileId: string;
  supportedOutputRequirementIds: string[];
  supportedArtifactKinds: string[];
  supportedStructuredPaths: string[];
  requiredTools?: string[];
}
```

### 11.3 Planner prompt must include machine-readable contract summary

Instead of only:

```text
- researcher: ...
```

Send:

```text
Profile: researcher
Can produce:
- structured: evidenceTable.rows
- structured: uncertaintyNotes
- artifact: evidence-table
Cannot produce:
- literature-search-results
Required inputs:
- literature-search-results artifact or user-supplied evidence notes
```

### 11.4 Validator must reject impossible plans

Add checks:

```ts
for (const step of p.steps) {
  const contract = context.profileContracts[step.profileId];

  for (const req of step.outputRequirements ?? []) {
    if (!contract.supportedOutputRequirementIds.includes(req.id)) {
      errors.push(`Step ${step.id}: ${step.profileId} cannot produce output ${req.id}`);
    }
  }

  for (const artifactReq of step.artifactRequirements ?? []) {
    if (!contract.supportedArtifactKinds.includes(artifactReq.kind)) {
      errors.push(`Step ${step.id}: ${step.profileId} cannot produce artifact ${artifactReq.kind}`);
    }
  }
}
```

### 11.5 Objective preservation checks

Add:

```ts
if (p.taskId !== context.taskId) errors.push("Plan taskId must match input taskId");
if (p.sessionId !== context.sessionId) errors.push("Plan sessionId must match input sessionId");
if (p.objective !== context.objective) errors.push("Plan objective must preserve original objective exactly");
```

For each step:

```ts
const userObjective = extractUserObjective(s.objective);
if (userObjective !== context.objective.trim()) {
  errors.push(`Step ${s.id}: User objective must be verbatim`);
}
```

### 11.6 Order validation

```ts
const orders = p.steps.map((s) => s.order);
if (new Set(orders).size !== orders.length) errors.push("Duplicate step order");
if (orders.sort((a,b) => a-b).some((order, i) => order !== i + 1)) {
  errors.push("Step orders must be continuous from 1");
}
```

---

## 12. Executor Refactor

### 12.1 Preserve output and artifact requirements

Update `workerRequestForStep()`:

```ts
return {
  taskId: `${plan.taskId}:${step.id}`,
  workerType: step.profileId,
  objective: step.objective,
  constraints,
  inputArtifacts,
  expectedOutputs: step.expectedOutputs,
  outputRequirements: step.outputRequirements,
  artifactRequirements: step.artifactRequirements,
  acceptanceCriteria: step.acceptanceCriteria,
  executionBudget: step.budget,
  profile,
  metadata: {
    ...metadata,
    leadTaskId: plan.taskId,
    workflowStepId: step.id,
    workflowStepOrder: step.order,
    expectedArtifactKinds: step.expectedArtifactKinds,
  },
};
```

### 12.2 Retry must include previous acceptance issues

```ts
let previousAcceptanceIssues: AcceptanceIssue[] = [];

while (true) {
  attempt += 1;

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

  if (acceptanceReport.accepted || hasBlockingOpenQuestion(workerResult) || attempt >= maxAttempts) {
    break;
  }

  previousAcceptanceIssues = acceptanceReport.issues.filter((issue) => issue.severity === "error");
}
```

### 12.3 Explicit linear workflow v1

Document:

```text
WorkflowPlan v1 is linear-order execution. Parallel DAG execution is not supported.
Prior accepted artifacts are automatically carried forward to later steps.
```

Future v2 can add:

```ts
dependsOn?: string[];
```

---

## 13. Template Refactor

Replace string output labels with contract IDs.

### 13.1 Example: literature-to-evidence

```ts
{
  id: "literature-to-evidence",
  title: "Literature To Evidence",
  steps: [
    {
      id: "literature-search",
      profileId: "literature-searcher",
      objective: "Build a structured search strategy and retrieve candidate literature.",
      outputRequirements: [
        outputReq("search-strategy"),
        outputReq("query-plan"),
        outputReq("literature-search-results"),
        outputReq("retrieval-gaps"),
      ],
      artifactRequirements: [
        { kind: "literature-search-results", required: true, minCount: 1 },
      ],
      expectedOutputs: ["search strategy", "query plan", "literature search results", "retrieval gaps"],
      expectedArtifactKinds: ["literature-search-results"],
      acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
    },
    {
      id: "evidence-summary",
      profileId: "researcher",
      objective: "Convert accepted retrieval outputs into a structured evidence table.",
      outputRequirements: [
        outputReq("evidence-summary"),
        outputReq("evidence-table"),
        outputReq("uncertainty-notes"),
      ],
      artifactRequirements: [
        { kind: "evidence-table", required: true, minCount: 1 },
      ],
      expectedOutputs: ["evidence summary", "evidence table", "uncertainty notes"],
      expectedArtifactKinds: ["evidence-table"],
      acceptanceCriteria: ["Uncertainty is explicit"],
    },
  ],
}
```

### 13.2 Remove artifact kind strings from `expectedOutputs`

Avoid:

```ts
expectedOutputs: ["evidence-table"]
```

Prefer:

```ts
expectedOutputs: ["evidence table"]
artifactRequirements: [{ kind: "evidence-table", required: true }]
```

---

## 14. Test Strategy

### 14.1 Unit tests

Create tests for:

```text
packages/agent-contracts
  - OutputRequirement type guards
  - WorkerRequest backward compatibility
  - WorkflowStep schema compatibility

packages/lead-agent/src/orchestration
  - validateWorkflowPlan rejects impossible artifact requirements
  - validateWorkflowPlan rejects wrong taskId/sessionId/objective
  - validateWorkflowPlan rejects non-continuous order
  - acceptance checks artifact requirement
  - acceptance checks structured output path
  - acceptance does not infer artifact from "bibliography candidates"

packages/lead-agent/src/workers
  - literature worker creates literature-search-results
  - researcher creates evidence-table from literature-search-results
  - citation checker creates claim-audit
  - method auditor creates revision-plan
  - reviewer creates review-comment-map
```

### 14.2 Integration tests

Add two runners:

1. **deterministic contract runner**
2. **live profile runner with mocked model/tool outputs**

The current smoke runner is useful but insufficient because it fabricates expected artifacts. Add live runner tests that inspect adapter behavior.

### 14.3 Regression tests for current failures

Create fixture cases:

```text
failure-regression/
  - bibliography-candidates-should-not-require-artifact.md
  - researcher-evidence-table-requires-structured-output.md
  - reviewer-without-literature-artifact-should-succeed.md
  - retry-gets-previous-acceptance-issues.md
  - domain-agnostic-query-warning-nonblocking.md
```

Expected results:

| Case | Expected |
|---|---|
| reviewer without literature artifact | accepted if review contract satisfied |
| bibliography candidates as text only | not accepted only if artifact requirement says so |
| evidence table structured output present | accepted |
| warning only | accepted |
| retry repair | second attempt receives issue feedback |

---

## 15. Implementation Plan

### Phase 0: Safety branch

Create a branch:

```bash
git checkout -b contract-first-worker-refactor
```

No behavior-changing commits before tests exist.

---

### Phase 1: Add contract types, no runtime behavior change

Files:

```text
packages/agent-contracts/src/index.ts
packages/lead-agent/src/contracts/academic-output-contracts.ts
packages/lead-agent/src/contracts/profile-contracts.ts
```

Tasks:

1. Add `OutputRequirement`.
2. Add `ArtifactRequirement`.
3. Add optional `outputRequirements` and `artifactRequirements` to `WorkerRequest` and `WorkflowStep`.
4. Keep `expectedOutputs` and `expectedArtifactKinds`.
5. Add type guards and JSON schema.
6. Add unit tests.

Definition of done:

- Existing code compiles.
- Existing smoke suite still passes.
- New contract fields can be serialized/deserialized.

---

### Phase 2: Acceptance checker upgrade

Files:

```text
packages/lead-agent/src/orchestration/acceptance.ts
```

Tasks:

1. Implement `resolveOutputRequirements(workerRequest)`.
2. Implement `resolveArtifactRequirements(workerRequest)`.
3. Implement structured path checker.
4. Deprecate `requiresArtifactRef(expectedOutput)`.
5. Keep legacy fallback for `expectedOutputs`.
6. Ensure warnings do not block acceptance.

Definition of done:

- `"bibliography candidates"` no longer automatically requires artifact.
- `artifactRequirements` enforce artifact kind.
- `outputRequirements` enforce structured paths.
- Regression tests pass.

---

### Phase 3: Executor preserves contracts and improves retry

Files:

```text
packages/lead-agent/src/orchestration/executor.ts
```

Tasks:

1. Pass `outputRequirements` and `artifactRequirements` from step to worker request.
2. Add previous acceptance issues to retry metadata.
3. Ensure retry prompt can consume metadata.
4. Write attempt-specific worker requests if needed:

```text
worker-request.attempt-1.json
worker-request.attempt-2.json
```

Definition of done:

- Retry attempt receives previous errors.
- Acceptance report uses attempt request.
- Workspace captures enough information to debug failed runs.

---

### Phase 4: Planner and validator compatibility checks

Files:

```text
packages/lead-agent/src/orchestration/planner.ts
packages/lead-agent/src/orchestration/llm-planner.ts
packages/lead-agent/src/contracts/profile-contracts.ts
```

Tasks:

1. Extend `PlannerValidationContext`.
2. Add task/session/objective checks.
3. Add order uniqueness and continuity checks.
4. Add verbatim objective extraction.
5. Add profile-output compatibility checks.
6. Include profile contract summaries in planner prompt.
7. Update repair prompt to include compatibility failures.

Definition of done:

- Planner cannot request `evidence-table` from a profile that cannot produce it.
- Planner cannot silently mutate objective.
- Planner cannot generate impossible artifact contracts.
- Validation errors are actionable.

---

### Phase 5: Replace generic profile runner with academic worker runner

Files:

```text
packages/lead-agent/src/workers/academic-worker-runner.ts
packages/lead-agent/src/workers/literature-search-worker.ts
packages/lead-agent/src/workers/evidence-synthesis-worker.ts
packages/lead-agent/src/workers/citation-check-worker.ts
packages/lead-agent/src/workers/method-audit-worker.ts
packages/lead-agent/src/workers/review-worker.ts
packages/lead-agent/src/workers/writing-worker.ts
packages/lead-agent/src/workers/worker-output-adapters.ts
packages/lead-agent/src/index.ts
```

Tasks:

1. Keep `createProfileWorkerRunner` only as legacy fallback.
2. Introduce `createAcademicWorkerRunner`.
3. Route by profile ID.
4. Literature search worker consumes `literature.search`.
5. Evidence synthesis worker reads retrieval artifacts and creates `evidence-table`.
6. Citation checker creates `claim-audit`.
7. Method auditor creates `revision-plan`.
8. Reviewer creates `review-comment-map`.
9. Writer creates `outline` and optional draft artifacts.

Definition of done:

- Non-literature workers no longer fail for missing literature artifact.
- All template-requested artifact kinds have a live production path.
- Smoke tests can run against live adapters, not only deterministic runner.

---

### Phase 6: Template migration

Files:

```text
packages/lead-agent/src/orchestration/templates.ts
```

Tasks:

1. Add `outputRequirements`.
2. Add `artifactRequirements`.
3. Keep legacy fields.
4. Remove artifact kind labels from `expectedOutputs`.
5. Fix missing `draft-text` artifact kind or rename to existing `response-letter-draft` / `outline`.

Definition of done:

- Templates become executable contracts.
- Planner receives feasible templates.
- No template references artifact kinds unsupported by artifact-core.

---

### Phase 7: Prompt hardening

Files:

```text
packages/lead-agent/src/workers/*.ts
packages/lead-agent/src/prompts.ts
```

Tasks:

1. Implement `buildContractPrompt`.
2. Include required output and artifact contracts.
3. Include previous acceptance failures.
4. Add profile-specific instructions.
5. Add query facet generation for literature search.
6. Add explicit candidate-vs-verified evidence boundary.

Definition of done:

- Worker prompt tells model exactly what contract must be satisfied.
- Retry prompt tells model exactly what failed.
- Literature worker produces more domain-specific queries.

---

### Phase 8: Full regression suite

Files:

```text
packages/lead-agent/test/
packages/lead-agent/src/academic-smoke.ts
```

Tasks:

1. Add regression fixtures for current failures.
2. Add contract acceptance unit tests.
3. Add live adapter tests.
4. Keep deterministic smoke tests but mark them as orchestration tests.
5. Add a separate `live-contract-smoke` mode.

Definition of done:

- Current error patterns have tests.
- Smoke suite no longer hides live runner limitations.
- CI fails if a template requests unsupported output.

---

## 16. Migration Strategy

### 16.1 Backward compatibility

For one transition period:

- Keep `expectedOutputs: string[]`.
- Keep `expectedArtifactKinds: string[]`.
- Add optional `outputRequirements`.
- Add optional `artifactRequirements`.
- If new fields are missing, derive best-effort requirements from legacy fields.

### 16.2 Derivation function

```ts
function deriveRequirementsFromLegacy(step: WorkflowStep): {
  outputRequirements: OutputRequirement[];
  artifactRequirements: ArtifactRequirement[];
} {
  return {
    outputRequirements: step.expectedOutputs.map((label) => ({
      id: normalizeLabel(label),
      label,
      kind: "text-section",
      required: true,
      matchAliases: [label],
    })),
    artifactRequirements: step.expectedArtifactKinds.map((kind) => ({
      kind,
      required: true,
      minCount: 1,
    })),
  };
}
```

Important: `bibliography candidates` should derive to a text-section unless paired with `expectedArtifactKinds`.

---

## 17. Concrete Fixes for Current Errors Under New Architecture

### 17.1 `Profile worker did not produce a literature artifact`

Fixed by:

- replacing generic runner,
- profile-specific success conditions,
- artifact requirements only for profiles that need them.

### 17.2 `bibliography candidates` missing

Fixed by:

- no artifact inference from text labels,
- explicit `artifactRequirements`,
- literature searcher contract includes `literature-search-results` artifact separately.

### 17.3 `evidence-table` missing

Fixed by:

- evidence synthesis worker creates `evidence-table`,
- `structuredOutputs.evidenceTable.rows` is populated,
- acceptance checks both structured output and artifact requirement.

### 17.4 `Domain-agnostic query`

Fixed by:

- literature searcher query facet prompt,
- query quality validator,
- warning remains nonblocking unless configured as strict.

### 17.5 Retry repeats same failure

Fixed by:

- previous acceptance issues injected into retry metadata and prompt.

---

## 18. Risks and Tradeoffs

### 18.1 Increased schema complexity

The project becomes more complex. This is necessary because a multi-worker academic runtime cannot be reliably controlled by free-text output labels.

Mitigation:

- Keep compatibility fields.
- Provide helpers like `outputReq("evidence-table")`.
- Centralize contracts in one registry.

### 18.2 More code in worker adapters

Adapters require careful parsing and artifact creation. This is unavoidable if you want deterministic acceptance.

Mitigation:

- Start with JSON output blocks.
- Add Markdown table fallback later.
- Add unit tests per adapter.

### 18.3 LLM output still unstable

Structured output prompts do not guarantee valid JSON.

Mitigation:

- Use tool-call based worker output submission where possible.
- Add repair pass at adapter level.
- Fail with precise acceptance issues.

### 18.4 Artifact truthfulness

Search results are metadata candidates, not verified evidence.

Mitigation:

- Add `evidenceStatus`.
- Force candidate-derived labels unless full source verification is done.
- Final synthesis must surface uncertainty.

---

## 19. Recommended Commit Sequence

```text
commit 1: add OutputRequirement and ArtifactRequirement contracts
commit 2: add academic output/profile contract registries
commit 3: refactor acceptance to use contracts with legacy fallback
commit 4: pass requirements through executor and retry metadata
commit 5: harden planner validation and prompt with profile contracts
commit 6: introduce academic worker runner dispatcher
commit 7: implement literature search worker under new runner
commit 8: implement evidence synthesis worker and evidence-table artifact
commit 9: implement citation/method/review adapters
commit 10: migrate templates to contract fields
commit 11: update smoke tests and add regression tests
commit 12: deprecate generic profile runner as default
```

---

## 20. Final Evaluation

The project is at an important transition point.

Current strengths:

1. Monorepo package separation is viable.
2. Agent contract package exists.
3. Artifact store exists.
4. LLM planner with repair exists.
5. Workflow executor exists.
6. Literature search tool is a real artifact-producing tool.
7. Smoke tests exist.

Current weaknesses:

1. Output expectations are string-based.
2. Templates request artifacts that live workers do not produce.
3. Generic profile worker runner is actually literature-specific.
4. Acceptance infers schema from natural language labels.
5. Retry does not provide feedback.
6. Planner lacks profile-output compatibility validation.
7. Smoke tests hide live runner gaps.
8. Evidence provenance is under-modeled.

The correct long-term direction is not prompt tuning. The correct direction is:

```text
contract-first workflow planning
+ profile-specific worker execution
+ deterministic output adapters
+ artifact-aware acceptance
+ issue-aware retry
+ accepted-artifact-only synthesis
```

Once this refactor is complete, the runtime will stop treating `"bibliography candidates"` and `"evidence-table"` as ambiguous strings. They will become explicit, typed, producible, testable, and repairable workflow outputs.
