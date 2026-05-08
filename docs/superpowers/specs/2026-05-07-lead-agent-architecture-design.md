# Lead-Agent Architecture Design

Status: Draft
Date: 2026-05-07

## 1. Purpose

This spec defines the target architecture for evolving pi-mono from a single-task coding agent host into a two-host agent system:

1. lead-agent as the only user-facing orchestration host.
2. coding-agent as a downstream execution host for concrete subtasks.
3. ai and agent remaining the shared foundation for model access and single-agent execution.

The goal is to support complex research, writing, review, and revision workflows without overloading coding-agent with global orchestration concerns.

## 2. Primary Decision

The system adopts one primary topology.

1. lead-agent is the only user entry point in orchestrated mode.
2. lead-agent owns the main session, task graph, artifact index, and final output responsibility.
3. coding-agent no longer acts as the top-level user host in this path.
4. coding-agent runs as an execution worker host for explicit subtasks.
5. worker results always return to lead-agent before any user-facing final output is produced.

This avoids the ambiguous flow where coding-agent is both the top-level host and a worker called by another host.

## 3. Scope

This spec covers:

1. Host topology.
2. Package responsibilities.
3. Session ownership.
4. Worker interaction model.
5. Core contracts.
6. Artifact ownership.
7. Dependency rules.
8. Directory-level package plan.

This spec does not define:

1. Detailed UI screens.
2. Full API surface for every package.
3. Full implementation order per file.
4. Provider-level changes inside ai.

## 4. User Flow

The main user flow is:

1. The user launches lead-agent.
2. lead-agent creates the main orchestration session.
3. The user submits a high-level goal.
4. lead-agent performs intake, clarifies missing inputs, and builds a task graph.
5. lead-agent dispatches one or more subtasks to coding-agent or other workers.
6. Each worker executes its subtask in its own worker session.
7. Each worker returns a structured result and produced artifacts.
8. lead-agent validates, accepts, retries, or reroutes the result.
9. lead-agent synthesizes accepted outputs into final deliverables.
10. lead-agent outputs the result to the user and persists the updated main session.

## 5. Session Ownership

Session ownership is a first-class architectural rule.

### 5.1 Main Session

The main session belongs only to lead-agent.

It stores:

1. User goals.
2. Clarifications and constraints.
3. Task graph state.
4. Worker dispatch history.
5. Acceptance results.
6. Artifact references.
7. Final synthesis state.
8. User-facing outputs.

### 5.2 Worker Sessions

Worker sessions belong to the worker host, usually coding-agent.

They store:

1. The assigned subtask.
2. Local execution context.
3. Tool activity.
4. Local transcript.
5. Intermediate execution state.
6. Produced artifacts before handoff.

Worker sessions are subordinate to the main session and never replace it.

## 6. Package Responsibilities

### 6.1 Existing Packages

#### packages/ai

Responsibility:

1. Provider integration.
2. Model registry and metadata.
3. Auth and credential handling.
4. Transport and streaming.
5. Token, cost, and context capability metadata.

Must not own:

1. Task planning.
2. Worker routing.
3. Workflow state.
4. Domain-specific orchestration.

#### packages/agent

Responsibility:

1. Single-agent execution loop.
2. Tool-call execution cycle.
3. Streaming lifecycle.
4. Steering and follow-up queues.
5. Agent events and execution state.

Must not own:

1. Global workflow state.
2. Task graph orchestration.
3. Domain workflow logic.
4. User-facing host behavior.

#### packages/coding-agent

Responsibility:

1. Single-task execution host.
2. Tool host for local workspace interaction.
3. Session and execution state for one subtask.
4. Resource loading for skills, templates, extensions, and themes.
5. Prompt construction for concrete execution.
6. CLI, TUI, RPC, and SDK host capabilities.

In orchestrated mode, coding-agent acts as a worker host, not as the top-level orchestrator.

### 6.2 New Packages

#### packages/lead-agent

Responsibility:

