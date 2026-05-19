import type { ArtifactBrief, ArtifactRef, WorkerProfile, WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { WorkflowPlanSchema } from "@mariozechner/pi-agent-contracts";
import type { Context, Tool, ToolCall } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { LeadAgentModel } from "../index.js";
import { assertValidWorkflowPlan, validateWorkflowPlan } from "./planner.js";
import { summarizeWorkflowTemplatesForPlanner } from "./templates.js";
import type { LeadTaskPlanningInput, PlannerValidationContext, WorkflowPlanner, WorkflowTemplate } from "./types.js";

export interface LlmWorkflowPlannerConfig {
	model: LeadAgentModel;
	templates: WorkflowTemplate[];
	profiles: readonly WorkerProfile[];
}

export class PlannerValidationError extends Error {
	readonly objective: string;
	readonly firstErrors: string[];
	readonly secondErrors: string[];
	readonly firstPlan?: unknown;
	readonly secondPlan?: unknown;

	constructor(options: {
		objective: string;
		firstErrors: string[];
		secondErrors: string[];
		firstPlan?: unknown;
		secondPlan?: unknown;
	}) {
		super(
			`LLM planner failed after repair attempt.\n` +
				`First errors: ${options.firstErrors.join("; ")}\n` +
				`Second errors: ${options.secondErrors.join("; ")}`,
		);
		this.name = "PlannerValidationError";
		this.objective = options.objective;
		this.firstErrors = options.firstErrors;
		this.secondErrors = options.secondErrors;
		this.firstPlan = options.firstPlan;
		this.secondPlan = options.secondPlan;
	}
}

type PlannerCallResult = { ok: true; plan: unknown } | { ok: false; errors: string[] };

// WorkflowPlanSchema is a plain JsonObject, not a TypeBox TSchema instance.
// Upgrading agent-contracts to TypeBox is out of scope for this change.
// This cast is local to llm-planner.ts; the tool is not exported.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const submitWorkflowPlanTool = {
	name: "submit_workflow_plan",
	description: "Submit the final workflow plan for execution.",
	parameters: {
		type: "object",
		properties: {
			plan: WorkflowPlanSchema,
		},
		required: ["plan"],
		additionalProperties: false,
	},
} satisfies Tool<any>;

const SYSTEM_PROMPT = `You are a workflow planner for an academic research pipeline.
Your ONLY job is to submit a valid WorkflowPlan.

Rules:
- Do NOT solve the user task.
- Do NOT write a user-facing answer.
- Do NOT explain your reasoning outside the tool call.
- Submit exactly one submit_workflow_plan tool call.
- Use only worker profile IDs listed in Available worker profiles.
- Treat the listed workflow templates as guidance — you may use, adapt, or combine them. Do not invent profile IDs.
- Do not invent worker types, artifact IDs, or inter-step artifact references.
- Before selecting direct/workflow mode, decide whether the request is a new task, continuation, revision,
  prior-artifact inspection/use request, or direct follow-up. State that continuity decision in the plan rationale.
- Prefer a new task unless the current request clearly refers to prior objectives, prior outputs, or listed artifacts.
- Do not switch to mode=direct merely to avoid validation errors.
  Only choose direct if the task truly requires no specialist worker.
- If mode=direct, steps MUST be [].
- If mode=workflow, steps MUST contain at least one step.
- Every workflow step MUST follow this exact format for the objective field:

  User objective: <verbatim copy of the user's original objective>

  Step objective: <specific task for this worker>

  Do not merge them. Do not paraphrase the user objective.
- Only reference artifact IDs from the provided Available artifacts list in inputArtifactRefs.
  Prior-step outputs are automatically available to later workers — do not invent inter-step IDs.`;

function formatArtifacts(artifacts: ArtifactRef[]): string {
	if (artifacts.length === 0) return "none";
	return artifacts.map((a) => `- ${a.id} (${a.kind})`).join("\n");
}

function formatArtifactBriefs(briefs: readonly ArtifactBrief[]): string {
	if (briefs.length === 0) return "none";
	return briefs
		.map((brief) => {
			const title = brief.title ? ` title=${brief.title}` : "";
			return `- ${brief.artifactId} (${brief.kind}${title}): ${brief.brief}`;
		})
		.join("\n");
}

function formatList(values: readonly string[]): string {
	return values.length > 0 ? values.join(", ") : "none";
}

function formatConversationContext(input: LeadTaskPlanningInput): string {
	const context = input.conversationContext;
	if (!context) return "none";
	return [
		`Current objective: ${context.currentObjective}`,
		`Recent user objectives:\n${context.recentUserObjectives.length > 0 ? context.recentUserObjectives.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Recent lead outputs:\n${context.recentLeadOutputs.length > 0 ? context.recentLeadOutputs.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Recent workflow results:\n${
			context.recentWorkflowResults.length > 0
				? context.recentWorkflowResults
						.map(
							(result) =>
								`- ${result.taskId}: accepted=${String(result.accepted)}, artifacts=${formatList(result.producedArtifactKinds)}, issues=${formatList(result.issues)}`,
						)
						.join("\n")
				: "none"
		}`,
		`Prior artifacts:\n${formatArtifacts(context.priorArtifacts)}`,
		`Artifact briefs:\n${formatArtifactBriefs(context.artifactBriefs)}`,
		`Compaction summary:\n${context.compactionSummary ?? "none"}`,
		`Context budget: ${context.budget.usedChars}/${context.budget.maxChars} chars; truncated=${formatList(context.budget.truncatedSections)}`,
	].join("\n");
}

