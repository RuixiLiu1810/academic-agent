# LLM Workflow Planner Design

**Date**: 2026-05-15  
**Scope**: `packages/lead-agent`

## Problem

The current `createTemplateWorkflowPlanner` uses keyword matching to select workflow templates. This conflates two distinct operations—routing (which workflow structure to use) and content propagation (what the user actually wants)—and solves both poorly. Step `objective` fields are hardcoded template strings; the user's original objective is never passed to workers. Keyword matching is ambiguous: "文献" triggers `evidence-synthesis` whether the user wants to read one paper or write a full review.

## Goal

Replace the keyword-based planner with an LLM-based planner that:
- Understands objective semantics, not word patterns
- Generates per-step objectives that preserve the user's original intent
- Selects from a template registry rather than matching keywords
- Implements the existing `WorkflowPlanner` interface with no changes to callers

---

## Architecture

```
LeadTaskPlanningInput
        ↓
createLlmWorkflowPlanner(config)
        ↓
  [independent completeSimple() call — not shared with lead-agent session]
        ↓
  submit_workflow_plan tool call
        ↓
  validateWorkflowPlan()
    ├── OK → WorkflowPlan
    └── failed → repair retry (full context rebuild, same tool)
              ├── OK → WorkflowPlan
              └── failed → throw PlannerValidationError
```

**New file**: `packages/lead-agent/src/orchestration/llm-planner.ts`  
**Interface unchanged**: `WorkflowPlanner.plan(input): Promise<WorkflowPlan>` — callers (`index.ts`, `executor.ts`) have no awareness of the change.

---

## File Changes

| File | Change |
|---|---|
| `src/orchestration/llm-planner.ts` | New: `createLlmWorkflowPlanner`, `PlannerValidationError`, `buildPlannerContext`, `buildRepairContext`, `runPlannerCall` |
| `src/orchestration/planner.ts` | Remove `createTemplateWorkflowPlanner`; keep `validateWorkflowPlan` (extended), `createFauxWorkflowPlanner` |
| `src/orchestration/templates.ts` | Remove `selectWorkflowTemplateCandidates`; keep `WORKFLOW_TEMPLATE_REGISTRY`; add `summarizeWorkflowTemplatesForPlanner()` |
| `src/orchestration/types.ts` | Remove `templateCandidates` from `LeadTaskPlanningInput`; add `PlannerValidationContext` |
| `src/orchestration/intake.ts` | Remove `templateCandidates` construction |
| `src/index.ts` | `createTemplateWorkflowPlanner()` default remains when no `plannerModel` is provided; LLM planner activates only when `plannerModel` is set |
| `packages/lead-agent/package.json` | Add `@mariozechner/pi-ai` dependency |

---

## Dependencies

`packages/lead-agent/package.json` gains one new dependency:

```json
"@mariozechner/pi-ai": "^0.73.0"
```

`completeSimple` and `Context`/`ToolCall` types are imported from `@mariozechner/pi-ai`.

---

## Configuration Interface

```typescript
// llm-planner.ts

export interface LlmWorkflowPlannerConfig {
  model: LeadAgentModel;             // Model object from ModelRegistry — not a string
  templates: WorkflowTemplate[];     // WORKFLOW_TEMPLATE_REGISTRY
  profiles: readonly WorkerProfile[];
}

export function createLlmWorkflowPlanner(config: LlmWorkflowPlannerConfig): WorkflowPlanner
```

`completeSimple(model, context)` from `@mariozechner/pi-ai` is called directly inside the planner. No `StreamFunction` is exposed in the config — the planner manages its own LLM calls internally.

---

## `LeadAgentRuntimeOptions` Change (index.ts)

Add one optional field:

```typescript
/** Model to use for the LLM workflow planner. When absent, falls back to createTemplateWorkflowPlanner(). */
plannerModel?: LeadAgentModel;
```

The default resolution in `createLeadAgentRuntime`:

```typescript
const workflowPlanner =
  options.workflowPlanner ??
  (options.plannerModel
    ? createLlmWorkflowPlanner({
        model: options.plannerModel,
        templates: WORKFLOW_TEMPLATE_REGISTRY,
        profiles,
      })
    : createTemplateWorkflowPlanner());
```

The three cases, in priority order:

1. `options.workflowPlanner` is set → use the injected planner as-is; `plannerModel` is ignored.
2. `options.plannerModel` is set (and `workflowPlanner` is absent) → instantiate `createLlmWorkflowPlanner`.
3. Neither is set → fall back to `createTemplateWorkflowPlanner()` (keyword-based); offline/test/smoke scenarios unaffected.