1. User intake.
2. Goal interpretation.
3. Task decomposition.
4. Worker routing.
5. Dispatch and retry control.
6. Acceptance and quality gating.
7. Artifact-aware synthesis.
8. Main session ownership.
9. Final output responsibility.

#### packages/agent-contracts

Responsibility:

1. Shared task types.
2. Shared artifact types.
3. Shared worker request and result types.
4. Shared workflow state models.
5. Shared acceptance and execution trace models.

This package is the canonical source of cross-package data contracts.

#### packages/worker-profiles

Responsibility:

1. Role definitions for research, writing, review, and revision workers.
2. Worker capability descriptors.
3. Input and output expectations.
4. Prompt and policy profiles.
5. Acceptance checklists by worker type.

#### packages/artifact-core

Responsibility:

1. Artifact storage.
2. Artifact versioning.
3. Artifact linking and lineage.
4. Artifact serialization.
5. Artifact diff support.

## 7. Module Plan

### 7.1 lead-agent Modules

lead-agent should contain these module groups.

1. intake
Accept goals, constraints, and clarifications.

2. planner
Convert a goal into a task graph, stages, and dependency structure.

3. router
Choose the proper worker profile for each subtask.

4. dispatcher
Send worker requests, track in-flight work, and manage retries.

5. acceptance
Validate completeness, format, consistency, and quality.

6. synthesis
Merge accepted worker outputs into user-facing deliverables.

7. session
Persist main session, workflow state, and orchestration history.

8. policies
Centralize retry, cost, escalation, and routing policies.

9. workers
Contain worker adapters and runtime bridges.

10. ui
Expose the user-facing entry experience.

### 7.2 coding-agent Modules in Orchestrated Mode

coding-agent keeps its current host responsibilities but needs a clear worker-facing path.

Required module groups:

1. worker task intake adapter.
2. structured result emitter.
3. artifact handoff adapter.
4. execution trace export.
5. orchestration-safe session mode.

### 7.3 Shared Foundation Modules

Shared cross-host infrastructure should remain separated from orchestration logic.

1. Model access in ai.
2. Single-agent loop in agent.
3. Common contracts in agent-contracts.
4. Artifact persistence in artifact-core.
5. Role definitions in worker-profiles.

## 8. Core Contracts

The following objects must be defined centrally in agent-contracts.

1. Goal
2. Task
3. Subtask
4. WorkflowState
5. WorkerProfile
6. WorkerRequest
7. WorkerResult
8. Artifact
9. ArtifactLink
10. AcceptanceReport
11. ExecutionTrace
12. Outline
13. EvidenceTable
14. ReviewCommentMap
15. RevisionPlan

Rules:

1. No package may redefine these objects privately.
2. Worker adapters must accept WorkerRequest and return WorkerResult.
3. lead-agent synthesis must consume contracts, not ad hoc text conventions.

## 9. Worker Interaction Model

lead-agent interacts with coding-agent through a worker protocol, not by passing unconstrained free-form prompts.

### 9.1 WorkerRequest

Must include at least:

1. taskId
2. workerType
3. objective
4. constraints
5. input artifact references
6. expected outputs
7. acceptance criteria
8. execution budget
9. retry policy

### 9.2 WorkerResult

Must include at least:

1. taskId
2. status
3. summary
4. structured outputs
5. produced artifact references
6. warnings
7. open questions
8. execution trace
9. failure reason when unsuccessful

## 10. Artifact Rules

Artifacts are first-class system objects.

Typical artifacts include:

1. literature map
2. evidence table
3. outline
4. draft section
5. review comment map
6. response letter draft
7. revision plan
8. manuscript diff map

Rules:

1. Worker outputs that matter across stages must be persisted as artifacts.
2. lead-agent coordinates work through artifact references, not only transcript memory.
3. Artifacts must support versioning and lineage.
4. Acceptance decisions may reference artifacts directly.

## 11. Dependency Rules

The dependency graph must stay clean.

1. ai depends on no host package.
2. agent depends on ai only.
3. coding-agent depends on ai and agent, and may depend on agent-contracts.
4. lead-agent depends on agent-contracts, worker-profiles, artifact-core, and calls coding-agent via SDK or RPC.
5. worker-profiles depends on agent-contracts only.
6. artifact-core depends on agent-contracts only.

