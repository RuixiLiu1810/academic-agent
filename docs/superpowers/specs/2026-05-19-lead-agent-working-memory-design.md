# Lead Agent Working Memory and Session Authority Design

Date: 2026-05-19

## Summary

This spec defines the full P0-P7 route for turning `lead-agent` session persistence into real academic working memory.

Current `lead-agent` already has session persistence through `agent-host` `SessionManager`, and recent contract-first work has connected `outputContract` and `attemptContext` into the workflow executor. However, `lead-agent` does not yet have a domain-level `LeadConversationContext`, so planner, worker, and direct paths still behave mostly as independent runs.

The target architecture is:

- `SessionManager` remains the append-only source of truth.
- `LeadConversationContext` becomes the lead-agent working memory adapter.
- Planner receives a compact context summary for continuity decisions.
- Workers receive a narrow `WorkerContextPackage`, not the full lead memory.
- Direct runner first consumes lead memory in transitional mode, then stops owning a long-lived cached session.
- Compaction is recognized from `agent-host` first, then extended with lead-agent academic structured memory.

## Current State

### Existing Strengths

- `packages/agent-host/src/session-manager.ts` already provides append-only session entries, branch traversal, `buildSessionContext()`, resume, fork, and compaction-aware context construction.
- `packages/lead-agent/src/cli/session.ts` already wires `--continue`, `--resume`, `--session`, `--fork`, `--no-session`, and `--session-dir`.
- `packages/lead-agent/src/orchestration/executor.ts` already builds `WorkerRequest.outputContract` through `outputContractForStep()`.
- The executor retry loop already constructs `attemptContext` with `attempt`, `maxAttempts`, `previousIssues`, and `previousFailureReason`.
- `packages/lead-agent/src/orchestration/acceptance.ts` already routes to contract acceptance when `workerRequest.outputContract` exists.

### Remaining Gaps

- There is no `LeadConversationContext` type or adapter.
- `createLeadTaskPlanningInput()` does not read `sessionManager.buildSessionContext()` or `sessionManager.getBranch()`.
- `llm-planner.ts` only sees the current objective, constraints, expected outputs, input artifacts, profiles, and templates.
- Worker requests do not receive a step-scoped context package.
- `profile-worker-runner.ts` still treats missing literature artifacts as generic failure by checking `producedArtifacts.length > 0`.
- Direct runner still has a long-lived `cachedSession`, separate from the lead-agent outer `SessionManager`.
- Lead-agent does not recognize compaction entries as domain memory.
- There is no academic-specific compaction details format.

## Non-Goals

- Do not copy coding-agent UI complexity into lead-agent.
- Do not put full transcript history into planner or worker prompts.
- Do not load large artifact content in the working memory adapter.
- Do not implement auto academic compaction in the first compaction phase.
- Do not make workers the owner of lead-agent session state.
- Do not replace `agent-host` session primitives.

## Architecture

### Source of Truth

`SessionManager` remains the only durable source of session truth.

Lead-agent may append:

- user messages
- lead assistant final outputs
- custom decision events
- workflow plan and result events
- compaction entries

Lead-agent should not create a parallel memory store. It should derive memory views from `SessionManager` and artifact manifests.

### Working Memory Layers

```text
SessionManager branch
  -> buildLeadConversationContext()
      -> planner conversation context summary
      -> worker context package
      -> direct synthesis context
```

### Artifact Rule

Artifact refs and briefs are not full evidence. They are pointers unless full artifact content is explicitly retrieved and supplied to a worker.

The working memory adapter must not load full artifact content. Full artifact retrieval remains an executor or worker responsibility.

## P0: Contract, Attempt, and Profile Worker Closure

P0 is not about connecting `outputContract` from scratch. The current executor already does that. P0 is about closing regressions and removing runner-level success assumptions that would corrupt later memory-aware behavior.

### P0.1 Executor Retry Attempt Context Regression

Add a regression test proving that retry attempt 2 receives prior acceptance issues.

Expected assertions:

- first worker request has `attemptContext.attempt === 1`
- second worker request has `attemptContext.attempt === 2`
- second worker request has `attemptContext.previousIssues`
- second worker request has `attemptContext.previousFailureReason`

### P0.2 Contract Acceptance Priority Regression

Add a regression test proving that `outputContract` takes precedence over legacy expected outputs.

The test should construct a request where:

- `expectedOutputs` contains a legacy artifact-like string
- `outputContract` requires only a narrative output
- worker result contains acceptable narrative text and no artifact

Expected result:

- accepted by contract acceptance
- not rejected by legacy artifact heuristics

### P0.3 Profile Worker Success Refactor

`profile-worker-runner.ts` must stop using `producedArtifacts.length > 0` as the universal success condition.

Runner responsibility:

- normalize profile worker output into `WorkerResult`
- report transport/tool/runtime failure
- provide warnings and open questions

Acceptance responsibility:

- decide whether `WorkerResult` satisfies the task contract

Proposed rules:

- `literature-searcher` requires a literature tool output or produced literature artifact.
- Non-literature profiles can return `success` when they produce a non-empty assistant summary or structured output.
- Missing contract requirements should be handled by contract acceptance, not by runner-level failure.

### P0.4 Worker Prompt Contract and Attempt Sections

`profile-worker-runner.ts` prompt should render:

- `Objective`
- `Lead Context Package` when present
- `Output Contract`
- `Attempt Context`
- `Acceptance Criteria`
- `Final Response Rules`

Worker rules:

- explicitly satisfy each required output contract
- on retry, directly address previous acceptance issues
- do not claim artifact-based evidence unless full artifact content or explicit evidence is provided

## P1: LeadConversationContext Adapter

P1 introduces lead-agent domain working memory but does not yet inject it into planner behavior.

### New File

`packages/lead-agent/src/orchestration/lead-context.ts`

### Core Types

```ts
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
  budget: {
    maxChars: number;
    usedChars: number;
    truncatedSections: string[];
  };
}
```

### Builder

```ts
export function buildLeadConversationContext(options: {
  sessionManager: SessionManager;
  currentObjective: string;
  maxChars?: number;
}): LeadConversationContext;
```

### Data Sources

- `sessionManager.buildSessionContext()` for LLM-visible user and assistant messages
- `sessionManager.getBranch()` for custom lead-agent events and compaction entries
- artifact refs and briefs from workflow results or custom entries when available

### Budget Rules

Always preserve:

1. current objective
2. compaction summary
3. current or last workflow result status
4. artifact refs

Prefer preserving:

5. recent user objectives
6. recent decisions
7. artifact brief title, kind, and short brief

Trim first:

8. verbose lead final outputs
9. verbose workflow event payloads
10. artifact brief key findings and limitation lists

Artifact refs must remain even when artifact brief details are shortened.

### P1 First Version Scope

P1 first version only adds:

- adapter
- debug formatting
- tests
- workspace debug dump

It must not inject memory into planner yet.

## P2: Planner Context Injection

P2 makes planner consume controlled memory.

### Type Changes

Extend `LeadTaskPlanningInput`:

```ts
conversationContext?: LeadConversationContext;
availableArtifactRefs: ArtifactRef[];
```

`availableArtifactRefs` is derived from:

- `request.inputArtifacts`
- `conversationContext.priorArtifacts`

Planner validation should use `availableArtifactRefs` as the only legal artifact ID set.

### Prompt Changes

`llm-planner.ts` user message gains:

- recent user objectives
- recent lead outputs
- recent workflow results
- prior artifacts
- artifact briefs
- compaction summary when present

System rules gain a continuity decision step:

- `new_task`
- `continue_previous_task`
- `revise_previous_output`
- `inspect_or_use_prior_artifact`
- `direct_followup`

P2 does not need to change `WorkflowPlan` schema yet. The planner can express continuity in rationale.

### Planner Hard Rules

