# Lead-Agent Orchestration Design

Status: Draft
Date: 2026-05-12

## 1. Purpose

This spec defines the next development stage for `packages/lead-agent`: replacing keyword-only routing with a lightweight academic workflow orchestrator.

The goal is not to make `agent-host` understand academic tasks. `agent-host` remains the generic session/runtime host. `lead-agent` owns task understanding, workflow planning, worker sequencing, artifact workspace management, acceptance, and final synthesis.

## 2. Confirmed Product Decisions

1. `lead-agent` is the user-facing academic orchestrator.
2. `agent-host` provides host/session/runtime primitives only.
3. `coding-agent` is a schedulable worker through its worker adapter.
4. Workflow templates are allowed, but a template is never executed blindly.
5. Every candidate workflow goes through LLM plan review before execution.
6. The default user experience is lightweight: no mandatory plan confirmation.
7. `lead-agent` asks the user only when continuing would likely be wrong.
8. Artifacts are scoped to a lead session, not to every prompt.
9. A user-provided `--artifact-dir` can override the default session artifact folder.
10. Worker outputs must avoid flooding the lead context with large content.

## 3. Current State

The current `lead-agent` runtime already has useful foundations:

1. Academic profiles are loaded from markdown profile files.
2. `planLeadAgentTask()` can choose direct mode or one worker.
3. Worker requests and results use `packages/agent-contracts`.
4. `artifact-core` has file-system and memory artifact stores.
5. Existing smoke tests prove basic routing, acceptance, and artifact creation.

The current orchestration is still too shallow:

1. Profile choice is mostly keyword based.
2. A task can dispatch at most one worker.
3. There is no structured workflow plan.
4. Worker steps do not form a dependency chain.
5. Artifact storage is not yet the central task context.
6. Lead synthesis mostly returns worker summary rather than reasoning over accepted step outputs.

## 4. Target Architecture

The target orchestration chain is:

```text
User Request
  -> Lead Intake
  -> Template Candidate Selection
  -> LLM Plan Review
  -> Structured WorkflowPlan
  -> Deterministic Step Executor
  -> Session Artifact Workspace
  -> Lightweight Step Decision
  -> Lead Synthesis
```

The core rule is that the LLM may decide and adapt the plan, but execution must happen through validated structured data. The executor must not interpret free-form workflow prose.

## 5. Planning Model

### 5.1 Template Candidate Selection

`lead-agent` first chooses one or more candidate templates from task signals. This can use cheap deterministic heuristics, including keywords, explicit CLI hints, task type, profile hints, and available artifacts.

Candidate templates are only planning inputs. They are not final decisions.

Initial templates:

1. `direct-writing`
2. `citation-audit`
3. `method-audit`
4. `review-memo`
5. `revision-response`
6. `evidence-synthesis`
7. `outline-to-draft`

### 5.2 LLM Plan Review

The planner receives:

1. User objective.
2. Constraints and expected outputs.
3. Candidate template.
4. Available worker profiles.
5. Current session artifact manifest.
6. Existing relevant artifact briefs.

The planner must decide:

1. Whether the candidate template is appropriate.
2. Whether to delete, add, reorder, or narrow steps.
3. Which worker profile each step should use.
4. Which artifact refs each step should read.
5. Which artifact kinds each step should produce.
6. Whether the task is small enough for direct synthesis.
7. Whether a clarification is required before execution.

The planner output is a validated `WorkflowPlan`.

## 6. Proposed Contracts

The following contracts should live in `packages/agent-contracts` unless implementation shows a strong reason to keep internal orchestration-only types in `packages/lead-agent`.

```ts
export interface WorkflowPlan {
  taskId: string;
  sessionId: string;
  objective: string;
  rationale: string;
  userVisibleSummary: string;
  mode: "direct" | "workflow";
  steps: WorkflowStep[];
  stopConditions: string[];
  requiresClarification?: WorkflowClarification;
}

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

export type StepDecisionKind =
  | "continue"
  | "retry"
  | "ask_user"
  | "stop"
  | "synthesize";
```

`WorkerResult` should gain an artifact-brief channel, either directly or through a companion step result:

```ts
export interface WorkerResult {
  summary: string;
  producedArtifacts: ArtifactRef[];
  artifactBriefs?: ArtifactBrief[];
  warnings: string[];
  openQuestions: string[];
}
```

Large artifact content must not be returned as lead context by default.

## 7. Session Artifact Workspace

Artifact storage is session scoped.

Default path:

```text
.lead-agent/artifacts/sessions/<session-id>/
```

If the user passes `--artifact-dir`, that directory becomes the session artifact workspace. This is useful for a long-running manuscript project.

Recommended layout:

```text
<session-artifact-dir>/
  manifest.json
  session-workflow-log.jsonl
  tasks/
    <task-id>/
      workflow-plan.json
      plan-review.json
      steps/
        01-<profile-id>/
          worker-request.json
          worker-result.json
          artifact-briefs.json
          produced/
            evidence-table.md
            claim-audit.json
            revision-plan.md
      final-output.md
```

Ownership rules:

1. `lead-agent` creates and owns the session workspace.
2. `lead-agent` writes workflow plans, worker requests, worker results, artifact briefs, final output, and manifest updates.
3. Workers return structured artifact refs, briefs, and content hints.
4. Workers do not directly write arbitrary files into the lead session workspace.
5. `artifact-core` remains the storage and manifest abstraction.