## 12. Prohibited Coupling

The following are not allowed.

1. Putting the main task graph into coding-agent internals.
2. Making coding-agent share ownership of the main session.
3. Adding domain workflow logic into agent.
4. Storing critical cross-stage state only in chat transcripts.
5. Hardcoding worker role definitions inside the lead-agent router.
6. Letting worker-to-worker handoff depend on unstructured natural language alone.

## 13. Runtime Modes

Two runtime modes may coexist, but they must stay explicit.

### 13.1 Standalone coding-agent Mode

1. The user talks directly to coding-agent.
2. coding-agent is both host and executor.
3. No lead-agent orchestration is involved.

### 13.2 Orchestrated Mode

1. The user talks only to lead-agent.
2. lead-agent owns the main session and task graph.
3. coding-agent executes downstream subtasks only.

The system must not blur these two modes.

## 14. Directory-Level Package Plan

Target package layout:

```text
packages/
  ai/
  agent/
  coding-agent/
  lead-agent/
    src/
      intake/
      planner/
      router/
      dispatcher/
      acceptance/
      synthesis/
      session/
      policies/
      workers/
      ui/
    test/
  agent-contracts/
    src/
      tasks/
      workflow/
      workers/
      artifacts/
      acceptance/
      execution/
      review/
    test/
  worker-profiles/
    src/
      shared/
      research/
      writing/
      review/
      revise/
    test/
  artifact-core/
    src/
      store/
      versioning/
      linking/
      serialization/
      diff/
    test/
```

The layout above is a high-level map. The detailed src layout below is the normative package plan for the final architecture.

### 14.1 Standard Root Files For Every New Package

Every new package should include these root-level files.

1. package.json
2. README.md
3. CHANGELOG.md
4. tsconfig.build.json
5. vitest.config.ts
6. src/index.ts
7. test/

### 14.2 packages/lead-agent Detailed Layout

Target layout:

```text
packages/lead-agent/
  package.json
  README.md
  CHANGELOG.md
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts
    main.ts
    cli/
      args.ts
      commands.ts
      initial-goal.ts
    core/
      runtime/
        create-lead-agent-runtime.ts
        lead-agent-runtime.ts
        lead-agent-services.ts
      intake/
        intake-service.ts
        goal-normalizer.ts
        clarification-manager.ts
        constraint-extractor.ts
      planner/
        decomposition-engine.ts
        task-graph-builder.ts
        stage-planner.ts
        dependency-resolver.ts
        milestone-planner.ts
      router/
        worker-router.ts
        capability-matcher.ts
        routing-decision.ts
      dispatcher/
        dispatch-service.ts
        worker-run-controller.ts
        retry-manager.ts
        concurrency-controller.ts
      acceptance/
        acceptance-engine.ts
        completeness-check.ts
        consistency-check.ts
        quality-gate.ts
        acceptance-decision.ts
      synthesis/
        synthesis-engine.ts
        artifact-merger.ts
        deliverable-assembler.ts
        final-response-writer.ts
      session/
        orchestration-session.ts
        orchestration-session-store.ts
        workflow-state-store.ts
        checkpoint-store.ts
      workers/
        worker-registry.ts
        worker-client.ts
        worker-adapter.ts
        adapters/
          coding-agent-sdk-worker.ts
          coding-agent-rpc-worker.ts
          external-worker.ts
      policies/
        routing-policy.ts
        retry-policy.ts
        cost-policy.ts
        escalation-policy.ts
      telemetry/
        orchestration-trace.ts
        metrics.ts
        audit-log.ts
    modes/
      index.ts
      interactive-mode.ts
      print-mode.ts
      rpc-mode.ts
  test/
    intake/
    planner/
    router/
    dispatcher/
    acceptance/
    synthesis/
    integration/
```

Core files and responsibilities:

1. src/main.ts
The user-facing entry point in orchestrated mode.