CLI constructs `plannerModel` the same way it constructs `model` — from `ModelRegistry` / user config.

---

## Type Changes

### `LeadTaskPlanningInput` (types.ts)

Remove `templateCandidates: WorkflowTemplate[]`. Template candidates are internal to the planner config, not intake data.

### `PlannerValidationContext` (types.ts — new)

```typescript
export interface PlannerValidationContext {
  profiles: readonly WorkerProfile[];
  templates: WorkflowTemplate[];
  inputArtifacts: ArtifactRef[];
}
```

### `PlannerValidationError` (llm-planner.ts — new)

```typescript
export class PlannerValidationError extends Error {
  readonly objective: string;
  readonly firstErrors: string[];
  readonly secondErrors: string[];
  readonly firstPlan?: unknown;
  readonly secondPlan?: unknown;
  readonly cause?: unknown;
}
```

---

## Template Registry Changes (templates.ts)

**Remove**: `selectWorkflowTemplateCandidates()` — keyword routing function deleted entirely.

**Keep**: `WORKFLOW_TEMPLATE_REGISTRY` — array of `WorkflowTemplate` definitions.

**Add**: `summarizeWorkflowTemplatesForPlanner(templates: WorkflowTemplate[])` returning an array of prompt-safe summaries:

```typescript
interface WorkflowTemplateSummary {
  id: string;
  description: string;
  steps: { profileId: string; role: string }[];
  suitableWhen: string;
  notSuitableWhen: string;
  requiredInputs: string[];
}
```

This summary must NOT include trigger keywords, full `acceptanceCriteria`, or internal implementation fields.

---

## Step `objective` Format

`WorkflowStep.objective: string` remains unchanged in `agent-contracts`. The planner is required to populate it using this two-section format:

```
User objective: <verbatim copy of the user's original objective>

Step objective: <specific task for this worker>
```

`buildCodingWorkerPrompt()` injects `step.objective` verbatim — the worker LLM receives both sections naturally.

### Validation enforcement

`validateWorkflowPlan()` gains two new checks per step:

```typescript
if (!step.objective.includes("User objective:")) {
  errors.push(`Step ${step.id}: objective missing "User objective:" section`);
}
if (!step.objective.includes("Step objective:")) {
  errors.push(`Step ${step.id}: objective missing "Step objective:" section`);
}
```

These are repairable errors and enter the repair retry path.

---

## `validateWorkflowPlan` Extended Signature

```typescript
function validateWorkflowPlan(
  plan: unknown,
  context: PlannerValidationContext,
): string[]
```

Added runtime checks:
- `step.profileId` must be in `context.profiles`
- `step.inputArtifactRefs` artifact ids must be in `context.inputArtifacts` (original inputs only — see inter-step artifact note below)
- `step.objective` format check (two-section requirement above)

---

## Inter-Step Artifact Dependency

The executor (`executeWorkflowPlan`) automatically passes all accepted artifacts from prior steps to each subsequent step. The planner must not and cannot encode inter-step artifact references.

**Rule**: `step.inputArtifactRefs` generated by the planner MUST only reference artifact IDs present in `input.inputArtifacts` (the original user-provided inputs). The planner must NOT invent IDs like `"step1-output"` or `"researcher-evidence"`.

**System prompt enforcement** (added to prompt rules):
```
- Do not reference inter-step artifact IDs in inputArtifactRefs.
  Only reference artifact IDs from the provided Input artifacts list.
  Prior-step outputs are automatically available to later workers.
```

**Validation**: `validateWorkflowPlan` checks that every ID in `step.inputArtifactRefs` exists in `context.inputArtifacts`. Any invented ID is a validation error and triggers repair.

---

## Tool Definition

`Tool` from `@mariozechner/pi-ai` is generic over `TParameters extends TSchema`. `WorkflowPlanSchema` from `agent-contracts` is a plain `JsonObject`, not a TypeBox schema. Upgrading `agent-contracts` to TypeBox is out of scope for this change.

Instead, define the tool parameters inline in `llm-planner.ts` and apply a controlled local cast.

Preferred resolution order (stop at the first that compiles):