- Prefer `new_task` unless clear lexical, artifact, or instruction continuity exists.
- Do not treat a request as continuation merely because prior artifacts exist.
- Only reference artifact IDs from `availableArtifactRefs`.
- Do not invent placeholder artifact IDs.
- Artifact refs and briefs are pointers, not full artifact content.

## P3: Worker Context Package

P3 gives workers a narrow step-scoped memory package.

### New File

`packages/lead-agent/src/orchestration/worker-context.ts`

### Type

```ts
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
```

### Injection

Executor receives `conversationContext?: LeadConversationContext`.

Each workflow step derives a `WorkerContextPackage`, then writes it to:

```ts
WorkerRequest.metadata.contextPackage
```

This is a short-term integration path. A later contracts revision may promote `contextPackage` to a first-class `WorkerRequest` field.

### Worker Prompt Rules

Profile worker prompt gains `Lead Context Package`.

Rules:

- Use only current request, context package, and provided input artifacts.
- Do not claim to have read artifact content unless full content is supplied.
- Artifact refs and briefs are summaries or pointers, not evidence by themselves.
- If required material is missing, return warnings or open questions.

## P4: Direct Runner Weak Unification

P4 lets direct mode consume lead memory while preserving current session ownership.

### Transitional Scope

- Keep `cachedSession`.
- Do not change outer `SessionManager.appendMessage()` flow.
- Inject `LeadConversationContext` into direct prompt.
- Treat lead conversation context as authoritative for prior lead-agent work.

### Prompt API

`buildLeadDirectMessage()` accepts optional context:

```ts
export function buildLeadDirectMessage(
  request: LeadDirectMessageOptions,
  options?: {
    conversationContext?: LeadConversationContext;
  },
): string;
```

### Prompt Sections

- current request
- recent user objectives
- recent lead outputs
- prior artifact refs and briefs
- compaction summary

Rules:

- use prior context only when directly relevant
- answer as a new task if the request is unrelated
- do not claim artifact content was read unless content is present

## P5: Direct Runner Strong Unification

P5 removes direct runner double memory ownership.

### Target

```text
lead-agent SessionManager
  single source of truth

direct runner
  per-call or stateless model execution
  consumes LeadConversationContext
  returns text only
```

### DirectRunContext

Add an explicit context boundary:

```ts
export interface DirectRunContext {
  conversationContext?: LeadConversationContext;
  model?: LeadAgentModel;
  thinkingLevel?: ThinkingLevel;
  tools?: string[];
  noTools?: "all" | "builtin";
}

export type LeadAgentDirectRunner = (
  request: LeadAgentTaskRequest,
  context: DirectRunContext,
) => Promise<string>;
```

### Migration Strategy

Use a transitional mode flag if needed:

```ts
directRunnerMode?: "legacy-cached-session" | "stateless-lead-context";
```

Recommended implementation:

- P5.1 remove long-lived `cachedSession`
- P5.2 use per-call ephemeral `AgentHostSession` if tools/model wiring are still needed
- P5.3 later consider a lighter stateless `completeSimple()` direct runner

### Hard Rules

- Direct runner must not call lead `sessionManager.appendMessage()` or `appendCustomEntry()`.
- Outer lead runtime remains responsible for user and assistant session entries.
- No cached session reset should be needed when model or thinking changes.

## P6: Compaction Recognition

P6 makes `LeadConversationContext` recognize existing `agent-host` compaction.

### Fields

`LeadConversationContext` includes:

```ts
compactionSummary?: string;
compactionDetails?: JsonObject;
```

P6 does not interpret all details schemas. It only preserves the details object for later phases.

### Rules

- Read compaction entries from `sessionManager.getBranch()`.
- Preserve the most recent compaction summary.
- Preserve details when present.
- Do not also treat compaction summary as `recentLeadOutputs`.
- If `buildSessionContext()` already includes a compaction summary message, avoid duplicate counting.

### Budget Priority

Compaction summary has high priority:

1. current objective
2. compaction summary
3. last workflow result status
4. artifact refs
5. recent user objectives
6. artifact briefs
7. recent lead outputs