2. src/core/runtime/lead-agent-runtime.ts
The top-level orchestration runtime that owns the main session and coordinates intake, planning, dispatch, acceptance, and synthesis.

3. src/core/intake/intake-service.ts
The canonical place where user goals are turned into normalized intake state.

4. src/core/planner/task-graph-builder.ts
The canonical builder for turning normalized goals into task graphs.

5. src/core/router/worker-router.ts
The single routing authority that maps subtasks to worker profiles.

6. src/core/dispatcher/dispatch-service.ts
The single dispatch authority that creates worker runs and tracks their lifecycle.

7. src/core/acceptance/acceptance-engine.ts
The single acceptance authority that decides whether a worker result is accepted, retried, rerouted, or escalated.

8. src/core/synthesis/synthesis-engine.ts
The final assembly layer for user-facing outputs and deliverables.

9. src/core/session/orchestration-session.ts
The main in-memory representation of the orchestration session.

10. src/core/workers/adapters/coding-agent-sdk-worker.ts
The primary adapter for calling coding-agent as a downstream execution host.

11. src/core/policies/
The stable location for routing, retry, cost, and escalation policy objects so policy does not leak into runtime controllers.

12. src/core/telemetry/
The stable location for orchestration trace, metrics, and audit support.

### 14.3 packages/agent-contracts Detailed Layout

Target layout:

```text
packages/agent-contracts/
  package.json
  README.md
  CHANGELOG.md
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts
    shared/
      ids.ts
      timestamps.ts
      schemas.ts
    tasks/
      goal.ts
      task.ts
      subtask.ts
      task-graph.ts
      task-status.ts
    workflow/
      workflow-state.ts
      workflow-phase.ts
      workflow-checkpoint.ts
      workflow-metrics.ts
    workers/
      worker-profile.ts
      worker-capability.ts
      worker-request.ts
      worker-result.ts
      worker-budget.ts
    artifacts/
      artifact.ts
      artifact-kind.ts
      artifact-ref.ts
      artifact-link.ts
      artifact-metadata.ts
    acceptance/
      acceptance-report.ts
      quality-issue.ts
      retry-decision.ts
    execution/
      execution-trace.ts
      run-record.ts
      warning.ts
      failure.ts
    research/
      evidence-table.ts
      literature-map.ts
    writing/
      outline.ts
      draft-section.ts
      deliverable-bundle.ts
    review/
      review-comment.ts
      review-comment-map.ts
      response-item.ts
      revision-plan.ts
  test/
    shared/
    tasks/
    workflow/
    workers/
    artifacts/
    acceptance/
    execution/
    research/
    writing/
    review/
```

Core files and responsibilities:

1. src/index.ts
The only public barrel for cross-package imports.

2. src/tasks/task.ts
The canonical top-level task contract.

3. src/tasks/task-graph.ts
The canonical task graph structure shared by planner, dispatcher, and session layers.

4. src/workers/worker-request.ts
The required input contract for all worker invocations.

5. src/workers/worker-result.ts
The required output contract for all worker invocations.

6. src/artifacts/artifact.ts
The base artifact contract used across all orchestration stages.

7. src/acceptance/acceptance-report.ts
The canonical record of validation and quality decisions.

8. src/execution/execution-trace.ts
The canonical trace shape used for audit and observability.

9. src/research/, src/writing/, src/review/
The stable location for domain-specific structured objects that must survive across worker boundaries.

### 14.4 packages/worker-profiles Detailed Layout

Target layout:

```text
packages/worker-profiles/
  package.json
  README.md
  CHANGELOG.md
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts
    registry.ts
    shared/
      base-profile.ts
      capability-tags.ts
      prompt-policy.ts
      output-contract.ts
      acceptance-checklist.ts
      handoff-policy.ts
    research/
      index.ts
      profile.ts
      prompt-policy.ts
      artifact-contract.ts
      acceptance-checklist.ts
      task-templates.ts
    writing/
      index.ts
      profile.ts
      prompt-policy.ts
      artifact-contract.ts
      acceptance-checklist.ts
      task-templates.ts
    review/
      index.ts
      profile.ts
      prompt-policy.ts
      artifact-contract.ts
      acceptance-checklist.ts
      task-templates.ts
    revise/
      index.ts
      profile.ts
      prompt-policy.ts
      artifact-contract.ts
      acceptance-checklist.ts
      task-templates.ts
  test/
    shared/
    research/
    writing/
    review/
    revise/
```