1. `satisfies Tool` — no type argument; if TypeBox inference accepts `JsonObject` here, this is sufficient.
2. `satisfies Tool<TSchema>` with `TSchema` imported — if the constraint is `TParameters extends TSchema` and `JsonObject` satisfies the base type, this is cleaner.
3. `satisfies Tool<any>` — last resort; use only when the type system cannot be satisfied otherwise.

In practice, because `WorkflowPlanSchema` is a plain `JsonObject` (not a `TSchema` instance), option 3 is expected to be necessary. Add an inline comment explaining why, and note that upgrading `agent-contracts` to TypeBox is out of scope:

```typescript
import type { Tool } from "@mariozechner/pi-ai";
import { WorkflowPlanSchema } from "@mariozechner/pi-agent-contracts";

const submitWorkflowPlanTool = {
  name: "submit_workflow_plan",
  description: "Submit the final workflow plan for execution.",
  parameters: {
    type: "object",
    properties: {
      plan: WorkflowPlanSchema,   // plain JsonObject from agent-contracts
    },
    required: ["plan"],
    additionalProperties: false,
  },
  // WorkflowPlanSchema is a plain JsonObject, not a TypeBox TSchema instance.
  // Upgrading agent-contracts to TypeBox is out of scope for this change.
  // This cast is local to llm-planner.ts and the tool is not exported.
} satisfies Tool<any>;
```

During implementation, first attempt `satisfies Tool` and `satisfies Tool<TSchema>` before settling on `Tool<any>`.

Wrapping in `{ plan }` allows future extension (`plannerNotes`, `confidenceNotes`) without breaking the schema.

---

## Planner System Prompt

```
You are a workflow planner for an academic research pipeline.
Your ONLY job is to submit a valid WorkflowPlan.

Rules:
- Do NOT solve the user task.
- Do NOT write a user-facing answer.
- Do NOT explain your reasoning outside the tool call.
- Submit exactly one submit_workflow_plan tool call.
- Use only worker profile IDs listed in Available worker profiles.
- Treat the listed workflow templates as guidance — you may use, adapt, or combine them. Do not invent profile IDs.
- Do not invent worker types, artifact IDs, or inter-step artifact references.
- Do not switch to mode=direct merely to avoid validation errors.
  Only choose direct if the task truly requires no specialist worker.
- If mode=direct, steps MUST be [] .
- If mode=workflow, steps MUST contain at least one step.
- Every workflow step MUST follow this exact format for the objective field:

  User objective: <verbatim copy of the user's original objective>

  Step objective: <specific task for this worker>

  Do not merge them. Do not paraphrase the user objective.
```

## Planner User Turn

```
User objective:
{input.objective}

Constraints:
{input.constraints — one per line, or "none"}

Expected outputs:
{input.expectedOutputs — one per line, or "none"}

Input artifacts:
{artifact summaries — id, title, kind, summary; or "none"}

Available worker profiles:
{profile id + one-line capability description for each}

Available workflow templates (use, adapt, or combine as needed):
{summarizeWorkflowTemplatesForPlanner() output}

Examples are illustrative. Your submitted plan must satisfy the actual WorkflowPlan schema.

[Few-shot example 1: direct mode]
[Few-shot example 2: two-step workflow mode]
```

## Repair Turn

The repair call is a new independent `completeSimple()` call with a fully rebuilt `Context`. It includes:
- Same system prompt (all rules)
- Original user objective, constraints, expectedOutputs
- Available profiles
- Available templates (summarized)
- Input artifact summaries
- Validation errors from first attempt
- Invalid plan JSON

Repair user message prefix:

```
The plan you submitted is invalid. Do not solve the user task.
Use only the available worker profiles and workflow templates listed below.
Do not invent replacement IDs. Preserve the original user objective exactly.
Do not switch to mode=direct merely to avoid validation errors.
Fix only the structural issues listed below and submit exactly one corrected
submit_workflow_plan tool call.

Validation errors:
{firstErrors}

Invalid plan:
{firstPlan as JSON}
```

---

## Internal Execution Flow

### `PlannerCallResult`

```typescript
type PlannerCallResult =
  | { ok: true; plan: unknown }
  | { ok: false; errors: string[] };
```

### `runPlannerCall`