## P7: Academic-Specific Compaction

P7 adds lead-agent academic memory on top of the `agent-host` compaction mechanism.

### First Version Scope

- manual only
- no auto compaction
- no large artifact content loading

Suggested command:

```text
/compact academic
```

The command should report a preview:

- artifact lineage count
- accepted workflow count
- open question count
- retrieval gap count

### AcademicCompactionDetails

```ts
export interface AcademicCompactionDetails {
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
```

### Storage

Reuse `SessionManager.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromExtension)`.

Do not create a parallel compaction store.

### Recovery

`buildLeadConversationContext()` should prefer structured academic compaction details when present, falling back to generic summary otherwise.

## Testing Plan

### P0 Tests

- executor passes previous acceptance issues into retry `attemptContext`
- contract acceptance uses `outputContract` before legacy expected outputs
- profile worker non-literature profile succeeds with narrative summary
- literature-searcher still requires literature output
- worker prompt includes output contract and attempt context

### P1 Tests

- adapter extracts recent user objectives
- adapter extracts recent lead outputs
- adapter extracts recent decisions from custom entries
- adapter extracts workflow result summaries
- adapter preserves artifact refs
- adapter trims verbose lead outputs before artifact refs
- adapter writes budget used/truncated sections

### P2 Tests

- no context keeps planner prompt close to legacy shape
- context prompt includes recent objectives and artifact refs
- validation allows artifact refs from context prior artifacts
- validation rejects invented artifact IDs
- planner does not assume history when context has no relevant artifact

### P3 Tests

- worker request contains `metadata.contextPackage`
- context package excludes full artifact content
- context package preserves artifact refs
- later workflow step sees prior step artifact ref and brief
- profile worker prompt renders `Lead Context Package`

### P4 Tests

- direct prompt includes conversation context
- no duplicate user message in lead session
- direct runner still works with no context
- prior artifacts are rendered as refs and briefs only

### P5 Tests

- direct mode no longer uses cached session across calls
- two direct runs produce exactly two lead user entries and two lead assistant entries
- direct runner cannot append to lead session internally
- model/thinking switch does not require cached session reset
- `--continue` and `--session` direct follow-up use `LeadConversationContext`

### P6 Tests

- context includes `compactionSummary` when branch has compaction entry
- compaction summary is not included in `recentLeadOutputs`
- `compactionDetails` preserves details object
- no compaction entry leaves compaction fields undefined
- budget report records whether compaction was retained or truncated

### P7 Tests

- `/compact academic` creates compaction entry
- details kind is `lead-agent.academic-compaction`
- details version is `v1`
- context restores artifact lineage
- context restores open questions and retrieval gaps
- compaction does not load large artifact content
- post-compaction planner/direct use compacted context rather than full old history

## Rollout Plan

### Phase 1: Foundation

- P0.1 executor retry test
- P0.2 contract priority test
- P0.3 profile worker success refactor
- P0.4 worker prompt contract and attempt sections
- P1.1 `LeadConversationContext` type and adapter
- P1.2 budget trimming tests
- P1.3 extraction tests
- P1.4 debug dump

### Phase 2: Memory-Aware Orchestration

- P2 planner context injection
- P2 available artifact validation
- P3 worker context package
- P3 worker prompt context rendering
- P4 direct runner weak unification

### Phase 3: Session Authority

- P5 explicit `DirectRunContext`
- P5 transitional direct runner mode flag if needed
- P5 remove long-lived cached direct session
- P5 per-call direct execution

### Phase 4: Compaction

- P6 generic compaction recognition
- P7 manual academic compaction command
- P7 academic structured compaction details
- P7 context restoration from academic details

## Open Decisions

None required before writing the implementation plan.

Deferred decisions:

- whether `WorkerContextPackage` becomes a first-class `WorkerRequest` field
- whether direct runner eventually moves from per-call `AgentHostSession` to direct `completeSimple()`
- whether auto academic compaction is worth enabling after manual compaction is stable