Core files and responsibilities:

1. src/registry.ts
The single registry of all available worker profiles.

2. src/shared/base-profile.ts
The common base shape used by all worker profiles.

3. src/shared/prompt-policy.ts
The shared abstraction for how a worker profile influences prompt construction without leaking orchestration logic into coding-agent.

4. src/shared/output-contract.ts
The shared mapping between a profile and the structured artifacts it must produce.

5. src/shared/acceptance-checklist.ts
The shared abstraction for profile-level validation expectations.

6. src/research/profile.ts
The canonical research worker definition.

7. src/writing/profile.ts
The canonical writing worker definition.

8. src/review/profile.ts
The canonical review-response worker definition.

9. src/revise/profile.ts
The canonical revision worker definition.

### 14.5 packages/artifact-core Detailed Layout

Target layout:

```text
packages/artifact-core/
  package.json
  README.md
  CHANGELOG.md
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts
    store/
      artifact-store.ts
      artifact-repository.ts
      artifact-query-service.ts
      backends/
        file-system-store.ts
        memory-store.ts
    versioning/
      version-service.ts
      version-graph.ts
      snapshot.ts
    linking/
      artifact-link-service.ts
      task-artifact-index.ts
      provenance-service.ts
    serialization/
      manifest.ts
      serializer.ts
      deserializer.ts
    diff/
      diff-engine.ts
      structured-diff.ts
      manuscript-diff.ts
    gc/
      retention-policy.ts
      cleanup-service.ts
  test/
    store/
    versioning/
    linking/
    serialization/
    diff/
    gc/
```

Core files and responsibilities:

1. src/store/artifact-store.ts
The root store interface that all artifact backends implement.

2. src/store/backends/file-system-store.ts
The default persistent backend for development and local orchestration.

3. src/versioning/version-service.ts
The single service responsible for artifact revision semantics.

4. src/linking/task-artifact-index.ts
The single index that maps workflow tasks to produced artifacts.

5. src/linking/provenance-service.ts
The canonical provenance layer for recording where artifacts came from and what they depend on.

6. src/serialization/manifest.ts
The persistent metadata representation for stored artifacts.

7. src/diff/manuscript-diff.ts
The domain-specific diff service for writing and review workflows.

### 14.6 Required Integration Touchpoints In Existing Packages

Even though the new packages above are the main additions, the final architecture also requires explicit integration points in coding-agent.

Required coding-agent additions:

1. src/core/orchestration/worker-task-adapter.ts
Transforms WorkerRequest into coding-agent execution context.

2. src/core/orchestration/worker-result-emitter.ts
Transforms local execution results into WorkerResult.

3. src/core/orchestration/artifact-handoff.ts
Publishes produced artifacts back to lead-agent-compatible infrastructure.

4. src/core/orchestration/execution-trace-export.ts
Exports execution trace in the contract shape expected by lead-agent.

5. src/core/orchestration/orchestrated-session-mode.ts
Ensures worker sessions remain subordinate to the lead-agent main session model.

## 15. Development Priorities

The system should evolve in this order.

1. Fix the topology and session ownership rules.
2. Establish shared contracts in agent-contracts.
3. Create lead-agent as a true orchestration host.
4. Define worker-profiles.
5. Add artifact-core so cross-stage work stops depending on transcript state alone.
6. Add coding-agent worker adapters and structured result export.

## 16. Final Decision Summary

The architecture is based on one stable principle:

1. lead-agent owns the user relationship.
2. lead-agent owns the main session.
3. coding-agent owns only worker execution sessions.
4. shared contracts and artifacts are the backbone of cross-stage collaboration.
5. orchestration remains above coding-agent rather than inside its core.