```typescript
async function runPlannerCall(context: Context): Promise<PlannerCallResult> {
  const msg = await completeSimple(config.model, context); // LeadAgentModel, not string

  if (msg.stopReason !== "toolUse") {
    return { ok: false, errors: [`Expected stopReason=toolUse, got ${msg.stopReason}`] };
  }
  const toolCalls = msg.content.filter(
    (c) => c.type === "toolCall" && c.name === "submit_workflow_plan"
  );
  if (toolCalls.length === 0) {
    return { ok: false, errors: ["No submit_workflow_plan tool call in response"] };
  }
  if (toolCalls.length > 1) {
    return { ok: false, errors: [`Expected exactly 1 tool call, got ${toolCalls.length}`] };
  }
  const args = (toolCalls[0] as ToolCall).arguments;
  if (!args.plan || typeof args.plan !== "object") {
    return { ok: false, errors: ["Tool call missing args.plan or plan is not an object"] };
  }
  return { ok: true, plan: args.plan };
}
```

### `plan()` main body

```typescript
// First attempt
const first = await runPlannerCall(buildPlannerContext(input));
const firstErrors = first.ok
  ? validateWorkflowPlan(first.plan, validationContext)
  : first.errors;

if (firstErrors.length === 0) return first.plan as WorkflowPlan;

// Repair attempt
const repair = await runPlannerCall(
  buildRepairContext(input, first.ok ? first.plan : null, firstErrors)
);
const secondErrors = repair.ok
  ? validateWorkflowPlan(repair.plan, validationContext)
  : repair.errors;

if (secondErrors.length === 0) return repair.plan as WorkflowPlan;

throw new PlannerValidationError({
  objective: input.objective,
  firstErrors,
  secondErrors,
  firstPlan: first.ok ? first.plan : undefined,
  secondPlan: repair.ok ? repair.plan : undefined,
});
```

---

## `runImpl` Error Handling

`LeadAgentResult` uses `finalOutput: string` and `decision: LeadAgentDecision`. No new result shape is introduced.

```typescript
function taskRequiresWorker(input: LeadTaskPlanningInput): boolean {
  return input.inputArtifacts.length > 0 || input.expectedOutputs.length > 0;
}

// In runImpl:
catch (e) {
  if (e instanceof PlannerValidationError) {
    logPlannerError(e); // dev: full errors + plan JSON; never shown to user verbatim
    if (taskRequiresWorker(planningInput)) {
      // Do NOT fallback direct — would produce fake completion
      return buildLeadAgentResult({
        finalOutput: "未能生成可执行的工作流计划。请检查输入后重试。",
        decision: { mode: "direct", reason: "Planner validation failed after repair" },
        // acceptanceReport, workerResult, workflowPlan all absent
      });
    }
    // No artifacts, no expected outputs: safe to fallback direct with warning
    // Proceed to direct lead-agent synthesis, append a warning to finalOutput
  }
  throw e;
}
```

---

## Testing Strategy

### Unit tests (no LLM)

**`test/orchestration/planner.test.ts`** — extend `validateWorkflowPlan`:
- objective missing `User objective:` → error
- objective missing `Step objective:` → error
- `step.profileId` not in profiles → error
- `step.inputArtifactRefs` references unknown artifact id → error
- `mode=direct` with non-empty steps → error (existing, retained)
- valid plan → empty error array

**`test/orchestration/templates.test.ts`** — new:
- `summarizeWorkflowTemplatesForPlanner()` output contains only `id/description/steps/suitableWhen/notSuitableWhen/requiredInputs`
- output does not contain trigger keywords or `acceptanceCriteria`

### Integration tests (faux provider)

**`test/orchestration/llm-planner.test.ts`** — new:

| Scenario | Faux config | Expected |
|---|---|---|
| First call returns valid plan | tool call with valid plan | returns WorkflowPlan |
| First fails, repair succeeds | 1st: no tool call; 2nd: valid plan | returns WorkflowPlan |
| Both calls produce no tool call | both: no tool call | throws PlannerValidationError |
| Both plans fail schema | both: invalid profileId | throws PlannerValidationError, firstErrors/secondErrors non-empty |
| Planner returns direct mode | mode=direct, steps=[] | returns WorkflowPlan(mode=direct) |
| stopReason !== toolUse | stopReason=stop | enters repair path |

**`runImpl` PlannerValidationError tests**:
- With `inputArtifacts` → returns `LeadAgentResult` with `finalOutput` containing failure message, no worker invoked
- Without `inputArtifacts` and no `expectedOutputs` → fallback direct synthesis, `finalOutput` contains warning

**`runImpl` PlannerValidationError tests**:
- With `inputArtifacts` → `result.status === "failed"`, no fallback to direct
- Without `inputArtifacts` and no `expectedOutputs` → fallback direct, result contains warning