## 8. Context Management

Worker output has three channels.

### 8.1 Summary Channel

Short text intended for lead decision context. This is the only worker free text that enters the lead context by default. It should be bounded, for example 300-800 words depending on task size.

### 8.2 Artifact Channel

Large outputs are persisted as artifacts. The lead receives artifact refs and artifact briefs, not full content.

### 8.3 Retrieval Channel

Later workflow steps may request details through explicit artifact refs. The first implementation can support simple whole-artifact reads for small artifacts and skip large artifacts. Later implementations can add section, row, or claim-level retrieval.

This design prevents worker results from exceeding the lead context while still preserving traceability.

## 9. Execution Loop

Implementation should split orchestration into focused modules:

```text
packages/lead-agent/src/orchestration/
  intake.ts
  templates.ts
  planner.ts
  executor.ts
  acceptance.ts
  synthesis.ts
  workspace.ts
```

Execution sequence:

1. Intake normalizes objective, constraints, expected outputs, file metadata, `taskId`, `sessionId`, and workspace path.
2. Template selection proposes a candidate workflow.
3. LLM plan review produces a `WorkflowPlan`.
4. If clarification is required, `lead-agent` asks one concise question.
5. If the plan is direct, lead runs direct synthesis.
6. If the plan is workflow, executor runs steps in order.
7. Each step creates a `WorkerRequest` with profile, input refs, expected outputs, expected artifact kinds, and acceptance criteria.
8. Worker result is accepted or rejected.
9. Accepted summaries and artifact briefs become context for later steps.
10. The step decision chooses `continue`, `retry`, `ask_user`, `stop`, or `synthesize`.
11. Lead synthesis creates final user output and writes `final-output.md`.

First version step decisions can be deterministic:

1. Worker failure -> `retry` if retry budget remains, otherwise `stop`.
2. Acceptance error -> `retry` if fixable, otherwise `ask_user` or `stop`.
3. Blocking open question -> `ask_user`.
4. Last accepted step -> `synthesize`.
5. Otherwise -> `continue`.

## 10. User Experience

The orchestration can be structured internally, but the user-facing interaction must stay lightweight.

Default behavior:

1. Do not force workflow plan confirmation.
2. Show only a short natural-language plan summary.
3. Automatically continue through normal worker steps.
4. Surface only meaningful progress, warnings, and final artifacts.

Ask the user only when:

1. Required input is missing.
2. Continuing would likely change the task scope materially.
3. A worker open question blocks the next decision.
4. Acceptance failure cannot be resolved by retrying or narrowing the step.

Optional behavior:

1. Add `--confirm-plan` for long or high-stakes tasks.
2. Add an interactive setting for users who want to inspect plans.
3. Keep JSON plans available on disk, not in normal chat output.

## 11. Testing Strategy

### 11.1 Planner Tests

Use faux planner outputs. Verify:

1. A candidate template can be accepted unchanged.
2. A candidate template can be narrowed, expanded, reordered, or rejected.
3. Small tasks can become direct plans.
4. Missing inputs produce `requiresClarification`.
5. Invalid profile ids, duplicate step ids, and unsupported artifact kinds are rejected.

### 11.2 Executor Tests

Use deterministic workers. Verify:

1. Steps run in order.
2. Worker requests include the selected profile.
3. Step outputs feed later step input refs.
4. Accepted worker summaries and artifact briefs are carried forward.
5. Failed acceptance does not blindly continue.

### 11.3 Workspace Tests

Verify:

1. One session gets one default artifact folder.
2. Multiple tasks in the same session reuse that folder.
3. `--continue`, `--resume`, and `--session` restore the same workspace.
4. `--artifact-dir` overrides the default folder.
5. Workflow plan, worker request, worker result, artifact briefs, final output, and manifest can round-trip.

### 11.4 Academic Workflow Smoke

Upgrade current smoke fixtures to include multi-step flows:

1. `citation-audit -> revision-plan`
2. `method-audit -> reviewer -> synthesis`
3. `evidence-summary -> outline -> draft`
4. `reviewer-comments -> response-strategy -> response-draft`

Smoke tests should not call real providers. They should use faux planner and deterministic workers.

Minimum acceptance gates:

1. At least one smoke case has two or more worker steps.
2. Every workflow writes `workflow-plan.json`.
3. Every worker step writes `worker-request.json`, `worker-result.json`, and `artifact-briefs.json`.
4. Final output is generated from summaries, briefs, and explicitly selected artifact content.
5. User-visible output remains concise.

## 12. Implementation Boundaries

Do not move academic orchestration into `agent-host`.

Do not make `coding-agent` choose academic workflows.

Do not let profile markdown become state protocol. Profiles define worker behavior; contracts define state.

Do not require user approval for every plan by default.

Do not pass large worker artifacts directly into lead context.

Do not let workers freely write into the lead session artifact workspace.

## 13. Open Implementation Decisions

These are implementation choices, not unresolved product requirements:

1. Whether `ArtifactBrief` is added directly to `WorkerResult` or wrapped in a `WorkflowStepResult`.
2. Whether default session artifact path should be `.lead-agent/artifacts/sessions/<session-id>/` or reuse the existing configured agent directory.
3. Whether the first planner is backed by a real model call immediately or starts with a faux planner plus an injectable planner interface.

The recommended first implementation is an injectable planner interface with faux planner tests, then a real LLM planner behind the same schema.