function buildUserMessage(input: LeadTaskPlanningInput, config: LlmWorkflowPlannerConfig): string {
	const profileLines = config.profiles.map((p) => `- ${p.id}: ${p.description}`).join("\n");
	const templateSummaries = summarizeWorkflowTemplatesForPlanner(config.templates);
	const templateLines = templateSummaries
		.map((t) => {
			const stepLines =
				t.steps.length === 0
					? "  (no steps — lead agent handles directly)"
					: t.steps
							.map(
								(s) =>
									`  - ${s.profileId}: ${s.role}\n` +
									`    required artifacts: ${formatList(s.expectedArtifactKinds)}\n` +
									`    expected outputs: ${formatList(s.expectedOutputs)}\n` +
									`    acceptance criteria: ${formatList(s.acceptanceCriteria)}`,
							)
							.join("\n");
			return `${t.id}: ${t.description}\n${stepLines}`;
		})
		.join("\n\n");

	return [
		`User objective:\n${input.objective}`,
		`Constraints:\n${input.constraints.length > 0 ? input.constraints.join("\n") : "none"}`,
		`Expected outputs:\n${input.expectedOutputs.length > 0 ? input.expectedOutputs.join("\n") : "none"}`,
		`Input artifacts:\n${formatArtifacts(input.inputArtifacts)}`,
		`Available artifacts:\n${formatArtifacts(input.availableArtifactRefs)}`,
		`Conversation context:\n${formatConversationContext(input)}`,
		`Available worker profiles:\n${profileLines}`,
		`Available workflow templates (use, adapt, or combine as needed):\n${templateLines}`,
	].join("\n\n");
}

function buildRepairUserMessage(
	input: LeadTaskPlanningInput,
	config: LlmWorkflowPlannerConfig,
	firstErrors: string[],
	firstPlan: unknown,
): string {
	const base = buildUserMessage(input, config);
	return (
		`The plan you submitted is invalid. Do not solve the user task.\n` +
		`Use only the available worker profiles and workflow templates listed below.\n` +
		`Do not invent replacement IDs. Preserve the original user objective exactly.\n` +
		`Do not switch to mode=direct merely to avoid validation errors.\n` +
		`Fix only the structural issues listed below and submit exactly one corrected submit_workflow_plan tool call.\n\n` +
		`Validation errors:\n${firstErrors.map((e) => `- ${e}`).join("\n")}\n\n` +
		`Invalid plan:\n${JSON.stringify(firstPlan, null, 2)}\n\n---\n\n` +
		base
	);
}

function buildContext(userMessage: string): Context {
	return {
		messages: [{ role: "user", content: [{ type: "text", text: userMessage }], timestamp: Date.now() }],
		tools: [submitWorkflowPlanTool],
		systemPrompt: SYSTEM_PROMPT,
	};
}

async function runPlannerCall(context: Context, config: LlmWorkflowPlannerConfig): Promise<PlannerCallResult> {
	const msg = await completeSimple(config.model, context);

	if (msg.stopReason !== "toolUse") {
		return { ok: false, errors: [`Expected stopReason=toolUse, got ${msg.stopReason}`] };
	}

	const toolCalls = msg.content.filter(
		(c) => c.type === "toolCall" && (c as ToolCall).name === "submit_workflow_plan",
	) as ToolCall[];

	if (toolCalls.length === 0) {
		return { ok: false, errors: ["No submit_workflow_plan tool call in response"] };
	}
	if (toolCalls.length > 1) {
		return { ok: false, errors: [`Expected exactly 1 tool call, got ${toolCalls.length}`] };
	}

	const args = toolCalls[0]!.arguments;
	if (!args.plan || typeof args.plan !== "object") {
		return { ok: false, errors: ["Tool call missing args.plan or plan is not an object"] };
	}

	return { ok: true, plan: args.plan };
}

export function createLlmWorkflowPlanner(config: LlmWorkflowPlannerConfig): WorkflowPlanner {
	return {
		async plan(input: LeadTaskPlanningInput): Promise<WorkflowPlan> {
			const validationContext: PlannerValidationContext = {
				profiles: config.profiles,
				templates: config.templates,
				inputArtifacts: input.inputArtifacts,
				availableArtifactRefs: input.availableArtifactRefs,
			};

			// First attempt
			const first = await runPlannerCall(buildContext(buildUserMessage(input, config)), config);
			const firstErrors = first.ok ? validateWorkflowPlan(first.plan, validationContext) : first.errors;

			if (first.ok && firstErrors.length === 0) {
				assertValidWorkflowPlan(first.plan, validationContext);
				return first.plan as WorkflowPlan;
			}

			// Repair attempt
			const firstPlan = first.ok ? first.plan : null;
			const repair = await runPlannerCall(
				buildContext(buildRepairUserMessage(input, config, firstErrors, firstPlan)),
				config,
			);
			const secondErrors = repair.ok ? validateWorkflowPlan(repair.plan, validationContext) : repair.errors;

			if (repair.ok && secondErrors.length === 0) {
				assertValidWorkflowPlan(repair.plan, validationContext);
				return repair.plan as WorkflowPlan;
			}

			throw new PlannerValidationError({
				objective: input.objective,
				firstErrors,
				secondErrors,
				firstPlan: first.ok ? first.plan : undefined,
				secondPlan: repair.ok ? repair.plan : undefined,
			});
		},
	};
}
